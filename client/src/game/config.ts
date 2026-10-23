/**
 * 게임 전체에서 쓰는 밸런스/색상 상수 모음.
 * 숫자만 바꿔도 난이도와 느낌을 조절할 수 있도록 한곳에 모았습니다.
 *
 * 좌표 규칙: 모든 엔티티의 (x, y)는 "중심 좌표"입니다.
 * 이미지로 교체할 때는 drawImage(img, x - width / 2, y - height / 2, width, height) 형태로 그리면 됩니다.
 */

/** 논리 해상도(세로형). 실제 캔버스 크기는 화면에 맞춰 자동으로 스케일됩니다. */
export const WORLD = {
  width: 480,
  height: 720,
} as const;

export const COLORS = {
  background: '#fff8ee',
  gridNear: 'rgba(255, 255, 255, 0.32)',
  gridFar: 'rgba(255, 255, 255, 0.18)',

  player: '#34d399',
  playerEdge: '#d1fae5',
  shield: 'rgba(59, 130, 246, 0.28)',
  shieldEdge: 'rgba(147, 197, 253, 0.95)',

  pet: '#4ade80',
  petEdge: '#166534',

  playerBullet: '#fde047',
  playerBulletGlow: 'rgba(253, 224, 71, 0.35)',

  enemyBullet: '#a855f7',
  enemyBulletEdge: '#7e22ce',
  enemyBulletCore: '#f3e8ff',

  text: '#12345b',
  textDim: 'rgba(18, 52, 91, 0.78)',
  accent: '#b45309',
} as const;

export const PLAYER = {
  width: 66,
  height: 75,
  /** 이동 속도(px/s) */
  speed: 300,
  /** Shift를 누르는 동안 속도 배율(정밀 회피용) */
  focusSpeedRatio: 0.45,
  /** 실제 피격 판정 반지름. 보이는 사각형보다 훨씬 작아야 탄막 게임답게 피할 수 있습니다. */
  hitRadius: 5,
  /** 자동 발사 간격(초) */
  fireInterval: 0.14,
  /** 총알 한 쌍의 좌우 간격 */
  bulletSpread: 9,
  maxLives: 3,
  /** 피격 후 무적 시간(초) */
  invulnerableTime: 2,
  /** 쉴드 원 반지름 */
  shieldRadius: 46,
} as const;

export const PET = {
  size: 32,
  /** 값이 클수록 플레이어를 빨리 따라옵니다(지수 보간 계수). */
  followRate: 7,
  /** 플레이어 기준 상대 위치: 옆-뒤(왼쪽 아래) */
  offsetX: -40,
  offsetY: 26,
  /** 쉴드 발동 주기(초): 10초마다 한 번 */
  shieldInterval: 10,
  /** 쉴드 유지 시간(초): 3초 */
  shieldDuration: 3,
} as const;

export const PLAYER_BULLET = {
  width: 4,
  height: 18,
  speed: 680,
  damage: 1,
} as const;

export const ENEMY_BULLET = {
  radius: 6,
} as const;

/** 시간에 따라 1 → 2 로 올라가는 난이도 계수의 상한 도달 시간(초) */
export const DIFFICULTY_RAMP_SECONDS = 120;

export const STORAGE_KEY_BEST = 'dorohell.best';
