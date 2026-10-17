import type { Images, SpriteKey } from "../engine/assets";
import type { Input, Action } from "../engine/input";
import type { Stage } from "../engine/stage";
import { sfx } from "../engine/audio";
import type { SectionId } from "../content";
import { UI, reducedMotion, type MenuItem } from "../ui/ui";
import type { TabId } from "../ui/sections";
import { Effects, damp, ease } from "./effects";
import { Guardian, type Shot } from "./guardians";
import { Hero, overlaps, type Solid } from "./hero";
import {
  BLOCK, BLOCKS, COINS, FORE, GROUND, GUARDIANS, LAYERS, STORY, WORLD_W, ZONES, ZONE_W,
  drawSprite, endingGround, type BlockDef,
} from "./world";

type Mode = "title" | "play" | "ending";

interface Block { def: BlockDef; used: boolean; bump: number }
interface Coin { x: number; y: number; taken: boolean }
interface Pop { x: number; y: number; t: number }
interface Tween { t: number; dur: number; from: number; to: number; set: (v: number) => void; ease: (t: number) => number; done: () => void }

const HERO_START = 70;
const SECTIONS: SectionId[] = ["about", "work", "portfolio"];
const LABEL: Record<SectionId, string> = { about: "About", work: "Work", portfolio: "Portfolio" };
const touch = () => matchMedia("(pointer: coarse)").matches;

export class Game {
  private mode: Mode = "title";
  private time = 0;
  private frameDt = 0;
  private hitStop = 0;
  private sleeps: { t: number; done: () => void }[] = [];
  private tweens: Tween[] = [];

  private fx: Effects;
  private hero!: Hero;
  private camX = 0;
  private guardians: Guardian[] = [];
  private fight: Guardian | null = null;
  /** a scripted sequence (victory, K.O., teleport) owns the hero */
  private busy = false;
  private defeated = new Set<SectionId>();
  private blocks: Block[] = [];
  private solids: Solid[] = [];
  private coins: Coin[] = [];
  private pops: Pop[] = [];
  private coinCount = 0;
  private storySeen = new Set<number>();
  private story: { x: number } | null = null; // where the current narration started
  private sayId = 0;
  private zone = -1;
  private tutorial = { jumped: false, attacked: false };
  private love = { met: false };
  private titleDrift = 0;

  constructor(private stage: Stage, private img: Images, private input: Input, private ui: UI) {
    this.fx = new Effects(reducedMotion);
    this.reset();
    input.onPress((a) => this.onAction(a));
    ui.onQuest = (id) => this.questClick(id);
    stage.resized(() => this.snapCamera());
  }

