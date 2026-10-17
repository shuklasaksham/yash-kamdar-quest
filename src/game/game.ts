import type { Images, SpriteKey } from "../engine/assets";
import type { Input, Action } from "../engine/input";
import type { Stage } from "../engine/stage";
import { sfx } from "../engine/audio";
import type { SectionId } from "../content";
import { UI, reducedMotion, type MenuItem } from "../ui/ui";
import { Effects, damp, ease } from "./effects";
import { FORE, GROUND, GUARDIANS, LAYERS, STORY, WORLD_W, ZONES, ZONE_W, drawSprite, endingGround, type GuardianDef } from "./world";

type Mode = "title" | "play" | "ending";
type HeroState = "free" | "busy";
type Pose = "idle" | "walk" | "windup" | "slash" | "victory";

interface Hero {
  x: number; y: number; vx: number; facing: number; alpha: number;
  state: HeroState; pose: Pose; anim: number; frame: number; sprite: SpriteKey;
}
const newHero = (): Hero => ({ x: HERO_START, y: GROUND, vx: 0, facing: 1, alpha: 1, state: "free", pose: "idle", anim: 0, frame: 0, sprite: "hero-idle" });

interface Guardian {
  def: GuardianDef;
  alive: boolean;
  engaged: boolean;
  hurt: number;
  chest: "none" | "closed" | "open";
  chestDrop: number;
}

const WALK_SPEED = 96;   // art px / s
const STOP_DIST = 112;   // how close the hero walks up to a living guardian
const HERO_START = 70;
const POSE_SPRITE: Partial<Record<Pose, SpriteKey>> = { windup: "hero-windup", slash: "hero-slash", victory: "hero-victory" };

interface Tween { t: number; dur: number; from: number; to: number; set: (v: number) => void; ease: (t: number) => number; done: () => void }


export class Game {
  private mode: Mode = "title";
  private time = 0;
  private hitStop = 0;
  private sleeps: { t: number; done: () => void }[] = [];
  private tweens: Tween[] = [];

  private hero: Hero = newHero();
  private camX = 0;
  private guardians: Guardian[] = [];
  private defeated = new Set<SectionId>();
  private storySeen = new Set<number>();
  private story: { x: number } | null = null; // where the current narration started
  private zone = -1;
  private love = { wave: false, met: false };
  private titleDrift = 0;
  private fx: Effects;

  constructor(private stage: Stage, private img: Images, private input: Input, private ui: UI) {
    this.fx = new Effects(reducedMotion);
    this.reset();
    input.onPress((a) => this.onAction(a));
    ui.onFight = (s) => void this.teleport(s);
    stage.resized(() => this.snapCamera());
  }

  // ---------------------------------------------------------------- lifecycle
  private reset() {
    this.guardians = GUARDIANS.map((def) => ({ def, alive: true, engaged: false, hurt: 0, chest: "none", chestDrop: 0 }));
    this.defeated = new Set();
    this.storySeen = new Set();
    this.hero = newHero();
    this.zone = -1;
    this.love = { wave: false, met: false };
    this.ui.setProgress(this.defeated);
    this.snapCamera();
  }

  start() {
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    this.showTitle();
    void this.ui.fade(0, 900);
  }

  private get paused() {
    return this.ui.panelOpen || this.ui.menuOpen;
  }

  /** Game-time sleep: freezes while a menu or panel is open. */
  private sleep(s: number) {
    return new Promise<void>((done) => this.sleeps.push({ t: s, done }));
  }

  private tween(set: (v: number) => void, from: number, to: number, dur: number, fn = ease.outCubic) {
    return new Promise<void>((done) => {
      if (dur <= 0) { set(to); done(); return; }
      this.tweens.push({ t: 0, dur, from, to, set, ease: fn, done });
    });
  }

  // ---------------------------------------------------------------- title + menus
  private titleItems(): MenuItem[] {
    return [
      { id: "start", label: "New Quest", sub: "begin on the beach" },
      { id: "about", label: "About", sub: "teleport to the Slime King" },
      { id: "work", label: "Work", sub: "teleport to the Stone Golem" },
      { id: "portfolio", label: "Portfolio", sub: "teleport to the Shadow Knight" },
      { id: "quick", label: "Quick View", sub: "skip the game, just read" },
      { id: "contact", label: "Contact", sub: "skip to the ending" },
    ];
  }

  private showTitle() {
    this.mode = "title";
    this.ui.showHud(false);
    this.ui.hideDialogue();
    this.ui.showTitle(this.titleItems(), (id) => void this.pickFromTitle(id));
  }

