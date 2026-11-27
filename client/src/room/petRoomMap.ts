import type { Obstacle, World } from './movement';

// 펫 마이룸(도로랜드 펫 정원)의 지도: 지형 높이, 주요 위치, 지나갈 수 없는 곳.
// Babylon에 의존하지 않아서 이동 검사(movement.test.ts)에서도 그대로 씁니다.
// 좌표: +z가 화면 안쪽(뒤). 울타리 안은 ±31, 이동 한계는 ±30.
//  - 아래층(높이 0): 입구 광장, 동산, 연못, 놀이터, 펫 케어 스테이션
//  - 1단 테라스(높이 2, z ≥ 14): 포털, 펫 하우스. 가운데·왼쪽 경사로
//  - 2단 전망대(높이 4, z ≥ 24): 관람차, 망원경. 오른쪽 경사로
export const HALF = 31;
// 이동 한계: 경계 덤불(±31, 반지름 약 1)에 파묻히지 않을 만큼 안쪽
export const LIMIT = 29.3;
export const TERRACE = { z: 14, height: 2 };
export const UPPER = { z: 24, height: 4 };
// 경사로: x 중심, 반폭, 시작 z, 끝 z, 시작 높이, 끝 높이
export const RAMPS = [
  { x: 0, hw: 2.5, z0: 8, z1: 14, h0: 0, h1: 2 },
  // 성역 돌계단: 비탈과 같은 곳에서 시작해 같은 곳에서 끝나고, 폭은 이어지는 길(돌길 2.4m)과 같습니다.
  { x: -17, hw: 1.2, z0: 12.6, z1: 15.4, h0: 0, h1: 2 },
  { x: 14, hw: 2, z0: 18, z1: 24, h0: 2, h1: 4 },
] as const;

