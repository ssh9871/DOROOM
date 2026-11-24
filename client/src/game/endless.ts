/**
 * 무한 모드 규칙 (스테이지 모드와 분리된 순수 함수 모음 → 단위 테스트 쉬움)
 *
 * 흐름: 구역 1(사파리) → 2(숲) → 3(정비 구역) → 4(허브) → 다시 1 → 2 → …
 *   - 한 구역 = 일반 웨이브 `zoneSeconds`초 + 보스전
 *   - 보스를 정화해야만 구역 클리어 보너스 + 다음 구역 (보스전 제한 시간 없음)
 *   - 난이도는 "구역 번호 + 구역 안 경과 시간"으로 연속 상승 (한 바퀴 돌아도 리셋 없음)
 *
 * 숫자는 전부 플레이테스트용 초안. 여기 상수만 고치면 됩니다.
 * ⚠️ zoneSeconds·zoneClearBonus 를 바꾸면 server/src/services/gameService.js 의 ENDLESS_RULE 도 같이 바꿀 것.
 */

export const ENDLESS = {
  zones: 4,
  /** 구역 진입 후 보스 등장까지(초) */
  zoneSeconds: 90,
  /** 구역 진입 후 엘리트 등장 시각(초) */
  elites: [25, 50, 75] as readonly number[],
  /** 보스 등장 후 지원 호출 시각(초) */
  bossReinforceAfter: 20,
  /** 구역 k(0부터)의 보스 정화 보너스 = zoneClearBonus × (k + 1) → 뒤 구역일수록 큼 */
  zoneClearBonus: 50,
  /** 구역 전환 배경 크로스페이드(초) */
  fadeSeconds: 1.5,
  /** 구역 전환 안내 표시(초) */
  noticeSeconds: 3,
} as const;

/**
 * 구역별로 사용할 스테이지 편성(stages 배열 인덱스).
 * 1회차는 기획서대로 1-3 / 2-3 / 3-3 / 4-1, 2회차부터 같은 구역의 다른 지점 편성으로 교체해 반복감을 줄임.
 * 배경은 stage.zone 으로 정해지므로 어떤 편성이든 구역 1→2→3→4 배경 순서는 유지됨.
 */
export const endlessRotation: readonly (readonly number[])[] = [
  [2, 0, 1],    // 사파리: 1-3 → 1-1 → 1-2
  [5, 3, 4],    // 숲:     2-3 → 2-1 → 2-2
  [8, 6, 7],    // 정비:   3-3 → 3-1 → 3-2
  [9, 10, 11],  // 허브:   4-1 → 4-2 → 4-3
];

/** 무한 모드에서 쓰일 수 있는 모든 스테이지 인덱스 (에셋 미리 로딩용) */
export const endlessStagePool: readonly number[] = [...new Set(endlessRotation.flat())];

export const endlessZone = (area: number) => area % ENDLESS.zones;
export const endlessLoop = (area: number) => Math.floor(area / ENDLESS.zones);
export function endlessStageIndex(area: number): number {
  const variants = endlessRotation[endlessZone(area)]!;
  return variants[endlessLoop(area) % variants.length]!;
}

/** 구역 k 보스 정화 보너스 */
export const zoneBonus = (area: number) => ENDLESS.zoneClearBonus * (area + 1);
export const totalZoneBonus = (clearedAreas: readonly number[]) =>
  clearedAreas.reduce((sum, area) => sum + zoneBonus(area), 0);

export type EndlessDifficulty = {
  /** 연속 난이도 수치 (0부터, 구역 하나 지날 때마다 +1) */
  level: number;
  /** HUD 표시용 위험도 (1부터 정수) */
  tier: number;
  enemyHp: number;
  eliteHp: number;
  bossHp: number;
  /** 적 공격 빈도 배율 */
  pace: number;
  /** 적 탄속 배율 */
  bulletSpeed: number;
  /** 일반 웨이브 생성 간격(초) */
  spawnInterval: number;
  /** 일반·엘리트가 쏠 수 있는 화면 내 탄 상한 */
  shotLimit: number;
};

/**
 * 시작값은 스토리 마지막 지점(4-3: 공격 빈도 81%, 탄속 85.4%)과 맞추고 상한까지 천천히 오름.
 *   level 0  → 빈도 0.80 / 탄속 0.85 / 간격 2.1초
 *   level 4  → 빈도 1.00 / 탄속 0.97 / 간격 1.7초   (1회차 끝)
 *   level 8  → 빈도 1.20 / 탄속 1.09 / 간격 1.3초   (2회차 끝)
 *   level 14 → 빈도 1.50(상한) / 탄속 1.25(상한) / 간격 0.9초(하한)
 */
export function endlessDifficulty(area: number, areaTime: number): EndlessDifficulty {
  const level = Math.max(0, area) + Math.min(1, Math.max(0, areaTime) / ENDLESS.zoneSeconds);
  return {
    level,
    tier: Math.floor(level) + 1,
    enemyHp: Math.min(5, 1 + 0.15 * level),
    eliteHp: Math.min(5, 1 + 0.15 * level),
    bossHp: 1 + 0.15 * Math.max(0, area),
    pace: Math.min(1.5, 0.8 + 0.05 * level),
    bulletSpeed: Math.min(1.25, 0.85 + 0.03 * level),
    spawnInterval: Math.max(0.9, 2.1 - 0.1 * level),
    shotLimit: Math.round(Math.min(180, 90 + 10 * level)),
  };
}

/** 보스 기본 체력 (난이도 배율 적용 전). 구역이 뒤일수록 큼 */
export const endlessBossBaseHp = (area: number) => 375 + 138 * endlessZone(area);
