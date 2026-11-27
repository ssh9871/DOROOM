export interface Motion {
  x: number;
  y: number;
  z: number;
  velocityY: number;
}

// 장애물: 원(r) 또는 축에 맞춘 사각형(hw, hd = 가로·세로의 절반)
export type Obstacle = { x: number; z: number; r: number } | { x: number; z: number; hw: number; hd: number };
// 방의 지형: 위치별 바닥 높이와 지나갈 수 없는 장애물
export type World = { height: (x: number, z: number) => number; obstacles: readonly Obstacle[] };
export const flatWorld: World = { height: () => 0, obstacles: [] };

// 일반 마이룸의 이동 한계. 펫 마이룸은 petRoomLayout.limit으로 더 넓게 씁니다.
export const roomLimit = 8.7;
// 캐릭터 몸의 반지름과 걸어서 오를 수 있는 높이(경사로는 오르고 벽·단은 막힘)
const bodyRadius = .4;
const stepHeight = .45;
// 따라오는 펫 몸의 반지름(머리·꼬리까지)
export const petRadius = .5;

export function blocked(world: World, x: number, z: number, radius = bodyRadius) {
  return world.obstacles.some(o => 'r' in o
    ? Math.hypot(x - o.x, z - o.z) < o.r + radius
    : Math.abs(x - o.x) < o.hw + radius && Math.abs(z - o.z) < o.hd + radius);
}

// (x, z)에 발이 feet 높이에 있는 몸이 설 수 있는지
export function canStand(world: World, x: number, z: number, feet: number, radius = bodyRadius) {
  return !blocked(world, x, z, radius) && world.height(x, z) <= feet + stepHeight;
}

const onGround = (state: Pick<Motion, 'x' | 'y' | 'z'>, world: World) => state.y <= world.height(state.x, state.z) + .05;

export function stepMotion(state: Motion, inputX: number, inputZ: number, jump: boolean, seconds: number, limit = roomLimit, world = flatWorld) {
  const dt = Math.min(Math.max(seconds, 0), 0.05);
  const length = Math.max(1, Math.hypot(inputX, inputZ));
  const speed = 6.5;
  const nx = Math.max(-limit, Math.min(limit, state.x + inputX / length * speed * dt));
  const nz = Math.max(-limit, Math.min(limit, state.z + inputZ / length * speed * dt));
  // 막히면 막히지 않은 축으로만 미끄러지듯 움직입니다.
  if (canStand(world, nx, nz, state.y)) { state.x = nx; state.z = nz; }
  else if (canStand(world, nx, state.z, state.y)) state.x = nx;
  else if (canStand(world, state.x, nz, state.y)) state.z = nz;
  const ground = world.height(state.x, state.z);
  if (jump && state.y <= ground + 1e-6) state.velocityY = 6.5;
  state.velocityY -= 18 * dt;
  state.y = Math.max(ground, state.y + state.velocityY * dt);
  if (state.y === ground) state.velocityY = 0;
}

export const portalPosition = { x: 0, z: 7 };

export function nearPortal(state: Pick<Motion, 'x' | 'y' | 'z'>, portal = portalPosition, world = flatWorld) {
  return onGround(state, world) && Math.hypot(state.x - portal.x, state.z - portal.z) <= 1.8;
}

export function stepFollowing(pet: { x: number; z: number }, target: { x: number; z: number }, seconds: number, limit = roomLimit, world = flatWorld) {
  const dx = target.x - pet.x;
  const dz = target.z - pet.z;
  const distance = Math.hypot(dx, dz);
  const step = Math.min(Math.max(0, distance - 1.2), 8 * Math.min(Math.max(seconds, 0), .05));
  if (step === 0) return false;
  const nx = Math.max(-limit, Math.min(limit, pet.x + dx / distance * step));
  const nz = Math.max(-limit, Math.min(limit, pet.z + dz / distance * step));
  const feet = world.height(pet.x, pet.z);
  if (canStand(world, nx, nz, feet, petRadius)) { pet.x = nx; pet.z = nz; return true; }
  if (canStand(world, nx, pet.z, feet, petRadius)) { pet.x = nx; return true; }
  if (canStand(world, pet.x, nz, feet, petRadius)) { pet.z = nz; return true; }
  return false;
}

export function nearShop(state: Pick<Motion, 'x' | 'y' | 'z'>, shop: { x: number; z: number }, world = flatWorld) {
  return onGround(state, world) && Math.hypot(state.x - shop.x, state.z - shop.z) <= 2;
}
