// 🟥 미니게임 — 스테이지 해금 · 게임 시작/종료 · 점수/보상 계산 · 주차 계산
// 셀은 addCell, 경험치는 addPetExp 로만 바꾼다. 공식 숫자는 전부 [가정] → 상단 상수만 수정.
import { getSetting } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { addCell, getBalance } from './cellService.js';
import { addPetExp, getPet, getPetCombatStats, assertPetCanSortie } from './petService.js';
import { useItem } from './inventoryService.js';

// ── 공식 [가정] ─────────────────────────────────────────────
export const SCORE = {
  perSecond: 10,          // 생존 1초당
  perKill: 5,             // 처치 1마리당
};
export const REWARD = {
  scoreCellDivisor: 100,     // 점수 보상 셀 = floor(score / 100)
  expDivisor: 10,            // 경험치 = floor(score / 10)
};
export const VALIDATION = {
  survivalSlackMs: 5000,     // 서버가 잰 시간 + 5초까지 허용
  maxKillsPerSecond: 20,
  maxWave: 9999,
};
// 무한 모드 구역 규칙 — client/src/game/endless.ts 의 ENDLESS 와 같은 값이어야 함
export const ENDLESS_RULE = {
  zoneSeconds: 90,           // 구역 진입 후 보스 등장까지(초) → 구역 k 보스는 빨라도 (k+1)*90초 이후에 정화 가능
  zoneClearBonus: 50,        // 구역 k(0부터) 보스 정화 보너스 = 50 × (k + 1)
};
export const zoneBonusScore = (clearedAreas) =>
  clearedAreas.reduce((sum, area) => sum + ENDLESS_RULE.zoneClearBonus * (area + 1), 0);

/** clearedAreas 검증: 0 이상 정수, 오름차순·중복 없음, 생존 시간 안에 도달 가능한 구역만 */
export function validateClearedAreas(raw, survivalMs) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 1000) throw new AppError('VALIDATION', 'clearedAreas 는 배열');
  const reachable = Math.floor(survivalMs / 1000 / ENDLESS_RULE.zoneSeconds);   // 이만큼의 구역 보스까지 등장 가능
  raw.forEach((area, i) => {
    if (!Number.isInteger(area) || area < 0) throw new AppError('VALIDATION', 'clearedAreas 는 0 이상 정수');
    if (i > 0 && area <= raw[i - 1]) throw new AppError('VALIDATION', 'clearedAreas 는 오름차순·중복 없음');
    if (area + 1 > reachable) throw new AppError('VALIDATION', '생존 시간으로 도달할 수 없는 구역입니다');
  });
  return raw;
}

export const ENDLESS_UNLOCK_STAGE_NO = 12;  // 4-3 클리어 시 무한모드 해금
export const TOTAL_STAGES = 12;
// ────────────────────────────────────────────────────────────

/** 종료 시각 → 한국시간 기준 그 주 월요일 날짜 ('YYYY-MM-DD'). SQL 로 계산해 TZ 실수 방지 */
export async function kstWeekStart(db, at /* Date | undefined */) {
  const { rows } = await db.query(
    `SELECT date_trunc('week', ($1::timestamptz AT TIME ZONE 'Asia/Seoul'))::date AS ws`, [at ?? new Date()]);
  return rows[0].ws; // 'YYYY-MM-DD'
}

export const stageDto = (r) => ({
  stageNo: r.stage_no, displayId: r.display_id, worldNo: r.world_no, subNo: r.sub_no, isBoss: r.is_boss,
  name: r.name, bossName: r.boss_name, briefing: r.briefing,
  clearBonusScore: r.clear_bonus_score,
  firstClearRewardCell: r.first_clear_reward_cell, repeatRewardCell: r.repeat_reward_cell,
  unlocked: r.unlocked, cleared: r.cleared,
});

/** 지점 목록 + 해금/클리어 상태 + 무한모드 해금 여부 */
export async function listStages(db, userId) {
  const { rows } = await db.query(
    `SELECT s.*, (c.stage_no IS NOT NULL) AS cleared,
            (s.stage_no = 1 OR EXISTS (SELECT 1 FROM user_stage_clear p WHERE p.user_id = $1 AND p.stage_no = s.stage_no - 1)) AS unlocked
       FROM stage s LEFT JOIN user_stage_clear c ON c.user_id = $1 AND c.stage_no = s.stage_no
      ORDER BY s.stage_no`, [userId]);
  const stages = rows.map(stageDto);
  const endlessUnlocked = stages.some(s => s.stageNo === ENDLESS_UNLOCK_STAGE_NO && s.cleared);
  return { stages, endlessUnlocked };
}

