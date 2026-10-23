import { WORLD } from './config';

interface SpeedLine {
  x: number;
  y: number;
  length: number;
  width: number;
  speed: number;
  alpha: number;
  layer: 'far' | 'near';
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  alpha: number;
  layer: 'far' | 'near';
}

/** 맑은 하늘, 햇빛, 구름과 속도선으로 구성한 비행 배경. */
export class Background {
  private readonly lines: SpeedLine[] = [];
  private readonly clouds: Cloud[] = [];

  constructor() {
    for (let i = 0; i < 20; i += 1) {
      const near = i % 3 === 0;
      this.lines.push({
        x: Math.random() * WORLD.width,
        y: Math.random() * WORLD.height,
        length: near ? 28 + Math.random() * 48 : 18 + Math.random() * 28,
        width: near ? 2 : 1,
        speed: near ? 420 + Math.random() * 220 : 240 + Math.random() * 130,
        alpha: near ? 0.22 + Math.random() * 0.16 : 0.1 + Math.random() * 0.1,
        layer: near ? 'near' : 'far',
      });
    }

    for (let i = 0; i < 9; i += 1) {
      const near = i % 3 === 0;
      this.clouds.push({
        x: Math.random() * WORLD.width,
        y: Math.random() * WORLD.height,
        width: near ? 70 + Math.random() * 55 : 42 + Math.random() * 42,
        height: near ? 18 + Math.random() * 14 : 12 + Math.random() * 10,
        speed: near ? 95 + Math.random() * 55 : 38 + Math.random() * 30,
        alpha: near ? 0.34 + Math.random() * 0.12 : 0.2 + Math.random() * 0.1,
        layer: near ? 'near' : 'far',
      });
    }
  }

  update(dt: number): void {
    for (const line of this.lines) {
      line.y += line.speed * dt;
      if (line.y - line.length > WORLD.height) {
        line.y = -line.length - Math.random() * 100;
        line.x = Math.random() * WORLD.width;
      }
    }

    for (const cloud of this.clouds) {
      cloud.y += cloud.speed * dt;
      if (cloud.y - cloud.height > WORLD.height) {
        cloud.y = -cloud.height - Math.random() * 80;
        cloud.x = Math.random() * WORLD.width;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // 외부 웹사이트 테마와 무관하게 캔버스 안에 하늘을 직접 칠합니다.
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    sky.addColorStop(0, '#48b9f2');
    sky.addColorStop(0.48, '#8cdbf7');
    sky.addColorStop(1, '#dff7ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    // 왼쪽 위의 은은한 햇빛.
    const sun = ctx.createRadialGradient(70, 76, 8, 70, 76, 120);
    sun.addColorStop(0, 'rgba(255, 255, 220, 0.55)');
    sun.addColorStop(1, 'rgba(255, 255, 220, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, 240, 220);

    // 멀리 있는 구름부터 그려 깊이감을 만듭니다.
    ctx.save();
    for (const layer of ['far', 'near'] as const) {
      for (const cloud of this.clouds) {
        if (cloud.layer !== layer) continue;
        this.drawCloud(ctx, cloud);
      }
    }
    ctx.restore();

    // 구름 사이로 빠르게 지나가는 옅은 흰색 속도선.
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    for (const line of this.lines) {
      ctx.globalAlpha = line.alpha;
      ctx.lineWidth = line.width;
      ctx.beginPath();
      ctx.moveTo(line.x, line.y - line.length);
      ctx.lineTo(line.x, line.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud): void {
    const { x, y, width, height } = cloud;
    ctx.globalAlpha = cloud.alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, y, width * 0.5, height * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(x - width * 0.24, y + 2, width * 0.27, height * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(x + width * 0.22, y + 1, width * 0.3, height * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