  private async pickFromTitle(id: string) {
    sfx.unlock();
    if (id === "quick") { this.ui.openPanel("about"); return; }
    await this.ui.fade(1, 500);
    await this.ui.hideTitle();
    this.reset();
    this.mode = "play";
    this.ui.showHud(true);
    if (id === "contact") { await this.startEnding(true); return; }
    await this.ui.fade(0, 600);
    if (id === "about" || id === "work" || id === "portfolio") await this.teleport(id);
  }

  private openPauseMenu() {
    const items: MenuItem[] = [
      { id: "resume", label: "Resume", sub: "back to the island" },
      { id: "quick", label: "Sections", sub: "About · Work · Portfolio · Contact" },
      { id: "about", label: "Teleport · About", sub: "to the Slime King" },
      { id: "work", label: "Teleport · Work", sub: "to the Stone Golem" },
      { id: "portfolio", label: "Teleport · Portfolio", sub: "to the Shadow Knight" },
      { id: "ending", label: "Skip to the Ending", sub: "and contact Yash" },
      { id: "title", label: "Title Screen", sub: "start over" },
    ];
    this.ui.openMenu(items, (id) => void this.pickFromMenu(id));
  }

  private async pickFromMenu(id: string) {
    await this.ui.closeMenu();
    if (id === "quick") this.ui.openPanel("about");
    else if (id === "about" || id === "work" || id === "portfolio") await this.teleport(id);
    else if (id === "ending") { if (this.mode === "play") await this.startEnding(); }
    else if (id === "title") { await this.ui.fade(1, 400); this.ui.showCredits(false); this.reset(); this.showTitle(); await this.ui.fade(0, 500); }
  }

  // ---------------------------------------------------------------- input
  private onAction(a: Action) {
    sfx.unlock();
    if (this.ui.handle(a)) return;
    if (a === "menu" && this.mode !== "title") { this.openPauseMenu(); return; }
    if (this.mode === "play" && a === "act" && this.hero.state === "free") {
      const g = this.engagedGuardian();
      if (g) void this.attack(g);
    }
  }

  private engagedGuardian() {
    return this.guardians.find((g) => g.alive && g.engaged && this.hero.x >= g.def.x - STOP_DIST - 4);
  }

  // ---------------------------------------------------------------- update
  private update(dt: number) {
    this.time += dt;
    this.titleDrift += dt;
    if (this.paused) return;
    this.ui.tick(dt);
    for (const tw of this.tweens) {
      tw.t = Math.min(tw.dur, tw.t + dt);
      tw.set(tw.from + (tw.to - tw.from) * tw.ease(tw.t / tw.dur));
    }
    for (const tw of this.tweens.filter((t) => t.t >= t.dur)) tw.done();
    this.tweens = this.tweens.filter((t) => t.t < t.dur);
    for (const s of this.sleeps) s.t -= dt;
    for (const s of this.sleeps.filter((s) => s.t <= 0)) s.done();
    this.sleeps = this.sleeps.filter((s) => s.t > 0);
    if (this.hitStop > 0) { this.hitStop -= dt; return; }

    this.fx.update(dt);
    for (const g of this.guardians) g.hurt = Math.max(0, g.hurt - dt);
    if (this.mode === "play") this.updatePlay(dt);
    if (this.mode === "ending") this.hero.y = endingGround(this.hero.x);
    this.animateHero(dt);
  }

  private updatePlay(dt: number) {
    const h = this.hero;
    let dir = 0;
    if (h.state === "free") dir = (this.input.isHeld("right") ? 1 : 0) - (this.input.isHeld("left") ? 1 : 0);
    // ease into and out of a walk instead of snapping to full speed
    h.vx += (dir * WALK_SPEED - h.vx) * damp(dir ? 9 : 12, dt);
    if (Math.abs(h.vx) < 0.5) h.vx = 0;
    if (h.state === "free") h.x += h.vx * dt;
    if (Math.abs(h.vx) > 4) h.facing = Math.sign(h.vx);
    h.x = Math.max(28, h.x);

    // living guardians block the path and issue their challenge
    for (const g of this.guardians) {
      if (!g.alive) continue;
      const stop = g.def.x - STOP_DIST;
      if (h.x >= stop - 0.5 && h.x < g.def.x) {
        h.x = stop;
        h.vx = 0;
        if (!g.engaged && h.state === "free") this.engage(g);
      }
    }

    // ambient narration, dismissed once the player wanders off
    STORY.forEach((s, i) => {
      if (!this.storySeen.has(i) && h.x >= s.x && h.state === "free") {
        this.storySeen.add(i);
        this.story = { x: h.x };
        void this.ui.say("Yash", "portrait-hero", s.text);
      }
    });
    if (this.story && Math.abs(h.x - this.story.x) > 150) { this.story = null; this.ui.hideDialogue(); }

    const zone = Math.min(ZONES.length - 1, Math.floor(h.x / ZONE_W));
    if (zone !== this.zone) { this.zone = zone; this.ui.banner(ZONES[zone].name, ZONES[zone].sub); }

    if (h.x >= WORLD_W - 24 && h.state === "free") void this.startEnding();

    const target = this.cameraTarget();
    this.camX += (target - this.camX) * damp(4.5, dt);
  }

