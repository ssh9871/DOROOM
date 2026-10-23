/** 순수 수학/충돌 유틸. DOM에 의존하지 않아 단위 테스트가 쉽습니다. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 프레임레이트와 무관한 Lerp 계수.
 * pos += (target - pos) * dampFactor(rate, dt) 처럼 쓰면 어떤 FPS에서도 같은 속도로 따라갑니다.
 */
export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** 원-원 충돌 */
export function circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/** 사각형(중심 좌표)-사각형(중심 좌표) 충돌 */
export function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return Math.abs(ax - bx) * 2 <= aw + bw && Math.abs(ay - by) * 2 <= ah + bh;
}

/** 원-사각형(중심 좌표) 충돌 */
export function circleRectOverlap(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  const nearestX = clamp(cx, rx - rw / 2, rx + rw / 2);
  const nearestY = clamp(cy, ry - rh / 2, ry + rh / 2);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= cr * cr;
}
