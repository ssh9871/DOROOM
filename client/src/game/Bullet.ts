import { ENEMY_BULLET, PLAYER_BULLET } from './config';
import { drawSprite } from './sprites';

class Bullet {
  alive = true;
  constructor(public x: number, public y: number, public vx: number, public vy: number) {}

  update(dt: number, width: number, height: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -40 || this.x > width + 40 || this.y < -40 || this.y > height + 40) this.alive = false;
  }
}

export class PlayerBullet extends Bullet {
  readonly width: number;
  readonly height: number;

  constructor(x: number, y: number, public readonly damage = PLAYER_BULLET.damage, size = 1, speed = PLAYER_BULLET.speed) {
    super(x, y, 0, -speed);
    this.width = PLAYER_BULLET.width * size;
    this.height = PLAYER_BULLET.height * size;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawSprite(ctx, 'projectiles/purification-pulse', this.x, this.y, { width: this.width, height: this.height });
  }
}

export type EnemyShot = 'basic' | 'aimed' | 'spray';

export class EnemyBullet extends Bullet {
  private age = 0;

  constructor(
    x: number, y: number, vx: number, vy: number,
    public readonly radius = ENEMY_BULLET.radius,
    private readonly shot: EnemyShot = 'basic',
    private readonly motion?: { acceleration: number; maxSpeed: number; redirectAt?: number },
    readonly wide = false,
    private firstStepDelay = 0,
  ) { super(x, y, vx, vy); }

  override update(dt: number, width: number, height: number, target?: Readonly<{ x: number; y: number }>): void {
    dt = Math.max(0, dt - this.firstStepDelay);
    this.firstStepDelay = 0;
    const previousAge = this.age;
    this.age += dt;
    if (this.motion) {
      const { acceleration, maxSpeed, redirectAt = 0 } = this.motion;
      let angle = Math.atan2(this.vx, this.vy);
      if (target && previousAge < redirectAt && this.age >= redirectAt)
        angle = Math.atan2(target.x - this.x, target.y - this.y);
      const acceleratingTime = Math.max(0, this.age - Math.max(previousAge, redirectAt));
      const speed = Math.min(maxSpeed, Math.hypot(this.vx, this.vy) + acceleration * acceleratingTime);
      this.vx = Math.sin(angle) * speed;
      this.vy = Math.cos(angle) * speed;
    }
    super.update(dt, width, height);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawSprite(ctx, `projectiles/enemy-${this.shot}`, this.x, this.y, { scale: ENEMY_BULLET.width / 8 });
  }
}