  // ---------------------------------------------------------------- lifecycle
  private reset() {
    this.guardians = GUARDIANS.map((def) => new Guardian(def, this.fx));
    this.fight = null;
    this.busy = false;
    this.defeated = new Set();
    this.storySeen = new Set();
    this.story = null;
    this.hero = new Hero(HERO_START, this.fx);
    this.hero.bounds = [24, WORLD_W - 8];
    this.zone = -1;
    this.love = { met: false };
    this.tutorial = { jumped: false, attacked: false };
    this.blocks = BLOCKS.map((def) => ({ def, used: false, bump: 0 }));
    this.solids = this.blocks.map((b) => ({ x0: b.def.x, x1: b.def.x + BLOCK, y0: b.def.y, y1: b.def.y + BLOCK, onBump: () => this.bumpBlock(b) }));
    this.coins = COINS.map((c) => ({ ...c, taken: false }));
    this.pops = [];
    this.coinCount = 0;
    this.ui.setProgress(this.defeated);
    this.ui.setHearts(this.hero.hp, this.hero.maxHp);
    this.ui.setCoins(0);
    this.ui.boss(null);
    this.ui.hint(null);
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

  private async until(cond: () => boolean, max = 3) {
    for (let t = 0; !cond() && t < max; t += 0.05) await this.sleep(0.05);
  }

  private tween(set: (v: number) => void, from: number, to: number, dur: number, fn = ease.outCubic) {
    return new Promise<void>((done) => {
      if (dur <= 0) { set(to); done(); return; }
      this.tweens.push({ t: 0, dur, from, to, set, ease: fn, done });
    });
  }

  /** Dialogue that newer lines can replace; `hold` seconds after typing it hides itself. */
  private async say(speaker: string, portrait: string, text: string, opts: { hold?: number; action?: { label: string; key: string; run: () => void } } = {}) {
    const id = ++this.sayId;
    await this.ui.say(speaker, portrait, text, opts.action);
    if (opts.hold === undefined) return;
    await this.sleep(opts.hold);
    if (this.sayId === id) this.ui.hideDialogue();
  }

  private hush() {
    this.sayId++;
    this.story = null;
    this.ui.hideDialogue();
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
    this.ui.boss(null);
    this.ui.hint(null);
    this.hush();
    this.ui.showTitle(this.titleItems(), (id) => void this.pickFromTitle(id));
  }

  /** A plain reading list for visitors who don't want to play. */
  private showQuickView() {
    const items: MenuItem[] = [
      { id: "read-about", label: "About", sub: "who Yash is" },
      { id: "read-work", label: "Work", sub: "experience & training" },
      { id: "read-portfolio", label: "Portfolio", sub: "every world he's built" },
      { id: "read-contact", label: "Contact", sub: "send an invite" },
      { id: "back", label: "Back", sub: "to the title" },
    ];
    this.ui.showTitle(items, (id) => void this.pickFromTitle(id), () => this.showTitle());
  }

  private async pickFromTitle(id: string) {
    sfx.unlock();
    if (id === "quick") { this.showQuickView(); return; }
    if (id === "back") { this.showTitle(); return; }
    if (id.startsWith("read-")) { this.ui.openPanel(id.slice(5) as TabId); return; }
    await this.ui.fade(1, 500);
    await this.ui.hideTitle();
    this.reset();
    this.mode = "play";
    this.ui.showHud(true);
    if (id === "contact") { await this.startEnding(true); return; }
    await this.ui.fade(0, 600);
    if (id === "start") this.ui.hint(this.controlsHint());
    else await this.teleport(id as SectionId);
  }

  private controlsHint() {
    return touch() ? "◀ ▶ move (hold to run) · A jump · B attack" : "← → move · Shift run · Space jump · J attack";
  }

  private openPauseMenu() {
    const items: MenuItem[] = [{ id: "resume", label: "Resume", sub: "back to the island" }];
    for (const s of SECTIONS) {
      const g = this.guardians.find((x) => x.def.section === s)!;
      items.push(this.defeated.has(s)
        ? { id: `read-${s}`, label: `Read · ${LABEL[s]}`, sub: "you earned this one" }
        : { id: s, label: `Teleport · ${LABEL[s]}`, sub: this.fight === g ? "you're fighting it now" : `fight the ${g.def.name}` });
    }
    items.push({ id: "ending", label: "Skip to the Ending", sub: "and contact Yash" }, { id: "title", label: "Title Screen", sub: "start over" });
    this.ui.openMenu(items, (id) => void this.pickFromMenu(id));
  }

  private async pickFromMenu(id: string) {
    await this.ui.closeMenu();
    if (id.startsWith("read-")) this.openSection(id.slice(5) as SectionId);
    else if (id === "about" || id === "work" || id === "portfolio") await this.teleport(id);
    else if (id === "ending") { if (this.mode === "play" && !this.busy) await this.startEnding(); }
    else if (id === "title") { await this.ui.fade(1, 400); this.ui.showCredits(false); this.reset(); this.showTitle(); await this.ui.fade(0, 500); }
  }

  /** The quest log in the HUD: earned sections open, unearned ones take you to their guardian. */
  private questClick(id: TabId) {
    if (this.mode !== "play" || this.busy) return;
    if (id === "contact") {
      if (this.defeated.size === SECTIONS.length) void this.startEnding();
      else this.ui.banner("Not yet…", "Defeat all three guardians first");
      return;
    }
    if (this.defeated.has(id)) this.openSection(id);
    else void this.teleport(id);
  }

  // ---------------------------------------------------------------- input
  private onAction(a: Action) {
    sfx.unlock();
    if (this.ui.handle(a)) return;
    if (a === "menu" && this.mode !== "title") { this.openPauseMenu(); return; }
    if (this.mode !== "play") return;
    if (a === "jump") { this.hero.pressJump(); this.tutorial.jumped = true; }
    if (a === "attack") { this.hero.pressAttack(); this.tutorial.attacked = true; }
  }

  // ---------------------------------------------------------------- update
  private update(dt: number) {
    this.time += dt;
    this.titleDrift += dt;
    this.frameDt = 0;
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

    this.frameDt = dt;
    this.fx.update(dt);
    if (this.mode === "play") this.updatePlay(dt);
    if (this.mode === "ending") {
      this.hero.y = endingGround(this.hero.x);
      if (this.hero.pose === "walk") this.hero.animate(dt, 60);
    }
  }

  private updatePlay(dt: number) {
    const h = this.hero;
    h.bounds = this.fight ? [this.fight.def.arena[0] + 10, this.fight.def.arena[1] - 10] : [24, WORLD_W - 8];
    h.update(dt, this.input, this.solids);

    // pickups
    const hb = h.box;
    for (const c of this.coins) {
      if (c.taken || !overlaps(hb, { x0: c.x - 4, x1: c.x + 4, y0: c.y - 5, y1: c.y + 5 })) continue;
      c.taken = true;
      this.addCoins(1);
      this.fx.sparkle(c.x, c.y + 4, 8, 8, 5, "#ffe066");
    }
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.5);
    for (const b of this.blocks) b.bump = Math.max(0, b.bump - dt / 0.18);

    for (const g of this.guardians) if (g.alive) g.update(dt, h);

    // walking into a living guardian's arena starts the fight
    if (!this.fight && !this.busy && h.control) {
      const g = this.guardians.find((g) => g.alive && h.x > g.def.arena[0] + 24 && h.x < g.def.arena[1] - 4);
      if (g) this.startFight(g);
    }
    if (this.fight && this.fight.alive && !this.busy) this.combat(this.fight, dt);

    // ambient narration, dismissed once the player wanders off
    if (!this.fight && !this.busy) {
      STORY.forEach((s, i) => {
        if (!this.storySeen.has(i) && h.x >= s.x) {
          this.storySeen.add(i);
          void this.say("Yash", "portrait-hero", s.text).then(() => { this.story = { x: h.x }; });
        }
      });
    }
    if (this.story && Math.abs(h.x - this.story.x) > 150) this.hush();

    const zone = Math.min(ZONES.length - 1, Math.floor(h.x / ZONE_W));
    if (zone !== this.zone) { this.zone = zone; this.ui.banner(ZONES[zone].name, ZONES[zone].sub); }

    if (this.tutorial.jumped && this.tutorial.attacked) this.ui.hint(null);

    if (h.x >= WORLD_W - 24 && h.control && !this.fight && !this.busy) void this.startEnding();

    this.camX += (this.cameraTarget() - this.camX) * damp(this.fight ? 3.5 : 5, dt);
  }

