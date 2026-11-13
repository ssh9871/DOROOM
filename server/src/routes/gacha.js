// 🟩 도로팜 — 뽑기 (명세서 3장) — draw는 한 트랜잭션
// 담당 팀이 채웁니다. 각 핸들러는 명세서(docs/db/API_spec_v1.md)의 요청/응답 형태를 따르고,
// 셀·경험치·아이템 변동은 services/ 의 공통 함수만 사용합니다.
import { Router } from 'express';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
// import { pool, withTransaction } from '../db/pool.js';
// import { addCell } from '../services/cellService.js';
// import { addPetExp, getPetCombatStats, assertPetCanSortie, getPet } from '../services/petService.js';
// import { addItem, useItem, addEquipment, useEquipment, getInventory } from '../services/inventoryService.js';

const router = Router();
router.use(requireAuth);
const todo = wrap(async () => { throw new AppError('NOT_IMPLEMENTED'); });

router.get('/pools', todo);
router.post('/pools/:poolId/draw', todo);
router.get('/history', todo);

export default router;
