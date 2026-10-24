import { PET } from './config';
import type { Player } from './Player';
import { dampFactor } from './utils';

/**
 * 선택한 동반자 펫의 이미지를 사용합니다.
 *
 * 1) 플레이어의 옆-뒤를 Lerp(지수 보간)로 부드럽게 따라다닙니다.
 * 2) 수동 스킬로 3초 방어막을 걸고 발동 시점부터 10초간 재사용을 막습니다.
 *    - 타이머는 게임 루프(update) 안에서만 흐르므로 일시정지 중에는 멈춥니다.
 *    - 방어막 상태는 Player.isShieldActive 에 반영됩니다.
 */
export class Pet {
  x: number;
  y: number;
  readonly size = PET.size;

  /** 다음 쉴드 발동까지 남은 시간(초) */
  private cooldown = 0;
  /** 현재 쉴드 유지 남은 시간(초). 0이면 꺼진 상태 */
  private shieldTimeLeft = 0;
  private time = 0;
  private readonly image: HTMLImageElement | null;

  constructor(player: Player, previewPath: string) {
    this.x = player.x + PET.offsetX;
    this.y = player.y + PET.offsetY;
    this.image = typeof Image === 'undefined' ? null : new Image();
    if (this.image) this.image.src = previewPath;
  }

  reset(player: Player): void {
    this.x = player.x + PET.offsetX;
    this.y = player.y + PET.offsetY;
    this.cooldown = 0;
    this.shieldTimeLeft = 0;
    this.time = 0;
    player.isShieldActive = false;
    player.shieldRemaining = 0;
  }

  get isShieldActive(): boolean {
    return this.shieldTimeLeft > 0;
  }

  get cooldownRemaining(): number {
    return this.cooldown;
  }

  activateShield(player: Player): boolean {
    if (this.cooldown > 0 || this.isShieldActive) return false;
    this.cooldown = PET.shieldCooldown;
    this.shieldTimeLeft = PET.shieldDuration;
    player.isShieldActive = true;
    player.shieldRemaining = this.shieldTimeLeft;
    return true;
  }

  update(dt: number, player: Player): void {
    this.time += dt;
    this.follow(dt, player);
    this.shieldTimeLeft = Math.max(0, this.shieldTimeLeft - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);

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

  draw(ctx: CanvasRenderingContext2D): void {
    const half = this.size / 2;

    // 기존 사각형/귀/눈 도형 대신 펫 PNG만 표시합니다.
    if (this.image?.complete && this.image.naturalWidth > 0) {
      ctx.drawImage(this.image, this.x - half, this.y - half, this.size, this.size);
    }
  }
}