  private cameraTarget() {
    const vw = this.stage.viewW;
    const h = this.hero;
    let target = h.x - vw * 0.42 + h.facing * vw * 0.07;
    if (this.fight) {
      // frame the duel: keep the hero and the guardian on screen together
      const [a0, a1] = this.fight.def.arena;
      const lo = a0 - 30, hi = a1 + 30 - vw;
      target = lo > hi ? (a0 + a1) / 2 - vw / 2 : Math.max(lo, Math.min(hi, (h.x + this.fight.x) / 2 - vw / 2));
    }
    return Math.max(0, Math.min(WORLD_W - vw, target));
  }

  private snapCamera() {
    if (this.hero) this.camX = this.cameraTarget();
  }

  private addCoins(n: number) {
    this.coinCount += n;
    this.ui.setCoins(this.coinCount);
    sfx.coin();
  }

  private bumpBlock(b: Block) {
    b.bump = 1;
    if (b.def.kind === "q" && !b.used) {
      b.used = true;
      this.addCoins(1);
      this.pops.push({ x: b.def.x + BLOCK / 2, y: b.def.y - 2, t: 0 });
    } else {
      sfx.bump();
    }
  }

  // ---------------------------------------------------------------- fights
  private startFight(g: Guardian) {
    this.fight = g;
    this.hush();
    const intro = g.def.taunt.length / 52 + 1.1;
    g.begin(intro);
    this.ui.boss(g.def.name, g.hp, g.def.hp);
    sfx.charge();
    void this.say(g.def.name, g.def.portrait, g.def.taunt, { hold: 1.2 });
    if (g.def.kind === "slime") this.ui.hint(touch() ? "B attack · or land on its head" : "J or X to attack · or land on its head");
    else if (g.def.kind === "golem") this.ui.hint(touch() ? "A jump over the quakes" : "Space to jump over the quakes");
    else this.ui.hint(null);
  }

