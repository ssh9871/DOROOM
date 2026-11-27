// 🟩 도로팜 — 펫 상세(PetDetail) + 장비 장착·해제 (창규)
// 규칙 (11/27 확정)
//  - 열린 칸 수 = 펫 등급 (pet_grade_rule.equip_slot_count: 노말 1 · 레어 2 · 레전드 3). 넘는 칸은 SLOT_LOCKED.
//  - 칸마다 들어갈 종류는 정하지 않는다: 어느 칸에든 모자·신발·목걸이를 넣을 수 있다.
//  - 한 펫에 같은 종류(line_code)는 하나만. 모자 두 개 같은 건 VALIDATION.
//  - 끼우면 가방(user_equipment)에서 1개 빠지고, 빼거나 다른 장비로 바꾸면 원래 장비가 가방으로 돌아온다.
import { AppError } from '../utils/errors.js';
import { getPet, getPetCombatStats } from './petService.js';
import { addEquipment, useEquipment, equipmentDto } from './inventoryService.js';

const SLOT_NUMBERS = [1, 2, 3];

/** 펫 상세 = Pet + 열린 칸 수 + 칸 3개 + 전투 능력치 + 다음 진화 조건 */
export async function getPetDetail(db, userId, userPetId) {
  const pet = await getPet(db, userId, userPetId);           // 내 펫이 아니면 NOT_FOUND
  const rule = await db.query(
    `SELECT g.equip_slot_count, nx.required_level, nx.evolve_cell_cost
       FROM user_pet p
       JOIN pet_species s ON s.species_id = p.species_id
       JOIN pet_grade_rule g ON g.grade = s.grade
       LEFT JOIN pet_evolution_rule nx ON nx.grade = s.grade AND nx.evolution_stage = p.evolution_stage + 1
      WHERE p.user_pet_id = $1`, [userPetId]);
  const r = rule.rows[0];
  const eq = await db.query(
    `SELECT upe.slot_no, e.*
       FROM user_pet_equipment upe JOIN equipment e ON e.equipment_id = upe.equipment_id
      WHERE upe.user_pet_id = $1`, [userPetId]);
  const bySlot = new Map(eq.rows.map(row => [row.slot_no, equipmentDto(row)]));
  return {
    ...pet,
    equipSlotCount: r.equip_slot_count,
    equipments: SLOT_NUMBERS.map(slotNo => ({ slotNo, equipment: bySlot.get(slotNo) ?? null })),
    combatStats: await getPetCombatStats(db, userId, userPetId),
    nextEvolution: r.required_level == null ? null : { requiredLevel: r.required_level, cellCost: r.evolve_cell_cost },
  };
}

/** 내 펫 전부의 장비 칸 → [{userPetId, equipSlotCount, equipments: [{slotNo, equipment|null}] x3}]
 *  P창에서 '이 장비를 누가 끼고 있나'(카드 얼굴·착용 펫 목록)와 펫 탭의 장비 칸을 한 번에 그리려고 쓴다. */
export async function listPetGear(db, userId) {
  const pets = await db.query(
    `SELECT p.user_pet_id, g.equip_slot_count
       FROM user_pet p
       JOIN pet_species s ON s.species_id = p.species_id
       JOIN pet_grade_rule g ON g.grade = s.grade
      WHERE p.user_id = $1 ORDER BY p.user_pet_id`, [userId]);
  const eq = await db.query(
    `SELECT upe.user_pet_id, upe.slot_no, e.*
       FROM user_pet_equipment upe
       JOIN user_pet p ON p.user_pet_id = upe.user_pet_id
       JOIN equipment e ON e.equipment_id = upe.equipment_id
      WHERE p.user_id = $1`, [userId]);
  return pets.rows.map(p => ({
    userPetId: p.user_pet_id,
    equipSlotCount: p.equip_slot_count,
    equipments: SLOT_NUMBERS.map(slotNo => {
      const row = eq.rows.find(r => r.user_pet_id === p.user_pet_id && r.slot_no === slotNo);
      return { slotNo, equipment: row ? equipmentDto(row) : null };
    }),
  }));
}

/** 칸 번호·펫 주인·열린 칸 확인. 펫 행을 잠가서 동시에 두 번 눌러도 꼬이지 않게 한다. */
async function lockPetSlot(client, userId, userPetId, slotNo) {
  if (!SLOT_NUMBERS.includes(slotNo)) throw new AppError('VALIDATION', '칸 번호는 1~3');
  const { rows } = await client.query(
    `SELECT g.equip_slot_count
       FROM user_pet p
       JOIN pet_species s ON s.species_id = p.species_id
       JOIN pet_grade_rule g ON g.grade = s.grade
      WHERE p.user_pet_id = $1 AND p.user_id = $2
      FOR UPDATE OF p`, [userPetId, userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '펫 없음');
  if (slotNo > rows[0].equip_slot_count) throw new AppError('SLOT_LOCKED');
}

/** 장착 (교체 포함). withTransaction 안에서 호출. */
export async function equipToPet(client, userId, userPetId, slotNo, equipmentId) {
  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) throw new AppError('VALIDATION', 'equipmentId 오류');
  await lockPetSlot(client, userId, userPetId, slotNo);
  const eq = await client.query('SELECT equipment_id, line_code, name FROM equipment WHERE equipment_id = $1', [equipmentId]);
  if (!eq.rows.length) throw new AppError('NOT_FOUND', '장비 없음');

  const cur = await client.query(
    `SELECT upe.slot_no, upe.equipment_id, e.line_code
       FROM user_pet_equipment upe JOIN equipment e ON e.equipment_id = upe.equipment_id
      WHERE upe.user_pet_id = $1`, [userPetId]);
  const inSlot = cur.rows.find(row => row.slot_no === slotNo);
  if (inSlot?.equipment_id === equipmentId) return getPetDetail(client, userId, userPetId);   // 이미 같은 장비
  const sameKind = cur.rows.find(row => row.slot_no !== slotNo && row.line_code === eq.rows[0].line_code);
  if (sameKind) throw new AppError('VALIDATION', `${eq.rows[0].name}은(는) 이미 ${sameKind.slot_no}번 칸에 끼워져 있어요`);

  await useEquipment(client, userId, equipmentId, 1);                 // 가방에서 1개 (없으면 NOT_ENOUGH_ITEM)
  if (inSlot) await addEquipment(client, userId, inSlot.equipment_id, 1);   // 원래 장비는 가방으로
  await client.query(
    `INSERT INTO user_pet_equipment (user_pet_id, slot_no, equipment_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_pet_id, slot_no) DO UPDATE SET equipment_id = EXCLUDED.equipment_id, equipped_at = now()`,
    [userPetId, slotNo, equipmentId]);
  return getPetDetail(client, userId, userPetId);
}

/** 해제. 빈 칸이면 아무것도 안 하고 상세만 돌려준다. withTransaction 안에서 호출. */
export async function unequipFromPet(client, userId, userPetId, slotNo) {
  await lockPetSlot(client, userId, userPetId, slotNo).catch(error => {
    if (error.code !== 'SLOT_LOCKED') throw error;                     // 잠긴 칸은 비어 있으니 해제할 것도 없음
  });
  const { rows } = await client.query(
    'DELETE FROM user_pet_equipment WHERE user_pet_id = $1 AND slot_no = $2 RETURNING equipment_id', [userPetId, slotNo]);
  if (rows.length) await addEquipment(client, userId, rows[0].equipment_id, 1);
  return getPetDetail(client, userId, userPetId);
}
