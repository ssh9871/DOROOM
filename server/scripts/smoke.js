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

// 스텁 라우트
const stub = await api('GET', '/pets', null, token);
check('미구현 라우트 → 501 NOT_IMPLEMENTED', !stub.ok && stub.error.code === 'NOT_IMPLEMENTED');

// 정리
await pool.query('DELETE FROM app_user WHERE user_id = $1', [userId]);
await pool.end();
console.log(failed ? `\n❌ ${failed}개 실패` : '\n✅ 전부 통과');
process.exit(failed ? 1 : 0);