  /** Picks the walk-cycle / idle-breathing frame for poses that animate on their own. */
  private animateHero(dt: number) {
    const h = this.hero;
    if (POSE_SPRITE[h.pose]) return;
    const speed = Math.abs(h.vx);
    if (speed > 6 || h.pose === "walk") {
      h.anim += (dt * Math.max(speed, 60)) / 13; // stride length matches movement speed
      const frame = Math.floor(h.anim) % 4;
      if (frame !== h.frame && frame % 2 === 0) sfx.step();
      h.frame = frame;
      h.sprite = (["hero-walk1", "hero-idle", "hero-walk2", "hero-idle"] as const)[frame];
    } else {
      h.anim += dt * 1.6;
      h.sprite = Math.floor(h.anim) % 2 ? "hero-idle2" : "hero-idle";
    }
  }

  private cameraTarget() {
    const vw = this.stage.viewW;
    return Math.max(0, Math.min(WORLD_W - vw, this.hero.x - vw * 0.36));
  }

  private snapCamera() {
    this.camX = this.cameraTarget();
  }

  // ---------------------------------------------------------------- encounters
  private engage(g: Guardian) {
    g.engaged = true;
    this.story = null;
    void this.ui.say(g.def.name, g.def.portrait, g.def.taunt, { label: "Attack", key: "E", run: () => void this.attack(g) });
  }

  private screen(x: number, y: number) {
    const p = this.stage.toScreen(x - this.camX, y);
    return { x: p.x, y: p.y };
  }

  private guardianTop(g: Guardian) {
    return GROUND - this.img[g.def.sprite].height + 6;
  }

  private async attack(g: Guardian) {
    if (this.hero.state !== "free" || !g.alive) return;
    const h = this.hero;
    h.state = "busy";
    this.ui.hideDialogue();
    // wind-up, dash in, strike
    h.pose = "windup";
    await this.sleep(0.12);
    sfx.dash();
    await this.tween((v) => (h.x = v), h.x, g.def.x - 54, 0.16, ease.outCubic);
    h.pose = "slash";
    sfx.slash();
    this.fx.sprite("fx-slash", g.def.x + 4, GROUND - 26, 0.28, 0.9, 1.05);
    await this.sleep(0.05);
    sfx.hit();
    g.hurt = 0.4;
    this.hitStop = reducedMotion() ? 0 : 0.08;
    this.fx.kick(2.5);
    this.fx.burst(g.def.x, GROUND - 30, 22, ["#ffffff", "#d4ff3a", "#ffc63a"], 90);
    this.fx.sprite("fx-burst", g.def.x, GROUND - 30, 0.32, 0.5, 1.3);
    const top = this.screen(g.def.x, this.guardianTop(g));
    this.ui.floatText("ONE HIT!", top.x, top.y - 24, "big");
    this.ui.floatText("9999", top.x + 26, top.y + 2, "dmg");
    await this.sleep(0.5);
    // defeat
    sfx.poof();
    g.alive = false;
    this.fx.sprite("fx-poof", g.def.x, GROUND, 0.7, 0.85, 1.2);
    this.fx.coins(g.def.x, GROUND - 24);
    this.fx.burst(g.def.x, GROUND - 20, 14, ["#c3cbd2", "#eeeff0", "#ffffff"], 50, 20);
    await this.sleep(0.35);
    // return to a ready stance, then victory
    await this.tween((v) => (h.x = v), h.x, g.def.x - 78, 0.25, ease.inOutSine);
    h.pose = "victory";
    sfx.fanfare();
    const mid = this.screen(g.def.x - 40, GROUND - 110);
    this.ui.floatText("VICTORY!", mid.x, mid.y, "info");
    g.chest = "closed";
    await this.tween((v) => (g.chestDrop = v), -60, 0, 0.45, ease.outBack);
    await this.sleep(0.35);
    g.chest = "open";
    sfx.coin();
    this.fx.sparkle(g.def.x, GROUND - 10, 24, 30, 18, "#ffe066");
    this.defeated.add(g.def.section);
    this.ui.setProgress(this.defeated);
    await this.sleep(0.4);
    this.openSection(g.def.section, () => {
      h.pose = "idle";
      h.state = "free";
      this.story = { x: h.x };
      void this.ui.say("Yash", "portrait-hero", g.def.victory, { label: "Read again", key: "E", run: () => this.openSection(g.def.section) });
    });
  }

