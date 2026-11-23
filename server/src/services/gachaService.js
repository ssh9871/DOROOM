// 🟩 도로팜 — 뽑기 (명세서 3장)  담당: 창규
// 확률은 gacha_grade_rate(등급 단위). 같은 등급 안에서는 후보(gacha_pool_entry)끼리 똑같은 확률.
import { equipmentDto } from './inventoryService.js';

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