export const PORTAL = { x: 0, z: 19 };
export const SHOP = { x: 17, z: 6.2 };
export const STATION = { x: 17, z: 9.2 };
// 영산(靈山) 성역: 1단 테라스 왼쪽. 안개 낀 산신령의 산으로, 레전더리 펫만 이 안에서 놉니다.
// 두 구역: 테라스 위 산신각 마당 + 그 앞 아래층의 넓은 풀밭(돌계단 왼쪽, 물길 왼쪽까지). 돌계단으로 이어집니다.
export const SANCTUARY_AREAS = [
  { x0: -LIMIT, x1: -4.4, z0: TERRACE.z + .3, z1: UPPER.z - 1 },
  { x0: -LIMIT, x1: -10.6, z0: 3.9, z1: TERRACE.z + .3 },
] as const;
export const inSanctuary = (x: number, z: number) => SANCTUARY_AREAS.some(a => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
// 레어 전용 구역: 별빛 정원. 정문 왼쪽 아래층 구석(연못 서쪽, 성역 풀밭 남쪽)으로, 흰 울타리로 둘러 있습니다.
// 원작 도로랜드의 "자연과 기술이 어우러진" 분위기(홀로그램·네온·떠 있는 조명·빛나는 수정 꽃과 나무)를 가장 진하게 모았습니다.
const SG_X1 = -10.5, SG_Z1 = -3.5, SG_EDGE = -29.6;
export const STAR_GARDEN = {
  x1: SG_X1, z1: SG_Z1,
  // 입구 아치: 정문 길에서 들어오는 동쪽 큰 아치, 성역 풀밭 쪽 북쪽 작은 아치. heading은 아치를 지나가는 방향.
  arches: [{ x: SG_X1, z: -23.5, half: 1.5, heading: Math.PI / 2 }, { x: -20, z: SG_Z1, half: 1.3, heading: 0 }],
  // 울타리(아치 자리는 비움)
  fences: [
    { x0: SG_X1, z0: SG_EDGE, x1: SG_X1, z1: -25.1 }, { x0: SG_X1, z0: -21.9, x1: SG_X1, z1: SG_Z1 },
    { x0: SG_X1, z0: SG_Z1, x1: -18.6, z1: SG_Z1 }, { x0: -21.4, z0: SG_Z1, x1: SG_EDGE, z1: SG_Z1 },
  ],
  fountain: { x: -19.5, z: -15, r: 1.4 },
  plazaR: 3.4,
  // 기둥 여섯 개는 turn(라디안)부터 60°씩. 분수 쪽 길이 기둥 사이 빈칸으로 들어옵니다.
  pavilion: { x: -24.8, z: -24, r: 1.7, turn: .6 },
  beds: [
    { x: -13.6, z: -11.2, r: .9 }, { x: -25.4, z: -9.2, r: 1 }, { x: -14.2, z: -27.4, r: .8 },
    { x: -27.4, z: -15.6, r: .85 }, { x: -20.6, z: -27.2, r: .8 }, { x: -15, z: -15.5, r: .7 },
  ],
  crystalTrees: [
    { x: -12.6, z: -6.2, s: 1 }, { x: -27.6, z: -5.8, s: 1.1 }, { x: -28, z: -28, s: 1 },
    { x: -12.6, z: -19, s: .9 }, { x: -24, z: -12.2, s: .95 }, { x: -16.5, z: -8.2, s: .85 },
  ],
  // 흰 포석 길: 동쪽 아치 → 분수 광장, 분수 광장 → 북쪽 아치, 분수 광장 → 별 관측 정자
  paths: [
    [[-9.4, -23.5], [-13, -23.3], [-15.8, -20.8], [-17.6, -17.4]],
    [[-19.5, -12], [-19.8, -7.5], [-20, -2.6]],
    [[-21.8, -17.4], [-23.4, -21], [-24.3, -22.5]],
  ] as [number, number][][],
};
export const inStarGarden = (x: number, z: number) => x <= SG_X1 && z <= SG_Z1;
// 노멀 펫 놀이 구역: 정원 오른쪽(광장·회전목마·상점·대관람차 쪽). 왼쪽의 성역·별빛 정원과 그 사이 길에는 가지 않습니다.
export const NORMAL_X0 = 0;
export const inNormalArea = (x: number, _z: number) => x >= NORMAL_X0;

// 아래 풀밭 가운데의 거대한 선돌 비석(약 6m, 한자를 새김). 앞면이 화면 쪽(-z)을 봅니다.
export const STELE = { x: -24.5, z: 8.6 };
// 왼쪽 경사로를 올라오면 바로 서 있는 홍살문, 그 안쪽 끝의 산신각
export const SPIRIT_GATE = { x: -17, z: 16, half: 1.7 };
export const SHRINE = { x: -17, z: 21, hw: 2.1, hd: 1.5 };
export const PINES = [
  { x: -27, z: 16.6, s: 1.3 }, { x: -24.3, z: 21.6, s: 1.1 }, { x: -10.6, z: 21.8, s: 1.2 }, { x: -29, z: 21.4, s: 1 }, { x: -12.4, z: 16.2, s: .85 },
  // 아래 풀밭 가장자리(가운데는 넓게 비워 둡니다)
  { x: -29, z: 12.2, s: 1.05 }, { x: -28.6, z: 4.8, s: .95 }, { x: -21, z: 4.7, s: .75 }, { x: -12.4, z: 12.3, s: .75 },
] as const;
export const CAIRNS = [{ x: -21.6, z: 17.6, s: 1 }, { x: -12.8, z: 19, s: .85 }, { x: -26.4, z: 19.2, s: .7 }] as const;
// 석등: 산신각 앞 한 쌍, 왼쪽 경사로 아래 한 쌍
export const LANTERNS = [{ x: -19.3, z: 18.4 }, { x: -14.7, z: 18.4 }, { x: -19.4, z: 11.9 }, { x: -14.6, z: 11.9 }] as const;
export const MOSS_ROCKS = [
  { x: -23.2, z: 15.3, r: .9 }, { x: -6.3, z: 20.6, r: .75 }, { x: -29.4, z: 18.6, r: .7 }, { x: -9.3, z: 19.2, r: .55 },
  { x: -12.2, z: 9.4, r: .7 }, { x: -29.4, z: 8.4, r: .6 }, { x: -22, z: 11.8, r: .55 },
] as const;
// 성역 뒤 전망대 왼쪽에 솟은 바위 봉우리(지나갈 수 없음)와 울타리 밖 먼 산
export const PEAKS = [
  { x: -27, z: 27.6, r: 3.6, h: 7.5 }, { x: -20.4, z: 28.6, r: 3, h: 5.8 }, { x: -14.2, z: 28.4, r: 2.5, h: 4.4 }, { x: -9.6, z: 29.3, r: 1.7, h: 3 },
] as const;
export const FAR_PEAKS = [
  { x: -44, z: 40, r: 11, h: 24 }, { x: -24, z: 47, r: 13, h: 30 }, { x: -54, z: 16, r: 10, h: 19 }, { x: -6, z: 50, r: 9, h: 17 }, { x: -60, z: 34, r: 9, h: 21 },
] as const;
export const POND = { x: -6, z: -4, r: 3.3 };
// 원작 도로랜드 광장처럼 큰 나무를 가운데 둔 둥근 광장
export const PLAZA = { x: 5, z: -9, r: 5.5 };
export const PLAZA_BOWLS = [-1, 1].flatMap(sx => [-1, 1].map(sz => ({ x: PLAZA.x + sx * 2.6, z: PLAZA.z + sz * 2.6 })));
// 펫 회전목마(원작 공원의 회전목마를 작게)
export const CAROUSEL = { x: 17, z: -14, r: 2.6 };
export const WHEEL = { x: 6, z: 27.5 };
export const TELESCOPE = { x: -6, z: 25.5 };
// 울타리 안 큰 나무
export const YARD_TREES = [
  { x: 27, z: -27, s: 1.4, blossom: true }, { x: 27, z: 0, s: 1.5, blossom: false },
  { x: 22, z: 28, s: 1.5, blossom: true },
] as const;
export const ROCKS = [
  { x: 24, z: 18, r: 1 },
] as const;
// 원작 정원처럼 돌 테두리를 두른 둥근 꽃밭
export const FLOWER_BEDS = [
  { x: 8, z: 4.5, r: 1.3 }, { x: -4.6, z: 11.2, r: 1.1 }, { x: 22, z: -4, r: 1.4 }, { x: 5, z: 21, r: 1.2 },
  { x: 9.5, z: 21, r: 1.1 }, { x: -4, z: -20, r: 1.4 }, { x: 12, z: -22, r: 1.2 },
] as const;
export const INFO = { x: -4, z: -26 };
// 벤치: 길을 피해 경치를 바라보는 자리. heading은 앉은 사람이 바라보는 방향(라디안, 0 = 화면 앞쪽 -z, 방향 벡터 = (-sin, -cos))
export const BENCHES = [
  { x: -1.5, z: 28.6, heading: 0 }, { x: -3.2, z: -9, heading: 2.5 }, { x: -22, z: -2, heading: -.29 }, { x: 22.5, z: -19.5, heading: 2.36 },
] as const;
// 폭포와 물길: 1단 테라스 옹벽에서 떨어져 연못으로 흘러갑니다. 화분·풀 등은 물길을 피해 놓습니다.
export const FALL_X = -8;
const bezier = (a: [number, number], b: [number, number], c: [number, number], count: number) =>
  Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, u = 1 - t;
    return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]] as [number, number];
  });
