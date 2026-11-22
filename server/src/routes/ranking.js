// 🟥 미니게임 — 주간 랭킹 (v_weekly_ranking). 무한모드 · 정상 종료 · 사람당 최고 점수 1개, 동점은 먼저 달성한 쪽이 위
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { getRanking } from '../services/gameService.js';

const router = Router();
router.use(requireAuth);

// GET /ranking?weekStart=YYYY-MM-DD&limit=10 → Ranking  (weekStart 없으면 이번 주, 한국시간 월요일 기준)
router.get('/', wrap(async (req, res) => {
  const { weekStart } = req.query;
  if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new AppError('VALIDATION', 'weekStart 는 YYYY-MM-DD');
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  ok(res, await getRanking(pool, req.userId, { weekStart, limit }));
}));

export default router;
