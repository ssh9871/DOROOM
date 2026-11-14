// DOROOM 공통 DTO — API 명세서 v1 7장과 동일. 서버 응답과 클라이언트 타입을 이 파일 하나로 맞춘다.
// 클라이언트: import type { Pet } from '../../shared/types';
// 서버(JS)는 JSDoc으로 참조: /** @type {import('../../shared/types').Pet} */
// 필드를 바꿀 땐 docs/db/API_spec_v1.md 7장도 같이 고친다.

export type Grade = 'NORMAL' | 'RARE' | 'LEGEND';
export type ItemType = 'FOOD' | 'SNACK' | 'TOY' | 'EXP_POTION' | 'EVOLVE_STONE' | 'GAME_BUFF';
export type SlotType = 'HEAD' | 'BODY' | 'ACCESSORY';
export type GameMode = 'STAGE' | 'ENDLESS';
export type PoolType = 'PET' | 'EQUIPMENT';

export type ErrorCode =
  | 'UNAUTHORIZED' | 'NOT_FOUND' | 'NOT_ENOUGH_CELL' | 'NOT_ENOUGH_ITEM' | 'PET_TOO_HUNGRY'
  | 'SLOT_LOCKED' | 'LEVEL_NOT_ENOUGH' | 'DAILY_LIMIT' | 'ALREADY_FINISHED' | 'ALREADY_CLAIMED'
  | 'VALIDATION' | 'NOT_IMPLEMENTED' | 'INTERNAL';

/** 모든 응답의 겉모양 */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

// ── 회원·재화·칭호 ─────────────────────────────────────────────
export interface Title { titleId: number; code: string; name: string; }
export interface User { userId: number; loginId: string; nickname: string; cellBalance: number; equippedTitle: Title | null; }
export interface CellTransaction {
  txId: number; amount: number; balanceAfter: number; reason: string; createdAt: string;
}

// ── 펫 ────────────────────────────────────────────────────────
export interface Ability { abilityId: number; code: string; name: string; effectValue: number; cooldownSec: number; }
export interface PetSpecies { speciesId: number; name: string; grade: Grade; ability: Ability; modelUrl: string | null; }
export interface Pet {
  userPetId: number; species: PetSpecies; nickname: string | null;
  level: number; exp: number; expToNext: number; evolutionStage: number;
  hunger: number; affection: number; isRepresentative: boolean; canSortie: boolean;
}
export interface CombatStats {
  attack: number; maxHp: number; moveSpeed: number; bulletSpeed: number;
  ability: Ability; canRevive: boolean;
}
export interface PetDetail extends Pet {
  equipSlotCount: number;                                         // 해금된 칸 수
  equipments: { slotNo: number; equipment: Equipment | null }[];  // 길이 3
  combatStats: CombatStats;
  nextEvolution: { requiredLevel: number; cellCost: number } | null;
}
export interface ExpTransfer { transferId: number; fromLevel: number; toLevelBefore: number; toLevelAfter: number; }

// ── 아이템·장비·강화 ───────────────────────────────────────────
export interface Item {
  itemId: number; code: string; name: string; itemType: ItemType;
  priceCell: number; hungerRestore: number; affectionRestore: number; expGain: number;
  effectConfig: Record<string, unknown>;
}
export interface UserItem { item: Item; quantity: number; }
export interface Equipment {
  equipmentId: number; lineCode: string; name: string; slotType: SlotType; grade: Grade;
  statCode: string; statValue: number;
  nextEquipmentId: number | null; mergeCount: number | null; mergeCellCost: number;
  modelUrl: string | null;
}
export interface UserEquipment { equipment: Equipment; quantity: number; }
export interface Inventory { items: UserItem[]; equipments: UserEquipment[]; }
/** 영구 강화 한 종류의 현재 상태. valueBonus 는 현재 단계까지의 누적 효과 (unit 이 PERCENT 면 %, FLAT 이면 수치) */
export interface StatUpgrade {
  statCode: string; name: string;
  unit: 'FLAT' | 'PERCENT';
  scope: 'PET' | 'MINIGAME';          // PET: 펫 전투 능력치에 합산됨 / MINIGAME: GameStart.upgrades 로 전달, 게임 안에서 적용
  level: number; maxLevel: number; valueBonus: number; nextCellCost: number | null;
}
export interface StatUpgradeBuyResult { upgrade: StatUpgrade; balance: number; }

// ── 뽑기 ──────────────────────────────────────────────────────
export interface GachaPool {
  poolId: number; poolType: PoolType; name: string; costCell: number;
  pityCount: number | null; dailyLimit: number | null; drawnToday: number;
  entries: { species?: PetSpecies; equipment?: Equipment; probability: number }[];
}
export interface GachaResult {
  gachaId: number; balance: number; isDuplicate: boolean; isPity: boolean;
  pet?: Pet; equipment?: UserEquipment; refundCell?: number;
}
export interface GachaLog { gachaId: number; poolId: number; species?: PetSpecies; equipment?: Equipment; createdAt: string; }

// ── 게임·랭킹 ─────────────────────────────────────────────────
/** 작전 지점. displayId "w-s" (1-1 … 4-3) ↔ stageNo = (w-1)*3 + s */
export interface Stage {
  stageNo: number; displayId: string; worldNo: number; subNo: number; isBoss: boolean;
  name: string; bossName: string; briefing: string;
  clearBonusScore: number; firstClearRewardCell: number; repeatRewardCell: number;
  unlocked: boolean; cleared: boolean;
}
export interface StageList { stages: Stage[]; endlessUnlocked: boolean; }   // GET /stages

export interface GameStartRequest {
  mode: GameMode; stageNo?: number; userPetId: number; buffItemIds?: number[];
  practice?: boolean;   // true 면 기록·보상·랭킹 제외 (디버그 연습). runId 는 null
}
export interface GameStart {
  runId: number | null; practice: boolean; mode: GameMode; stageNo: number | null; stage: Stage | null;
  pet: Pet; combatStats: CombatStats; upgrades: StatUpgrade[]; appliedBuffs: Item[];
}
export interface GameFinishRequest { survivalMs: number; killCount: number; reachedWave: number; cleared: boolean; reviveUsed: boolean; }
export interface GameResult {
  runId: number;
  replayed: boolean;     // true 면 이미 확정된 결과를 다시 돌려준 것 (보상 재지급 없음)
  mode: GameMode; stageNo: number | null;
  score: number; rewardCell: number; firstClearBonus: number; expGained: number; cleared: boolean;
  pet: Pet | null; balance: number; newRank: number | null;
}
export type GameRunStatus = 'PLAYING' | 'FINISHED' | 'ABORTED';
export interface GameRun {
  runId: number; mode: GameMode; stageNo: number | null; displayId: string | null; status: GameRunStatus;
  score: number; survivalMs: number; killCount: number; reachedWave: number; cleared: boolean;
  rewardCell: number; expGained: number; startedAt: string; endedAt: string | null;
}
export interface GameHistoryQuery { mode?: GameMode; limit?: number; offset?: number; }  // GET /game/history
export interface RankingEntry { rank: number; userId: number; nickname: string; title: Title | null; bestScore: number; achievedAt: string; }
export interface Ranking { weekStart: string; myRank: RankingEntry | null; entries: RankingEntry[]; }

// ── 우편 ──────────────────────────────────────────────────────
export interface Mail {
  mailId: number; sourceType: string; title: string; cellAmount: number; titleReward: Title | null;
  createdAt: string; claimedAt: string | null; expiresAt: string | null;
}
