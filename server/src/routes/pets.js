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
import { getPetDetail, equipToPet, unequipFromPet, listPetGear } from '../services/petEquipmentService.js';
import { feedPet, patPet, usePotion, evolvePet } from '../services/petCareService.js';
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
const petIdOf = (req) => {
  const userPetId = Number(req.params.userPetId);
  if (!Number.isSafeInteger(userPetId) || userPetId <= 0) throw new AppError('VALIDATION', 'userPetId 오류');
  return userPetId;
};
const slotNoOf = (req) => {
  const slotNo = Number(req.params.slotNo);
  if (!Number.isSafeInteger(slotNo)) throw new AppError('VALIDATION', 'slotNo 오류');
  return slotNo;
};
// 내 펫 전부의 장비 칸 (창규) → PetGear[]  ※ '/:userPetId' 보다 먼저 있어야 함
router.get('/equipments', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  ok(res, await listPetGear(pool, req.userId));
}));
// 펫 상세 (창규): 열린 칸 수 + 칸 3개 + 전투 능력치 + 다음 진화 조건 → PetDetail
router.get('/:userPetId', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  ok(res, await getPetDetail(pool, req.userId, petIdOf(req)));
}));
// 대표 펫 장착·해제 (창규). 명세: {nickname?, isRepresentative?} → Pet — 지금은 isRepresentative 만 처리
router.patch('/:userPetId', wrap(async (req, res) => {
  const userPetId = Number(req.params.userPetId);
  if (!Number.isSafeInteger(userPetId) || userPetId <= 0) throw new AppError('VALIDATION', 'userPetId 오류');
  const { isRepresentative } = req.body ?? {};
  if (typeof isRepresentative !== 'boolean') throw new AppError('VALIDATION', 'isRepresentative(true/false)가 필요합니다');
  ok(res, await withTransaction(client => setRepresentative(client, req.userId, userPetId, isRepresentative)));
}));
// 돌보기·성장: {itemId} → {pet, used} / → Pet / {itemId} → Pet / → Pet
router.post('/:userPetId/feed', wrap(async (req, res) => {
  ok(res, await withTransaction(client => feedPet(client, req.userId, petIdOf(req), Number(req.body?.itemId))));
}));
router.post('/:userPetId/pat', wrap(async (req, res) => {
  ok(res, await withTransaction(client => patPet(client, req.userId, petIdOf(req))));
}));
router.post('/:userPetId/use-potion', wrap(async (req, res) => {
  ok(res, await withTransaction(client => usePotion(client, req.userId, petIdOf(req), Number(req.body?.itemId))));
}));
router.post('/:userPetId/evolve', wrap(async (req, res) => {
  ok(res, await withTransaction(client => evolvePet(client, req.userId, petIdOf(req))));
}));
router.post('/transfer-exp', todo);
// 장비 장착·해제 (창규). 칸 종류 자유, 같은 종류 중복 금지, 끼우면 가방에서 1개 빠짐 → PetDetail
router.put('/:userPetId/equipments/:slotNo', wrap(async (req, res) => {
  const equipmentId = Number(req.body?.equipmentId);
  ok(res, await withTransaction(client => equipToPet(client, req.userId, petIdOf(req), slotNoOf(req), equipmentId)));
}));
router.delete('/:userPetId/equipments/:slotNo', wrap(async (req, res) => {
  ok(res, await withTransaction(client => unequipFromPet(client, req.userId, petIdOf(req), slotNoOf(req))));
}));

export default router;
