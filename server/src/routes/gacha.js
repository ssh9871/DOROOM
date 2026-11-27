// 🟩 도로팜 — 뽑기 (명세서 3장)  담당: 창규
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listPools, drawOnce, listHistory, addDemoDraws } from '../services/gachaService.js';

const router = Router();
router.use(requireAuth);

// ① GET /gacha/pools → GachaPool[]   뽑기 종류, 등급·후보별 확률, 오늘 뽑은 횟수, 천장 진행도
router.get('/pools', wrap(async (req, res) => ok(res, await listPools(pool, req.userId))));

// ② POST /gacha/pools/:poolId/draw → GachaResult   뽑기 1회 (셀 차감·지급·기록 한 트랜잭션)
router.post('/pools/:poolId/draw', wrap(async (req, res) => {
  const poolId = Number(req.params.poolId);
  if (!Number.isInteger(poolId)) throw new AppError('VALIDATION', 'poolId 오류');
  // 시연용: 데모 로그인이 켜진 개발 환경에서만 결과 지정(forceId: 펫 뽑기면 speciesId, 장비 뽑기면 equipmentId)을 받는다
  const demo = process.env.NODE_ENV !== 'production' && process.env.DEMO_ACCOUNT_LOGIN === 'true';
  const forceId = demo && Number.isInteger(req.body?.forceId) ? req.body.forceId : null;
  ok(res, await withTransaction(client => drawOnce(client, req.userId, poolId, { forceId })));
}));

// POST /gacha/pools/:poolId/demo-draws → GachaPool[]   시연용: 오늘 이 뽑기 횟수 +1 (데모 로그인이 켜진 개발 환경에서만)
router.post('/pools/:poolId/demo-draws', wrap(async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_ACCOUNT_LOGIN !== 'true') {
    throw new AppError('VALIDATION', '시연 환경에서만 뽑기 횟수를 늘릴 수 있어요');
  }
  const poolId = Number(req.params.poolId);
  if (!Number.isInteger(poolId)) throw new AppError('VALIDATION', 'poolId 오류');
  addDemoDraws(req.userId, poolId, 1);
  ok(res, await listPools(pool, req.userId));
}));

// ③ GET /gacha/history?poolType=PET|EQUIPMENT&limit=30 → GachaHistoryEntry[]   최근 순
router.get('/history', wrap(async (req, res) => {
  const poolType = req.query.poolType ?? null;
  if (poolType !== null && poolType !== 'PET' && poolType !== 'EQUIPMENT') throw new AppError('VALIDATION', 'poolType 은 PET 또는 EQUIPMENT');
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  ok(res, await listHistory(pool, req.userId, { poolType, limit }));
}));

export default router;
