// 영구 스탯 강화 (로비에서 셀로 구매). 펫 능력치용(ATTACK…)과 미니게임용(PROJECTILE_COUNT…) 코드를 같은 API 로 다룬다.
//   stat_code.scope = 'PET'      → getPetCombatStats 에 합산됨
//   stat_code.scope = 'MINIGAME' → GameStart.upgrades 로 전달, 게임 안에서 적용
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { wrap } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listStatUpgrades, buyStatUpgrade } from '../services/gameService.js';

const router = Router();
router.use(requireAuth);

// GET /stat-upgrades → StatUpgrade[]  (level, maxLevel, valueBonus=누적 효과, nextCellCost)
router.get('/', wrap(async (req, res) => ok(res, await listStatUpgrades(pool, req.userId))));

// POST /stat-upgrades/:statCode → { upgrade: StatUpgrade, balance }
router.post('/:statCode', wrap(async (req, res) => {
  const statCode = String(req.params.statCode).toUpperCase();
  ok(res, await withTransaction(client => buyStatUpgrade(client, req.userId, statCode)));
}));

export default router;
