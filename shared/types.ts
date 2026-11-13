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
export interface User { userId: number; nickname: string; cellBalance: number; equippedTitle: Title | null; }
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
export interface StatUpgrade { statCode: string; level: number; valueBonus: number; nextCellCost: number | null; }

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
export interface Stage {
  stageNo: number; name: string; bossName: string; briefing: string;
  unlocked: boolean; cleared: boolean; firstClearRewardCell: number; repeatRewardCell: number;
}
export interface GameStartRequest { mode: GameMode; stageNo?: number; userPetId: number; buffItemIds?: number[]; }
export interface GameStart {
  runId: number; mode: GameMode; stageNo: number | null;
  pet: Pet; combatStats: CombatStats; appliedBuffs: Item[];
}
export interface GameFinishRequest { survivalMs: number; killCount: number; reachedWave: number; cleared: boolean; reviveUsed: boolean; }
export interface GameResult {
  runId: number; score: number; rewardCell: number; firstClearBonus: number; expGained: number;
  pet: Pet; balance: number; newRank: number | null;
}
export interface GameRun {
  runId: number; mode: GameMode; stageNo: number | null; score: number;
  survivalMs: number; killCount: number; reachedWave: number; cleared: boolean; startedAt: string;
}
export interface RankingEntry { rank: number; userId: number; nickname: string; title: Title | null; bestScore: number; }
export interface Ranking { weekStart: string; myRank: RankingEntry | null; entries: RankingEntry[]; }

// ── 우편 ──────────────────────────────────────────────────────
export interface Mail {
  mailId: number; sourceType: string; title: string; cellAmount: number; titleReward: Title | null;
  createdAt: string; claimedAt: string | null; expiresAt: string | null;
}