async function isStageUnlocked(db, userId, stageNo) {
  if (stageNo === 1) return true;
  const { rows } = await db.query(
    'SELECT 1 FROM user_stage_clear WHERE user_id = $1 AND stage_no = $2', [userId, stageNo - 1]);
  return rows.length > 0;
}
async function isEndlessUnlocked(db, userId) {
  const { rows } = await db.query(
    'SELECT 1 FROM user_stage_clear WHERE user_id = $1 AND stage_no = $2', [userId, ENDLESS_UNLOCK_STAGE_NO]);
  return rows.length > 0;
}

/** 보유 중인 영구 강화 (미니게임 코드 포함) → StatUpgrade[] */
export async function listStatUpgrades(db, userId) {
  const { rows } = await db.query(
    `SELECT c.stat_code, c.name, c.unit, c.scope,
            COALESCE(u.level, 0) AS level,
            (SELECT MAX(level) FROM stat_upgrade_rule r WHERE r.stat_code = c.stat_code) AS max_level,
            COALESCE((SELECT value_bonus FROM stat_upgrade_rule r WHERE r.stat_code = c.stat_code AND r.level = COALESCE(u.level, 0)), 0) AS value_bonus,
            (SELECT cell_cost FROM stat_upgrade_rule r WHERE r.stat_code = c.stat_code AND r.level = COALESCE(u.level, 0) + 1) AS next_cell_cost
       FROM stat_code c
       LEFT JOIN user_stat_upgrade u ON u.user_id = $1 AND u.stat_code = c.stat_code
      ORDER BY c.scope, c.stat_code`, [userId]);
  return rows.map(r => ({
    statCode: r.stat_code, name: r.name, unit: r.unit, scope: r.scope,
    level: r.level, maxLevel: r.max_level, valueBonus: Number(r.value_bonus),
    nextCellCost: r.next_cell_cost ?? null,
  }));
}

/**
 * 게임 시작. practice=true 면 DB 기록 없이 능력치만 돌려줌 (디버그 연습: 전적·보상·랭킹 제외)
 * @returns GameStart
 */