  private combat(g: Guardian, dt: number) {
    const h = this.hero;
    // sword
    const sword = h.hitbox;
    if (sword && !h.attackHit && overlaps(sword, g.body)) {
      h.attackHit = true;
      this.damage(g, h.facing, true);
      if (g.def.kind === "slime") this.ui.hint(null);
    }
    // stomp: land on its head, Mario style
    const body = g.body;
    if (h.vy > 40 && h.y - h.vy * dt <= body.y0 + 6 && overlaps(h.box, body)) {
      h.y = body.y0;
      h.bounce();
      this.damage(g, Math.sign(g.x - h.x) || 1, false);
      return;
    }
    // getting hit
    const src = g.touching(h);
    if (src === null) return;
    if (g.def.kind === "slime") {
      if (overlaps(h.box, g.body) && h.grounded) h.vx = (h.x < g.x ? -1 : 1) * 120; // a harmless shove
      return;
    }
    if (h.hurt(src)) this.heroHurt(g);
  }

  private damage(g: Guardian, dir: number, sword: boolean) {
    if (!g.hit(dir)) return;
    const h = this.hero;
    sfx.hit();
    this.hitStop = reducedMotion() ? 0 : 0.06;
    this.fx.kick(2);
    const px = g.x - dir * g.def.body[0] * 0.3;
    const py = GROUND - g.def.body[1] * 0.55;
    this.fx.burst(px, py, 14, ["#ffffff", "#d4ff3a", "#ffc63a"], 80);
    this.fx.sprite("fx-burst", px, py, 0.26, 0.4, 0.9);
    if (sword && h.grounded) h.vx = -dir * 50;
    this.ui.boss(g.def.name, g.hp, g.def.hp);
    const top = this.screen(g.x, GROUND - g.def.body[1] - 6);
    if (g.hp <= 0) void this.defeat(g);
    else this.ui.floatText("HIT", top.x, top.y, "dmg");
  }

  private heroHurt(g: Guardian) {
    const h = this.hero;
    this.ui.setHearts(h.hp, h.maxHp);
    this.hitStop = reducedMotion() ? 0 : 0.05;
    this.fx.kick(2.5);
    this.fx.burst(h.x, h.y - 30, 10, ["#ff5b3a", "#ffffff"], 70);
    const p = this.screen(h.x, h.y - 60);
    this.ui.floatText("-1 ♥", p.x, p.y, "hurt");
    if (h.hp <= 0) void this.knockedOut(g);
  }

