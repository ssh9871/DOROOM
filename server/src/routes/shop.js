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

// 도로팜 상점에서 파는 아이템 종류. 경험치 포션(EXP_POTION)·게임 버프(GAME_BUFF)는 미니게임 안에서 판매 (11/23 석훈)
// 아이템 자체는 DB에 그대로 있음 — 미니게임이 같은 item 표를 씀
const DOROFARM_SHOP_TYPES = ['FOOD', 'SNACK', 'TOY', 'EVOLVE_STONE'];
// 미니게임 상점 목록: 활성 입장 버프(무적·경험치·셀). 구매는 /shop/buy 가 아니라 출동 시작 때 결제 (11/26 석훈)
const MINIGAME_SHOP_TYPES = ['GAME_BUFF'];

// ① GET /shop/items → Item[]   도로팜 상점 판매 중인 아이템만, 종류 → 가격 순
//    GET /shop/items?shop=minigame → 입장 버프 목록 (POST /game/start 의 entryBuffItemIds 로 선택)
router.get('/items', wrap(async (req, res) => {
  const shop = req.query.shop ?? 'dorofarm';
  if (shop !== 'dorofarm' && shop !== 'minigame') throw new AppError('VALIDATION', 'shop 은 dorofarm 또는 minigame');
  const types = shop === 'minigame' ? MINIGAME_SHOP_TYPES : DOROFARM_SHOP_TYPES;
  const { rows } = await pool.query(
    `SELECT * FROM item WHERE is_active AND item_type = ANY($1)
      ORDER BY array_position($1::text[], item_type::text), price_cell, item_id`, [types]);
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
    const { rows } = await client.query(
      'SELECT * FROM item WHERE item_id = $1 AND is_active AND item_type = ANY($2)', [itemId, DOROFARM_SHOP_TYPES]);
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