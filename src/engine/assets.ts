// Loads every image the game draws on the canvas. Paths are relative to /public.

const ART = ["layer-sky", "layer-far", "layer-mid", "layer-ground", "layer-fore", "title", "ending"] as const;
const SPRITES = [
  "hero-idle", "hero-idle2", "hero-walk1", "hero-walk2", "hero-windup", "hero-slash", "hero-victory", "hero-teleport",
  "slime", "slime-squash", "slime-hurt", "golem", "golem-hurt", "knight", "knight-hurt", "love", "love-wave",
  "fx-slash", "fx-burst", "fx-poof", "fx-beam", "fx-heart", "fx-heart-big", "chest", "chest-open",
] as const;

export type ArtKey = (typeof ART)[number];
export type SpriteKey = (typeof SPRITES)[number];
export type Images = Record<ArtKey | SpriteKey, HTMLImageElement>;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadImages(onProgress: (done: number, total: number) => void): Promise<Images> {
  const base = import.meta.env.BASE_URL;
  const jobs = [
    ...ART.map((k) => [k, `${base}art/${k}.png`] as const),
    ...SPRITES.map((k) => [k, `${base}sprites/${k}.png`] as const),
  ];
  let done = 0;
  const entries = await Promise.all(
    jobs.map(async ([key, src]) => {
      const img = await load(src);
      onProgress(++done, jobs.length);
      return [key, img] as const;
    }),
  );
  return Object.fromEntries(entries) as Images;
}
