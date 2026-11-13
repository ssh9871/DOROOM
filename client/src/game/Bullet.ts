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

  constructor(x: number, y: number, public readonly damage = PLAYER_BULLET.damage, size = 1) {
    super(x, y, 0, -PLAYER_BULLET.speed);
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
    private readonly stops = false,
    private pattern?: 'split' | 'ricochet',
  ) { super(x, y, vx, vy); }

  override update(dt: number, width: number, height: number): void {
    const previous = this.age;
    this.age += dt;
    const paused = this.stops ? Math.max(0, Math.min(this.age, 1.2) - Math.max(previous, 0.65)) : 0;
    super.update(dt - paused, width, height);
    if (this.alive && this.pattern === 'ricochet' && (this.x < this.radius || this.x > width - this.radius)) {
      const wall = this.x < this.radius ? this.radius : width - this.radius;
      this.x = 2 * wall - this.x;
      this.vx = -this.vx;
      this.pattern = undefined;
    }
  }

  split(room: number): EnemyBullet[] {
    if (!this.alive || this.pattern !== 'split' || this.age < 0.9) return [];
    this.pattern = undefined;
    if (room < 1) return [];
    this.alive = false;
    const speed = Math.hypot(this.vx, this.vy);
    const direction = Math.atan2(this.vx, this.vy);
    return [-1, 1].map(side => {
      const angle = direction + side * Math.PI / 9;
      return new EnemyBullet(this.x, this.y, Math.sin(angle) * speed, Math.cos(angle) * speed);
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawSprite(ctx, `projectiles/enemy-${this.shot}`, this.x, this.y, { scale: ENEMY_BULLET.width / 8 });
    if (!this.stops || this.age < 0.85 || this.age >= 1.2) return;
    const angle = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 3, 0, Math.PI * 2);
    ctx.moveTo(9, 0);
    ctx.lineTo(16, 0);
    ctx.lineTo(12, -3);
    ctx.moveTo(16, 0);
    ctx.lineTo(12, 3);
    ctx.stroke();
    ctx.restore();
  }
}
