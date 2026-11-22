// 🟩 도로팜 — 상점 (명세서 3장)  담당: 창규
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { itemDto, addItem } from '../services/inventoryService.js';
import { addCell } from '../services/cellService.js';

const router = Router();
router.use(requireAuth);

// ① GET /shop/items → Item[]   판매 중(is_active)인 아이템만, 종류 → 가격 순
router.get('/items', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM item WHERE is_active
      ORDER BY array_position(ARRAY['FOOD','SNACK','TOY','EXP_POTION','EVOLVE_STONE','GAME_BUFF'], item_type), price_cell, item_id`);
  ok(res, rows.map(itemDto));
}));

// ② POST /shop/buy {itemId, quantity} → {balance, item: UserItem}
//    셀 차감과 아이템 지급을 한 트랜잭션으로. 둘 중 하나라도 실패하면 둘 다 취소
router.post('/buy', wrap(async (req, res) => {
  const itemId = Number(req.body?.itemId);
  const quantity = Number(req.body?.quantity ?? 1);
  if (!Number.isInteger(itemId)) throw new AppError('VALIDATION', 'itemId 필요');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new AppError('VALIDATION', 'quantity는 1~99');

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM item WHERE item_id = $1 AND is_active', [itemId]);
    if (!rows.length) throw new AppError('NOT_FOUND', '판매 중인 아이템이 아닙니다');
    const item = rows[0];

    const balance = await addCell(client, req.userId, -item.price_cell * quantity, 'ITEM_PURCHASE', itemId);
    await addItem(client, req.userId, itemId, quantity);

    const owned = await client.query(
      'SELECT quantity FROM user_item WHERE user_id = $1 AND item_id = $2', [req.userId, itemId]);
    return { balance, item: { item: itemDto(item), quantity: owned.rows[0].quantity } };
  });
  ok(res, result);
}));

export default router;