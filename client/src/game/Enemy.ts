import { EnemyBullet, type EnemyShot } from './Bullet';
import { WORLD } from './config';
import { drawSprite } from './sprites';
import { clamp } from './utils';
import type { Attack } from './stages';

export type EnemyKind = 'normal' | 'elite' | 'boss';
type Point = { x: number; y: number };
const deg = Math.PI / 180;

const ATTACK_SPEED: Record<Attack, number> = {
  single: 170, diagonal: 150, burst: 165, fan: 140, fixed: 120, 'fixed-double': 130,
  cross: 145, crane: 147, radial: 124, 'twin-radial': 126, stop: 110, 'open-fan': 100,
  split: 105, corridor: 135, ricochet: 123, dash: 132, 'return-dash': 143,
  sweep: 134, spray: 129, barrier: 138, reinforce: 131,
};

const normal = {
  'patrol-drone': { attacks: ['single'], speed: 73, hp: 4, recovery: 1.9 },
  mower: { attacks: ['fixed'], speed: 76, hp: 5, recovery: 2 },
  guard: { attacks: ['burst'], speed: 65, hp: 6, recovery: 2.25 },
  carrier: { attacks: ['diagonal'], speed: 140, hp: 5, recovery: 1.45 },
  sprayer: { attacks: ['spray'], speed: 64, hp: 6, recovery: 2.3 },
  'armored-worker': { attacks: ['fixed-double'], speed: 43, hp: 12, recovery: 3 },
  'small-worker': { attacks: ['fan'], speed: 105, hp: 2, recovery: 2.1 },
  relay: { attacks: ['cross'], speed: 55, hp: 7, recovery: 2.65 },
} satisfies Record<string, { attacks: Attack[]; speed: number; hp: number; recovery: number }>;

export class Enemy {
  alive = true;
  readonly width: number;
  readonly height: number;
  readonly maxHp: number;
  hp: number;
  y: number;
  age = 0;
  private hitFlash = 0;
  private timer: number;
  private index = 0;
  private volley = 0;
  private attack?: Attack;
  private aim = 0;
  private phaseTwo = false;
  private moving = 0;
  private moveDirection = 1;
  private barrier = false;
  private purified = false;
  private reinforceFlash = 0;
  private readonly entryX: number;
  private readonly entrySide: number;
  private readonly attacks: readonly Attack[];
  private returning = false;

  constructor(
    readonly kind: EnemyKind, readonly sprite: string, public x: number,
    sequence: readonly Attack[] = [], difficulty = 1,
    bossHp = 160,
  ) {
    const spec = this.spec;
    this.width = this.height = kind === 'boss' ? (sprite === '4-3' ? 160 : 128) : kind === 'elite' ? 80
      : ({ carrier: 52, 'armored-worker': 64, relay: 56, guard: 56, mower: 56, sprayer: 60 } as Record<string, number>)[sprite] ?? 48;
    this.maxHp = Math.round((kind === 'boss' ? bossHp : kind === 'elite' ? 26 : spec.hp) * difficulty);
    this.hp = this.maxHp;
    this.y = -this.height / 2;
    this.entryX = x;
    this.entrySide = x < WORLD.width / 2 ? 1 : -1;
    this.attacks = kind === 'normal' ? spec.attacks : kind === 'elite'
      ? [...sequence, sprite === 'hub' ? 'twin-radial' : 'fan'] : sequence;
    this.timer = kind === 'normal' ? 0.55 + Math.random() * 0.75 : 0.65 + (kind === 'elite' ? x / WORLD.width * 0.8 : 0);
  }

  private get spec() { return normal[this.sprite as keyof typeof normal] ?? normal['patrol-drone']; }