  private async knockedOut(g: Guardian) {
    const h = this.hero;
    this.busy = true;
    h.control = false;
    g.stop();
    sfx.ko();
    const p = this.screen(h.x, h.y - 70);
    this.ui.floatText("K.O.", p.x, p.y, "big");
    await this.sleep(0.9);
    await this.ui.fade(1, 450);
    g.regroup();
    g.begin(1.1);
    h.place(g.def.arena[0] + 34);
    h.facing = 1;
    h.heal();
    h.inv = 1.5;
    this.ui.setHearts(h.hp, h.maxHp);
    this.snapCamera();
    await this.ui.fade(0, 450);
    h.control = true;
    this.busy = false;
    void this.say("Yash", "portrait-hero", "Ouch. Back on my feet — and that guardian is still hurting from last round.", { hold: 1.4 });
  }

  private async defeat(g: Guardian) {
    const h = this.hero;
    this.busy = true;
    h.control = false;
    g.stop();
    this.ui.boss(null);
    this.ui.hint(null);
    this.hitStop = reducedMotion() ? 0 : 0.18;
    this.fx.kick(4);
    const top = this.screen(g.x, GROUND - g.def.body[1] - 14);
    this.ui.floatText("FINISH!", top.x, top.y, "big");
    await this.sleep(0.45);
    sfx.poof();
    g.alive = false;
    this.fight = null;
    this.fx.sprite("fx-poof", g.x, GROUND, 0.7, 0.85, 1.2);
    this.fx.coins(g.x, GROUND - 24);
    this.fx.burst(g.x, GROUND - 20, 14, ["#c3cbd2", "#eeeff0", "#ffffff"], 50, 20);
    await this.until(() => h.grounded);
    await this.sleep(0.25);
    h.facing = g.x >= h.x ? 1 : -1;
    h.pose = "victory";
    sfx.fanfare();
    const mid = this.screen(h.x, GROUND - 110);
    this.ui.floatText("VICTORY!", mid.x, mid.y, "info");
    const [a0, a1] = g.def.arena;
    g.chestX = Math.max(a0 + 30, Math.min(a1 - 30, Math.abs(g.x - h.x) < 30 ? h.x + h.facing * 40 : g.x));
    g.chest = "closed";
    await this.tween((v) => (g.chestDrop = v), -60, 0, 0.45, ease.outBack);
    await this.sleep(0.35);
    g.chest = "open";
    this.addCoins(10);
    this.fx.sparkle(g.chestX, GROUND - 10, 24, 30, 18, "#ffe066");
    this.defeated.add(g.def.section);
    this.ui.setProgress(this.defeated);
    h.heal();
    this.ui.setHearts(h.hp, h.maxHp);
    await this.sleep(0.4);
    this.openSection(g.def.section, () => {
      h.pose = null;
      h.control = true;
      this.busy = false;
      void this.say("Yash", "portrait-hero", g.def.victory, { action: { label: "Read again", key: "Enter", run: () => this.openSection(g.def.section) } })
        .then(() => { this.story = { x: h.x }; });
    });
  }

  private openSection(s: SectionId, after?: () => void) {
    this.ui.panelClosed = () => { this.ui.panelClosed = null; after?.(); };
    this.ui.openPanel(s);
  }

  private screen(x: number, y: number) {
    return this.stage.toScreen(x - this.camX, y);
  }

  // ---------------------------------------------------------------- teleport
  private async teleport(section: SectionId) {
    if (this.mode === "title") { await this.pickFromTitle(section); return; }
    if (this.busy) return;
    const g = this.guardians.find((x) => x.def.section === section)!;
    if (this.fight === g) return;
    if (this.mode === "ending") {
      await this.ui.fade(1, 450);
      this.ui.showCredits(false);
      this.mode = "play";
      this.ui.showHud(true);
      this.hero.pose = null;
      await this.ui.fade(0, 300);
    }
    if (this.fight) { this.fight.stop(); this.fight.regroup(); this.fight = null; this.ui.boss(null); }
    const h = this.hero;
    this.busy = true;
    h.control = false;
    this.hush();
    this.ui.hint(null);
    sfx.teleport();
    this.fx.sprite("fx-beam", h.x, h.y + 2, 0.7, 0.2, 1);
    this.fx.sparkle(h.x, h.y - 4, 20, 50, 20);
    await this.tween((v) => (h.alpha = v), 1, 0, 0.35, ease.inOutSine);
    void this.ui.flash("rgba(212,255,58,.45)", 600);
    await this.ui.fade(1, 260);
    h.place(g.alive ? g.def.arena[0] + 34 : (g.chestX || g.def.x) - 50);
    h.facing = 1;
    this.zone = -1;
    this.storySeen = new Set(STORY.map((_, i) => i).filter((i) => STORY[i].x <= h.x));
    this.snapCamera();
    await this.ui.fade(0, 380);
    this.fx.sprite("fx-beam", h.x, GROUND + 2, 0.8, 1, 0.2);
    this.fx.sparkle(h.x, GROUND - 4, 20, 50, 20);
    await this.tween((v) => (h.alpha = v), 0, 1, 0.4, ease.inOutSine);
    h.control = true;
    this.busy = false;
    if (!g.alive) this.openSection(section);
    // a living guardian's fight starts on its own: the hero is standing in its arena
  }

