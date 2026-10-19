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