export const STREAM = bezier([FALL_X, 11.6], [-9.5, 4], [-6.6, -0.95], 34);
// 성역 쪽(가운데 경사로 왼쪽)은 옹벽 대신 아래층에서 테라스로 자연스럽게 올라가는 비탈입니다.
export const SLOPE = { x1: -2.5, z0: 12.8, z1: 15.6 };
// 폭포: 테라스 위 바위 틈에서 솟은 물이 비탈의 바위 사이로 흘러내려 아래 소(웅덩이)로 떨어집니다.
export const CASCADE = { x: FALL_X, z0: 12.9, z1: 16.3 };
export const POOL = { x: FALL_X, z: 12.1, r: 1.05 };
const jitter = (i: number, k: number) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
export const CASCADE_ROCKS = [
  ...[-1, 1].flatMap(side => Array.from({ length: 5 }, (_, i) => {
    const size = 1 + Math.abs(jitter(i, side)) * .5;
    return { x: FALL_X + side * (1 + Math.abs(jitter(i + 3, side)) * .25), z: CASCADE.z0 + .2 + i * .78, size };
  })),
  // 물이 솟는 곳 뒤의 큰 바위들
  { x: FALL_X - .9, z: CASCADE.z1 + .5, size: 1.6 }, { x: FALL_X + .2, z: CASCADE.z1 + .9, size: 1.9 }, { x: FALL_X + 1.1, z: CASCADE.z1 + .4, size: 1.4 },
];
export const nearStream = (x: number, z: number, margin = 1.2) => STREAM.some(([px, pz]) => Math.hypot(x - px, z - pz) < margin);
export const GATE = { z: -HALF, gap: 3 };

