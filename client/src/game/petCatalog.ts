import { petDamageBonus, type Levels, type SkillId } from './progress.ts';
import { PLAYER, PLAYER_BULLET } from './config.ts';
import type { CombatStats, Grade } from '../../../shared/types.ts';

export type BattlePet = {
  id: string;
  speciesCode: string;
  name: string;
  grade: Grade;
  icon: string;
  sprite?: string;
  attack: number;
  maxHp: number;
  moveSpeed: number;
  bulletSpeed: number;
  ability: { id: SkillId; name: string; effectValue: number; cooldownSec: number };
};

// Local sprites and fallback base stats. Official runs take combat stats from GameStart.
export const battlePets: readonly BattlePet[] = [
  { id: 'pet-dog-001', speciesCode: 'dog', name: '강아지', grade: 'NORMAL', icon: '🐶', sprite: 'pets/pet-dog-001',
    attack: 10, maxHp: 100, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'heal', name: '주기적 체력 회복', effectValue: 10, cooldownSec: 15 } },
  { id: 'pet-cat-001', speciesCode: 'cat', name: '고양이', grade: 'NORMAL', icon: '🐱', sprite: 'pets/pet-cat-001',
    attack: 10, maxHp: 100, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'rapid-fire', name: '발사 속도 증가', effectValue: 1.5, cooldownSec: 20 } },
  { id: 'pet-panda-001', speciesCode: 'panda', name: '판다', grade: 'RARE', icon: '🐼', sprite: 'pets/pet-panda-001',
    attack: 12, maxHp: 120, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'shield', name: '보호막', effectValue: 1, cooldownSec: 25 } },
  { id: 'pet-gumiho-001', speciesCode: 'gumiho', name: '구미호', grade: 'LEGEND', icon: '🦊', sprite: 'pets/pet-gumiho-001',
    attack: 15, maxHp: 150, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'clear', name: '맵 전체 탄막 제거', effectValue: 0, cooldownSec: 30 } },
];

// DB combat stats use a different scale from the Canvas combat loop.
export function battlePetStats(
  pet: Pick<CombatStats, 'attack' | 'maxHp' | 'moveSpeed' | 'bulletSpeed'> | undefined, levels: Levels, petLevel = 1,
) {
  return {
    damage: PLAYER_BULLET.damage * (1 + levels.damage / 10) * (pet ? pet.attack / 10 : 1 + petDamageBonus(petLevel)),
    maxHp: Math.round(PLAYER.maxHp * (pet?.maxHp ?? 100) / 100) + levels['max-hp'],
    moveSpeedScale: (pet?.moveSpeed ?? 100) / 100,
    bulletSpeedScale: (pet?.bulletSpeed ?? 100) / 100,
  };
}