  update(
    dt: number, target: Point, room: number, emit: (bullet: EnemyBullet) => void,
    reinforce: () => void, clearShots: () => void, pace = 1, bulletSpeed = 1,
  ): void {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.reinforceFlash = Math.max(0, this.reinforceFlash - dt);
    this.move(dt);
    if (this.kind === 'normal' && this.y - this.height / 2 > WORLD.height) { this.alive = false; return; }
    const fireLine = this.kind === 'normal' ? 35 : this.kind === 'elite' ? 105 : 140;
    if (this.y < fireLine || this.y > 580 || this.moving > 0 || this.returning) return;

    const finalPhase = this.sprite === '4-3' && this.hp <= this.maxHp / 2;
    if (finalPhase && !this.phaseTwo) {
      this.phaseTwo = true;
      clearShots();
      this.attack = undefined;
      this.barrier = false;
      this.index = 0;
      this.timer = 0.8;
    }
    const sequence = this.phaseTwo ? ['corridor', 'stop', 'burst'] as const
      : this.attacks;
    if (!sequence.length) return;
    this.timer -= dt;
    if (this.timer > 1e-9) return;
    if (!this.attack) {
      this.attack = sequence[this.index % sequence.length]!;
      this.volley = 0;
      this.aim = Math.atan2(target.x - this.x, target.y - this.y);
      this.moveDirection = this.x > WORLD.width / 2 ? -1 : 1;
      this.barrier = this.attack === 'barrier';
    }

    const attack = this.attack;
    const step = this.volley;
    let count = 0;
    let interval = 0;
    let center = 0;
    let spread = 0;
    let origin = this.x;
    let shot: EnemyShot = 'basic';
    switch (attack) {
      case 'single': count = 1; center = this.aim; shot = 'aimed'; break;
      case 'diagonal': count = 1; center = this.entrySide * 30 * deg; break;
      case 'burst': count = 1; center = this.aim; shot = 'aimed'; interval = step < 2 ? 0.18 : 0; break;
      case 'fan':
        count = this.sprite === '4-1' || this.sprite === '4-3' ? 5 : 3;
        center = this.aim; spread = 20 * deg; shot = 'aimed'; break;
      case 'fixed':
      case 'fixed-double':
        count = 3; center = step * 10 * deg; spread = 20 * deg;
        interval = attack === 'fixed-double' && step === 0 ? 0.55 : 0; break;
      case 'crane':
        if (step === 0) {
          this.moving = 0.8;
          this.volley++;
          this.timer = 0;
          return;
        }
        // After the crane moves, fire from its two nozzles.
        count = 3; spread = 14 * deg;
        center = (step === 1 ? 30 : -30) * deg;
        origin = this.nozzle(step - 1);
        interval = step === 1 ? 0.30 : 0; break;
      case 'cross':
        count = 3; spread = 14 * deg;
        center = (step === 0 ? 30 : -30) * deg;
        origin = this.nozzle(step);
        interval = step === 0 ? 0.30 : 0; break;
      case 'radial':
        count = 12; spread = 30 * deg; center = step * 10 * deg;
        interval = step < 2 ? 0.42 : 0; break;
      case 'twin-radial':
        count = 16; spread = 45 * deg;
        break;
      case 'stop':
        if (step === 0) { count = 8; spread = 18 * deg; interval = 0.85; }
        else { count = 1; center = Math.atan2(target.x - origin, target.y - this.y); shot = 'aimed'; }
        break;
      case 'open-fan':
        count = 4; spread = 22 * deg; interval = step === 0 ? 0.8 : 0;
        break;
      case 'split':
        count = 3; spread = 29 * deg;
        break;
      case 'corridor':
        count = 8; interval = step < 2 ? 0.72 : 0;
        break;
      case 'ricochet':
        count = 2; spread = 124 * deg; interval = step === 0 ? 0.45 : 0;
        break;
      case 'dash':
      case 'return-dash':
      case 'sweep':
        if (step === 0) {
          this.moving = attack === 'dash' ? 0.72 : 1.35;
          this.volley++;
          this.timer = 0;
          return;
        }
        count = 3; spread = 20 * deg;
        if (this.kind === 'boss' && attack === 'return-dash') {
          center = Math.atan2(target.x - origin, target.y - this.y);
          shot = 'aimed';
        }
        break;
      case 'spray':
        shot = 'spray'; spread = 12 * deg;
        if (this.kind === 'boss') {
          origin = this.nozzle(step);
          center = Math.atan2(target.x - origin, target.y - this.y);
          count = 5;
          interval = step === 0 ? 0.6 : 0;
        } else {
          count = this.kind === 'normal' ? 3 : 6;
          center = this.kind === 'normal' ? (this.index % 2 === 0 ? 35 : -35) * deg : (step === 0 ? 50 : -50) * deg;
          interval = this.kind === 'elite' && this.sprite === 'irrigation' && step === 0 ? 0.6 : 0;
        }
        break;
      case 'barrier':
        if (step === 0) { count = 3; spread = 20 * deg; interval = 0.9; }
        else {
          this.barrier = false; count = 1; shot = 'aimed';
          if (step === 1) this.aim = Math.atan2(target.x - origin, target.y - this.y);
          center = this.aim; interval = step < 3 ? 0.18 : 0;
        }
        break;
      case 'reinforce':
        count = 3; spread = 20 * deg;
        if (room >= count) { reinforce(); this.reinforceFlash = 0.35; }
        break;
    }
    if (count > room) return;
    const velocity = ATTACK_SPEED[attack] * bulletSpeed;
    for (let i = 0; i < count; i++) {
      const right = i >= count / 2;
      let angle = center + (i - (count - 1) / 2) * spread;
      let x = origin;
      if (attack === 'twin-radial') angle = (i % 8 + (right ? 0.5 : 0)) * spread;
      if (attack === 'twin-radial' || attack === 'stop' && step === 0) x = this.nozzle(right ? 1 : 0);
      if (attack === 'corridor') {
        const gap = (this.index % 2 === 0 ? 3 + step : 5 - step);
        const lane = i < gap ? i : i + 2;
        x = (lane + 0.5) * WORLD.width / 10;
      }
      emit(new EnemyBullet(x, this.y, Math.sin(angle) * velocity, Math.cos(angle) * velocity,
        undefined, shot, attack === 'stop' && step === 0, attack === 'split' ? 'split' : attack === 'ricochet' ? 'ricochet' : undefined));
    }
    if (interval) {
      this.volley++;
      this.timer = interval;
      return;
    }
    this.index++;
    this.attack = undefined;
    const recovery = this.kind === 'normal' ? this.spec.recovery :
      attack === 'radial' || attack === 'twin-radial' ? 1.35 : this.sprite === '1-1' && this.index <= 3 ? 1.4 :
      this.kind === 'elite' ? 1.4 : 0.85;
    this.timer = attack === 'stop' ? 1.15 : (['split', 'corridor', 'ricochet'].includes(attack) ? 1.6 : recovery) / pace;
    if (this.kind === 'boss') this.timer = 0.4;
  }