// 포털 앞 둥근 광장의 반지름(길이 이 안으로 들어와 끝납니다)
export const PORTAL_PLAZA_R = 3.5;

// 길: 끊기지 않는 한 줄(체인)마다 2차 베지어 [시작, 중간, 끝]을 이어 붙입니다.
// 이어지는 곳은 앞 구간의 (끝 - 중간)과 뒤 구간의 (중간 - 시작) 방향이 같아서 꺾이지 않습니다.
// 길 끝은 광장·포털 광장·다른 길 안에 묻히게 해서 이음매가 보이지 않습니다.
type Pt = [number, number];
const plazaEdge = (angle: number): Pt => [PLAZA.x + Math.cos(angle) * (PLAZA.r - .6), PLAZA.z + Math.sin(angle) * (PLAZA.r - .6)];
export const PATH_WIDTH = 2.2;
const PATH_CHAINS: [Pt, Pt, Pt][][] = [
  // 정문 → 광장
  [[[0, -HALF + .6], [0, -20], plazaEdge(-2.2)]],
  // 광장 → 가운데 경사로 → 포털 광장
  [[plazaEdge(2.1), [0, 2], [0, 7.6]], [[0, 7.6], [0, 11], [0, 16.4]]],
  // 광장 → 펫 케어 스테이션(상점 앞까지)
  [[plazaEdge(.5), [17, -1.5], [SHOP.x, 7.3]]],
  // 가운데 길에서 갈라져 → 물길 다리 → 왼쪽 경사로(돌계단) → 홍살문 → 산신각 앞(돌길)
  [[[.4, 2.5], [-17, 2.5], [-17, 8]], [[-17, 8], [-17, 13.4], [-17, 18.8]]],
  // 포털 광장 → 오른쪽 경사로 → 전망대 관람차
  [[[2, 16.6], [14, 15.6], [14, 19.6]], [[14, 19.6], [14, 21], [14, 22.4]], [[14, 22.4], [14, 26.6], [9, 26.6]]],
];
const SAMPLE = .3;
// 길 가운데 선(점 목록). 꾸미기와 다리·풀 배치 계산에 함께 씁니다.
export const PATH_LINES: Pt[][] = PATH_CHAINS.map(chain => chain.flatMap(([a, b, c], i) => {
  const approx = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
  return bezier(a, b, c, Math.max(2, Math.round(approx / SAMPLE))).slice(i ? 1 : 0);
}));
// 점에서 길 가운데 선까지의 거리
export const distToLine = (line: Pt[], x: number, z: number) => {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i]!, [bx, bz] = line[i + 1]!;
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};
export const onPath = (x: number, z: number, margin = 0) => PATH_LINES.some(line => distToLine(line, x, z) < PATH_WIDTH / 2 + margin);

// 다리: 길이 물길을 건너는 곳에 길과 같은 방향으로 놓아 길이 그대로 다리로 이어집니다.
// heading 방향(sin, cos)이 다리 길이 방향입니다.
export const BRIDGE = { length: 3.4, width: PATH_WIDTH };
export const BRIDGES = PATH_LINES.flatMap((points, line) => {
  let best = { d: Infinity, i: -1 };
  points.forEach(([px, pz], i) => STREAM.forEach(([sx, sz]) => {
    const d = Math.hypot(px - sx, pz - sz);
    if (d < best.d) best = { d, i };
  }));
  if (best.d >= 1.2) return [];
  const [x, z] = points[best.i]!;
  const a = points[Math.max(best.i - 2, 0)]!, b = points[Math.min(best.i + 2, points.length - 1)]!;
  return [{ x, z, heading: Math.atan2(b[0] - a[0], b[1] - a[1]), line }];
});
// 다리 길이 방향 위치 t(0~1)에서 다리 바닥이 지면보다 높은 정도(아치)
export const bridgeDeck = (t: number) => .18 + Math.sin(Math.PI * t) * .22;
const onBridge = (x: number, z: number) => {
  for (const b of BRIDGES) {
    const dx = x - b.x, dz = z - b.z;
    const along = dx * Math.sin(b.heading) + dz * Math.cos(b.heading);
    const across = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);
    if (Math.abs(along) <= BRIDGE.length / 2 && Math.abs(across) <= BRIDGE.width / 2) return { b, t: along / BRIDGE.length + .5 };
  }
  return null;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

