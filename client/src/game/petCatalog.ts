import type { SkillId } from './progress.ts';
import type { Grade } from '../../../shared/types.ts';

export type BattlePet = {
  id: string;
  speciesId: number;
  name: string;
  grade: Grade;
  icon: string;
  attack: number;
  maxHp: number;
  moveSpeed: number;
  bulletSpeed: number;
  ability: { id: SkillId; name: string; effectValue: number; cooldownSec: number };
};

// Local sprites and fallback base stats. Official runs take combat stats from GameStart.
export const battlePets: readonly BattlePet[] = [
  { id: 'pet-dog-001', speciesId: 1, name: '강아지', grade: 'NORMAL', icon: '🐶',
    attack: 10, maxHp: 100, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'heal', name: '주기적 체력 회복', effectValue: 10, cooldownSec: 15 } },
  { id: 'pet-cat-001', speciesId: 2, name: '고양이', grade: 'NORMAL', icon: '🐱',
    attack: 10, maxHp: 100, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'rapid-fire', name: '발사 속도 증가', effectValue: 1.5, cooldownSec: 20 } },
  { id: 'pet-turtle-001', speciesId: 3, name: '거북이', grade: 'RARE', icon: '🐢',
    attack: 12, maxHp: 120, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'shield', name: '보호막', effectValue: 1, cooldownSec: 25 } },
  { id: 'pet-panda-001', speciesId: 4, name: '판다', grade: 'LEGEND', icon: '🐼',
    attack: 15, maxHp: 150, moveSpeed: 100, bulletSpeed: 100,
    ability: { id: 'clear', name: '맵 전체 탄막 제거', effectValue: 0, cooldownSec: 30 } },
];

// DB combat stats use a different scale from the Canvas combat loop.
export function battlePetStats(pet: BattlePet, baseHp: number) {
  return {
    damageScale: pet.attack / 10,
    maxHp: Math.round(baseHp * pet.maxHp / 100),
    moveSpeedScale: pet.moveSpeed / 100,
    bulletSpeedScale: pet.bulletSpeed / 100,
    healHp: Math.max(1, Math.round(baseHp * pet.ability.effectValue / 100)),
  };
}
