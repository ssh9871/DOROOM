import { COLORS, ENEMY_BULLET, PLAYER_BULLET } from './config';

/** 화면 밖으로 이만큼 벗어나면 탄환을 제거합니다. */
const CULL_MARGIN = 40;

/**
 * 모든 탄환의 공통 부모.
 * (x, y)는 탄환의 중심 좌표, vx / vy 는 초당 이동 픽셀입니다.
 */
export abstract class Bullet {
  alive = true;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
  ) {}

  update(dt: number, worldWidth: number, worldHeight: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (
      this.x < -CULL_MARGIN || this.x > worldWidth + CULL_MARGIN ||
      this.y < -CULL_MARGIN || this.y > worldHeight + CULL_MARGIN
    ) {
      this.alive = false;
    }
  }

  abstract draw(ctx: CanvasRenderingContext2D): void;
}

/** 플레이어의 "정화의 빛": 위로 곧게 뻗는 노란색 얇은 사각형 */
export class PlayerBullet extends Bullet {
  readonly width = PLAYER_BULLET.width;
  readonly height = PLAYER_BULLET.height;
  readonly damage = PLAYER_BULLET.damage;

  constructor(x: number, y: number) {
    super(x, y, 0, -PLAYER_BULLET.speed);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // ─────────────────────────────────────────────────────────────
    // [이미지 교체 안내] 정화의 빛 PNG로 바꾸려면 아래 도형 코드 대신:
    //   ctx.drawImage(lightImg, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    // (이미지가 더 크다면 width/height 값을 config.ts 의 PLAYER_BULLET 에서 함께 조정하세요.)
    // ─────────────────────────────────────────────────────────────
    ctx.fillStyle = COLORS.playerBulletGlow;
    ctx.fillRect(this.x - this.width, this.y - this.height / 2, this.width * 2, this.height);
    ctx.fillStyle = COLORS.playerBullet;
    ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
  }
}

/** 적 탄막: 보라색 오염된 물방울. 둥글고 팝한 놀이공원 오브젝트입니다. */
export class EnemyBullet extends Bullet {
  private spin = Math.random() * Math.PI * 2;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    public readonly radius: number = ENEMY_BULLET.radius,
  ) {
    super(x, y, vx, vy);
  }

  override update(dt: number, worldWidth: number, worldHeight: number): void {
    super.update(dt, worldWidth, worldHeight);
    this.spin += dt * 6;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // 물방울 꼬리가 아래로 살짝 늘어나는 팝 스타일
    const tail = this.radius * 0.8;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + tail);
    ctx.bezierCurveTo(this.x - this.radius * 1.25, this.y + this.radius * 0.25, this.x - this.radius, this.y - this.radius, this.x, this.y - this.radius);
    ctx.bezierCurveTo(this.x + this.radius, this.y - this.radius, this.x + this.radius * 1.25, this.y + this.radius * 0.25, this.x, this.y + tail);
    ctx.fillStyle = COLORS.enemyBulletEdge;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y - 1, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.enemyBullet;
    ctx.fill();

    // 반짝이는 하이라이트로 무섭지 않고 말랑한 느낌을 줍니다.
    ctx.beginPath();
    ctx.arc(this.x - this.radius * 0.35, this.y - this.radius * 0.4, this.radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.enemyBulletCore;
    ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────────
// 적 탄막 패턴 생성 함수
// 적(Enemy)은 이 함수들이 돌려주는 탄환 배열을 Game 에 넘기기만 하면 됩니다.
// 각도 단위는 라디안이며, 화면 좌표계(y가 아래로 증가)를 따릅니다.
// ─────────────────────────────────────────────────────────────────

/** 방사형: (x, y)를 중심으로 count 개의 탄환을 균등한 각도로 퍼뜨립니다. */
export function radialPattern(
  x: number,
  y: number,
  count: number,
  speed: number,
  angleOffset = 0,
): EnemyBullet[] {
  const bullets: EnemyBullet[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = angleOffset + (i * Math.PI * 2) / count;
    bullets.push(new EnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed));
  }
  return bullets;
}

/** 조준형: 목표(tx, ty)를 향해 발사. count > 1 이면 spread(전체 부채꼴 각도) 안에 균등 분배. */
export function aimedPattern(
  x: number,
  y: number,
  tx: number,
  ty: number,
  speed: number,
  count = 1,
  spread = 0,
): EnemyBullet[] {
  const base = Math.atan2(ty - y, tx - x);
  const bullets: EnemyBullet[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = base + t * spread;
    bullets.push(new EnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed));
  }
  return bullets;
}