// 지형 자체의 높이(다리 제외). 지형 메시와 소품 배치에 씁니다.
export function terrainHeight(x: number, z: number) {
  let h = z >= UPPER.z ? UPPER.height : z >= TERRACE.z ? TERRACE.height : 0;
  // 성역 쪽 비탈(돌계단과 그 옆벽 자리는 빼고)
  if (x < SLOPE.x1 && z >= SLOPE.z0 && z < SLOPE.z1 && !RAMPS.some(r => r.x < SLOPE.x1 && Math.abs(x - r.x) <= r.hw && z >= r.z0)) {
    h = TERRACE.height * smooth((z - SLOPE.z0) / (SLOPE.z1 - SLOPE.z0));
  }
  for (const ramp of RAMPS) {
    if (Math.abs(x - ramp.x) <= ramp.hw && z >= ramp.z0 && z < ramp.z1) h = ramp.h0 + (ramp.h1 - ramp.h0) * (z - ramp.z0) / (ramp.z1 - ramp.z0);
  }
  // 울타리 밖: 둥근 언덕이 솟아오르다가 섬 가장자리에서 바다로 내려갑니다.
  const out = Math.max(Math.abs(x) - HALF, -z - HALF, z - HALF, 0);
  if (out > 0) h += Math.min(7, out * .45) * (0.75 + 0.25 * Math.sin(x * .17) * Math.cos(z * .13));
  const r = Math.hypot(x, z);
  if (r > 62) h -= (r - 62) * .6;
  return h;
}

// 걸을 때의 바닥 높이: 지형 + 다리 위에서는 아치형 다리 바닥
export function heightAt(x: number, z: number) {
  const h = terrainHeight(x, z);
  const bridge = onBridge(x, z);
  return bridge ? Math.max(h, terrainHeight(bridge.b.x, bridge.b.z) + bridgeDeck(bridge.t)) : h;
}

// 바닥 높이를 바꾸는 벽: 테라스 앞 옹벽과 경사로 옆벽. 막아서 떨어지지도, 통과하지도 않게 합니다.
const wallSegments = (z: number, gaps: readonly { x: number; hw: number }[]) => {
  const cuts = [-HALF, ...gaps.flatMap(g => [g.x - g.hw, g.x + g.hw]).sort((a, b) => a - b), HALF];
  const segments: { x0: number; x1: number }[] = [];
  for (let i = 0; i < cuts.length; i += 2) segments.push({ x0: cuts[i]!, x1: cuts[i + 1]! });
  return segments.filter(s => s.x1 - s.x0 > .1).map(s => ({ x: (s.x0 + s.x1) / 2, z, hw: (s.x1 - s.x0) / 2, hd: .35 }));
};
// 테라스 옹벽은 가운데 경사로 오른쪽에만 남습니다(왼쪽은 비탈).
export const TERRACE_WALLS = wallSegments(TERRACE.z - .35, RAMPS.filter(r => r.z1 === TERRACE.z)).filter(s => s.x - s.hw >= SLOPE.x1);
export const UPPER_WALLS = wallSegments(UPPER.z - .35, RAMPS.filter(r => r.z1 === UPPER.z));
export const RAMP_SIDES = RAMPS.flatMap(r => [-1, 1].map(side => ({ x: r.x + side * (r.hw + .2), z: (r.z0 + r.z1) / 2, hw: .2, hd: (r.z1 - r.z0) / 2 })));

