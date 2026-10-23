import { aimedPattern, radialPattern, type EnemyBullet } from './Bullet';
import { WORLD } from './config';
import { clamp } from './utils';

/** 오류가 나서 폭주하는 귀여운 놀이공원 장난감 블록들 */
export type EnemyKind = 'scrap' | 'cube' | 'golem';

interface EnemySpec {
  width: number;
  height: number;
  hp: number;
  /** 내려오는 속도(px/s) */
  speed: number;
  score: number;
  /** 탄막 발사 간격(초) */
  fireInterval: number;
  body: string;
  edge: string;
}

const SPECS: Record<EnemyKind, EnemySpec> = {
  scrap: { width: 52, height: 52, hp: 4, speed: 90, score: 100, fireInterval: 1.8, body: '#fb7185', edge: '#be123c' },
  cube: { width: 64, height: 64, hp: 9, speed: 60, score: 250, fireInterval: 2.4, body: '#f43f5e', edge: '#9f1239' },
  golem: { width: 132, height: 92, hp: 160, speed: 70, score: 3000, fireInterval: 1.3, body: '#e11d48', edge: '#881337' },
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** 골렘이 멈춰서 머무는 높이 */
const GOLEM_HOVER_Y = 140;

/** Enemy.update 가 탄환을 만들 때 쓰는 목표(플레이어) 정보 */
export interface EnemyTarget {
  x: number;
  y: number;
}

export class Enemy {
  readonly kind: EnemyKind;
  readonly width: number;
  readonly height: number;
  readonly maxHp: number;
  readonly score: number;
  hp: number;
  x: number;
  y: number;
  alive = true;

  private readonly spec: EnemySpec;
  private readonly baseX: number;
  private readonly phase = Math.random() * Math.PI * 2;
  private age = 0;
  private hitFlash = 0;
  private fireTimer: number;
  private patternStep = 0;

  constructor(kind: EnemyKind, x: number) {
    this.kind = kind;
    this.spec = SPECS[kind];
    this.width = this.spec.width;
    this.height = this.spec.height;
    this.maxHp = this.spec.hp;
    this.hp = this.spec.hp;
    this.score = this.spec.score;
    this.baseX = x;
    this.x = x;
    this.y = -this.height / 2;
    // 처음 발사 시점을 흩뜨려서 여러 적이 동시에 쏘지 않게 함
    this.fireTimer = this.spec.fireInterval * (0.5 + Math.random() * 0.5);
  }

  /**
   * 한 프레임 갱신: 아래로 이동 + 탄막 발사.
   * @param difficulty 1(쉬움) ~ 2(어려움). 탄속과 발사 빈도에 반영됩니다.
   * @param emit 새로 생긴 적 탄환을 전달받는 콜백
   */
  update(dt: number, target: EnemyTarget, difficulty: number, emit: (bullet: EnemyBullet) => void): void {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.move(dt);

    // 화면 아래로 완전히 벗어나면 제거
    if (this.y - this.height / 2 > WORLD.height) {
      this.alive = false;
      return;
    }

    // 화면 안에 보일 때만 발사
    const canFire = this.y > 10 && this.y < WORLD.height - 140;
    if (!canFire) return;

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer += this.spec.fireInterval / (1 + (difficulty - 1) * 0.5);
      const speedScale = 1 + (difficulty - 1) * 0.4;
      for (const bullet of this.createPattern(target, speedScale, difficulty)) emit(bullet);
    }
  }

  /** 피해를 입힙니다. @returns 이번 공격으로 파괴되었는지 */
  hit(damage: number): boolean {
    this.hp -= damage;
    this.hitFlash = 0.08;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  private move(dt: number): void {
    switch (this.kind) {
      case 'scrap': {
        // 좌우로 살랑살랑 흔들리며 내려옵니다.
        this.y += this.spec.speed * dt;
        const sway = Math.sin(this.age * 2 + this.phase) * 40;
        this.x = clamp(this.baseX + sway, this.width / 2, WORLD.width - this.width / 2);
        break;
      }
      case 'cube':
        this.y += this.spec.speed * dt;
        break;
      case 'golem': {
        if (this.y < GOLEM_HOVER_Y) {
          this.y = Math.min(GOLEM_HOVER_Y, this.y + this.spec.speed * dt);
        } else {
          // 자리를 잡으면 좌우로 천천히 왕복
          const range = WORLD.width / 2 - this.width / 2 - 10;
          this.x = WORLD.width / 2 + Math.sin(this.age * 0.8) * range;
        }
        break;
      }
    }
  }

  private createPattern(target: EnemyTarget, speedScale: number, difficulty: number): EnemyBullet[] {
    switch (this.kind) {
      case 'scrap': {
        // 조준형: 난이도가 오르면 3갈래로
        const count = difficulty > 1.4 ? 3 : 1;
        return aimedPattern(this.x, this.y, target.x, target.y, 190 * speedScale, count, 0.5);
      }
      case 'cube': {
        // 방사형: 발사할 때마다 각도를 조금씩 돌려 빈틈이 달라지게 함
        this.patternStep += 1;
        return radialPattern(this.x, this.y, 10, 130 * speedScale, this.patternStep * 0.31);
      }
      case 'golem': {
        const step = this.patternStep % 3;
        this.patternStep += 1;
        if (step === 0) {
          return radialPattern(this.x, this.y, 20, 130 * speedScale, this.patternStep * 0.157);
        }
        if (step === 1) {
          return aimedPattern(this.x, this.y, target.x, target.y, 210 * speedScale, 5, 0.9);
        }
        // 이중 링: 속도가 다른 두 겹의 방사형
        return [
          ...radialPattern(this.x, this.y, 14, 110 * speedScale, this.patternStep * 0.2),
          ...radialPattern(this.x, this.y, 14, 165 * speedScale, this.patternStep * 0.2 + Math.PI / 14),
        ];
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawBody(ctx);
    this.drawHpBar(ctx);
  }

  /** 오류 난 빨간 장난감 블록 본체 */
  private drawBody(ctx: CanvasRenderingContext2D): void {
    const left = this.x - this.width / 2;
    const top = this.y - this.height / 2;

    ctx.fillStyle = this.spec.body;
    roundedRect(ctx, left, top, this.width, this.height, this.kind === 'golem' ? 18 : 12);
    ctx.fill();
    ctx.strokeStyle = this.spec.edge;
    ctx.lineWidth = 3;
    roundedRect(ctx, left + 1.5, top + 1.5, this.width - 3, this.height - 3, this.kind === 'golem' ? 16 : 10);
    ctx.stroke();

    // 사탕색 하이라이트와 장난감 블록의 귀여운 얼굴
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    roundedRect(ctx, left + 8, top + 7, this.width * 0.42, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#fff1f2';
    if (this.kind === 'golem') {
      for (const ox of [-34, 0, 34]) {
        ctx.beginPath();
        ctx.arc(this.x + ox, this.y - 4, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (const ox of [-10, 10]) {
        ctx.beginPath();
        ctx.arc(this.x + ox, this.y - 4, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#7f1d4e';
      ctx.fillRect(this.x - 10, this.y + 9, 20, 4);
    }

    if (this.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      roundedRect(ctx, left, top, this.width, this.height, this.kind === 'golem' ? 18 : 12);
      ctx.fill();
    }
  }

  /** 체력바: 큰 적이거나 한 번이라도 맞은 적에게만 표시 */
  private drawHpBar(ctx: CanvasRenderingContext2D): void {
    if (this.hp >= this.maxHp && this.kind !== 'golem') return;
    const barWidth = this.width;
    const left = this.x - barWidth / 2;
    const top = this.y - this.height / 2 - 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(left, top, barWidth, 5);
    ctx.fillStyle = '#c026d3';
    ctx.fillRect(left, top, barWidth * clamp(this.hp / this.maxHp, 0, 1), 5);
  }
}

/** 시간에 따라 적을 생성하는 로직. 경과 시간이 길수록 더 자주 등장하고, 주기적으로 골렘이 나타납니다. */
export class EnemySpawner {
  private timer = 1;
  private nextGolemAt = 45;

  reset(): void {
    this.timer = 1;
    this.nextGolemAt = 45;
  }

  /**
   * @param elapsed 게임 시작 후 경과 시간(초)
   * @param enemies 현재 살아있는 적들(동시 등장 수 제한과 골렘 중복 방지용)
   * @returns 이번 프레임에 새로 생긴 적
   */
  update(dt: number, elapsed: number, enemies: readonly Enemy[]): Enemy[] {
    const spawned: Enemy[] = [];
    const alive = enemies.filter((e) => e.alive);

    this.timer -= dt;
    if (this.timer <= 0 && alive.length < 8) {
      this.timer += Math.max(0.7, 2.2 - elapsed * 0.01);
      const kind: EnemyKind = elapsed > 12 && Math.random() < 0.4 ? 'cube' : 'scrap';
      const spec = SPECS[kind];
      const margin = spec.width / 2 + 10;
      spawned.push(new Enemy(kind, margin + Math.random() * (WORLD.width - margin * 2)));
    }

    if (elapsed >= this.nextGolemAt && !alive.some((e) => e.kind === 'golem')) {
      spawned.push(new Enemy('golem', WORLD.width / 2));
      this.nextGolemAt = elapsed + 50;
    }

    return spawned;
  }
}
