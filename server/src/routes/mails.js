// 🟦 공통 — 우편함 (랭킹 보상 등 수령)
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { addCell } from '../services/cellService.js';

const router = Router();
router.use(requireAuth);

const mailDto = (r) => ({
  mailId: r.mail_id, sourceType: r.source_type, title: r.title, cellAmount: r.cell_amount,
  titleReward: r.title_id ? { titleId: r.title_id, code: r.t_code, name: r.t_name } : null,
  createdAt: r.created_at, claimedAt: r.claimed_at, expiresAt: r.expires_at,
});
const MAIL_SELECT = `
  SELECT m.*, t.code AS t_code, t.name AS t_name
    FROM reward_mail m LEFT JOIN title t ON t.title_id = m.title_id`;

// GET /mails?unclaimedOnly=true → Mail[]
router.get('/', wrap(async (req, res) => {
  const unclaimedOnly = req.query.unclaimedOnly === 'true';
  const { rows } = await pool.query(
    `${MAIL_SELECT} WHERE m.user_id = $1 ${unclaimedOnly ? 'AND m.claimed_at IS NULL' : ''}
      ORDER BY m.mail_id DESC LIMIT 100`, [req.userId]);
  ok(res, rows.map(mailDto));
}));

// POST /mails/:mailId/claim → {balance, mail}
router.post('/:mailId/claim', wrap(async (req, res) => {
  const mailId = Number(req.params.mailId);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `${MAIL_SELECT} WHERE m.mail_id = $1 AND m.user_id = $2 FOR UPDATE OF m`, [mailId, req.userId]);
    if (!rows.length) throw new AppError('NOT_FOUND', '우편 없음');
    const mail = rows[0];
    if (mail.claimed_at) throw new AppError('ALREADY_CLAIMED');
    if (mail.expires_at && new Date(mail.expires_at) < new Date()) throw new AppError('VALIDATION', '만료된 우편');

    let balance = null;
    if (mail.cell_amount > 0) balance = await addCell(client, req.userId, mail.cell_amount, 'MAIL_CLAIM', mailId);
    if (mail.title_id) {
      await client.query(
        'INSERT INTO user_title (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, mail.title_id]);
    }
    const upd = await client.query(
      `UPDATE reward_mail SET claimed_at = now() WHERE mail_id = $1 RETURNING claimed_at`, [mailId]);
    if (balance === null) {
      const b = await client.query('SELECT cell_balance FROM app_user WHERE user_id = $1', [req.userId]);
      balance = b.rows[0].cell_balance;
    }
    return { balance, mail: mailDto({ ...mail, claimed_at: upd.rows[0].claimed_at }) };
  });
  ok(res, result);
}));

export default router;
