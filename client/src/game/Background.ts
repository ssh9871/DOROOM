import { WORLD } from './config';
import { areaImage, drawSprite } from './sprites';
import type { Stage } from './stages';

export class Background {
  private offset = 0;

  reset(): void { this.offset = 0; }
  update(dt: number): void { this.offset = (this.offset + 54 * dt) % WORLD.height; }

  draw(ctx: CanvasRenderingContext2D, stage: Stage): void {
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