export async function startGame(client, userId, { mode, stageNo, userPetId, buffItemIds = [], entryBuffItemIds = [], startRequestId = null, practice = false }) {
  if (!['STAGE', 'ENDLESS'].includes(mode)) throw new AppError('VALIDATION', 'mode 는 STAGE 또는 ENDLESS');
  if (!Number.isInteger(userPetId)) throw new AppError('VALIDATION', 'userPetId 필요');
  // 보유 버프 소모(buffItemIds)와 유료 선택(entryBuffItemIds)은 한 요청에 같이 쓸 수 없다
  if (buffItemIds.length && entryBuffItemIds.length) {
    throw new AppError('VALIDATION', 'buffItemIds 와 entryBuffItemIds 는 함께 보낼 수 없어요');
  }
  if (entryBuffItemIds.some(id => !Number.isInteger(id) || id <= 0)) throw new AppError('VALIDATION', 'entryBuffItemIds 오류');
  if (startRequestId !== null && (typeof startRequestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(startRequestId))) {
    throw new AppError('VALIDATION', 'startRequestId 는 8~64자 영문·숫자·-·_');
  }
  const paid = !practice && entryBuffItemIds.length > 0;   // 연습 모드는 기존대로 버프 없이, 결제 없이

  // 소유권 + 출전 가능 (둘 다 req.userId 기준)
  const pet = await getPet(client, userId, userPetId);            // 남의 펫이면 NOT_FOUND
  await assertPetCanSortie(client, userId, userPetId);

  let stage = null;
  if (mode === 'STAGE') {
    if (!Number.isInteger(stageNo)) throw new AppError('VALIDATION', 'STAGE 모드는 stageNo 필요');
    const { rows } = await client.query('SELECT * FROM stage WHERE stage_no = $1', [stageNo]);
    if (!rows.length) throw new AppError('NOT_FOUND', '지점 없음');
    stage = rows[0];
    if (!practice && !(await isStageUnlocked(client, userId, stageNo))) {
      throw new AppError('VALIDATION', `${stage.display_id} 은(는) 아직 열리지 않았습니다 (직전 지점을 먼저 클리어)`);
    }
  } else {
    stageNo = null;
    if (!practice && !(await isEndlessUnlocked(client, userId))) {
      throw new AppError('VALIDATION', '무한 모드는 4-3 클리어 후 열립니다');
    }
  }

  const combatStats = await getPetCombatStats(client, userId, userPetId);
  const upgrades = await listStatUpgrades(client, userId);
  const reply = (runId, appliedBuffs, extra = {}) => ({
    runId, practice, mode, stageNo,
    stage: stage ? stageDto({ ...stage, unlocked: true, cleared: false }) : null,
    pet, combatStats, upgrades, appliedBuffs, ...extra,
  });

  // ── 유료 입장 버프: 선택 검증 → 셀 차감 → 출동 기록을 한 트랜잭션으로 (11/26 석훈 요청) ──
  if (paid) {
    // 같은 사람의 출동 시작을 줄 세운다 (같은 요청 ID 동시 재전송 → 한 번만 결제)
    await client.query('SELECT 1 FROM app_user WHERE user_id = $1 FOR UPDATE', [userId]);
    if (startRequestId) {
      const prev = await client.query(
        'SELECT run_id, applied_buffs FROM game_run WHERE user_id = $1 AND start_request_id = $2', [userId, startRequestId]);
      if (prev.rows.length) {                                    // 이미 성공한 같은 요청 → 결제 없이 그대로 돌려줌
        const codes = (prev.rows[0].applied_buffs ?? []).map(b => b?.code).filter(Boolean);
        const items = (await client.query('SELECT * FROM item WHERE code = ANY($1) ORDER BY item_id', [codes])).rows;
        return reply(Number(prev.rows[0].run_id), items.map(buffDto), { balance: await getBalance(client, userId), replayed: true });
      }
    }
    const ids = [...new Set(entryBuffItemIds)].sort((a, b) => a - b);
    if (ids.length !== entryBuffItemIds.length) throw new AppError('VALIDATION', '같은 버프는 한 판에 한 번만 고를 수 있어요');
    const { rows } = await client.query(
      `SELECT * FROM item WHERE item_id = ANY($1) AND item_type = 'GAME_BUFF' AND is_active ORDER BY item_id`, [ids]);
    if (rows.length !== ids.length) throw new AppError('VALIDATION', '판매 중인 입장 버프가 아닌 것이 있어요');
    const types = rows.map(i => i.effect_config?.type);
    if (new Set(types).size !== types.length) throw new AppError('VALIDATION', '같은 효과의 버프는 한 판에 하나만 고를 수 있어요');
    // 결제: 버프마다 ITEM_PURCHASE + item_id 로 원장 기록. 보유 수량(user_item)은 건드리지 않는다
    let balance = await getBalance(client, userId);
    for (const i of rows) balance = await addCell(client, userId, -i.price_cell, 'ITEM_PURCHASE', i.item_id);  // 부족하면 NOT_ENOUGH_CELL → 전부 취소
    const appliedBuffs = rows.map(buffDto);
    const ins = await client.query(
      `INSERT INTO game_run (user_id, user_pet_id, species_id, pet_level_snapshot, pet_stage_snapshot, mode, stage_no, status, applied_buffs, start_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PLAYING', $8, $9) RETURNING run_id`,
      [userId, userPetId, pet.species.speciesId, pet.level, pet.evolutionStage, mode, stageNo,
       JSON.stringify(appliedBuffs.map(b => ({ code: b.code, itemId: b.itemId, effectConfig: b.effectConfig }))), startRequestId]);
    return reply(Number(ins.rows[0].run_id), appliedBuffs, { balance });
  }

  // 버프 아이템 (서로 다른 효과는 함께 OK, 같은 효과는 한 판에 1개). 연습 모드에서는 소모하지 않음
  const appliedBuffs = [];
  if (!practice && buffItemIds.length) {
    const ids = [...new Set(buffItemIds)].sort((a, b) => a - b);          // 같은 아이템 중복 제거, ID 순으로 차감
    if (ids.length !== buffItemIds.length) throw new AppError('VALIDATION', '같은 버프는 한 판에 한 번만 쓸 수 있어요');
    const { rows } = await client.query(
      `SELECT * FROM item WHERE item_id = ANY($1) AND item_type = 'GAME_BUFF' ORDER BY item_id`, [ids]);
    if (rows.length !== ids.length) throw new AppError('VALIDATION', '게임 버프 아이템이 아닌 것이 있어요');
    const types = rows.map(i => i.effect_config?.type);
    if (new Set(types).size !== types.length) throw new AppError('VALIDATION', '같은 효과의 버프는 한 판에 하나만 쓸 수 있어요');
    for (const i of rows) {
      await useItem(client, userId, i.item_id, 1);                      // 부족하면 NOT_ENOUGH_ITEM → 전부 취소
      appliedBuffs.push(buffDto(i));
    }
  }

  let runId = null;
  if (!practice) {
    const { rows } = await client.query(
      `INSERT INTO game_run (user_id, user_pet_id, species_id, pet_level_snapshot, pet_stage_snapshot, mode, stage_no, status, applied_buffs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PLAYING', $8) RETURNING run_id`,
      [userId, userPetId, pet.species.speciesId, pet.level, pet.evolutionStage, mode, stageNo,
       JSON.stringify(appliedBuffs.map(b => ({ code: b.code, itemId: b.itemId, effectConfig: b.effectConfig })))]);  // 종료 때 이 값으로 보상 계산
    runId = rows[0].run_id;
  }

  return reply(runId, appliedBuffs);
}

