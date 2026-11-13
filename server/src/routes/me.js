// 🟦 공통 — 내 정보 · 셀 내역 · 칭호
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { getBalance, listTransactions } from '../services/cellService.js';

const router = Router();
router.use(requireAuth);

const titleDto = (r) => (r && r.title_id ? { titleId: r.title_id, code: r.code, name: r.name } : null);

/** User DTO (auth.js에서도 사용) */
export async function getUserDto(db, userId) {
  const { rows } = await db.query(
    `SELECT u.user_id, u.nickname, u.cell_balance, t.title_id, t.code, t.name
       FROM app_user u LEFT JOIN title t ON t.title_id = u.equipped_title_id
      WHERE u.user_id = $1`, [userId]);
  if (!rows.length) throw new AppError('NOT_FOUND', '회원 없음');
  const r = rows[0];
  return { userId: r.user_id, nickname: r.nickname, cellBalance: r.cell_balance, equippedTitle: titleDto(r) };
}

// GET /me → User
router.get('/', wrap(async (req, res) => ok(res, await getUserDto(pool, req.userId))));

// GET /me/cells?limit=50 → {balance, transactions}
router.get('/cells', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  ok(res, {
    balance: await getBalance(pool, req.userId),
    transactions: await listTransactions(pool, req.userId, limit),
  });
}));

// GET /me/titles → {equippedTitleId, titles: Title[]}
router.get('/titles', wrap(async (req, res) => {
  const u = await pool.query('SELECT equipped_title_id FROM app_user WHERE user_id = $1', [req.userId]);
  const { rows } = await pool.query(
    `SELECT t.title_id, t.code, t.name FROM user_title ut JOIN title t ON t.title_id = ut.title_id
      WHERE ut.user_id = $1 ORDER BY ut.acquired_at`, [req.userId]);
  ok(res, { equippedTitleId: u.rows[0]?.equipped_title_id ?? null, titles: rows.map(titleDto) });
}));

// PATCH /me/title {titleId | null} → User
router.patch('/title', wrap(async (req, res) => {
  const { titleId } = req.body ?? {};
  await withTransaction(async (client) => {
    if (titleId != null) {
      const owned = await client.query(
        'SELECT 1 FROM user_title WHERE user_id = $1 AND title_id = $2', [req.userId, titleId]);
      if (!owned.rows.length) throw new AppError('NOT_FOUND', '보유하지 않은 칭호');
    }
    await client.query('UPDATE app_user SET equipped_title_id = $2 WHERE user_id = $1', [req.userId, titleId ?? null]);
  });
  ok(res, await getUserDto(pool, req.userId));
}));

export default router;
