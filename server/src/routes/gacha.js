// 🟩 도로팜 — 뽑기 (명세서 3장)  담당: 창규
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listPools } from '../services/gachaService.js';

const router = Router();
router.use(requireAuth);

// ① GET /gacha/pools → GachaPool[]   뽑기 종류, 등급·후보별 확률, 오늘 뽑은 횟수, 천장 진행도
router.get('/pools', wrap(async (req, res) => ok(res, await listPools(pool, req.userId))));

// ② POST /gacha/pools/:poolId/draw   (4-2단계에서 구현)
router.post('/pools/:poolId/draw', wrap(async () => { throw new AppError('NOT_IMPLEMENTED'); }));

// ③ GET /gacha/history   (5단계에서 구현)
router.get('/history', wrap(async () => { throw new AppError('NOT_IMPLEMENTED'); }));

export default router;
