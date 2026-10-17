import type { Images, SpriteKey } from "../engine/assets";
import type { SectionId } from "../content";

export const ZONE_W = 480;
export const WORLD_W = ZONE_W * 6;
export const GROUND = 250;

/** Parallax factor of each layer relative to the walkable ground. */
export const LAYERS = [
  ["layer-sky", 0.1],
  ["layer-far", 0.25],
  ["layer-mid", 0.5],
  ["layer-ground", 1],
] as const;
export const FORE = ["layer-fore", 1.35] as const;

export const ZONES = [
  { name: "Sunrise Beach", sub: "Where the quest begins" },
  { name: "The Shrine", sub: "Guardian of About" },
  { name: "Deep Jungle", sub: "Mind the vines" },
  { name: "The Old Forge", sub: "Guardian of Work" },
  { name: "Waterfall Cliffs", sub: "Almost there" },
  { name: "Temple Gate", sub: "Guardian of Portfolio" },
];

/** Sprite anchor = the pixel that sits on the ground (feet / base centre). */
const HERO_ANCHOR: [number, number] = [33, 64];
export const ANCHOR: Partial<Record<SpriteKey, [number, number]>> = {
  "hero-idle": HERO_ANCHOR, "hero-idle2": HERO_ANCHOR, "hero-walk1": HERO_ANCHOR, "hero-walk2": HERO_ANCHOR,
  "hero-run1": HERO_ANCHOR, "hero-run2": HERO_ANCHOR, "hero-jump": HERO_ANCHOR, "hero-fall": HERO_ANCHOR,
  "hero-skid": HERO_ANCHOR, "hero-hurt": HERO_ANCHOR,
  "hero-windup": HERO_ANCHOR, "hero-slash": HERO_ANCHOR, "hero-victory": HERO_ANCHOR, "hero-teleport": HERO_ANCHOR,
  slime: [36, 55], "slime-squash": [36, 55], "slime-hurt": [36, 55],
  golem: [38, 73], "golem-hurt": [38, 73],
  knight: [36, 77], "knight-hurt": [36, 77],
  love: [30, 64], "love-wave": [30, 64],
  chest: [13, 23], "chest-open": [13, 23],
  "fx-poof": [32, 40], "fx-beam": [18, 120],
};

export type GuardianKind = "slime" | "golem" | "knight";

export interface GuardianDef {
  section: SectionId;
  name: string;
  kind: GuardianKind;
  /** Where the guardian stands when the fight starts. */
  x: number;
  hp: number;
  /** The fight is fenced in between these world x positions until the guardian falls. */
  arena: [number, number];
  /** Hurtbox width/height around the feet anchor. */
  body: [number, number];
  portrait: string;
  taunt: string;
  victory: string;
}

export const GUARDIANS: GuardianDef[] = [
  { section: "about", name: "Slime King", kind: "slime", x: ZONE_W * 1 + 330, hp: 3, arena: [ZONE_W + 110, ZONE_W + 450], body: [48, 38],
    portrait: "portrait-slime",
    taunt: "Halt, traveller! None may learn who Yash really is… unless you can land three hits on ME!",
    victory: "The Slime King is down — and the chest holds my story." },
  { section: "work", name: "Stone Golem", kind: "golem", x: ZONE_W * 3 + 330, hp: 5, arena: [ZONE_W * 3 + 90, ZONE_W * 3 + 450], body: [44, 60],
    portrait: "portrait-golem",
    taunt: "GRRR… THE FORGE REMEMBERS EVERY QUEST. JUMP MY QUAKES IF YOU CAN!",
    victory: "Smashed! The golem's ledger shows my work history." },
  { section: "portfolio", name: "Shadow Knight", kind: "knight", x: ZONE_W * 5 + 330, hp: 6, arena: [ZONE_W * 5 + 70, ZONE_W * 6 - 30], body: [32, 62],
    portrait: "portrait-knight",
    taunt: "Many have sought the vault of works. All have fallen. Draw your blade!",
    victory: "The vault is open — every world I've built is inside. Something calls me east…" },
];