  private openSection(s: SectionId, after?: () => void) {
    this.ui.panelClosed = () => { this.ui.panelClosed = null; after?.(); };
    this.ui.openPanel(s);
  }

  // ---------------------------------------------------------------- teleport
  private async teleport(section: SectionId) {
    const g = this.guardians.find((x) => x.def.section === section)!;
    if (this.mode === "title") { await this.pickFromTitle(section); return; }
    if (this.mode === "ending") {
      await this.ui.fade(1, 450);
      this.ui.showCredits(false);
      this.mode = "play";
      this.ui.showHud(true);
    }
    const h = this.hero;
    h.state = "busy";
    this.ui.hideDialogue();
    this.story = null;
    sfx.teleport();
    this.fx.sprite("fx-beam", h.x, GROUND + 2, 0.7, 0.2, 1);
    this.fx.sparkle(h.x, GROUND - 4, 20, 50, 20);
    await this.tween((v) => (h.alpha = v), 1, 0, 0.35, ease.inOutSine);
    await this.ui.flash("rgba(212,255,58,.45)", 600);
    await this.ui.fade(1, 260);
    h.x = g.alive ? g.def.x - STOP_DIST - 40 : g.def.x - 78;
    h.vx = 0;
    h.facing = 1;
    this.zone = -1;
    this.storySeen = new Set(STORY.map((_, i) => i).filter((i) => STORY[i].x <= h.x));
    this.snapCamera();
    await this.ui.fade(0, 380);
    this.fx.sprite("fx-beam", h.x, GROUND + 2, 0.8, 1, 0.2);
    this.fx.sparkle(h.x, GROUND - 4, 20, 50, 20);
    await this.tween((v) => (h.alpha = v), 0, 1, 0.4, ease.inOutSine);
    h.state = "free";
    if (g.alive) {
      // walk the last few steps up to the guardian, which triggers its challenge
      h.pose = "walk";
      h.state = "busy";
      await this.tween((v) => (h.x = v), h.x, g.def.x - STOP_DIST, 0.6, ease.inOutSine);
      h.pose = "idle";
      h.state = "free";
    } else {
      this.openSection(section);
    }
  }

  // ---------------------------------------------------------------- ending
  private async startEnding(fromTitle = false) {
    const h = this.hero;
    h.state = "busy";
    this.ui.hideDialogue();
    if (!fromTitle) await this.ui.fade(1, 700);
    this.mode = "ending";
    this.ui.showHud(false);
    this.love = { wave: false, met: false };
    h.x = -24;
    h.vx = 0;
    h.facing = 1;
    h.alpha = 1;
    await this.ui.fade(0, 900);
    this.ui.banner("The Sunset Hill", "The last stop of the journey");
    h.pose = "walk";
    await this.tween((v) => (h.x = v), h.x, 298, 3.4, ease.inOutSine);
    h.pose = "idle";
    await this.sleep(0.4);
    this.love.met = true;
    sfx.heart();
    this.fx.hearts(332, 196, 7);
    await this.sleep(0.5);
    const line = this.defeated.size === GUARDIANS.length
      ? "You beat every guardian just to find me? Then let's build the next world — together."
      : "You came all this way? The guardians can wait — let's build the next world together.";
    await this.ui.say("???", "portrait-love", line);
    await this.sleep(2.2);
    this.ui.hideDialogue();
    await this.sleep(0.4);
    this.ui.showCredits(true);
  }

  async playAgain() {
    await this.ui.fade(1, 500);
    this.ui.showCredits(false);
    this.reset();
    this.showTitle();
    await this.ui.fade(0, 600);
  }

