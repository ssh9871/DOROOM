// 🟩 도로팜 — 펫 (명세서 2장)
// 담당 팀이 채웁니다. 각 핸들러는 명세서(docs/db/API_spec_v1.md)의 요청/응답 형태를 따르고,
// 셀·경험치·아이템 변동은 services/ 의 공통 함수만 사용합니다.
import { Router } from 'express';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { pool, withTransaction } from '../db/pool.js';
import { getPetCombatStats, listPets, setRepresentative } from '../services/petService.js';
// import { addCell } from '../services/cellService.js';
// import { addItem, useItem, addEquipment, useEquipment, getInventory } from '../services/inventoryService.js';

const router = Router();
router.use(requireAuth);
const todo = wrap(async () => { throw new AppError('NOT_IMPLEMENTED'); });

router.get('/', wrap(async (req, res) => ok(res, await listPets(pool, req.userId))));
router.get('/:userPetId/combat-stats', wrap(async (req, res) => {
  const userPetId = Number(req.params.userPetId);
  if (!Number.isSafeInteger(userPetId) || userPetId <= 0) throw new AppError('VALIDATION', 'userPetId 오류');
  const stats = await getPetCombatStats(pool, req.userId, userPetId);
  res.set('Cache-Control', 'no-store');
  ok(res, stats);
}));
router.get('/:userPetId', todo);
// 대표 펫 장착·해제 (창규). 명세: {nickname?, isRepresentative?} → Pet — 지금은 isRepresentative 만 처리
router.patch('/:userPetId', wrap(async (req, res) => {
  const userPetId = Number(req.params.userPetId);
  if (!Number.isSafeInteger(userPetId) || userPetId <= 0) throw new AppError('VALIDATION', 'userPetId 오류');
  const { isRepresentative } = req.body ?? {};
  if (typeof isRepresentative !== 'boolean') throw new AppError('VALIDATION', 'isRepresentative(true/false)가 필요합니다');
  ok(res, await withTransaction(client => setRepresentative(client, req.userId, userPetId, isRepresentative)));
}));
router.post('/:userPetId/feed', todo);
router.post('/:userPetId/pat', todo);
router.post('/:userPetId/use-potion', todo);
router.post('/:userPetId/evolve', todo);
router.post('/transfer-exp', todo);
router.put('/:userPetId/equipments/:slotNo', todo);
router.delete('/:userPetId/equipments/:slotNo', todo);

export default router;
