export const WORLD = { width: 480, height: 720 } as const;

export const PLAYER = {
  width: 72, height: 80, speed: 300, focusSpeedRatio: 0.45,
  hitRadius: 5, fireInterval: 0.14, maxHp: 5, invulnerableTime: 2, shieldRadius: 46,
};

export const PET = { followRate: 7, offsetX: -40, offsetY: 26 };

export const PLAYER_BULLET = { width: 12, height: 28, speed: 680, damage: 1 };
export const ENEMY_BULLET = { radius: 6, width: 14 };
export const BOSS_AT = 300;
export const ELITES = [60, 120, 180, 240] as const;

/**
 * 처치하지 못한 일반 몹이 화면 아래로 빠져나가면 플레이어 HP 1 감소.
 * 피격과 같은 규칙: 무적 시간(2초)·펫 보호막 중에는 깎이지 않음 → 웨이브가 한꺼번에 빠져도 한 번에 즉사하지 않음.
 * false 로 바꾸면 기존처럼 페널티 없음.
 */
export const ENEMY_ESCAPE_PENALTY = true;
