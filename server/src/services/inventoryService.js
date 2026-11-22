// 🟦 공통 — 아이템·장비 수량 변동은 이 함수로만.
import { AppError } from '../utils/errors.js';

/** 아이템 수량 +qty (없으면 행 생성) */
export async function addItem(client, userId, itemId, qty = 1) {
  if (!Number.isInteger(qty) || qty <= 0) throw new AppError('VALIDATION', 'qty는 1 이상');
  await client.query(
    `INSERT INTO user_item (user_id, item_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_item.quantity + EXCLUDED.quantity`,
    [userId, itemId, qty]);
}

/** 아이템 수량 -qty. 부족하면 NOT_ENOUGH_ITEM */
export async function useItem(client, userId, itemId, qty = 1) {
  if (!Number.isInteger(qty) || qty <= 0) throw new AppError('VALIDATION', 'qty는 1 이상');
  const { rows } = await client.query(
    'SELECT quantity FROM user_item WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
  if (!rows.length || rows[0].quantity < qty) throw new AppError('NOT_ENOUGH_ITEM');
  await client.query(
    'UPDATE user_item SET quantity = quantity - $3 WHERE user_id = $1 AND item_id = $2', [userId, itemId, qty]);
}

/** 장비 수량 +qty */
export async function addEquipment(client, userId, equipmentId, qty = 1) {
  if (!Number.isInteger(qty) || qty <= 0) throw new AppError('VALIDATION', 'qty는 1 이상');
  await client.query(
    `INSERT INTO user_equipment (user_id, equipment_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, equipment_id) DO UPDATE SET quantity = user_equipment.quantity + EXCLUDED.quantity`,
    [userId, equipmentId, qty]);
}

/** 장비 수량 -qty (합치기용). 부족하면 NOT_ENOUGH_ITEM */
export async function useEquipment(client, userId, equipmentId, qty = 1) {
  const { rows } = await client.query(
    'SELECT quantity FROM user_equipment WHERE user_id = $1 AND equipment_id = $2 FOR UPDATE', [userId, equipmentId]);
  if (!rows.length || rows[0].quantity < qty) throw new AppError('NOT_ENOUGH_ITEM');
  await client.query(
    'UPDATE user_equipment SET quantity = quantity - $3 WHERE user_id = $1 AND equipment_id = $2', [userId, equipmentId, qty]);
}

const itemDto = (r) => ({
  itemId: r.item_id, code: r.code, name: r.name, itemType: r.item_type, priceCell: r.price_cell,
  hungerRestore: r.hunger_restore, affectionRestore: r.affection_restore, expGain: r.exp_gain,
  effectConfig: r.effect_config ?? {},
});
const equipmentDto = (r) => ({
  equipmentId: r.equipment_id, lineCode: r.line_code, name: r.name, slotType: r.slot_type, grade: r.grade,
  statCode: r.stat_code, statValue: r.stat_value, nextEquipmentId: r.next_equipment_id,
  mergeCount: r.merge_count, mergeCellCost: r.merge_cell_cost, modelUrl: r.model_url,
});

/** 인벤토리 → { items: UserItem[], equipments: UserEquipment[] } */
export async function getInventory(db, userId) {
  const items = await db.query(
    `SELECT i.*, ui.quantity FROM user_item ui JOIN item i ON i.item_id = ui.item_id
      WHERE ui.user_id = $1 AND ui.quantity > 0 ORDER BY i.item_id`, [userId]);
  const eqs = await db.query(
    `SELECT e.*, ue.quantity FROM user_equipment ue JOIN equipment e ON e.equipment_id = ue.equipment_id
      WHERE ue.user_id = $1 AND ue.quantity > 0 ORDER BY e.equipment_id`, [userId]);
  return {
    items: items.rows.map(r => ({ item: itemDto(r), quantity: r.quantity })),
    equipments: eqs.rows.map(r => ({ equipment: equipmentDto(r), quantity: r.quantity })),
  };
}

export { itemDto, equipmentDto };
