import { PET } from './config';
import type { Player } from './Player';
import { dampFactor } from './utils';

/**
 * 동반자 펫. 첨부된 토끼 모양 PNG를 사용합니다.
 *
 * 1) 플레이어의 옆-뒤를 Lerp(지수 보간)로 부드럽게 따라다닙니다.
 * 2) 자체 타이머를 가지고 10초마다 3초 동안 플레이어에게 방어막을 겁니다.
 *    - 타이머는 게임 루프(update) 안에서만 흐르므로 일시정지 중에는 멈춥니다.
 *    - 방어막 상태는 Player.isShieldActive 에 반영됩니다.
 */
export class Pet {
  x: number;
  y: number;
  readonly size = PET.size;

  /** 다음 쉴드 발동까지 남은 시간(초) */
  private cooldown: number = PET.shieldInterval;
  /** 현재 쉴드 유지 남은 시간(초). 0이면 꺼진 상태 */
  private shieldTimeLeft = 0;
  private time = 0;
  private readonly image: HTMLImageElement | null;

  constructor(player: Player) {
    this.x = player.x + PET.offsetX;
    this.y = player.y + PET.offsetY;
    this.image = typeof Image === 'undefined' ? null : new Image();
    if (this.image) this.image.src = '/assets/previews/pet.png';
  }

  reset(player: Player): void {
    this.x = player.x + PET.offsetX;
    this.y = player.y + PET.offsetY;
    this.cooldown = PET.shieldInterval;
    this.shieldTimeLeft = 0;
    this.time = 0;
    player.isShieldActive = false;
    player.shieldRemaining = 0;
  }

  get isShieldActive(): boolean {
    return this.shieldTimeLeft > 0;
  }

  /** 0 → 1 : 다음 쉴드가 충전되는 진행도 (쉴드 작동 중에는 1) */
  get chargeRatio(): number {
    if (this.isShieldActive) return 1;
    return 1 - this.cooldown / PET.shieldInterval;
  }

  /** 1 → 0 : 쉴드 유지 시간이 남은 비율 (꺼져 있으면 0) */
  get shieldRatio(): number {
    return this.shieldTimeLeft / PET.shieldDuration;
  }

  update(dt: number, player: Player): void {
    this.time += dt;
    this.follow(dt, player);
    this.updateShieldTimer(dt);

    // 쉴드 상태를 플레이어 객체에 전달
    player.isShieldActive = this.isShieldActive;
    player.shieldRemaining = this.shieldTimeLeft;
  }

  /** 플레이어의 옆-뒤 위치를 목표로 부드럽게 접근 (프레임레이트 독립 Lerp) */
  private follow(dt: number, player: Player): void {
    const bob = Math.sin(this.time * 3) * 3; // 둥실둥실 떠 있는 느낌
    const targetX = player.x + PET.offsetX;
    const targetY = player.y + PET.offsetY + bob;
    const k = dampFactor(PET.followRate, dt);
    this.x += (targetX - this.x) * k;
    this.y += (targetY - this.y) * k;
  }

  /** 10초마다 3초간 켜지는 쉴드 타이머 */
  private updateShieldTimer(dt: number): void {
    if (this.shieldTimeLeft > 0) {
      this.shieldTimeLeft = Math.max(0, this.shieldTimeLeft - dt);
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.shieldTimeLeft = PET.shieldDuration;
      // 주기를 흔들리지 않게 유지하기 위해 0으로 리셋하지 않고 더해줍니다.
      this.cooldown += PET.shieldInterval;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const half = this.size / 2;

    // 기존 사각형/귀/눈 도형 대신 펫 PNG만 표시합니다.
    if (this.image?.complete && this.image.naturalWidth > 0) {
      ctx.drawImage(this.image, this.x - half, this.y - half, this.size, this.size);
    }
  }
}