export const STORY = [
  { x: 0, text: "Three guardians hold this island's secrets — who I am, what I've done, and what I've built. Time to earn them." },
  { x: ZONE_W * 2 + 20, text: "The jungle grows thick. Somewhere past these giants, the Stone Golem guards my work history." },
  { x: ZONE_W * 4 + 20, text: "The temple is just past these falls. Its guardian protects everything I've ever built." },
];

// ---------------------------------------------------------------- platforms + pickups
export const BLOCK = 16;
export type BlockKind = "q" | "stone";
export interface BlockDef { x: number; y: number; kind: BlockKind }

const ROW = GROUND - 84; // top of a block row: walk under it, jump onto it
export const BLOCKS: BlockDef[] = [
  { x: 236, y: ROW, kind: "q" },
  { x: 1104, y: ROW, kind: "stone" }, { x: 1120, y: ROW, kind: "q" }, { x: 1136, y: ROW, kind: "stone" }, { x: 1152, y: ROW, kind: "q" },
  { x: 1290, y: ROW - 44, kind: "q" },
  { x: 2060, y: ROW, kind: "q" },
  { x: 2180, y: ROW, kind: "stone" }, { x: 2196, y: ROW, kind: "q" }, { x: 2212, y: ROW, kind: "stone" },
  { x: 2244, y: ROW - 44, kind: "stone" }, { x: 2260, y: ROW - 44, kind: "q" },
];

/** Coin arcs that reward running jumps. */
function arc(x0: number, n: number, gap: number, base: number, height: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return { x: x0 + i * gap, y: Math.round(base - Math.sin(t * Math.PI) * height) };
  });
}
export const COINS: { x: number; y: number }[] = [
  ...arc(330, 5, 16, GROUND - 30, 52),
  ...arc(1104, 4, 16, ROW - 26, 18),
  ...arc(1360, 6, 16, GROUND - 30, 60),
  ...arc(2000, 5, 16, GROUND - 30, 52),
  ...arc(2180, 3, 16, ROW - 26, 10),
  ...arc(2244, 2, 16, ROW - 70, 0),
  ...arc(2330, 5, 16, GROUND - 30, 56),
];

/** Ground height of the sunset hill in the ending scene (matches the generated art). */
export function endingGround(x: number) {
  return Math.round(244 + Math.sin(x / 60) * 6 - Math.min(26, Math.max(0, (x - 250) / 3)));
}

// ---------------------------------------------------------------- drawing
const silhouettes = new Map<string, HTMLCanvasElement>();

/** A flat-colour copy of a sprite, used for hit flashes. */
function silhouette(im: HTMLImageElement, key: string, color: string) {
  const id = `${key}|${color}`;
  let c = silhouettes.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const g = c.getContext("2d")!;
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    silhouettes.set(id, c);
  }
  return c;
}

export interface DrawOpts {
  flip?: boolean;
  alpha?: number;
  scale?: number;
  /** Squash and stretch around the feet. */
  sx?: number;
  sy?: number;
  /** Draw as a flat silhouette of this colour (hit flash). */
  tint?: string;
}

export function drawSprite(ctx: CanvasRenderingContext2D, img: Images, key: SpriteKey, x: number, y: number, opts: DrawOpts = {}) {
  const im = img[key];
  const [ax, ay] = ANCHOR[key] ?? [im.width / 2, im.height / 2];
  const s = opts.scale ?? 1;
  const sx = s * (opts.sx ?? 1);
  const sy = s * (opts.sy ?? 1);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (opts.flip) ctx.scale(-1, 1);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.drawImage(opts.tint ? silhouette(im, key, opts.tint) : im, -ax, -ay);
  ctx.restore();
}
