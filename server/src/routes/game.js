// 🟥 미니게임 — 게임 시작·종료·중단·전적 (명세서 5장). 점수·보상은 서버(gameService)가 계산
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { startGame, finishGame, abortGame, listHistory } from '../services/gameService.js';

const router = Router();
router.use(requireAuth);

const runIdOf = (req) => {
  const id = Number(req.params.runId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('VALIDATION', 'runId 오류');
  return id;
};

// POST /game/start {mode, stageNo?, userPetId, buffItemIds?, practice?} → GameStart
router.post('/start', wrap(async (req, res) => {
  const { mode, stageNo, userPetId, buffItemIds, practice } = req.body ?? {};
  const result = await withTransaction(client => startGame(client, req.userId, {
    mode, stageNo: stageNo == null ? undefined : Number(stageNo), userPetId: Number(userPetId),
    buffItemIds: Array.isArray(buffItemIds) ? buffItemIds.map(Number) : [], practice: practice === true,
  }));
  ok(res, result, 201);
}));

// POST /game/:runId/finish {survivalMs, killCount, reachedWave, cleared, reviveUsed} → GameResult
//   같은 runId 재요청 → 저장된 결과 그대로 (replayed: true), 보상 중복 없음
router.post('/:runId/finish', wrap(async (req, res) => {
  const runId = runIdOf(req);
  ok(res, await withTransaction(client => finishGame(client, req.userId, runId, req.body ?? {})));
}));

// POST /game/:runId/abort → {runId}
router.post('/:runId/abort', wrap(async (req, res) => {
  const runId = runIdOf(req);
  ok(res, await withTransaction(client => abortGame(client, req.userId, runId)));
}));

// GET /game/history?mode=ENDLESS&limit=20&offset=0 → GameRun[]
router.get('/history', wrap(async (req, res) => {
  const mode = req.query.mode;
  if (mode && !['STAGE', 'ENDLESS'].includes(mode)) throw new AppError('VALIDATION', 'mode 는 STAGE 또는 ENDLESS');
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  ok(res, await listHistory(pool, req.userId, { mode, limit, offset }));
}));

export default router;
