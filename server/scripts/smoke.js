// 서버가 제대로 떴는지 확인하는 연기(smoke) 테스트.  서버 켜둔 상태에서:  npm run smoke
// 가입 → 로그인 → /me → 셀 내역 → 우편 → 공통 함수 직접 호출(addCell/addPetExp/getPetCombatStats) 순서.
import 'dotenv/config';
import { pool, withTransaction } from '../src/db/pool.js';
import { addCell } from '../src/services/cellService.js';
import { addPetExp, getPetCombatStats, assertPetCanSortie, getPet } from '../src/services/petService.js';
import { addItem, useItem, getInventory } from '../src/services/inventoryService.js';

const BASE = process.env.SMOKE_BASE ?? `http://localhost:${process.env.PORT ?? 3000}`;
const tag = Date.now().toString(36);
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failed++;
};
const api = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

// ── HTTP ──
const health = await api('GET', '/health');
check('GET /health', health.ok);

if (process.env.DEMO_ACCOUNT_LOGIN === 'true' && process.env.NODE_ENV !== 'production') {
  const accounts = await api('GET', '/auth/demo-accounts');
  check('테스트 계정 목록', accounts.ok && accounts.data.map(account => account.loginId).join(',') === 'kim,lee');
  for (const account of accounts.data ?? []) {
    const login = await api('POST', '/auth/demo-login', { loginId: account.loginId });
    const profile = await api('GET', '/me', null, login.data?.token);
    check(`테스트 계정 로그인 및 /me: ${account.loginId}`,
      login.ok && profile.ok && profile.data.nickname === account.nickname && profile.data.userId === login.data.user.userId);
  }
  const unavailable = await api('POST', '/auth/demo-login', { loginId: 'unknown' });
  check('목록 밖 계정의 간편 로그인 차단', !unavailable.ok && unavailable.error.code === 'NOT_FOUND');
}

const su = await api('POST', '/auth/signup', { loginId: `smoke_${tag}`, password: 'pw1234', nickname: `연기${tag.slice(-4)}` });
check('POST /auth/signup', su.ok && su.data.userId > 0, JSON.stringify(su.data ?? su.error));
const userId = su.data?.userId;

const bad = await api('POST', '/auth/login', { loginId: `smoke_${tag}`, password: 'wrong' });
check('로그인 실패 → UNAUTHORIZED', !bad.ok && bad.error.code === 'UNAUTHORIZED');

const li = await api('POST', '/auth/login', { loginId: `smoke_${tag}`, password: 'pw1234' });
check('POST /auth/login', li.ok && !!li.data.token);
const token = li.data?.token;

const noauth = await api('GET', '/me');
check('토큰 없이 /me → UNAUTHORIZED', !noauth.ok && noauth.error.code === 'UNAUTHORIZED');

const me = await api('GET', '/me', null, token);
check('GET /me', me.ok && me.data.userId === userId && me.data.cellBalance === 0);

// ── 공통 함수 (DB 직접) ──
const balance = await withTransaction(c => addCell(c, userId, 500, 'ADMIN'));
check('addCell +500', balance === 500);
let threw = null;
try { await withTransaction(c => addCell(c, userId, -9999, 'ITEM_PURCHASE')); } catch (e) { threw = e.code; }
check('addCell 잔액 초과 → NOT_ENOUGH_CELL', threw === 'NOT_ENOUGH_CELL');

const cells = await api('GET', '/me/cells', null, token);
check('GET /me/cells', cells.ok && cells.data.balance === 500 && cells.data.transactions.length === 1);

// 펫 하나 지급 (seed의 1번 종) → 경험치 → 전투 능력치
const { rows: [petRow] } = await pool.query(
  `INSERT INTO user_pet (user_id, species_id, hunger) VALUES ($1, 1, 100) RETURNING user_pet_id`, [userId]);