  // ---------------------------------------------------------------- ending
  private async startEnding(fromTitle = false) {
    const h = this.hero;
    this.busy = true;
    h.control = false;
    this.hush();
    this.ui.hint(null);
    this.ui.boss(null);
    if (!fromTitle) await this.ui.fade(1, 700);
    this.mode = "ending";
    this.ui.showHud(false);
    this.love = { met: false };
    h.place(-24, endingGround(-24));
    h.facing = 1;
    h.alpha = 1;
    await this.ui.fade(0, 900);
    this.ui.banner("The Sunset Hill", "The last stop of the journey");
    h.pose = "walk";
    await this.tween((v) => (h.x = v), h.x, 298, 3.4, ease.inOutSine);
    h.pose = null;
    await this.sleep(0.4);
    this.love.met = true;
    sfx.heart();
    this.fx.hearts(332, 196, 7);
    await this.sleep(0.5);
    const line = this.defeated.size === GUARDIANS.length
      ? "You beat every guardian just to find me? Then let's build the next world — together."
      : "You came all this way? The guardians can wait — let's build the next world together.";
    await this.say("???", "portrait-love", line);
    await this.sleep(2.2);
    this.ui.hideDialogue();
    await this.sleep(0.4);
    this.ui.showCredits(true);
    this.busy = false;
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
    this.hero.place(WORLD_W - 140);
    this.hero.facing = -1;
    this.hero.pose = null;
    this.hero.control = true;
    this.busy = false;
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
    if (this.fight) for (const ex of this.fight.def.arena) this.drawFence(ctx, ex - cam);
    for (const b of this.blocks) this.drawBlock(ctx, b, cam);
    for (const c of this.coins) if (!c.taken) this.drawCoin(ctx, c.x - cam, c.y, this.time * 5 + c.x * 0.05);
    for (const p of this.pops) {
      const t = p.t / 0.5;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      this.drawCoin(ctx, p.x - cam, p.y - ease.outCubic(Math.min(1, t * 1.4)) * 28, this.time * 14);
      ctx.globalAlpha = 1;
    }
    for (const g of this.guardians) this.drawGuardian(ctx, g, cam);
    this.drawHero(ctx, cam);
    this.fx.draw(ctx, this.img, cam);
    ctx.drawImage(this.img[FORE[0]], -Math.round(cam * FORE[1]), 0);
    ctx.restore();
  }

  private drawHero(ctx: CanvasRenderingContext2D, cam: number) {
    const h = this.hero;
    if (h.alpha <= 0.01) return;
    drawSprite(ctx, this.img, h.sprite(this.frameDt), h.x - cam, h.y, h.look());
  }