export const obstacles: Obstacle[] = [
  ...TERRACE_WALLS, ...UPPER_WALLS, ...RAMP_SIDES,
  { x: STATION.x, z: STATION.z, hw: 3.1, hd: 1.7 },
  { x: SHRINE.x, z: SHRINE.z, hw: SHRINE.hw, hd: SHRINE.hd },
  ...[-1, 1].map(side => ({ x: SPIRIT_GATE.x + side * SPIRIT_GATE.half, z: SPIRIT_GATE.z, r: .22 })),
  ...PINES.map(p => ({ x: p.x, z: p.z, r: .35 * p.s })),
  ...CAIRNS.map(c => ({ x: c.x, z: c.z, r: .55 * c.s })),
  ...LANTERNS.map(l => ({ x: l.x, z: l.z, r: .35 })),
  ...MOSS_ROCKS.map(r => ({ x: r.x, z: r.z, r: r.r })),
  { x: STELE.x, z: STELE.z, r: 1.15 },
  // 폭포: 흘러내리는 물줄기와 양옆 바위(물줄기는 건널 수 없음)
  ...CASCADE_ROCKS.map(r => ({ x: r.x, z: r.z, r: r.size * .42 })),
  ...Array.from({ length: 8 }, (_, i) => ({ x: CASCADE.x, z: CASCADE.z0 + .2 + i * .45, r: .5 })),
  { x: POOL.x, z: POOL.z, r: POOL.r },
  ...PEAKS.map(p => ({ x: p.x, z: p.z, r: p.r * .9 })),
  { x: POND.x, z: POND.z, r: POND.r },
  { x: WHEEL.x, z: WHEEL.z, r: 2.4 },
  { x: TELESCOPE.x, z: TELESCOPE.z, r: .6 },
  { x: CAROUSEL.x, z: CAROUSEL.z, r: CAROUSEL.r },
  // 세계수 줄기와 뿌리
  { x: PLAZA.x, z: PLAZA.z, r: 2.3 },
  ...PLAZA_BOWLS.map(b => ({ x: b.x, z: b.z, r: .65 })),
  ...YARD_TREES.map(t => ({ x: t.x, z: t.z, r: .45 * t.s })),
  // 별빛 정원: 울타리, 아치 기둥, 분수, 정자 기둥, 수정 꽃밭·나무
  ...STAR_GARDEN.fences.map(f => ({ x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2, hw: Math.abs(f.x1 - f.x0) / 2 + .12, hd: Math.abs(f.z1 - f.z0) / 2 + .12 })),
  ...STAR_GARDEN.arches.flatMap(a => [-1, 1].map(side => ({ x: a.x + Math.cos(a.heading) * side * a.half, z: a.z - Math.sin(a.heading) * side * a.half, r: .3 }))),
  { x: STAR_GARDEN.fountain.x, z: STAR_GARDEN.fountain.z, r: STAR_GARDEN.fountain.r },
  ...Array.from({ length: 6 }, (_, i) => ({ x: STAR_GARDEN.pavilion.x + Math.cos(i / 6 * Math.PI * 2 + STAR_GARDEN.pavilion.turn) * STAR_GARDEN.pavilion.r, z: STAR_GARDEN.pavilion.z + Math.sin(i / 6 * Math.PI * 2 + STAR_GARDEN.pavilion.turn) * STAR_GARDEN.pavilion.r, r: .16 })),
  ...STAR_GARDEN.beds.map(b => ({ x: b.x, z: b.z, r: b.r })),
  ...STAR_GARDEN.crystalTrees.map(t => ({ x: t.x, z: t.z, r: .3 * t.s })),
  ...ROCKS.map(r => ({ x: r.x, z: r.z, r: r.r })),
  ...FLOWER_BEDS.map(b => ({ x: b.x, z: b.z, r: b.r })),
  { x: INFO.x, z: INFO.z, r: .5 },
  ...BENCHES.map(b => ({ x: b.x, z: b.z, r: .95 })),
  ...[-1, 1].map(side => ({ x: side * (GATE.gap + .3), z: GATE.z, r: .45 })),
  ...[-1, 1].map(side => ({ x: PORTAL.x + side * 2.6, z: PORTAL.z - .8, r: .2 })),
  // 물길: 다리 밑을 빼고는 건널 수 없습니다(다리로만 건넘).
  ...STREAM.filter(([x, z]) => !BRIDGES.some(b => Math.hypot(x - b.x, z - b.z) < BRIDGE.length / 2 + .3)).map(([x, z]) => ({ x, z, r: .4 })),
  // 상점 옆 화분
  ...[-1, 1].map(side => ({ x: STATION.x + side * 3.4, z: STATION.z - 1.5, r: .42 })),
  // 다리 난간: 양쪽 난간을 따라 작은 원을 촘촘히 놓아 옆으로 빠지거나 통과하지 못하게 합니다.
  ...BRIDGES.flatMap(b => [-1, 1].flatMap(side => Array.from({ length: 13 }, (_, i) => {
    const along = -BRIDGE.length / 2 + i * BRIDGE.length / 12, across = side * (BRIDGE.width / 2 + .05);
    return { x: b.x + along * Math.sin(b.heading) + across * Math.cos(b.heading), z: b.z + along * Math.cos(b.heading) - across * Math.sin(b.heading), r: .1 };
  }))),
];

export const petWorld: World = { height: heightAt, obstacles };
export const petRoomLayout = { limit: LIMIT, portal: PORTAL, shop: SHOP, world: petWorld };