  private nozzle(step: number): number {
    return clamp(this.x + (step === 0 ? -55 : 55), 12, WORLD.width - 12);
  }

  private move(dt: number): void {
    if (this.returning) {
      this.y = Math.max(130, this.y - 280 * dt);
      this.returning = this.y > 130;
      return;
    }
    if (this.moving > 0) {
      const returning = this.attack === 'return-dash' && this.moving < 0.62;
      if (this.attack === 'dash') this.y += 425 * dt;
      else this.x = clamp(this.x + this.moveDirection * (returning ? -1 : 1) * 320 * dt, this.width / 2, WORLD.width - this.width / 2);
      this.moving -= dt;
      if (this.kind === 'elite' && this.attack === 'dash' && this.moving <= 0) this.returning = true;
    } else if (this.kind === 'normal') {
      this.moveNormal(dt);
    } else if (this.kind === 'elite') {
      if (this.y < 130) this.y = Math.min(130, this.y + 110 * dt);
      else this.x = clamp(this.x + Math.cos(this.age * 1.4) * 68 * dt, 40, WORLD.width - 40);
    } else if (this.y < 140) {
      this.y = Math.min(140, this.y + 90 * dt);
    } else if (this.kind === 'boss' && !this.attack && !['2-1', '3-3'].includes(this.sprite)) {
      // Start at the current position so the first hover frame cannot jump.
      this.x = clamp(this.x + Math.cos(this.age * 0.8) * 72 * dt, this.width / 2, WORLD.width - this.width / 2);
    }
  }

  private moveNormal(dt: number): void {
    this.y += this.spec.speed * dt;
    switch (this.sprite) {
      case 'mower':
      case 'carrier':
        this.x += this.entrySide * this.spec.speed * 0.72 * dt;
        break;
      case 'guard':
      case 'relay': {
        const arrival = (this.height / 2 + 110) / this.spec.speed;
        this.y = -this.height / 2 + this.spec.speed * (this.age - clamp(this.age - arrival, 0, 1.55));
        this.x = this.entryX + Math.sin(this.age * 2) * 25;
        break;
      }
      case 'sprayer': this.x = this.entryX + Math.sin(this.age * 1.7) * 100; break;
      case 'armored-worker': this.x = this.entryX + Math.sin(this.age * 0.85) * 64; break;
      case 'small-worker': this.x = this.entryX + Math.sin(this.age * 3.5) * 45; break;
      default: this.x = this.entryX + Math.sin(this.age * 2.6) * 52;
    }
    this.x = clamp(this.x, this.width / 2, WORLD.width - this.width / 2);
  }

  hit(damage: number): boolean {
    if (this.barrier) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.hitFlash = 0.08;
    if (this.hp > 0) return false;
    this.alive = false;
    this.purified = true;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const key = this.kind === 'boss' ? `bosses/boss-${this.sprite}`
      : `enemies/${this.kind === 'normal' ? 'enemy' : 'elite'}-${this.sprite}`;
    ctx.save();
    if (this.hitFlash > 0 && !this.purified) ctx.globalAlpha = 0.55;
    drawSprite(ctx, key, this.x, this.y, {
      time: this.age, tag: this.purified ? 'purified' : this.attack ? 'attack' : this.kind === 'normal' ? 'move' : 'idle',
    });
    ctx.restore();
    if (this.purified) return;
    if (this.barrier) drawSprite(ctx, 'effects/fx-enemy-barrier', this.x, this.y + 28, { time: this.age, width: this.width, height: 42 });
    if (this.reinforceFlash > 0)
      drawSprite(ctx, 'effects/fx-enemy-reinforce', this.x, this.y, { time: 0.35 - this.reinforceFlash });
  }
}