const buffDto = (i) => ({ itemId: i.item_id, code: i.code, name: i.name, itemType: i.item_type, priceCell: i.price_cell,
  hungerRestore: i.hunger_restore, affectionRestore: i.affection_restore, expGain: i.exp_gain, effectConfig: i.effect_config ?? {} });

/**
 * 출동 기록에 저장된 버프 → 보상 증가율(%).
 * 예전 형식(코드 문자열 배열)이나 효과 설정이 없는 기록은 0% (기본 보상)
 */
export function buffBoosts(appliedBuffs) {
  const list = Array.isArray(appliedBuffs) ? appliedBuffs : [];
  const sum = (type) => list.reduce((acc, b) => {
    const cfg = b && typeof b === 'object' ? b.effectConfig : null;
    return acc + (cfg?.type === type && Number.isFinite(Number(cfg.percent)) ? Number(cfg.percent) : 0);
  }, 0);
  return { expPercent: sum('EXP_BOOST'), cellPercent: sum('CELL_BOOST') };
}

/** 점수 계산 (서버만) */
export function calcScore({ survivalMs, killCount, cleared, clearedAreas = [] }, stage) {
  return Math.floor(survivalMs / 1000) * SCORE.perSecond + killCount * SCORE.perKill
       + (cleared && stage ? stage.clear_bonus_score : 0)
       + zoneBonusScore(clearedAreas);
}

/**
 * 게임 종료 + 보상. 같은 runId 로 두 번 호출되면 두 번째는 저장된 결과를 그대로 돌려줌 (보상 중복 없음).
 * finish 와 abort 가 동시에 와도 행 잠금(FOR UPDATE)으로 한쪽만 확정된다.
 * @returns GameResult
 */
