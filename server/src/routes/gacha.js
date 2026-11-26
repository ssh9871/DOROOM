// 🟩 도로팜 — 뽑기 (명세서 3장)  담당: 창규
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listPools, drawOnce, listHistory } from '../services/gachaService.js';

const router = Router();
router.use(requireAuth);

// ① GET /gacha/pools → GachaPool[]   뽑기 종류, 등급·후보별 확률, 오늘 뽑은 횟수, 천장 진행도
router.get('/pools', wrap(async (req, res) => ok(res, await listPools(pool, req.userId))));

// ② POST /gacha/pools/:poolId/draw → GachaResult   뽑기 1회 (셀 차감·지급·기록 한 트랜잭션)
router.post('/pools/:poolId/draw', wrap(async (req, res) => {
  const poolId = Number(req.params.poolId);
  if (!Number.isInteger(poolId)) throw new AppError('VALIDATION', 'poolId 오류');
  ok(res, await withTransaction(client => drawOnce(client, req.userId, poolId)));
}));

// ③ GET /gacha/history?poolType=PET|EQUIPMENT&limit=30 → GachaHistoryEntry[]   최근 순
router.get('/history', wrap(async (req, res) => {
  const poolType = req.query.poolType ?? null;
  if (poolType !== null && poolType !== 'PET' && poolType !== 'EQUIPMENT') throw new AppError('VALIDATION', 'poolType 은 PET 또는 EQUIPMENT');
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  ok(res, await listHistory(pool, req.userId, { poolType, limit }));
}));

export default router;
