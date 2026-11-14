import { EnemyBullet, type EnemyShot } from './Bullet';
import { WORLD } from './config';
import { drawSprite } from './sprites';
import { circleRectOverlap, clamp } from './utils';
import { finalBossAttacks, type Attack } from './stages';

export type EnemyKind = 'normal' | 'elite' | 'boss';
type Point = { x: number; y: number };
const deg = Math.PI / 180;
const LASER_WIDTH = 24;
const LASER_LENGTH = Math.hypot(WORLD.width, WORLD.height);
const LASER_WARNING = 0.5;
const LASER_DURATION = 0.35;
const LASER_SHOTS = 3;

const normal = {
  'patrol-drone': { attack: null, speed: 73, hp: 4, recovery: 1.9 },
  mower: { attack: 'square', speed: 76, hp: 5, recovery: 2 },
  guard: { attack: 'aimed-fan', speed: 65, hp: 6, recovery: 2.25 },
  carrier: { attack: null, speed: 140, hp: 5, recovery: 1.45 },
  sprayer: { attack: 'double-fan', speed: 64, hp: 6, recovery: 2.3 },
  'armored-worker': { attack: 'down-accel', speed: 43, hp: 12, recovery: 3 },
  'small-worker': { attack: 'octagon', speed: 105, hp: 2, recovery: 2.1 },
  relay: { attack: 'aimed-accel', speed: 55, hp: 7, recovery: 2.65 },
} as const satisfies Record<string, { attack: Attack | null; speed: number; hp: number; recovery: number }>;

export const isWideAttack = (attack?: Attack | null) => attack === 'double-fan' || attack === 'ring';

export function normalAttack(sprite: string, stage: string): Attack | null {
  if (stage === '4-2' && sprite === 'armored-worker') return 'ring';
  return normal[sprite as keyof typeof normal]?.attack ?? null;
}

export function waveSize(sprite: string, stage: string, zone: number): number {
  switch (normalAttack(sprite, stage)) {
    case null: return zone === 3 ? 12 : 10;
    case 'octagon': return zone === 3 ? 4 : 2;
    case 'square': return zone === 2 ? 6 : 4;
    case 'double-fan': return zone === 3 ? 3 : 2;
    case 'aimed-accel':
    case 'ring': return 3;
    case 'aimed-fan': return 4;
    case 'down-accel': return 5;
    default: return 2;
  }
}

export class Enemy {
  alive = true;
  readonly width: number;
  readonly height: number;
  readonly maxHp: number;
  hp: number;
  y: number;
  age = 0;
  private hitFlash = 0;
  private lastAttack = -Infinity;
  private attackFlash = 0;
  private timer: number;
  private index = 0;
  private volley = 0;
  private attack?: Attack;
  private aim = 0;
  private phaseTwo = false;
  private barrier = false;
  private purified = false;
  private reinforceFlash = 0;
  private readonly entryX: number;
  private readonly entryY: number;
  private readonly entrySide: number;
  private readonly attacks: readonly Attack[];

  get isShooter() { return this.kind === 'normal' && this.attacks.length > 0; }
  get isWideShooter() { return this.isShooter && isWideAttack(this.attacks[0]); }
  get timeSinceAttack() { return this.age - this.lastAttack; }
  get isFiring() { return this.attack !== undefined && this.volley > 0; }
  get nextAttack() {
    const sequence = this.phaseTwo ? finalBossAttacks : this.attacks;
    return this.attack ?? sequence[this.index % sequence.length];
  }

  constructor(
    readonly kind: EnemyKind, readonly sprite: string, public x: number,
    sequence: readonly Attack[] = [], difficulty = 1,
    bossHp = 160,
    private readonly placement: { stage?: string; delay?: number; offset?: number } = {},
  ) {
    const spec = this.spec;
    this.width = this.height = kind === 'boss' ? (sprite === '4-3' ? 160 : 128) : kind === 'elite' ? 80
      : ({ carrier: 52, 'armored-worker': 64, relay: 56, guard: 56, mower: 56, sprayer: 60 } as Record<string, number>)[sprite] ?? 48;
    this.maxHp = Math.round((kind === 'boss' ? bossHp : kind === 'elite' ? 26 : spec.hp) * difficulty);
    this.hp = this.maxHp;
    this.y = this.entryY = -this.height / 2 - (placement.offset ?? 0);
    this.entryX = x;
    this.entrySide = x < WORLD.width / 2 ? 1 : -1;
    const attack = normalAttack(sprite, placement.stage ?? '');
    this.attacks = kind === 'normal' ? (attack ? [attack] : []) : sequence;
    this.timer = kind === 'normal' ? 0.55 + (placement.delay ?? 0) : 0.65;
  }

