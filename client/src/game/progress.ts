import { BOSS_AT } from './config.ts';
import type { BattlePet } from './petCatalog.ts';

export const upgrades = {
  amount: { name: '발사체 개수', costs: [120, 300], effect: (level: number) => `${1 + level}발` },
  damage: { name: '피해량', costs: [60, 100, 150, 220, 320], effect: (level: number) => `${100 + 10 * level}%` },
  size: { name: '발사체 크기', costs: [50, 80, 120, 180, 260], effect: (level: number) => `${100 + 10 * level}%` },
  'max-hp': { name: '체력', costs: [80, 150, 280], effect: (level: number) => `${5 + level} HP` },
};
export type UpgradeId = keyof typeof upgrades;
export type Levels = Record<UpgradeId, number>;
export const upgradeIds = Object.keys(upgrades) as UpgradeId[];
export const baseLevels: Levels = { amount: 0, damage: 0, size: 0, 'max-hp': 0 };

export const skills = {
  shield: { name: '보호막', description: '3초 동안 피격을 막아요.' },
  clear: { name: '전체 탄환 지우기', description: '화면의 적 탄환을 모두 지워요.' },
  heal: { name: '체력 회복', description: '체력을 1 HP 회복해요.' },
  'rapid-fire': { name: '공격속도 증가', description: '5초 동안 자동 발사 빈도가 30% 증가해요.' },
};
export type SkillId = keyof typeof skills;
export const skillCooldown = 60;
export const BOSS_TIME_LIMIT = 50;
export const petDamageBonus = (level: number) => Math.min(3, Math.max(0, level - 1)) * 0.15;
export type RunSetup = { mode: 'stage' | 'endless'; stage: number; levels: Levels; skill: SkillId; petLevel?: number; pet?: BattlePet };
export type RunOutcome = 'clear' | 'return' | 'abort';
export type RunResult = Pick<RunSetup, 'mode' | 'stage'> & {
  id: string; outcome: RunOutcome; seconds: number; purified: number; completedAt: number;
  reachedWave?: number; bossTimeout?: boolean; bossPractice?: boolean;
};
export type RankedRun = { id: string; score: number; completedAt: number };

export function scoreRun(run: RunResult, clearReward: number) {
  const survival = Math.floor(run.mode === 'stage' ? Math.min(run.seconds, BOSS_AT) : run.seconds);
  const purification = run.purified * 10;
  const score = survival + purification;
  return {
    survival, purification, score,
    scoreCells: run.outcome === 'abort' || run.bossPractice ? 0 : Math.floor(score / 25),
    clearCells: run.mode === 'stage' && run.outcome === 'clear' && !run.bossPractice ? clearReward : 0,
  };
}

const day = 86_400_000;
const koreaOffset = 9 * 60 * 60 * 1000;
export function weekStart(at: number): number {
  const date = new Date(at + koreaOffset);
  return Math.floor((at + koreaOffset) / day) * day - ((date.getUTCDay() + 6) % 7) * day - koreaOffset;
}

export function weeklyRanking(runs: readonly RankedRun[], user: { id: string; nickname: string }, at = Date.now()) {
  const start = weekStart(at);
  const end = start + 7 * day;
  const best = runs.filter(run => run.completedAt >= start && run.completedAt < end)
    .sort((a, b) => b.score - a.score || a.completedAt - b.completedAt)[0];
  return { start, end, rows: best ? [{ ...best, userId: user.id, nickname: user.nickname }] : [] };
}
