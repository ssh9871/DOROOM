// 🟩 펫 돌보기·성장 (명세서 2장: feed · pat · use-potion · evolve)
// 셀·아이템·경험치 변동은 공통 함수(addCell · useItem · addPetExp)만 사용한다.
import { AppError } from '../utils/errors.js';
import { addCell } from './cellService.js';
import { useItem, itemDto } from './inventoryService.js';
import { addPetExp, getPet } from './petService.js';

const PAT_AFFECTION = 5;   // 쓰다듬기 한 번에 오르는 호감도 [가정]
const INTERACTION_OF = { FOOD: 'FEED', SNACK: 'FEED', TOY: 'PLAY' };

/** 내 펫 행 잠금 + 등급·진화 단계 (다른 사람 펫이면 NOT_FOUND) */
async function lockPet(client, userId, userPetId) {
  const { rows } = await client.query(
    `SELECT p.user_pet_id, p.level, p.evolution_stage, p.hunger, p.affection, s.grade
       FROM user_pet p JOIN pet_species s ON s.species_id = p.species_id
      WHERE p.user_pet_id = $1 AND p.user_id = $2 FOR UPDATE OF p`, [userPetId, userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '펫 없음');
  return rows[0];
}

/** 한 번에 쓸 개수 (생략하면 1개, 1~99) */
function quantityOf(quantity) {
  const qty = quantity === undefined || quantity === null ? 1 : Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new AppError('VALIDATION', 'quantity는 1~99');
  return qty;
}
/** 가진 개수가 qty 이상인지 먼저 확인 (모자라면 아무것도 바꾸지 않음) */
async function ensureOwned(client, userId, itemId, qty) {
  const { rows } = await client.query('SELECT quantity FROM user_item WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
  if (!rows.length || rows[0].quantity < qty) throw new AppError('NOT_ENOUGH_ITEM');
}

async function activeItem(client, itemId, types) {
  if (!Number.isSafeInteger(itemId)) throw new AppError('VALIDATION', 'itemId 오류');
  const { rows } = await client.query('SELECT * FROM item WHERE item_id = $1 AND is_active', [itemId]);
  if (!rows.length || !types.includes(rows[0].item_type)) throw new AppError('VALIDATION', '여기에 쓸 수 없는 아이템이에요');
  return rows[0];
}

/** 밥·간식·장난감 주기 (quantity개 한 번에) → {pet, used, quantity}
 *  배고픔·호감도가 가득 차면 더 쓸모없는 개수는 쓰지 않는다 → quantity 는 실제로 쓴 개수 */
export async function feedPet(client, userId, userPetId, itemId, quantity) {
  const want = quantityOf(quantity);
  const pet = await lockPet(client, userId, userPetId);
  const item = await activeItem(client, itemId, Object.keys(INTERACTION_OF));
  const need = (now, gain) => (gain > 0 && now < 100 ? Math.ceil((100 - now) / gain) : 0);
  const useful = Math.max(need(pet.hunger, item.hunger_restore), need(pet.affection, item.affection_restore));
  if (useful === 0) throw new AppError('VALIDATION', '이미 가득 차 있어요');
  await ensureOwned(client, userId, item.item_id, want);
  const qty = Math.min(want, useful);
  const hunger = Math.min(100, pet.hunger + item.hunger_restore * qty);
  const affection = Math.min(100, pet.affection + item.affection_restore * qty);
  await useItem(client, userId, item.item_id, qty);
  await client.query(
    'UPDATE user_pet SET hunger = $2, affection = $3, last_interacted_at = now() WHERE user_pet_id = $1',
    [userPetId, hunger, affection]);
  // 기록은 지금처럼 1개당 1줄 (테이블 구조 변경 없음)
  await client.query(
    'INSERT INTO pet_interaction_log (user_pet_id, interaction_type, item_id) SELECT $1, $2, $3 FROM generate_series(1, $4)',
    [userPetId, INTERACTION_OF[item.item_type], item.item_id, qty]);
  return { pet: await getPet(client, userId, userPetId), used: itemDto(item), quantity: qty };
}

/** 쓰다듬기 (아이템 없음) → Pet */
export async function patPet(client, userId, userPetId) {
  const pet = await lockPet(client, userId, userPetId);
  if (pet.affection >= 100) throw new AppError('VALIDATION', '호감도가 이미 가득 차 있어요');
  await client.query(
    'UPDATE user_pet SET affection = LEAST(100, affection + $2), last_interacted_at = now() WHERE user_pet_id = $1',
    [userPetId, PAT_AFFECTION]);
  await client.query("INSERT INTO pet_interaction_log (user_pet_id, interaction_type) VALUES ($1, 'PET')", [userPetId]);
  return getPet(client, userId, userPetId);
}

/** 경험치 포션 (quantity개 한 번에) → Pet
 *  중간에 최대 레벨이 되면 거기서 멈추고, 남은 포션은 쓰지 않는다 */
export async function usePotion(client, userId, userPetId, itemId, quantity) {
  const want = quantityOf(quantity);
  await lockPet(client, userId, userPetId);
  const item = await activeItem(client, itemId, ['EXP_POTION']);
  const before = await getPet(client, userId, userPetId);
  if (before.expToNext === 0) throw new AppError('VALIDATION', '이미 최대 레벨이에요');
  await ensureOwned(client, userId, item.item_id, want);
  let used = 0;
  while (used < want) {
    const after = await addPetExp(client, userPetId, item.exp_gain);
    used += 1;
    if (after.expToNext === 0) break;
  }
  await useItem(client, userId, item.item_id, used);
  return getPet(client, userId, userPetId);
}

/** 진화: 다음 단계 규칙의 요구 레벨·셀 확인 → 셀 차감(EVOLVE) → 단계 +1 → Pet */
export async function evolvePet(client, userId, userPetId) {
  const pet = await lockPet(client, userId, userPetId);
  const { rows } = await client.query(
    'SELECT required_level, evolve_cell_cost FROM pet_evolution_rule WHERE grade = $1 AND evolution_stage = $2',
    [pet.grade, pet.evolution_stage + 1]);
  if (!rows.length) throw new AppError('VALIDATION', '이미 마지막 단계예요');
  const { required_level: requiredLevel, evolve_cell_cost: cost } = rows[0];
  if (pet.level < requiredLevel) throw new AppError('LEVEL_NOT_ENOUGH', `Lv. ${requiredLevel}부터 진화할 수 있어요`);
  if (cost > 0) await addCell(client, userId, -cost, 'EVOLVE', userPetId);
  await client.query('UPDATE user_pet SET evolution_stage = evolution_stage + 1 WHERE user_pet_id = $1', [userPetId]);
  return getPet(client, userId, userPetId);
}