  async keepExploring() {
    await this.ui.fade(1, 500);
    this.ui.showCredits(false);
    this.mode = "play";
    this.ui.showHud(true);
    this.hero.x = WORLD_W - 140;
    this.hero.facing = -1;
    this.hero.state = "free";
    this.hero.pose = "idle";
    this.snapCamera();
    await this.ui.fade(0, 600);
  }

  // ---------------------------------------------------------------- render
  private render() {
    const ctx = this.stage.ctx;
    const vw = this.stage.viewW;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0d0b14";
    ctx.fillRect(0, 0, vw, 300);
    if (this.mode === "title") return this.renderTitle(ctx, vw);
    if (this.mode === "ending") return this.renderEnding(ctx, vw);

    const o = this.fx.offset();
    ctx.save();
    ctx.translate(o.x, o.y);
    const cam = Math.round(this.camX);
    for (const [key, speed] of LAYERS) ctx.drawImage(this.img[key], -Math.round(cam * speed), 0);

    for (const g of this.guardians) {
      if (g.chest !== "none") drawSprite(ctx, this.img, g.chest === "open" ? "chest-open" : "chest", g.def.x - cam, GROUND + Math.round(g.chestDrop));
      if (!g.alive) continue;
      let key: SpriteKey = g.def.sprite;
      let y = GROUND;
      if (g.hurt > 0) {
        key = `${g.def.sprite}-hurt` as SpriteKey;
      } else if (g.def.sprite === "slime") {
        key = Math.floor(this.time * 2.4) % 2 ? "slime-squash" : "slime";
      } else {
        y += Math.round(Math.sin(this.time * 2.2) * 1);
      }
      const jitter = g.hurt > 0.25 ? Math.round((Math.random() - 0.5) * 3) : 0;
      drawSprite(ctx, this.img, key, g.def.x - cam + jitter, y);
      if (g.engaged && g.hurt === 0 && this.hero.state === "free") this.drawAlert(ctx, g.def.x - cam, this.guardianTop(g) - 10);
    }
    this.drawHero(ctx, cam, GROUND);
    this.fx.draw(ctx, this.img, cam);
    ctx.drawImage(this.img[FORE[0]], -Math.round(cam * FORE[1]), 0);
    ctx.restore();
  }

  private drawHero(ctx: CanvasRenderingContext2D, cam: number, y: number) {
    const h = this.hero;
    if (h.alpha <= 0.01) return;
    drawSprite(ctx, this.img, POSE_SPRITE[h.pose] ?? h.sprite, h.x - cam, y, { flip: h.facing < 0, alpha: h.alpha });
  }

  private drawAlert(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const bob = Math.round(Math.sin(this.time * 5) * 1.5);
    ctx.fillStyle = "#0d0b14";
    ctx.fillRect(Math.round(x) - 2, y - 13 + bob, 5, 11);
    ctx.fillRect(Math.round(x) - 2, y + bob, 5, 4);
    ctx.fillStyle = "#ffe066";
    ctx.fillRect(Math.round(x) - 1, y - 12 + bob, 3, 9);
    ctx.fillRect(Math.round(x) - 1, y + 1 + bob, 3, 2);
  }

  private renderTitle(ctx: CanvasRenderingContext2D, vw: number) {
    // a slow, living drift through the island's parallax layers
    const base = 520 + Math.sin(this.titleDrift * 0.07) * 160;
    const cam = reducedMotion() ? 520 : base;
    for (const [key, speed] of LAYERS.slice(0, 3)) ctx.drawImage(this.img[key], -Math.round(cam * speed), 0);
    const grad = ctx.createLinearGradient(0, 170, 0, 300);
    grad.addColorStop(0, "rgba(13,11,20,0)");
    grad.addColorStop(1, "rgba(13,11,20,0.85)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 170, vw, 130);
    const bob = reducedMotion() ? 0 : Math.round(Math.sin(this.time * 2) * 1);
    drawSprite(ctx, this.img, "hero-victory", Math.round(vw * 0.18), 286 + bob);
  }

  private renderEnding(ctx: CanvasRenderingContext2D, vw: number) {
    // keep the lovers centred on narrow (portrait) screens
    const off = Math.round(Math.min(0, Math.max(vw - 480, vw / 2 - 300)));
    ctx.drawImage(this.img.ending, off, 0);
    const loveKey: SpriteKey = this.love.met && Math.floor(this.time * 1.4) % 2 ? "love-wave" : "love";
    drawSprite(ctx, this.img, loveKey, 362 + off, endingGround(362));
    this.drawHero(ctx, -off, this.hero.y);
    this.fx.draw(ctx, this.img, -off);
  }
}
