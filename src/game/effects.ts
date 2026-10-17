import type { Images, SpriteKey } from "../engine/assets";
import { drawSprite } from "./world";

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
};

/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; g: number; drag: number;
  color?: string; size?: number; sprite?: SpriteKey; spin?: number;
}

export class Effects {
  private parts: Particle[] = [];
  private sprites: { key: SpriteKey; x: number; y: number; life: number; max: number; scaleFrom: number; scaleTo: number }[] = [];
  shake = 0;
  flash = 0;
  constructor(private reduced: () => boolean) {}

  burst(x: number, y: number, n: number, colors: string[], speed = 60, g = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, life: 0, max: 0.5 + Math.random() * 0.5,
        g, drag: 2.2, color: colors[i % colors.length], size: Math.random() < 0.3 ? 2 : 1 });
    }
  }

  coins(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      this.parts.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -80 - Math.random() * 60, life: 0, max: 0.9, g: 260, drag: 0.6,
        color: i % 3 ? "#ffc63a" : "#fff1c2", size: 2 });
    }
  }

  /** Little puffs kicked up by feet; `dir` is the direction of travel (dust flies the other way). */
  dust(x: number, y: number, dir = 0, n = 4) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 8, y: y - 1, vx: -dir * (10 + Math.random() * 35) + (Math.random() - 0.5) * 30, vy: -6 - Math.random() * 22,
        life: 0, max: 0.3 + Math.random() * 0.25, g: -15, drag: 3.5, color: i % 2 ? "#f2e6c9" : "#c9b48f", size: Math.random() < 0.4 ? 2 : 1 });
    }
  }

  hearts(x: number, y: number, n = 6) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 12, vy: -14 - Math.random() * 12,
        life: -i * 0.35, max: 2.6, g: -2, drag: 0.4, sprite: "fx-heart" });
    }
  }

  sparkle(x: number, y: number, w: number, h: number, n = 14, color = "#d4ff3a") {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * w, y: y - Math.random() * h, vx: 0, vy: -10 - Math.random() * 20, life: -Math.random() * 0.4,
        max: 0.8, g: 0, drag: 0, color, size: 1 });
    }
  }

  sprite(key: SpriteKey, x: number, y: number, max: number, scaleFrom = 1, scaleTo = 1) {
    this.sprites.push({ key, x, y, life: 0, max, scaleFrom, scaleTo });
  }

  kick(amount: number) {
    if (!this.reduced()) this.shake = Math.max(this.shake, amount);
  }

  update(dt: number) {
    for (const p of this.parts) {
      p.life += dt;
      if (p.life < 0) continue;
      p.vx -= p.vx * p.drag * dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const s of this.sprites) s.life += dt;
    this.sprites = this.sprites.filter((s) => s.life < s.max);
    this.shake = Math.max(0, this.shake - dt * 12);
    this.flash = Math.max(0, this.flash - dt * 4);
  }

  draw(ctx: CanvasRenderingContext2D, img: Images, camX: number) {
    for (const s of this.sprites) {
      const t = s.life / s.max;
      const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      drawSprite(ctx, img, s.key, s.x - camX, s.y, { alpha: a, scale: s.scaleFrom + (s.scaleTo - s.scaleFrom) * ease.outCubic(t) });
    }
    for (const p of this.parts) {
      if (p.life < 0) continue;
      const a = 1 - p.life / p.max;
      if (p.sprite) {
        drawSprite(ctx, img, p.sprite, p.x - camX, p.y, { alpha: Math.min(1, a * 1.6) });
      } else {
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.fillStyle = p.color!;
        const s = p.size ?? 1;
        ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  offset() {
    if (this.shake <= 0) return { x: 0, y: 0 };
    const m = Math.ceil(this.shake);
    return { x: Math.round((Math.random() * 2 - 1) * m), y: Math.round((Math.random() * 2 - 1) * m * 0.6) };
  }
}
