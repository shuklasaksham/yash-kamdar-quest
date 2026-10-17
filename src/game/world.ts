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
export const ANCHOR: Partial<Record<SpriteKey, [number, number]>> = {
  "hero-idle": [33, 64], "hero-idle2": [33, 64], "hero-walk1": [33, 64], "hero-walk2": [33, 64],
  "hero-windup": [33, 64], "hero-slash": [33, 64], "hero-victory": [33, 64], "hero-teleport": [33, 64],
  slime: [36, 55], "slime-squash": [36, 55], "slime-hurt": [36, 55],
  golem: [38, 73], "golem-hurt": [38, 73],
  knight: [36, 77], "knight-hurt": [36, 77],
  love: [30, 64], "love-wave": [30, 64],
  chest: [13, 23], "chest-open": [13, 23],
  "fx-poof": [32, 40], "fx-beam": [18, 120],
};

export interface GuardianDef {
  section: SectionId;
  name: string;
  x: number;
  sprite: "slime" | "golem" | "knight";
  portrait: string;
  taunt: string;
  victory: string;
}

export const GUARDIANS: GuardianDef[] = [
  { section: "about", name: "Slime King", x: ZONE_W * 1 + 330, sprite: "slime", portrait: "portrait-slime",
    taunt: "Halt, traveller! None may learn who Yash really is… unless they defeat ME!",
    victory: "The Slime King is down — and the chest holds my story." },
  { section: "work", name: "Stone Golem", x: ZONE_W * 3 + 330, sprite: "golem", portrait: "portrait-golem",
    taunt: "GRRR… THE FORGE REMEMBERS EVERY QUEST. PROVE YOU EARNED YOURS!",
    victory: "Smashed! The golem's ledger shows my work history." },
  { section: "portfolio", name: "Shadow Knight", x: ZONE_W * 5 + 330, sprite: "knight", portrait: "portrait-knight",
    taunt: "Many have sought the vault of works. All have fallen. Draw your blade!",
    victory: "The vault is open — every world I've built is inside. Something calls me west…" },
];

export const STORY = [
  { x: 0, text: "Three guardians hold this island's secrets — who I am, what I've done, and what I've built. Time to earn them." },
  { x: ZONE_W * 2 + 20, text: "The jungle grows thick. Somewhere past these giants, the Stone Golem guards my work history." },
  { x: ZONE_W * 4 + 20, text: "The temple is just past these falls. Its guardian protects everything I've ever built." },
];

/** Ground height of the sunset hill in the ending scene (matches the generated art). */
export function endingGround(x: number) {
  return Math.round(244 + Math.sin(x / 60) * 6 - Math.min(26, Math.max(0, (x - 250) / 3)));
}

export function drawSprite(
  ctx: CanvasRenderingContext2D, img: Images, key: SpriteKey, x: number, y: number,
  opts: { flip?: boolean; alpha?: number; scale?: number } = {},
) {
  const im = img[key];
  const [ax, ay] = ANCHOR[key] ?? [im.width / 2, im.height / 2];
  const s = opts.scale ?? 1;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (opts.flip) ctx.scale(-1, 1);
  if (s !== 1) ctx.scale(s, s);
  ctx.drawImage(im, -ax, -ay);
  ctx.restore();
}