  private drawGuardian(ctx: CanvasRenderingContext2D, g: Guardian, cam: number) {
    if (g.chest !== "none") drawSprite(ctx, this.img, g.chest === "open" ? "chest-open" : "chest", g.chestX - cam, GROUND + Math.round(g.chestDrop));
    if (!g.alive) return;
    const look = g.sprite(this.time);
    const flip = g.facing > 0;
    g.trail.forEach((tx, i) => drawSprite(ctx, this.img, look.key, tx - cam, g.y + look.dy, { flip, alpha: 0.12 * (i + 1), tint: "#6a4cff" }));
    const jitter = g.hurtT > 0.12 ? Math.round((Math.random() - 0.5) * 3) : 0;
    const shake = g.tele > 0.6 && g.def.kind === "golem" ? Math.round((Math.random() - 0.5) * 2) : 0;
    const flash = g.hurtT > 0.17;
    const key: SpriteKey = flash ? g.def.kind : look.key;
    drawSprite(ctx, this.img, key, g.x - cam + jitter + shake, g.y + look.dy, { flip, sx: look.sx, sy: look.sy, tint: flash ? "#ffffff" : undefined });
    const top = g.y + look.dy - this.img[g.def.kind].height + 4;
    if (g.tele > 0.05) this.drawAlert(ctx, g.x - cam, top - 6);
    else if (!g.active && !this.fight && Math.abs(this.hero.x - g.x) < 320) this.drawAlert(ctx, g.x - cam, top - 6, 0.6);
    if (g.def.kind === "knight" && g.tele > 0.3) this.drawGlint(ctx, g.x - cam + g.facing * 16, top + 30, g.tele);
    for (const s of g.shots) this.drawShot(ctx, s, cam);
  }

