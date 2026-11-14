// 🟥 미니게임 — 작전 지점 목록 (명세서 5장). 1-1 기본 해금, 직전 지점 클리어로 해금, 4-3 클리어 시 무한모드 해금
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listStages } from '../services/gameService.js';

const router = Router();
router.use(requireAuth);

// GET /stages → { stages: Stage[], endlessUnlocked }
router.get('/', wrap(async (req, res) => ok(res, await listStages(pool, req.userId))));

export default router;
