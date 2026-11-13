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