export async function finishGame(client, userId, runId, body) {
  const { rows } = await client.query(
    'SELECT * FROM game_run WHERE run_id = $1 AND user_id = $2 FOR UPDATE', [runId, userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '출동 기록 없음');     // 남의 출동도 NOT_FOUND
  const run = rows[0];

  if (run.status === 'FINISHED') return buildResult(client, userId, run, { replayed: true });
  if (run.status !== 'PLAYING') throw new AppError('ALREADY_FINISHED', '이미 중단된 판입니다');

  // 입력 검증
  const survivalMs = Number(body.survivalMs), killCount = Number(body.killCount), reachedWave = Number(body.reachedWave ?? 0);
  const cleared = body.cleared === true, reviveUsed = body.reviveUsed === true;
  if (![survivalMs, killCount, reachedWave].every(Number.isInteger) || survivalMs < 0 || killCount < 0 || reachedWave < 0)
    throw new AppError('VALIDATION', 'survivalMs, killCount, reachedWave 는 0 이상 정수');
  const elapsedMs = Date.now() - new Date(run.started_at).getTime();
  if (survivalMs > elapsedMs + VALIDATION.survivalSlackMs) throw new AppError('VALIDATION', '생존 시간이 서버 기록보다 깁니다');
  if (killCount > Math.ceil(survivalMs / 1000) * VALIDATION.maxKillsPerSecond + VALIDATION.maxKillsPerSecond)
    throw new AppError('VALIDATION', '처치 수가 비정상입니다');
  if (reachedWave > VALIDATION.maxWave) throw new AppError('VALIDATION', 'reachedWave 비정상');
  if (run.mode === 'ENDLESS' && cleared) throw new AppError('VALIDATION', '무한 모드에는 클리어가 없습니다');
  if (run.mode === 'STAGE' && body.clearedAreas?.length) throw new AppError('VALIDATION', 'clearedAreas 는 무한 모드 전용');
  const clearedAreas = run.mode === 'ENDLESS' ? validateClearedAreas(body.clearedAreas, survivalMs) : [];

  let stage = null;
  if (run.mode === 'STAGE') {
    stage = (await client.query('SELECT * FROM stage WHERE stage_no = $1', [run.stage_no])).rows[0];
  }

  // 점수·보상 계산
  const score = calcScore({ survivalMs, killCount, cleared, clearedAreas }, stage);
  const boost = buffBoosts(run.applied_buffs);
  // 점수 기반 셀만 증가. 클리어 반복 보상·첫 클리어 보너스는 그대로
  const scoreCells = Math.floor(score * (100 + boost.cellPercent) / (REWARD.scoreCellDivisor * 100));
  const scoreRewardCell = stage ? scoreCells : 0;
  let rewardCell = scoreCells, firstClearBonus = 0;
  if (stage && cleared) {
    rewardCell += stage.repeat_reward_cell;
    // 첫 클리어: PK (user_id, stage_no) 로 동시 요청에서도 한 번만
    const ins = await client.query(
      `INSERT INTO user_stage_clear (user_id, stage_no, first_run_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, stage_no) DO NOTHING RETURNING stage_no`, [userId, run.stage_no, runId]);
    if (ins.rows.length) firstClearBonus = stage.first_clear_reward_cell;
  }
  const expGained = Math.floor(score * (100 + boost.expPercent) / (REWARD.expDivisor * 100));

  // 지급 (원장 기록; uq_cell_tx_reward_once 인덱스가 같은 run 의 중복 지급을 DB 차원에서 막음)
  if (rewardCell > 0) await addCell(client, userId, rewardCell, 'GAME_REWARD', runId);
  if (firstClearBonus > 0) await addCell(client, userId, firstClearBonus, 'STAGE_FIRST_CLEAR', runId);
  if (expGained > 0) {
    const petExists = await client.query('SELECT 1 FROM user_pet WHERE user_pet_id = $1', [run.user_pet_id]);
    if (petExists.rows.length) await addPetExp(client, run.user_pet_id, expGained);   // 펫이 삭제된 경우 경험치만 생략
  }

  const endedAt = new Date();
  const weekStart = await kstWeekStart(client, endedAt);
  await client.query(
    `UPDATE game_run SET status = 'FINISHED', reached_wave = $2, cleared = $3, survival_ms = $4, kill_count = $5,
            score = $6, revive_used = $7, reward_cell = $8, exp_gained = $9, week_start = $10, ended_at = $11,
            score_reward_cell = $12
      WHERE run_id = $1`,
    [runId, reachedWave, cleared, survivalMs, killCount, score, reviveUsed, rewardCell + firstClearBonus,
      expGained, weekStart, endedAt, scoreRewardCell]);

  const updated = (await client.query('SELECT * FROM game_run WHERE run_id = $1', [runId])).rows[0];
  return buildResult(client, userId, updated, { replayed: false, firstClearBonus });
}

/** 저장된 game_run 행 → GameResult (재요청 시에도 같은 값) */
async function buildResult(client, userId, run, { replayed, firstClearBonus }) {
  if (firstClearBonus == null) {
    const fc = await client.query(
      `SELECT amount FROM cell_transaction WHERE user_id = $1 AND reason = 'STAGE_FIRST_CLEAR' AND ref_id = $2`, [userId, run.run_id]);
    firstClearBonus = fc.rows[0]?.amount ?? 0;
  }
  let newRank = null;
  if (run.mode === 'ENDLESS' && run.week_start) {
    const r = await client.query(
      'SELECT rank_no FROM v_weekly_ranking WHERE week_start = $1 AND user_id = $2', [run.week_start, userId]);
    newRank = r.rows[0]?.rank_no ?? null;
  }
  let pet = null;
  try { pet = await getPet(client, userId, run.user_pet_id); } catch { /* 펫 삭제됨 */ }
  return {
    runId: run.run_id, replayed, mode: run.mode, stageNo: run.stage_no,
    score: run.score, rewardCell: run.reward_cell - firstClearBonus, scoreRewardCell: run.score_reward_cell,
    firstClearBonus, expGained: run.exp_gained,
    cleared: run.cleared, pet, balance: await getBalance(client, userId), newRank,
  };
}

/** 중도 포기: 이미 중단한 판은 같은 runId 응답, 정상 종료한 판은 ALREADY_FINISHED */
export async function abortGame(client, userId, runId) {
  const { rows } = await client.query(
    'SELECT status FROM game_run WHERE run_id = $1 AND user_id = $2 FOR UPDATE', [runId, userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '출동 기록 없음');
  if (rows[0].status === 'ABORTED') return { runId };
  if (rows[0].status !== 'PLAYING') throw new AppError('ALREADY_FINISHED');
  await client.query(`UPDATE game_run SET status = 'ABORTED', ended_at = now() WHERE run_id = $1`, [runId]);
  return { runId };
}

export const runDto = (r) => ({
  runId: r.run_id, mode: r.mode, stageNo: r.stage_no, displayId: r.display_id ?? null, status: r.status,
  score: r.score, survivalMs: r.survival_ms, killCount: r.kill_count, reachedWave: r.reached_wave,
  cleared: r.cleared, rewardCell: r.reward_cell, expGained: r.exp_gained, startedAt: r.started_at, endedAt: r.ended_at,
});

/** 내 전적 (연습 모드는 애초에 기록되지 않음). mode 필터, limit/offset 페이지 */
export async function listHistory(db, userId, { mode, limit = 20, offset = 0 }) {
  const params = [userId];
  let where = 'g.user_id = $1';
  if (mode) { params.push(mode); where += ` AND g.mode = $${params.length}`; }
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT g.*, s.display_id FROM game_run g LEFT JOIN stage s ON s.stage_no = g.stage_no
      WHERE ${where} ORDER BY g.run_id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows.map(runDto);
}

/** 주간 랭킹: 상위 N + 내 순위 */
export async function getRanking(db, userId, { weekStart, limit = 10 }) {
  const ws = weekStart ?? await kstWeekStart(db);
  const entrySql = `
    SELECT v.rank_no, v.user_id, v.best_score, v.achieved_at, u.nickname, t.title_id, t.code AS t_code, t.name AS t_name
      FROM v_weekly_ranking v
      JOIN app_user u ON u.user_id = v.user_id
      LEFT JOIN title t ON t.title_id = u.equipped_title_id
     WHERE v.week_start = $1`;
  const top = await db.query(`${entrySql} ORDER BY v.rank_no, v.achieved_at LIMIT $2`, [ws, limit]);
  const mine = await db.query(`${entrySql} AND v.user_id = $2`, [ws, userId]);
  const dto = (r) => ({
    rank: r.rank_no, userId: r.user_id, nickname: r.nickname, bestScore: r.best_score, achievedAt: r.achieved_at,
    title: r.title_id ? { titleId: r.title_id, code: r.t_code, name: r.t_name } : null,
  });
  return { weekStart: ws, myRank: mine.rows[0] ? dto(mine.rows[0]) : null, entries: top.rows.map(dto) };
}

/** 영구 강화 1단계 구매 (같은 트랜잭션에서 셀 차감 + 단계 갱신) */
export async function buyStatUpgrade(client, userId, statCode) {
  const def = await client.query('SELECT * FROM stat_code WHERE stat_code = $1', [statCode]);
  if (!def.rows.length) throw new AppError('NOT_FOUND', '없는 스탯 코드');
  const cur = await client.query(
    `INSERT INTO user_stat_upgrade (user_id, stat_code, level) VALUES ($1, $2, 0)
     ON CONFLICT (user_id, stat_code) DO UPDATE SET level = user_stat_upgrade.level
     RETURNING level`, [userId, statCode]);              // 행 생성 + 잠금
  const level = cur.rows[0].level;
  const next = await client.query(
    'SELECT cell_cost FROM stat_upgrade_rule WHERE stat_code = $1 AND level = $2', [statCode, level + 1]);
  if (!next.rows.length) throw new AppError('VALIDATION', '이미 최대 단계입니다');
  const balance = await addCell(client, userId, -next.rows[0].cell_cost, 'STAT_UPGRADE', null);
  await client.query('UPDATE user_stat_upgrade SET level = $3 WHERE user_id = $1 AND stat_code = $2', [userId, statCode, level + 1]);
  const upgrades = await listStatUpgrades(client, userId);
  return { upgrade: upgrades.find(u => u.statCode === statCode), balance };
}
