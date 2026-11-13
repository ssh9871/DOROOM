// 🟦 공통 — 펫 경험치·레벨·전투 능력치·출전 가능 여부.
// 도로팜(레벨업·진화)과 미니게임(게임 시작)이 모두 여기를 호출한다.
import { getSetting } from '../db/pool.js';
import { AppError } from '../utils/errors.js';

// ───────────────────────────────────────────────────────────────
// [가정] 펫 기본 능력치 — 회의에서 "A안(등급 기본값 + 레벨 증가 × 진화 배율)"이 확정되면
// 이 상수를 pet_grade_rule / pet_evolution_rule 컬럼으로 옮긴다 (migrations/001_pet_base_stats.sql).
// 그 전까지는 여기 숫자만 바꾸면 됨. 미니게임 팀은 getPetCombatStats 결과만 쓰므로 영향 없음.
const BASE_STATS = {
  //          attack, maxHp, moveSpeed, bulletSpeed   /  레벨당 증가
  NORMAL: { base: { ATTACK: 10, MAX_HP: 100, MOVE_SPEED: 100, BULLET_SPEED: 100 }, perLevel: { ATTACK: 1, MAX_HP: 10, MOVE_SPEED: 0, BULLET_SPEED: 0 } },
  RARE:   { base: { ATTACK: 12, MAX_HP: 120, MOVE_SPEED: 100, BULLET_SPEED: 100 }, perLevel: { ATTACK: 1.2, MAX_HP: 12, MOVE_SPEED: 0, BULLET_SPEED: 0 } },
  LEGEND: { base: { ATTACK: 15, MAX_HP: 150, MOVE_SPEED: 100, BULLET_SPEED: 100 }, perLevel: { ATTACK: 1.5, MAX_HP: 15, MOVE_SPEED: 0, BULLET_SPEED: 0 } },
};
const EVOLUTION_MULTIPLIER = { 1: 1.0, 2: 1.3, 3: 1.7 }; // [가정]
// ───────────────────────────────────────────────────────────────

/** 레벨업에 필요한 경험치 = 현재 레벨 × 등급 기본값 [가정] */
export const expToNextLevel = (level, baseExpPerLevel) => level * baseExpPerLevel;

/**
 * 경험치 추가 + 레벨업 계산. 최대 레벨에서는 경험치가 쌓이지 않는다.
 * @returns { level, exp, expToNext, leveledUp }
 */
