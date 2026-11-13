import { drawSprite } from './sprites';

type Effect = { id: string; x: number; y: number; age: number; duration: number; size?: number };

export class Effects {
  private items: Effect[] = [];

  clear(): void { this.items = []; }

  play(id: string, x: number, y: number, duration = 0.4, size?: number): void {
    this.items.push({ id, x, y, age: 0, duration, size });
  }

  update(dt: number): void {
    for (const item of this.items) item.age += dt;
    this.items = this.items.filter(item => item.age < item.duration);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const item of this.items) {
      const size = item.id === 'bullet-clear' ? 45 + 560 * item.age / item.duration : item.size;
      drawSprite(ctx, `effects/fx-${item.id}`, item.x, item.y, { time: item.age, width: size, height: size });
    }
  }
}