const petId = petRow.user_pet_id;
const lv = await withTransaction(c => addPetExp(c, petId, 150));           // NORMAL: Lv1→2 는 100 필요
check('addPetExp 150 → Lv.2, 남은 50', lv.level === 2 && lv.exp === 50 && lv.expToNext === 200, JSON.stringify(lv));
const stats = await getPetCombatStats(pool, userId, petId);
check('getPetCombatStats', stats.attack > 0 && stats.maxHp > 0 && stats.ability?.code, JSON.stringify(stats));
check('assertPetCanSortie (배고픔 100)', await assertPetCanSortie(pool, userId, petId));
await pool.query('UPDATE user_pet SET hunger = 10 WHERE user_pet_id = $1', [petId]);
threw = null;
try { await assertPetCanSortie(pool, userId, petId); } catch (e) { threw = e.code; }
check('배고픔 10 → PET_TOO_HUNGRY', threw === 'PET_TOO_HUNGRY');
const pet = await getPet(pool, userId, petId);
check('getPet DTO', pet.userPetId === petId && pet.species.grade === 'NORMAL' && pet.canSortie === false);

// 아이템
await withTransaction(c => addItem(c, userId, 1, 3));
await withTransaction(c => useItem(c, userId, 1, 2));
threw = null;
try { await withTransaction(c => useItem(c, userId, 1, 5)); } catch (e) { threw = e.code; }
check('addItem 3 / useItem 2 / 5 → NOT_ENOUGH_ITEM', threw === 'NOT_ENOUGH_ITEM');
const inv = await api('GET', '/inventory', null, token);
check('GET /inventory (수량 1)', inv.ok && inv.data.items[0]?.quantity === 1);

// 우편: 셀 100 + 칭호 → 받기 → 두 번째는 ALREADY_CLAIMED
const { rows: [mail] } = await pool.query(
  `INSERT INTO reward_mail (user_id, source_type, source_key, title, cell_amount, title_id)
   VALUES ($1, 'ADMIN', $2, '테스트 우편', 100, 1) RETURNING mail_id`, [userId, `smoke:${tag}`]);
const mails = await api('GET', '/mails?unclaimedOnly=true', null, token);
check('GET /mails', mails.ok && mails.data.length === 1 && mails.data[0].titleReward?.titleId === 1);
const claim = await api('POST', `/mails/${mail.mail_id}/claim`, null, token);
check('POST /mails/:id/claim → 잔액 600', claim.ok && claim.data.balance === 600, JSON.stringify(claim.error ?? ''));
const again = await api('POST', `/mails/${mail.mail_id}/claim`, null, token);
check('두 번째 claim → ALREADY_CLAIMED', !again.ok && again.error.code === 'ALREADY_CLAIMED');
const titles = await api('GET', '/me/titles', null, token);
check('GET /me/titles (1개)', titles.ok && titles.data.titles.length === 1);
const eq = await api('PATCH', '/me/title', { titleId: 1 }, token);
check('PATCH /me/title 장착', eq.ok && eq.data.equippedTitle?.titleId === 1);

// 잔액 = 내역 합계
const { rows: [sum] } = await pool.query(
  `SELECT u.cell_balance, COALESCE(SUM(t.amount),0) AS total FROM app_user u
     LEFT JOIN cell_transaction t ON t.user_id = u.user_id WHERE u.user_id = $1 GROUP BY u.cell_balance`, [userId]);
check('잔액 = cell_transaction 합계', Number(sum.cell_balance) === Number(sum.total), `${sum.cell_balance} / ${sum.total}`);


// ── 🟥 미니게임 흐름 ──
// 준비: 배고픔 복구, 셀 1000
await pool.query('UPDATE user_pet SET hunger = 100 WHERE user_pet_id = $1', [petId]);
await withTransaction(c => addCell(c, userId, 400, 'ADMIN'));   // 600 → 1000

const st = await api('GET', '/stages', null, token);
check('GET /stages (12개, 1-1만 열림, 무한모드 잠김)',
  st.ok && st.data.stages.length === 12 && st.data.stages[0].displayId === '1-1' && st.data.stages[0].unlocked
  && !st.data.stages[1].unlocked && st.data.endlessUnlocked === false, JSON.stringify(st.error ?? ''));

const locked = await api('POST', '/game/start', { mode: 'STAGE', stageNo: 2, userPetId: petId }, token);
check('안 열린 1-2 시작 → VALIDATION', !locked.ok && locked.error.code === 'VALIDATION');
const noEndless = await api('POST', '/game/start', { mode: 'ENDLESS', userPetId: petId }, token);
check('무한모드 잠김 → VALIDATION', !noEndless.ok && noEndless.error.code === 'VALIDATION');