export async function addPetExp(client, userPetId, exp) {
  if (!Number.isInteger(exp) || exp < 0) throw new AppError('VALIDATION', 'exp는 0 이상 정수');

  const { rows } = await client.query(
    `SELECT p.level, p.exp, g.max_level, g.base_exp_per_level
       FROM user_pet p
       JOIN pet_species s ON s.species_id = p.species_id
       JOIN pet_grade_rule g ON g.grade = s.grade
      WHERE p.user_pet_id = $1 FOR UPDATE`, [userPetId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '펫 없음');

  let { level, exp: cur } = rows[0];
  const { max_level: maxLevel, base_exp_per_level: base } = rows[0];
  const before = level;

  if (level >= maxLevel) {
    return { level, exp: 0, expToNext: 0, leveledUp: false };
  }
  cur += exp;
  while (level < maxLevel && cur >= expToNextLevel(level, base)) {
    cur -= expToNextLevel(level, base);
    level += 1;
  }
  if (level >= maxLevel) cur = 0;

  await client.query('UPDATE user_pet SET level = $2, exp = $3 WHERE user_pet_id = $1', [userPetId, level, cur]);
  return {
    level, exp: cur,
    expToNext: level >= maxLevel ? 0 : expToNextLevel(level, base),
    leveledUp: level > before,
  };
}

/**
 * 전투 능력치 합산 → CombatStats (명세서 7장).
 * = 펫 기본값(등급·레벨·진화) + 장착 장비 + 영구 스탯 강화
 * 소유자 검증 포함: 다른 사람 펫이면 NOT_FOUND.
 */
export async function getPetCombatStats(db, userId, userPetId) {
  const { rows } = await db.query(
    `SELECT p.level, p.evolution_stage, s.grade,
            a.ability_id, a.code AS ability_code, a.name AS ability_name, a.effect_value, a.cooldown_sec,
            COALESCE(e.grants_revive, false) AS grants_revive
       FROM user_pet p
       JOIN pet_species s ON s.species_id = p.species_id
       JOIN ability a ON a.ability_id = s.innate_ability_id
       LEFT JOIN pet_evolution_rule e ON e.grade = s.grade AND e.evolution_stage = p.evolution_stage
      WHERE p.user_pet_id = $1 AND p.user_id = $2`, [userPetId, userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '펫 없음');
  const pet = rows[0];

  // 1) 기본값
  const cfg = BASE_STATS[pet.grade];
  const mul = EVOLUTION_MULTIPLIER[pet.evolution_stage] ?? 1;
  const stats = {};
  for (const code of Object.keys(cfg.base)) {
    stats[code] = Math.floor((cfg.base[code] + cfg.perLevel[code] * (pet.level - 1)) * mul);
  }

  // 2) 장착 장비
  const eq = await db.query(
    `SELECT e.stat_code, e.stat_value
       FROM user_pet_equipment upe JOIN equipment e ON e.equipment_id = upe.equipment_id
      WHERE upe.user_pet_id = $1`, [userPetId]);
  for (const r of eq.rows) stats[r.stat_code] = (stats[r.stat_code] ?? 0) + r.stat_value;

  // 3) 영구 스탯 강화 (계정 전체 적용 [가정])
  const up = await db.query(
    `SELECT u.stat_code, r.value_bonus
       FROM user_stat_upgrade u
       JOIN stat_upgrade_rule r ON r.stat_code = u.stat_code AND r.level = u.level
      WHERE u.user_id = $1 AND u.level > 0`, [userId]);
  for (const r of up.rows) stats[r.stat_code] = (stats[r.stat_code] ?? 0) + r.value_bonus;

  return {
    attack: stats.ATTACK ?? 0,
    maxHp: stats.MAX_HP ?? 0,
    moveSpeed: stats.MOVE_SPEED ?? 0,
    bulletSpeed: stats.BULLET_SPEED ?? 0,
    ability: {
      abilityId: pet.ability_id, code: pet.ability_code, name: pet.ability_name,
      effectValue: Number(pet.effect_value), cooldownSec: pet.cooldown_sec,
    },
    canRevive: pet.grants_revive,
  };
}

/** 배고픔이 기준(game_setting SORTIE_MIN_HUNGER) 미만이면 PET_TOO_HUNGRY */
export async function assertPetCanSortie(db, userId, userPetId) {
  const { rows } = await db.query(
    'SELECT hunger FROM user_pet WHERE user_pet_id = $1 AND user_id = $2', [userPetId, userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '펫 없음');
  const min = await getSetting(db, 'SORTIE_MIN_HUNGER', 30);
  if (rows[0].hunger < min) throw new AppError('PET_TOO_HUNGRY', `배고픔이 ${min} 이상이어야 출전할 수 있습니다`);
  return true;
}

/** user_pet 한 행 → Pet DTO (도로팜·미니게임 공용) */
export async function getPet(db, userId, userPetId) {
  const { rows } = await db.query(
    `SELECT p.user_pet_id, p.nickname, p.level, p.exp, p.evolution_stage, p.hunger, p.affection, p.is_representative,
            s.species_id, s.name AS species_name, s.grade, s.model_url,
            g.max_level, g.base_exp_per_level,
            a.ability_id, a.code AS ability_code, a.name AS ability_name, a.effect_value, a.cooldown_sec
       FROM user_pet p
       JOIN pet_species s ON s.species_id = p.species_id
       JOIN pet_grade_rule g ON g.grade = s.grade
       JOIN ability a ON a.ability_id = s.innate_ability_id
      WHERE p.user_pet_id = $1 AND p.user_id = $2`, [userPetId, userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '펫 없음');
  const min = await getSetting(db, 'SORTIE_MIN_HUNGER', 30);
  return toPetDto(rows[0], min);
}

export function toPetDto(r, sortieMinHunger) {
  return {
    userPetId: r.user_pet_id,
    species: {
      speciesId: r.species_id, name: r.species_name, grade: r.grade, modelUrl: r.model_url,
      ability: { abilityId: r.ability_id, code: r.ability_code, name: r.ability_name,
                 effectValue: Number(r.effect_value), cooldownSec: r.cooldown_sec },
    },
    nickname: r.nickname,
    level: r.level, exp: r.exp,
    expToNext: r.level >= r.max_level ? 0 : expToNextLevel(r.level, r.base_exp_per_level),
    evolutionStage: r.evolution_stage,
    hunger: r.hunger, affection: r.affection,
    isRepresentative: r.is_representative,
    canSortie: r.hunger >= sortieMinHunger,
  };
}
