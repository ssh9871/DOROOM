import { PlayerBullet } from './Bullet';
import { COLORS, PLAYER, WORLD } from './config';
import type { Input } from './Input';
import { clamp } from './utils';

/** 자연을 지키는 놀이공원 아바타. 첨부된 로봇 PNG를 사용합니다. */
export class Player {
  x: number = WORLD.width / 2;
  y: number = WORLD.height - 110;
  readonly width = PLAYER.width;
  readonly height = PLAYER.height;
  readonly hitRadius = PLAYER.hitRadius;

  lives: number = PLAYER.maxLives;

  /**
   * 펫이 걸어주는 방어막 상태. Pet.update() 가 매 프레임 갱신합니다.
   * true 인 동안은 적 탄막 피해를 받지 않습니다(충돌 처리는 Game.ts).
   */
  isShieldActive = false;
  /** 쉴드 남은 시간(초). 쉴드 종료 직전 깜빡임 연출에 사용. */
  shieldRemaining = 0;

  /** 피격 후 무적 타이머(초) */
  invulnerableTimer = 0;

  private fireTimer = 0;
  private time = 0;
  private readonly image: HTMLImageElement | null;

  constructor() {
    // public/ 아래 파일은 Vite가 루트 URL로 제공합니다.
    this.image = typeof Image === 'undefined' ? null : new Image();
    if (this.image) this.image.src = '/assets/previews/avatar.png';
  }

  reset(): void {
    this.x = WORLD.width / 2;
    this.y = WORLD.height - 110;
    this.lives = PLAYER.maxLives;
    this.isShieldActive = false;
    this.shieldRemaining = 0;
    this.invulnerableTimer = 0;
    this.fireTimer = 0;
    this.time = 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnerableTimer > 0;
  }

  /** 방향키 이동 + 자동 발사. 새로 생긴 총알은 emit 으로 전달합니다. */
  update(dt: number, input: Input, emit: (bullet: PlayerBullet) => void): void {
    this.time += dt;

    // 이동 (대각선 이동 시 속도가 빨라지지 않도록 정규화)
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    const speed = PLAYER.speed * (input.focus ? PLAYER.focusSpeedRatio : 1);
    this.x = clamp(this.x + dx * speed * dt, this.width / 2, WORLD.width - this.width / 2);
    this.y = clamp(this.y + dy * speed * dt, this.height / 2, WORLD.height - this.height / 2);

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }

    // 자동 발사: 키 입력 없이 일정 간격으로 쌍발 사격
    this.fireTimer -= dt;
    while (this.fireTimer <= 0) {
      this.fireTimer += PLAYER.fireInterval;
      const muzzleY = this.y - this.height / 2;
      emit(new PlayerBullet(this.x - PLAYER.bulletSpread, muzzleY));
      emit(new PlayerBullet(this.x + PLAYER.bulletSpread, muzzleY));
    }
  }

  /**
   * 피해 적용. 쉴드 중이거나 무적 시간이면 아무 일도 일어나지 않고 false 를 돌려줍니다.
   * @returns 실제로 생명이 깎였는지
   */
  takeDamage(): boolean {
    if (this.isShieldActive || this.isInvulnerable) return false;
    this.lives -= 1;
    this.invulnerableTimer = PLAYER.invulnerableTime;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawBody(ctx);
    this.drawShield(ctx);
  }

  /** 기체 본체: 첨부 PNG를 hitbox 크기에 맞춰 그립니다. */
  private drawBody(ctx: CanvasRenderingContext2D): void {
    // 무적 시간에는 깜빡입니다.
    if (this.isInvulnerable && Math.floor(this.time * 14) % 2 === 0) return;

    // 이미지가 로드되면 첨부된 로봇 PNG만 플레이어 표시 크기로 그립니다.
    if (this.image?.complete && this.image.naturalWidth > 0) {
      ctx.drawImage(this.image, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }
  }

  /** 방어막: 쉴드가 켜진 동안 기체 주위에 파란 반투명 원 */
  private drawShield(ctx: CanvasRenderingContext2D): void {
    if (!this.isShieldActive) return;
    // 종료 0.7초 전부터 깜빡여서 곧 꺼진다는 것을 알려줍니다.
    if (this.shieldRemaining < 0.7 && Math.floor(this.time * 12) % 2 === 0) return;

    // ─────────────────────────────────────────────────────────────
    // [이미지 교체 안내] 방어막 이펙트 PNG:
    //   const r = PLAYER.shieldRadius;
    //   ctx.drawImage(shieldImg, this.x - r, this.y - r, r * 2, r * 2);
    // ─────────────────────────────────────────────────────────────
    const radius = PLAYER.shieldRadius + Math.sin(this.time * 8) * 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.shield;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.shieldEdge;
    ctx.stroke();
  }

}