  private drawShot(ctx: CanvasRenderingContext2D, s: Shot, cam: number) {
    const x = Math.round(s.x - cam);
    if (s.kind === "quake") {
      // a glowing crack trails behind a cluster of erupting rock spikes
      const dir = Math.sign(s.vx) || 1;
      const trail = Math.min(36, Math.round(s.t * 150));
      ctx.fillStyle = "rgba(255,176,58,0.35)";
      ctx.fillRect(dir > 0 ? x - trail : x, GROUND - 2, trail, 3);
      ctx.fillStyle = "#ffb03a";
      ctx.fillRect(dir > 0 ? x - trail : x, GROUND - 1, trail, 1);
      for (let i = 0; i < 5; i++) {
        const hh = Math.round(22 * (0.4 + 0.6 * Math.abs(Math.sin(s.t * 16 + i * 1.9))) * (i === 2 ? 1 : 0.8));
        const cx = x - 10 + i * 4;
        ctx.fillStyle = "#1a1714";
        ctx.fillRect(cx - 1, GROUND - hh - 1, 6, hh + 1);
        ctx.fillStyle = i % 2 ? "#a39b8a" : "#d8d0bd";
        ctx.fillRect(cx, GROUND - hh, 4, hh);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cx, GROUND - hh, 2, 1);
        ctx.fillStyle = "#5c574d";
        ctx.fillRect(cx + 3, GROUND - hh + 2, 1, hh - 2);
      }
      return;
    }
    const dir = Math.sign(s.vx) || 1;
    ctx.fillStyle = "rgba(154,124,255,0.22)";
    ctx.fillRect(x - 9, GROUND - s.h - 3, 18, s.h + 3);
    for (let r = 0; r < s.h; r++) {
      const t = (r / (s.h - 1)) * 2 - 1;
      const off = Math.round((1 - t * t) * 6) * dir;
      const y = GROUND - s.h + r;
      ctx.fillStyle = "#1c1828";
      ctx.fillRect(x + off - 3, y, 6, 1);
      ctx.fillStyle = "#b8a4ff";
      ctx.fillRect(x + off - 2, y, 4, 1);
      if (Math.abs(t) < 0.65) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x + off + (dir > 0 ? 1 : -2), y, 1, 1); }
    }
  }

  private drawFence(ctx: CanvasRenderingContext2D, x: number) {
    const sx = Math.round(x);
    ctx.fillStyle = `rgba(212,255,58,${0.1 + 0.05 * Math.sin(this.time * 4)})`;
    ctx.fillRect(sx - 3, GROUND - 130, 6, 130);
    ctx.fillStyle = "rgba(212,255,58,0.35)";
    ctx.fillRect(sx, GROUND - 130, 1, 130);
    ctx.fillStyle = "#ecff9a";
    for (let i = 0; i < 6; i++) {
      const y = GROUND - ((this.time * 38 + i * 22) % 130);
      ctx.fillRect(sx + Math.round(Math.sin(i * 2 + this.time * 3) * 2), Math.round(y), 1, 2);
    }
  }

  private drawBlock(ctx: CanvasRenderingContext2D, b: Block, cam: number) {
    const x = Math.round(b.def.x - cam);
    if (x < -BLOCK || x > this.stage.viewW) return;
    const y = b.def.y - Math.round(Math.sin(b.bump * Math.PI) * 5);
    const used = b.def.kind === "q" && b.used;
    const [fill, light, dark] = b.def.kind === "stone" ? ["#8b8475", "#b8b0a0", "#5c574d"] : used ? ["#8a5a2c", "#b07a44", "#5a3410"] : ["#f2a922", "#ffe9a0", "#b86a10"];
    ctx.fillStyle = "#24160c";
    ctx.fillRect(x, y, BLOCK, BLOCK);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 1, y + 1, BLOCK - 2, BLOCK - 2);
    ctx.fillStyle = light;
    ctx.fillRect(x + 1, y + 1, BLOCK - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, BLOCK - 2);
    ctx.fillStyle = dark;
    ctx.fillRect(x + 1, y + BLOCK - 2, BLOCK - 2, 1);
    ctx.fillRect(x + BLOCK - 2, y + 1, 1, BLOCK - 2);
    if (b.def.kind === "stone") {
      ctx.fillRect(x + 4, y + 5, 5, 1);
      ctx.fillRect(x + 8, y + 6, 1, 4);
      return;
    }
    // rivets
    for (const [rx, ry] of [[2, 2], [13, 2], [2, 13], [13, 13]]) ctx.fillRect(x + rx, y + ry, 1, 1);
    if (used) return;
    const glyph = [".###.", "#...#", "....#", "..##.", "..#..", ".....", "..#.."];
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 4);
    glyph.forEach((row, gy) => [...row].forEach((c, gx) => {
      if (c !== "#") return;
      ctx.fillStyle = "#7a3a08";
      ctx.fillRect(x + 6 + gx, y + 5 + gy, 1, 1);
      ctx.fillStyle = `rgba(255,255,255,${pulse})`;
      ctx.fillRect(x + 5 + gx, y + 4 + gy, 1, 1);
    }));
  }

  private drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number) {
    const cx = Math.round(x), cy = Math.round(y);
    if (cx < -8 || cx > this.stage.viewW + 8) return;
    const w = Math.max(1, Math.round(Math.abs(Math.cos(phase)) * 3));
    ctx.fillStyle = "#5a2c08";
    ctx.fillRect(cx - w - 1, cy - 5, w * 2 + 2, 10);
    ctx.fillStyle = "#ffc63a";
    ctx.fillRect(cx - w, cy - 4, w * 2, 8);
    ctx.fillStyle = "#fff1c2";
    ctx.fillRect(cx - w, cy - 4, 1, 6);
  }

  private drawGlint(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
    const r = Math.round(2 + k * 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1);
    ctx.fillRect(Math.round(x), Math.round(y) - r, 1, r * 2 + 1);
  }

  private drawAlert(ctx: CanvasRenderingContext2D, x: number, y: number, alpha = 1) {
    const bob = Math.round(Math.sin(this.time * 5) * 1.5);
    const sx = Math.round(x);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#0d0b14";
    ctx.fillRect(sx - 2, y - 13 + bob, 5, 11);
    ctx.fillRect(sx - 2, y + bob, 5, 4);
    ctx.fillStyle = "#ffe066";
    ctx.fillRect(sx - 1, y - 12 + bob, 3, 9);
    ctx.fillRect(sx - 1, y + 1 + bob, 3, 2);
    ctx.globalAlpha = 1;
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
    this.drawHero(ctx, -off);
    this.fx.draw(ctx, this.img, -off);
  }
}
