import { PlayerBullet } from './Bullet';
import { PLAYER, PLAYER_BULLET, WORLD } from './config';
import type { Input } from './Input';
import { baseLevels, petDamageBonus, type Levels } from './progress';
import { drawSprite } from './sprites';
import { clamp } from './utils';

export class Player {
  x: number = WORLD.width / 2;
  y: number = WORLD.height - 110;
  readonly hitRadius = PLAYER.hitRadius;
  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  isShieldActive = false;
  fireRate = 1;
  private invulnerable = 0;
  private fireTimer = 0;
  private time = 0;
  private direction = 0;
  private focus = false;
  private levels = baseLevels;
  private damage = PLAYER_BULLET.damage;

  reset(levels: Levels, petLevel: number): void {
    this.levels = levels;
    this.damage = PLAYER_BULLET.damage * (1 + levels.damage / 10) * (1 + petDamageBonus(petLevel));
    this.x = WORLD.width / 2;
    this.y = WORLD.height - 110;
    this.maxHp = PLAYER.maxHp + levels['max-hp'];
    this.hp = this.maxHp;
    this.isShieldActive = false;
    this.fireRate = 1;
    this.invulnerable = this.fireTimer = this.time = this.direction = 0;
    this.focus = false;
  }

  update(dt: number, input: Input, emit: (bullet: PlayerBullet) => void): void {
    this.time += dt;
    const dx = Number(input.right) - Number(input.left);
    const dy = Number(input.down) - Number(input.up);
    this.direction = dx;
    this.focus = input.focus;
    const speed = PLAYER.speed * (this.focus ? PLAYER.focusSpeedRatio : 1) * (dx && dy ? Math.SQRT1_2 : 1);
    this.x = clamp(this.x + dx * speed * dt, PLAYER.width / 2, WORLD.width - PLAYER.width / 2);
    this.y = clamp(this.y + dy * speed * dt, PLAYER.height / 2, WORLD.height - PLAYER.height / 2);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    this.fireTimer -= dt * this.fireRate;
    while (this.fireTimer <= 0) {
      this.fireTimer += PLAYER.fireInterval;
      const count = 1 + this.levels.amount;
      for (let i = 0; i < count; i++) {
        emit(new PlayerBullet(this.x + (i - (count - 1) / 2) * 18, this.y - 36,
          this.damage, 1 + this.levels.size / 10));
      }
    }
  }

  takeDamage(): boolean {
    if (this.hp <= 0 || this.isShieldActive || this.invulnerable > 0) return false;
    this.hp--;
    this.invulnerable = PLAYER.invulnerableTime;
    return true;
  }

  heal(): boolean {
    if (this.hp <= 0 || this.hp === this.maxHp) return false;
    this.hp++;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.invulnerable > 0 && Math.floor(this.time * 14) % 2 === 0) ctx.globalAlpha = 0.42;
    for (const side of [-1, 1]) {
      drawSprite(ctx, 'player/thruster', this.x + side * 22, this.y + 35 + side * this.direction * 3,
        { tag: this.focus ? 'focus' : 'cruise', time: this.time });
    }
    drawSprite(ctx, 'player/hoverboard', this.x, this.y, { tag: this.direction === 0 ? 'idle' : this.direction < 0 ? 'left' : 'right' });
    ctx.restore();
    if (this.isShieldActive) drawSprite(ctx, 'effects/fx-shield', this.x, this.y, { time: this.time });
    if (this.focus) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#24243b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
