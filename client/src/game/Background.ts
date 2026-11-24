import { WORLD } from './config';
import { ENDLESS } from './endless';
import { areaImage, drawSprite } from './sprites';
import type { Stage } from './stages';

export class Background {
  private offset = 0;
  /** 무한 모드 구역 전환 시 이전 배경 (크로스페이드용) */
  private from?: Stage;
  private fade = 0;

  reset(): void {
    this.offset = 0;
    this.from = undefined;
    this.fade = 0;
  }

  /** 스크롤 위치는 유지한 채 이전 구역 배경에서 새 배경으로 서서히 바꿈 */
  transition(from: Stage): void {
    this.from = from;
    this.fade = ENDLESS.fadeSeconds;
  }

  get isTransitioning(): boolean { return this.fade > 0; }

  update(dt: number): void {
    this.offset = (this.offset + 54 * dt) % WORLD.height;
    this.fade = Math.max(0, this.fade - dt);
    if (this.fade === 0) this.from = undefined;
  }

  draw(ctx: CanvasRenderingContext2D, stage: Stage): void {
    if (!this.from || this.fade <= 0) {
      this.drawLayer(ctx, stage);
      return;
    }
    this.drawLayer(ctx, this.from);
    ctx.save();
    ctx.globalAlpha = 1 - this.fade / ENDLESS.fadeSeconds;
    this.drawLayer(ctx, stage);
    ctx.restore();
  }

  private drawLayer(ctx: CanvasRenderingContext2D, stage: Stage): void {
    const { width, height } = WORLD;
    const y = Math.round(this.offset);
    const x = width / 2;
    const key = areaImage(stage.zone, 'battle');
    drawSprite(ctx, key, x, y - height / 2, { width, height });
    drawSprite(ctx, key, x, y + height / 2, { width, height });
    drawSprite(ctx, `props/${stage.prop}`, stage.pin[0] < 50 ? 52 : width - 52,
      (y + height / 2) % height, { scale: 1.5 });
  }
}
