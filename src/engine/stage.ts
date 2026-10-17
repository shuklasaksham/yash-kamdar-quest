// Keeps the canvas at the native art height (300px) and picks a view width that fits the
// screen, then scales it up with crisp pixels. Portrait phones get a narrower camera.

export const ART_H = 300;
export const MIN_VIEW_W = 240;
export const MAX_VIEW_W = 480;

export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  viewW = MAX_VIEW_W;
  scale = 1;
  portrait = false;
  private onResize: (() => void)[] = [];

  constructor(host: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "stage-canvas";
    this.canvas.setAttribute("aria-label", "Game world");
    host.prepend(this.canvas);
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
    new ResizeObserver(() => this.fit()).observe(document.documentElement);
    this.fit();
  }

  resized(fn: () => void) {
    this.onResize.push(fn);
  }

  /** Convert an art-space point to CSS pixels relative to the stage element. */
  toScreen(x: number, y: number) {
    return { x: x * this.scale, y: y * this.scale };
  }

  private fit() {
    const W = innerWidth;
    const H = innerHeight;
    this.portrait = H > W * 1.15;
    document.documentElement.classList.toggle("is-portrait", this.portrait);
    let availH = H;
    if (this.portrait) availH = Math.min(H * 0.6, W * 1.3);
    const vw = Math.round(Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, (ART_H * W) / availH)));
    this.viewW = vw;
    this.scale = Math.min(W / vw, availH / ART_H);
    if (this.canvas.width !== vw || this.canvas.height !== ART_H) {
      this.canvas.width = vw;
      this.canvas.height = ART_H;
    }
    this.ctx.imageSmoothingEnabled = false;
    const cssW = Math.round(vw * this.scale);
    const cssH = Math.round(ART_H * this.scale);
    const root = document.documentElement.style;
    root.setProperty("--stage-w", `${cssW}px`);
    root.setProperty("--stage-h", `${cssH}px`);
    root.setProperty("--px", `${this.scale}`);
    for (const fn of this.onResize) fn();
  }
}
