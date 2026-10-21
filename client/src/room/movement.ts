export interface Motion {
  x: number;
  y: number;
  z: number;
  velocityY: number;
}

export function stepMotion(state: Motion, inputX: number, inputZ: number, jump: boolean, seconds: number) {
  // shortcut: flat floor and rectangular bounds; add geometry collisions when introducing furniture or stairs.
  const dt = Math.min(Math.max(seconds, 0), 0.05);
  const length = Math.max(1, Math.hypot(inputX, inputZ));
  const speed = 4;
  state.x = Math.max(-8.7, Math.min(8.7, state.x + inputX / length * speed * dt));
  state.z = Math.max(-8.7, Math.min(8.7, state.z + inputZ / length * speed * dt));
  if (jump && state.y === 0) state.velocityY = 6.5;
  state.velocityY -= 18 * dt;
  state.y = Math.max(0, state.y + state.velocityY * dt);
  if (state.y === 0) state.velocityY = 0;
}

export const portalPosition = { x: 0, z: 7 };

export function nearPortal(state: Pick<Motion, 'x' | 'y' | 'z'>) {
  return state.y === 0 && Math.hypot(state.x - portalPosition.x, state.z - portalPosition.z) <= 1.8;
}

export function stepFollowing(pet: { x: number; z: number }, target: { x: number; z: number }, seconds: number) {
  // shortcut: direct following on a flat empty floor; add pathfinding when obstacles are introduced.
  const dx = target.x - pet.x;
  const dz = target.z - pet.z;
  const distance = Math.hypot(dx, dz);
  const step = Math.min(Math.max(0, distance - 1.2), 5 * Math.min(Math.max(seconds, 0), .05));
  if (step === 0) return false;
  pet.x = Math.max(-8.7, Math.min(8.7, pet.x + dx / distance * step));
  pet.z = Math.max(-8.7, Math.min(8.7, pet.z + dz / distance * step));
  return true;
}

export const shopPosition = { x: 5.5, z: 6.5 };
export function nearShop(state: Pick<Motion, 'x' | 'y' | 'z'>) {
  return state.y === 0 && Math.hypot(state.x - shopPosition.x, state.z - shopPosition.z) <= 2;
}
