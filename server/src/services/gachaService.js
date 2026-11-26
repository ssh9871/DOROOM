// 🟩 도로팜 — 뽑기 (명세서 3장)  담당: 창규
// 확률은 gacha_grade_rate(등급 단위). 같은 등급 안에서는 후보(gacha_pool_entry)끼리 똑같은 확률.
import { randomInt } from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { addCell } from './cellService.js';
import { addEquipment, equipmentDto } from './inventoryService.js';
import { getPet } from './petService.js';

const GRADES = ['NORMAL', 'RARE', 'LEGEND'];
const pct = (bp) => Math.round(bp) / 100;                       // 만분율 → % (8500 → 85)

/** 오늘(한국시간) 이 뽑기를 몇 번 했는지 */
export async function drawnToday(db, userId, poolId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM gacha_log
      WHERE user_id = $1 AND pool_id = $2
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')`,
    [userId, poolId]);
  return rows[0].n;
}

/** 마지막 LEGEND 이후 몇 번 뽑았는지 (천장 진행도) */
export async function drawsSinceLegend(db, userId, poolId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM gacha_log g
      WHERE g.user_id = $1 AND g.pool_id = $2
        AND g.gacha_id > COALESCE((
              SELECT max(l.gacha_id) FROM gacha_log l
                LEFT JOIN pet_species s ON s.species_id = l.species_id
                LEFT JOIN equipment  e ON e.equipment_id = l.equipment_id
               WHERE l.user_id = $1 AND l.pool_id = $2 AND COALESCE(s.grade, e.grade) = 'LEGEND'), 0)`,
    [userId, poolId]);
  return rows[0].n;
}

/** 뽑기 목록 + 등급 확률 + 후보별 확률 + 내 오늘 횟수·천장 진행도 → GachaPool[] */
export async function listPools(db, userId) {
  const pools = (await db.query('SELECT * FROM gacha_pool WHERE is_active ORDER BY pool_id')).rows;
  const result = [];
  for (const p of pools) {
    const rates = (await db.query(
      'SELECT grade, rate_bp FROM gacha_grade_rate WHERE pool_id = $1', [p.pool_id])).rows;
    const rateOf = Object.fromEntries(rates.map(r => [r.grade, r.rate_bp]));

    const cand = (await db.query(
      `SELECT e.entry_id,
              s.species_id, s.name AS s_name, s.grade AS s_grade, s.model_url AS s_model,
              a.ability_id, a.code AS a_code, a.name AS a_name, a.effect_value, a.cooldown_sec,
              q.*
         FROM gacha_pool_entry e
         LEFT JOIN pet_species s ON s.species_id = e.species_id
         LEFT JOIN ability a ON a.ability_id = s.innate_ability_id
         LEFT JOIN equipment q ON q.equipment_id = e.equipment_id
        WHERE e.pool_id = $1
        ORDER BY e.entry_id`, [p.pool_id])).rows;
    const gradeOf = (c) => c.s_grade ?? c.grade;
    const countByGrade = {};
    for (const c of cand) countByGrade[gradeOf(c)] = (countByGrade[gradeOf(c)] ?? 0) + 1;

    const entries = cand.map(c => {
      const g = gradeOf(c);
      const probability = pct((rateOf[g] ?? 0) / countByGrade[g]);
      return c.species_id
        ? { species: { speciesId: c.species_id, name: c.s_name, grade: c.s_grade, modelUrl: c.s_model,
                       ability: { abilityId: c.ability_id, code: c.a_code, name: c.a_name,
                                  effectValue: Number(c.effect_value), cooldownSec: c.cooldown_sec } },
            probability }
        : { equipment: equipmentDto(c), probability };
    });

    result.push({
      poolId: p.pool_id, poolType: p.pool_type, name: p.name, costCell: p.cost_cell,
      pityCount: p.pity_count, dailyLimit: p.daily_limit,
      drawnToday: await drawnToday(db, userId, p.pool_id),
      drawsSinceLegend: p.pity_count ? await drawsSinceLegend(db, userId, p.pool_id) : null,
      gradeRates: GRADES.filter(g => rateOf[g] != null && countByGrade[g]).map(g => ({ grade: g, probability: pct(rateOf[g]) })),
      entries,
    });
  }
  return result;
}

/**
 * 뽑기 1회. withTransaction 안에서 호출 (중간에 실패하면 셀·펫·기록 전부 취소).
 * 순서: 회원 잠금 → 하루 횟수 확인 → 등급 추첨(천장이면 LEGEND 확정) → 등급 안에서 후보 균등 추첨
 *      → 기록 → 셀 차감 → 펫 지급 or 중복 환급 / 장비 수량 +1
 * @returns GachaResult
 */
export async function drawOnce(client, userId, poolId) {
  const poolRow = (await client.query('SELECT * FROM gacha_pool WHERE pool_id = $1 AND is_active', [poolId])).rows[0];
  if (!poolRow) throw new AppError('NOT_FOUND', '없는 뽑기입니다');

  // 같은 사람이 동시에 여러 번 누르면 한 번씩 차례로 처리되게 회원 행을 잠금
  await client.query('SELECT 1 FROM app_user WHERE user_id = $1 FOR UPDATE', [userId]);

  if (poolRow.daily_limit && (await drawnToday(client, userId, poolId)) >= poolRow.daily_limit) {
    throw new AppError('DAILY_LIMIT', `오늘은 ${poolRow.daily_limit}번까지 뽑을 수 있어요`);
  }

  // 후보 (등급별로 묶기)
  const cand = (await client.query(
    `SELECT e.species_id, e.equipment_id, COALESCE(s.grade, q.grade) AS grade
       FROM gacha_pool_entry e
       LEFT JOIN pet_species s ON s.species_id = e.species_id
       LEFT JOIN equipment q ON q.equipment_id = e.equipment_id
      WHERE e.pool_id = $1`, [poolId])).rows;
  const byGrade = {};
  for (const c of cand) (byGrade[c.grade] ??= []).push(c);

  // 1) 등급 추첨 — 후보가 있는 등급만, 확률 합으로 정규화
  const rates = (await client.query(
    'SELECT grade, rate_bp FROM gacha_grade_rate WHERE pool_id = $1', [poolId])).rows
    .filter(r => r.rate_bp > 0 && byGrade[r.grade]?.length);
  if (!rates.length) throw new AppError('VALIDATION', '뽑기 후보가 없습니다');

  let grade;
  let isPity = false;
  if (poolRow.pity_count && byGrade.LEGEND?.length
      && (await drawsSinceLegend(client, userId, poolId)) >= poolRow.pity_count - 1) {
    grade = 'LEGEND';                                   // 천장: 30번째는 LEGEND 확정
    isPity = true;
  } else {
    const total = rates.reduce((sum, r) => sum + r.rate_bp, 0);
    let roll = randomInt(total);                        // 0 ~ total-1
    for (const r of GRADES.map(g => rates.find(x => x.grade === g)).filter(Boolean)) {
      if (roll < r.rate_bp) { grade = r.grade; break; }
      roll -= r.rate_bp;
    }
  }

  // 2) 그 등급 안에서 균등 추첨
  const list = byGrade[grade];
  const picked = list[randomInt(list.length)];

  // 3) 결과 처리
  let isDuplicate = false;
  let refundCell = 0;
  if (picked.species_id) {
    const owned = await client.query(
      'SELECT user_pet_id FROM user_pet WHERE user_id = $1 AND species_id = $2', [userId, picked.species_id]);
    isDuplicate = owned.rows.length > 0;
    if (isDuplicate) {
      refundCell = (await client.query(
        'SELECT duplicate_refund_cell FROM pet_grade_rule WHERE grade = $1', [grade])).rows[0].duplicate_refund_cell;
    }
  } else {
    const owned = await client.query(
      'SELECT quantity FROM user_equipment WHERE user_id = $1 AND equipment_id = $2', [userId, picked.equipment_id]);
    isDuplicate = (owned.rows[0]?.quantity ?? 0) > 0;  // 장비는 중복이어도 환급 없이 수량 +1 (합치기 재료)
  }

  const log = await client.query(
    `INSERT INTO gacha_log (user_id, pool_id, species_id, equipment_id, is_duplicate, is_pity)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING gacha_id`,
    [userId, poolId, picked.species_id, picked.equipment_id, isDuplicate, isPity]);
  const gachaId = log.rows[0].gacha_id;

  let balance = await addCell(client, userId, -poolRow.cost_cell,
    poolRow.pool_type === 'PET' ? 'PET_GACHA' : 'EQUIP_GACHA', gachaId);  // 셀 부족이면 여기서 전부 취소

  const result = { gachaId, poolId, grade, isDuplicate, isPity, balance };
  if (picked.species_id) {
    let userPetId;
    if (isDuplicate) {
      if (refundCell > 0) balance = await addCell(client, userId, refundCell, 'DUPLICATE_REFUND', gachaId);
      userPetId = (await client.query(
        'SELECT user_pet_id FROM user_pet WHERE user_id = $1 AND species_id = $2', [userId, picked.species_id])).rows[0].user_pet_id;
    } else {
      const first = (await client.query('SELECT 1 FROM user_pet WHERE user_id = $1 LIMIT 1', [userId])).rows.length === 0;
      userPetId = (await client.query(
        `INSERT INTO user_pet (user_id, species_id, is_representative) VALUES ($1, $2, $3) RETURNING user_pet_id`,
        [userId, picked.species_id, first])).rows[0].user_pet_id;  // 첫 펫이면 대표 펫으로
    }
    result.pet = await getPet(client, userId, userPetId);
    result.refundCell = refundCell;
  } else {
    await addEquipment(client, userId, picked.equipment_id, 1);
    const row = (await client.query(
      `SELECT q.*, ue.quantity FROM user_equipment ue JOIN equipment q ON q.equipment_id = ue.equipment_id
        WHERE ue.user_id = $1 AND ue.equipment_id = $2`, [userId, picked.equipment_id])).rows[0];
    result.equipment = { equipment: equipmentDto(row), quantity: row.quantity };
  }
  result.balance = balance;
  return result;
}