  private get spec() { return normal[this.sprite as keyof typeof normal] ?? normal['patrol-drone']; }

  update(
    dt: number, target: Point, room: number, emit: (bullet: EnemyBullet) => void,
    reinforce: () => boolean, clearShots: () => void, pace = 1, bulletSpeed = 1, canStart = true,
  ): void {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackFlash = Math.max(0, this.attackFlash - dt);
    this.reinforceFlash = Math.max(0, this.reinforceFlash - dt);
    this.move(dt, target);
    if (this.kind === 'normal' && this.y - this.height / 2 > WORLD.height) { this.alive = false; return; }
    const fireLine = this.kind === 'normal' ? 35 : this.kind === 'elite' ? 105 : 140;
    if (this.y < fireLine || this.y > 580) return;
    if (this.kind === 'boss' && this.sprite === '4-3' && this.hp <= this.maxHp / 2 && !this.phaseTwo) {
      this.phaseTwo = true;
      clearShots();
      this.attack = undefined;
      this.barrier = false;
      this.index = this.volley = 0;
      this.timer = 0.8;
      return;
    }

    this.timer -= dt;
    const attack = this.nextAttack;
    if (this.timer > 1e-9 || !attack || (!this.isFiring && !canStart)) return;

    // Sweeps can have several shots due in one simulation step.
    const sweep = attack === 'arc-sweep' || attack === 'ring-sweep';
    do {
      let count = 1;
      let interval = 0;
      let center = 0;
      let spread = 0;
      let speed = 130;
      let shot: EnemyShot = 'basic';
      let acceleration = 0;
      let redirectAt: number | undefined;
      const step = this.volley;
      const lockAim = step === 0 || (attack === 'laser' && step % 2 === 0 && step < LASER_SHOTS * 2);
      const aim = lockAim ? Math.atan2(target.x - this.x, target.y - this.y) : this.aim;
      switch (attack) {
        case 'square': count = 4; spread = 90; break;
        case 'octagon': count = 8; spread = 45; break;
        case 'ring': count = 18; spread = 20; speed = 116; break;
        case 'double-fan':
          count = 10; center = aim; spread = 45; speed = 138; shot = 'spray'; break;
        case 'aimed-fan':
          count = 3; center = aim; spread = 30; speed = 148; shot = 'aimed'; break;
        case 'aimed-accel':
        case 'down-accel':
          center = attack === 'aimed-accel' ? aim : 0;
          shot = attack === 'aimed-accel' ? 'aimed' : 'basic';
          speed = 90; acceleration = 110; interval = step < 4 ? 0.18 : 0; break;
        case 'offset-fan':
          count = 18;
          spread = 20;
          center = (170 + (step >= 3 ? 10 : 0)) * deg;
          speed = step < 3 ? 178 : 178 * 1.15;
          interval = step < 5 ? 0.15 : 0;
          break;
        case 'aimed-stream':
          count = 3; center = aim; spread = 5; speed = 215; shot = 'aimed';
          interval = step < 9 ? 0.13 / pace : 0; break;
        case 'arc-sweep':
          center = aim + (-90 + 5 * (step < 37 ? step : 73 - step)) * deg;
          speed = 300;
          interval = step < 73 ? 0.01 : 0;
          break;
        case 'redirect-fan':
          count = 7; center = aim; spread = 10; speed = 164; shot = 'spray';
          acceleration = 340; redirectAt = 2; break;
        case 'ring-sweep':
          count = 2; center = aim + step * 5 * deg; speed = 200;
          interval = step < 71 ? 0.01 : 0; break;
        case 'scatter':
          count = step < 6 ? 72 : 71; speed = 250;
          interval = step < 13 ? 0.24 / pace : 0; break;
        case 'laser':
          count = 0;
          if (step < LASER_SHOTS * 2) interval = step % 2 === 0 ? LASER_WARNING : LASER_DURATION;
          break;
      }
      if (this.kind !== 'boss' && count > room && count > 0) return;

      if (!this.attack && this.placement.stage === '3-1' && this.kind !== 'normal' && this.index % this.attacks.length === 0) {
        this.barrier = true;
        this.attack = attack;
        this.timer = 0.9;
        return;
      }
      this.attack = attack;
      if (step === 0) this.lastAttack = this.age;
      if (count > 0) this.attackFlash = 0.16;
      this.aim = aim;
      this.barrier = false;
      if (step === 0 && this.kind === 'elite' && this.index % this.attacks.length === 0
        && (this.placement.stage === '3-2' || this.placement.stage === '4-3') && reinforce())
        this.reinforceFlash = 0.35;

      for (let i = 0; i < count; i++) {
        let angle = center + (i - (count - 1) / 2) * spread * deg;
        let velocity = speed * bulletSpeed;
        if (attack === 'double-fan') {
          angle = center + (Math.floor(i / 2) - 2) * spread * deg;
          if (i % 2 === 0) velocity *= 0.85;
        }
        if (attack === 'ring-sweep' && i === 1) velocity = 300 * bulletSpeed;
        if (attack === 'scatter') angle = Math.random() * 2 * Math.PI;
        const offset = attack === 'double-fan' ? (i % 2 === 0 ? 6 : 18) : 0;
        emit(new EnemyBullet(this.x + Math.sin(angle) * offset, this.y + Math.cos(angle) * offset,
          Math.sin(angle) * velocity, Math.cos(angle) * velocity, undefined, shot,
          acceleration ? { acceleration: acceleration * bulletSpeed, maxSpeed: (redirectAt ? 470 : 235) * bulletSpeed, redirectAt } : undefined,
          isWideAttack(attack), sweep ? clamp(dt + this.timer, 0, dt) : 0));
      }
      if (interval) {
        this.volley++;
        this.timer = sweep ? this.timer + interval : interval;
        continue;
      }
      this.index++;
      this.attack = undefined;
      this.volley = 0;
      const recovery = this.kind === 'boss' ? (this.sprite === '1-1' ? 1.2 : 0.4)
        : (this.kind === 'normal' ? this.spec.recovery : 1.4) / pace;
      this.timer = sweep ? this.timer + recovery : recovery;
      return;
    } while (sweep && this.timer <= 1e-9);
  }