// 남의 펫으로 시작 (seed kim 의 userPetId 1)
const notMine = await api('POST', '/game/start', { mode: 'STAGE', stageNo: 1, userPetId: 1 }, token);
check('남의 펫으로 시작 → NOT_FOUND', !notMine.ok && notMine.error.code === 'NOT_FOUND');

// 연습 모드: 기록 없음
const prac = await api('POST', '/game/start', { mode: 'STAGE', stageNo: 5, userPetId: petId, practice: true }, token);
check('연습 모드 시작 (runId null, 잠긴 지점도 가능)', prac.ok && prac.data.runId === null && prac.data.practice === true);

// 1-1 시작 → 종료(클리어) → 첫 클리어 보상
const g1 = await api('POST', '/game/start', { mode: 'STAGE', stageNo: 1, userPetId: petId }, token);
check('POST /game/start 1-1', g1.ok && g1.data.runId > 0 && g1.data.combatStats.attack > 0 && Array.isArray(g1.data.upgrades), JSON.stringify(g1.error ?? ''));
const run1 = g1.data?.runId;
const badFinish = await api('POST', `/game/${run1}/finish`, { survivalMs: 999999999, killCount: 1, reachedWave: 1, cleared: true, reviveUsed: false }, token);
check('생존시간 조작 → VALIDATION', !badFinish.ok && badFinish.error.code === 'VALIDATION');
const f1 = await api('POST', `/game/${run1}/finish`, { survivalMs: 3000, killCount: 4, reachedWave: 1, cleared: true, reviveUsed: false }, token);
// score = 3*10 + 4*5 + 50(1-1 보너스) = 100, 반복보상 7 + 첫클리어 40, exp 10
check('POST /game/:id/finish 1-1 클리어 (score 100, 셀 7+40)',
  f1.ok && f1.data.score === 100 && f1.data.rewardCell === 7 && f1.data.firstClearBonus === 40 && f1.data.expGained === 10 && f1.data.balance === 1047,
  JSON.stringify(f1.data ?? f1.error));
const f1b = await api('POST', `/game/${run1}/finish`, { survivalMs: 3000, killCount: 4, reachedWave: 1, cleared: true, reviveUsed: false }, token);
check('같은 run 재종료 → 같은 결과, replayed=true, 잔액 그대로', f1b.ok && f1b.data.replayed === true && f1b.data.balance === 1047 && f1b.data.score === 100);
const ab1 = await api('POST', `/game/${run1}/abort`, null, token);
check('끝난 판 abort → ALREADY_FINISHED', !ab1.ok && ab1.error.code === 'ALREADY_FINISHED');

const st2 = await api('GET', '/stages', null, token);
check('1-1 클리어 후 1-2 해금', st2.ok && st2.data.stages[0].cleared && st2.data.stages[1].unlocked && !st2.data.stages[2].unlocked);

// 1-1 반복 클리어 → 반복 보상만
const g2 = await api('POST', '/game/start', { mode: 'STAGE', stageNo: 1, userPetId: petId }, token);
const f2 = await api('POST', `/game/${g2.data.runId}/finish`, { survivalMs: 1000, killCount: 0, reachedWave: 1, cleared: true, reviveUsed: false }, token);
check('1-1 반복 클리어 → 첫클리어 보너스 0', f2.ok && f2.data.firstClearBonus === 0 && f2.data.rewardCell === 7);

// abort
const g3 = await api('POST', '/game/start', { mode: 'STAGE', stageNo: 2, userPetId: petId }, token);
const ab3 = await api('POST', `/game/${g3.data.runId}/abort`, null, token);
check('POST /game/:id/abort', ab3.ok && ab3.data.runId === g3.data.runId);
const f3 = await api('POST', `/game/${g3.data.runId}/finish`, { survivalMs: 1000, killCount: 0, reachedWave: 1, cleared: false, reviveUsed: false }, token);
check('중단된 판 finish → ALREADY_FINISHED', !f3.ok && f3.error.code === 'ALREADY_FINISHED');

