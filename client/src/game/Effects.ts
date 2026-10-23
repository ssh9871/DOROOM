/** 폭발 파편, 쉴드 흡수 링 같은 짧은 시각 효과. 게임 판정과는 무관합니다. */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];

  clear(): void {
    this.particles = [];
    this.rings = [];
  }

  /** 사방으로 튀는 사각 파편 */
  burst(x: number, y: number, color: string, count: number, speed: number, size = 4): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const life = 0.3 + Math.random() * 0.4;
      this.particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life, maxLife: life, size: size * (0.6 + Math.random() * 0.7), color,
      });
    }
  }

  /** 퍼져나가는 원형 링 */
  ring(x: number, y: number, color: string, maxRadius = 18, life = 0.25): void {
    this.rings.push({ x, y, radius: 2, maxRadius, life, maxLife: life, color });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) {
      r.life -= dt;
      r.radius = r.maxRadius * (1 - r.life / r.maxLife);
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const r of this.rings) {
      ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