  laserHits(target: Point, radius: number): boolean {
    if (!this.alive || this.attack !== 'laser' || this.volley === 0 || this.volley % 2 !== 0) return false;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const sin = Math.sin(this.aim);
    const cos = Math.cos(this.aim);
    return circleRectOverlap(dx * cos - dy * sin, dx * sin + dy * cos, radius,
      0, LASER_LENGTH / 2, LASER_WIDTH, LASER_LENGTH);
  }

  private move(dt: number, target: Point): void {
    if (this.kind === 'normal') this.moveNormal(dt, target);
    else if (this.kind === 'elite') {
      if (this.y < 130) this.y = Math.min(130, this.y + 110 * dt);
      else this.x = clamp(this.x + Math.cos(this.age * 1.4) * 68 * dt, 40, WORLD.width - 40);
    } else if (this.y < 140) {
      this.y = Math.min(140, this.y + 90 * dt);
    } else if (!this.attack) {
      this.x = clamp(this.x + Math.cos(this.age * 0.8) * 72 * dt, this.width / 2, WORLD.width - this.width / 2);
    }
  }

  private moveNormal(dt: number, target: Point): void {
    // A queued wide shooter stays in range until it gets its first turn.
    const waitingForFirstVolley = this.isWideShooter && this.lastAttack === -Infinity;
    if (!waitingForFirstVolley || this.y < 150) this.y += this.spec.speed * dt;
    switch (this.sprite) {
      case 'carrier':
        if (this.y > 20 && this.y < target.y - 64 && this.y < 560)
          this.x += clamp(target.x - this.x, -95 * dt, 95 * dt);
        break;
      case 'mower':
        this.x += this.entrySide * this.spec.speed * 0.72 * dt;
        break;
      case 'guard':
      case 'relay': {
        const arrival = (110 - this.entryY) / this.spec.speed;
        this.y = this.entryY + this.spec.speed * (this.age - clamp(this.age - arrival, 0, 1.55));
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
    if (this.alive && this.attack === 'laser' && this.volley > 0) {
      ctx.save();
      const warning = this.volley % 2 === 1;
      ctx.strokeStyle = warning ? '#ffa775' : '#fff0a3';
      ctx.globalAlpha = warning ? 0.45 : 1;
      ctx.lineWidth = LASER_WIDTH;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.sin(this.aim) * LASER_LENGTH, this.y + Math.cos(this.aim) * LASER_LENGTH);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    if (this.hitFlash > 0 && !this.purified) ctx.globalAlpha = 0.55;
    drawSprite(ctx, key, this.x, this.y, {
      time: this.age, tag: this.purified ? 'purified' : (this.attack || this.attackFlash > 0) ? 'attack' : this.kind === 'normal' ? 'move' : 'idle',
    });
    ctx.restore();
    if (this.purified) return;
    if (this.barrier) drawSprite(ctx, 'effects/fx-enemy-barrier', this.x, this.y + 28, { time: this.age, width: this.width, height: 42 });
    if (this.reinforceFlash > 0)
      drawSprite(ctx, 'effects/fx-enemy-reinforce', this.x, this.y, { time: 0.35 - this.reinforceFlash });
  }
}