// 4-3 클리어 처리(DB 직접) → 무한모드 해금 → 종료 → 랭킹
await pool.query('INSERT INTO user_stage_clear (user_id, stage_no) SELECT $1, n FROM generate_series(1,12) n ON CONFLICT DO NOTHING', [userId]);
const g4 = await api('POST', '/game/start', { mode: 'ENDLESS', userPetId: petId }, token);
check('무한모드 시작 (4-3 클리어 후)', g4.ok && g4.data.mode === 'ENDLESS' && g4.data.stageNo === null, JSON.stringify(g4.error ?? ''));
const f4 = await api('POST', `/game/${g4.data.runId}/finish`, { survivalMs: 2000, killCount: 20, reachedWave: 5, cleared: false, reviveUsed: true }, token);
// score = 20 + 100 = 120 → 셀 1, exp 12
check('무한모드 종료 (score 120, 셀 1, 순위 있음)', f4.ok && f4.data.score === 120 && f4.data.rewardCell === 1 && f4.data.newRank >= 1, JSON.stringify(f4.data ?? f4.error));
const rk = await api('GET', '/ranking', null, token);
check('GET /ranking (내 순위 포함, 상위 10 이내)', rk.ok && rk.data.myRank?.userId === userId && rk.data.entries.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(rk.data.weekStart));
const hist = await api('GET', '/game/history?mode=ENDLESS&limit=5', null, token);
check('GET /game/history?mode=ENDLESS', hist.ok && hist.data.length === 1 && hist.data[0].mode === 'ENDLESS');
const histAll = await api('GET', '/game/history', null, token);
check('GET /game/history 전체 (4판, 연습 제외)', histAll.ok && histAll.data.length === 4);

// 강화
const up0 = await api('GET', '/stat-upgrades', null, token);
check('GET /stat-upgrades (8종, DAMAGE 0단계 다음 60셀)', up0.ok && up0.data.length === 8 && up0.data.find(u => u.statCode === 'DAMAGE')?.nextCellCost === 60);
const buy = await api('POST', '/stat-upgrades/DAMAGE', null, token);
check('POST /stat-upgrades/DAMAGE → 1단계, +10%, 셀 -60', buy.ok && buy.data.upgrade.level === 1 && buy.data.upgrade.valueBonus === 10 && buy.data.upgrade.unit === 'PERCENT' && buy.data.upgrade.nextCellCost === 100, JSON.stringify(buy.data ?? buy.error));
const buyPc1 = await api('POST', '/stat-upgrades/PROJECTILE_COUNT', null, token);
const buyPc2 = await api('POST', '/stat-upgrades/PROJECTILE_COUNT', null, token);
const buyPc3 = await api('POST', '/stat-upgrades/PROJECTILE_COUNT', null, token);
check('발사체 개수 2단계 만렙 → 3번째는 VALIDATION', buyPc1.ok && buyPc2.ok && buyPc2.data.upgrade.level === 2 && !buyPc3.ok && buyPc3.error.code === 'VALIDATION');
const g5 = await api('POST', '/game/start', { mode: 'STAGE', stageNo: 1, userPetId: petId, practice: true }, token);
check('GameStart.upgrades 에 미니게임 강화 포함', g5.ok && g5.data.upgrades.find(u => u.statCode === 'PROJECTILE_COUNT')?.level === 2);

// 스텁 라우트
const stub = await api('GET', '/pets', null, token);
check('미구현 라우트 → 501 NOT_IMPLEMENTED', !stub.ok && stub.error.code === 'NOT_IMPLEMENTED');

const { rows: [sum2] } = await pool.query(
  `SELECT u.cell_balance, COALESCE(SUM(t.amount),0) AS total FROM app_user u
     LEFT JOIN cell_transaction t ON t.user_id = u.user_id WHERE u.user_id = $1 GROUP BY u.cell_balance`, [userId]);
check('미니게임 후에도 잔액 = cell_transaction 합계', Number(sum2.cell_balance) === Number(sum2.total), `${sum2.cell_balance} / ${sum2.total}`);

// 정리
await pool.query('DELETE FROM app_user WHERE user_id = $1', [userId]);
await pool.end();
console.log(failed ? `\n❌ ${failed}개 실패` : '\n✅ 전부 통과');
process.exit(failed ? 1 : 0);
