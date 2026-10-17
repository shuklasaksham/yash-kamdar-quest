// The three guardians. Each has telegraphed attacks you can read and jump over:
//   Slime King    — harmless hopper, a warm-up (hit it or bop its head)
//   Stone Golem   — ground slams that send quakes along the floor
//   Shadow Knight — sword waves and full-arena dash attacks

import type { SpriteKey } from "../engine/assets";
import { sfx } from "../engine/audio";
import type { Effects } from "./effects";
import { overlaps, type Box, type Hero } from "./hero";
import { GROUND, type GuardianDef } from "./world";

export interface Shot { kind: "quake" | "wave"; x: number; vx: number; w: number; h: number; t: number }

type State = "idle" | "intro" | "rest" | "squat" | "hop" | "walk" | "windup" | "slam" | "recover"
  | "stalk" | "waveWind" | "dashWind" | "dash" | "brake" | "evade";

const SLIME_HOP_V = 250;

export class Guardian {
  hp: number;
  x: number;
  y = GROUND;
  vx = 0;
  vy = 0;
  facing = -1;
  alive = true;
  /** fight in progress */
  active = false;
  hurtT = 0;
  private inv = 0;
  state: State = "idle";
  private t = 0;
  private next = 1;
  private step = 0;
  private queued = 0;
  /** golem: quick hits make it slam sooner */
  private rage = 0;
  /** knight: how long the hero has been crowding it */
  private crowd = 0;
  /** 0..1 how wound-up the current attack is, for drawing */
  tele = 0;
  lift = 0;
  trail: number[] = [];
  shots: Shot[] = [];
  chest: "none" | "closed" | "open" = "none";
  chestX = 0;
  chestDrop = 0;

  constructor(readonly def: GuardianDef, private fx: Effects) {
    this.hp = def.hp;
    this.x = def.x;
  }

  get body(): Box {
    const [w, h] = this.def.body;
    return { x0: this.x - w / 2, x1: this.x + w / 2, y0: this.y - h, y1: this.y };
  }

  get low() {
    return this.hp <= Math.ceil(this.def.hp / 2);
  }

  /** Back to the starting spot; damage already dealt is kept. */
  regroup() {
    this.x = this.def.x;
    this.y = GROUND;
    this.vx = this.vy = 0;
    this.facing = -1;
    this.shots = [];
    this.trail = [];
    this.tele = this.lift = 0;
    this.go("intro", 1.2);
  }

  begin(introSeconds: number) {
    this.active = true;
    this.go("intro", introSeconds);
  }

  stop() {
    this.active = false;
    this.shots = [];
    this.trail = [];
    this.tele = this.lift = 0;
    this.go("idle", 1);
  }

  private go(s: State, next = 1) {
    this.state = s;
    this.t = 0;
    this.next = next;
  }

  /** Apply one point of damage from direction `dir`. Returns true if this hit was accepted. */
  hit(dir: number) {
    if (this.inv > 0 || !this.alive) return false;
    this.hp -= 1;
    this.inv = 0.28;
    this.hurtT = 0.24;
    if (this.def.kind === "slime") {
      this.vx = dir * 120;
      if (this.y >= GROUND) { this.vy = -140; this.go("hop"); }
    } else if (this.def.kind === "golem") {
      this.vx = dir * 26;
      this.rage += 1;
      if (this.rage >= 2 && this.hp > 0 && (this.state === "walk" || this.state === "recover")) {
        this.rage = 0;
        this.go("windup", 0.38);
        sfx.rumble();
      }
    } else if (this.state !== "dash" && this.state !== "evade" && this.hp > 0) {
      this.backstep(dir);
    }
    return true;
  }

  update(dt: number, hero: Hero) {
    this.inv = Math.max(0, this.inv - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.rage = Math.max(0, this.rage - dt * 0.6);
    this.t += dt;
    const [a0, a1] = this.def.arena;
    const toHero = Math.sign(hero.x - this.x) || -1;

    if (this.active) {
      if (this.def.kind === "slime") this.slime(dt, toHero);
      else if (this.def.kind === "golem") this.golem(dt, hero, toHero);
      else this.knight(dt, hero, toHero);
    }

    // shared physics: gravity for hops, friction for slides, stay inside the arena
    if (this.y < GROUND || this.vy < 0) {
      this.vy += 900 * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND) {
        this.y = GROUND;
        this.vy = 0;
        if (this.def.kind === "slime") { this.fx.dust(this.x, GROUND, 0, 6); sfx.land(); this.go("rest", this.low ? 0.5 : 0.9 + Math.random() * 0.5); }
      }
    }
    this.x += this.vx * dt;
    if (this.state !== "dash" && this.state !== "hop" && this.y >= GROUND) this.vx -= this.vx * Math.min(1, dt * 7);
    else if (this.state === "evade" && this.y >= GROUND) this.vx = 0;
    const half = this.def.body[0] / 2;
    if (this.x < a0 + half) { this.x = a0 + half; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > a1 - half) { this.x = a1 - half; this.vx = -Math.abs(this.vx) * 0.3; }

    // projectiles
    for (const s of this.shots) {
      s.t += dt;
      s.x += s.vx * dt;
      if (s.kind === "quake" && Math.random() < dt * 30) this.fx.dust(s.x, GROUND, Math.sign(s.vx), 1);
    }
    this.shots = this.shots.filter((s) => s.x > a0 - 10 && s.x < a1 + 10);
    if (this.trail.length && this.state !== "dash") this.trail.shift();
  }

  shotBox(s: Shot): Box {
    return { x0: s.x - s.w / 2, x1: s.x + s.w / 2, y0: GROUND - s.h, y1: GROUND };
  }

  /** Does anything this guardian controls touch the hero? Returns the source x, or null. */
  touching(hero: Hero): number | null {
    const hb = hero.box;
    for (const s of this.shots) if (overlaps(hb, this.shotBox(s))) return s.x;
    return overlaps(hb, this.body) ? this.x : null;
  }

  // ------------------------------------------------------------ Slime King
  private slime(dt: number, toHero: number) {
    if (this.state === "intro" && this.t > this.next) this.go("rest", 0.6);
    else if (this.state === "rest" && this.t > this.next) this.go("squat", 0.22);
    else if (this.state === "squat" && this.t > this.next) {
      // hop around the arena, loosely toward the hero but never landing exactly on them
      const dir = Math.random() < 0.65 ? toHero : -toHero;
      this.vx = dir * (55 + Math.random() * 45);
      this.vy = -SLIME_HOP_V * (0.75 + Math.random() * 0.35);
      this.facing = dir;
      this.go("hop");
    }
    void dt;
  }

  // ------------------------------------------------------------ Stone Golem
  private golem(dt: number, hero: Hero, toHero: number) {
    this.facing = this.state === "windup" || this.state === "slam" ? this.facing : toHero;
    switch (this.state) {
      case "intro":
        if (this.t > this.next) this.go("walk", 1.3);
        break;
      case "walk":
        if (Math.abs(hero.x - this.x) > 64) this.vx = toHero * 28;
        if (this.t > this.next) { this.go("windup", this.low ? 0.5 : 0.65); sfx.rumble(); }
        break;
      case "windup":
        this.tele = Math.min(1, this.t / this.next);
        this.lift = Math.round(this.tele * 7);
        if (this.t > this.next) this.slam();
        break;
      case "slam":
        this.lift = Math.max(0, this.lift - dt * 120);
        if (this.queued > 0 && this.t > 0.42) { this.queued--; this.slam(); }
        else if (this.t > 0.3 && this.queued === 0) this.go("recover", this.low ? 0.7 : 1.0);
        break;
      case "recover":
        this.tele = 0;
        if (this.t > this.next) this.go("walk", 1.1 + Math.random() * 0.6);
        break;
    }
  }

  private slam() {
    const wasWindup = this.state === "windup";
    this.go("slam");
    this.tele = 0;
    this.lift = 0;
    sfx.quake();
    this.fx.kick(4);
    this.fx.dust(this.x - 18, GROUND, 1, 8);
    this.fx.dust(this.x + 18, GROUND, -1, 8);
    for (const d of [-1, 1]) this.shots.push({ kind: "quake", x: this.x + d * 26, vx: d * 150, w: 14, h: 15, t: 0 });
    if (wasWindup && this.low) this.queued = 1;
  }

  // ------------------------------------------------------------ Shadow Knight
  private knight(dt: number, hero: Hero, toHero: number) {
    const pattern = ["wave", "dash", "wave", "wave", "dash"];
    switch (this.state) {
      case "intro":
        if (this.t > this.next) this.go("stalk", 0.9);
        break;
      case "stalk": {
        this.facing = toHero;
        // hold a duelling distance; crowd it and it flips away, then counters
        const gap = Math.abs(hero.x - this.x);
        this.crowd = gap < 60 ? this.crowd + dt : 0;
        if (this.crowd > 0.35) { this.crowd = 0; this.backstep(-toHero); break; }
        this.vx = gap < 90 ? -toHero * 46 : gap > 150 ? toHero * 46 : 0;
        if (this.t > this.next) {
          const move = pattern[this.step++ % pattern.length];
          if (move === "dash") { this.go("dashWind", this.low ? 0.5 : 0.62); sfx.charge(); }
          else { this.go("waveWind", this.low ? 0.36 : 0.46); this.queued = this.low ? 1 : 0; sfx.charge(); }
        }
        break;
      }
      case "waveWind":
        this.tele = Math.min(1, this.t / this.next);
        if (this.t > this.next) {
          this.shots.push({ kind: "wave", x: this.x + this.facing * 22, vx: this.facing * 205, w: 14, h: 22, t: 0 });
          sfx.wave();
          if (this.queued > 0) { this.queued--; this.go("waveWind", 0.34); }
          else { this.tele = 0; this.go("recover", 0.55); }
        }
        break;
      case "dashWind":
        this.facing = toHero;
        this.tele = Math.min(1, this.t / this.next);
        this.vx = -this.facing * 18; // draw back before lunging
        if (this.t > this.next) {
          this.go("dash");
          this.tele = 0;
          this.vx = this.facing * (this.low ? 400 : 340);
          this.next = hero.x + this.facing * 90; // run through the hero's spot
          sfx.dash();
        }
        break;
      case "dash": {
        this.trail.push(this.x);
        if (this.trail.length > 5) this.trail.shift();
        const [a0, a1] = this.def.arena;
        const half = this.def.body[0] / 2;
        const past = this.facing > 0 ? this.x >= this.next : this.x <= this.next;
        const wall = this.x <= a0 + half + 1 || this.x >= a1 - half - 1;
        if (past || wall || this.t > 1.2) this.go("brake");
        break;
      }
      case "brake":
        this.vx -= this.vx * Math.min(1, dt * 9);
        if (Math.random() < dt * 40) this.fx.dust(this.x, GROUND, Math.sign(this.vx), 1);
        if (Math.abs(this.vx) < 12) this.go("recover", 0.6);
        break;
      case "evade":
        // back-flip away, then punish whoever chased
        if (this.y >= GROUND && this.vy === 0 && this.t > 0.1) {
          this.facing = toHero;
          if (this.step++ % 2) { this.go("dashWind", 0.45); sfx.charge(); }
          else { this.go("waveWind", 0.32); this.queued = this.low ? 1 : 0; sfx.charge(); }
        }
        break;
      case "recover":
        this.tele = 0;
        if (this.t > this.next) this.go("stalk", 0.7 + Math.random() * 0.5);
        break;
    }
  }

  private backstep(away: number) {
    this.go("evade");
    this.vy = -270;
    this.vx = away * 150;
    this.facing = -away;
    this.tele = 0;
    sfx.jump();
  }

  // ------------------------------------------------------------ drawing helpers
  sprite(time: number): { key: SpriteKey; sx: number; sy: number; dy: number } {
    const k = this.def.kind;
    if (this.hurtT > 0) return { key: `${k}-hurt` as SpriteKey, sx: 1, sy: 1, dy: 0 };
    if (k === "slime") {
      if (this.state === "squat") return { key: "slime-squash", sx: 1.12, sy: 0.86, dy: 0 };
      if (this.y < GROUND) { const s = Math.max(-1, Math.min(1, this.vy / 260)); return { key: "slime", sx: 1 - s * 0.1, sy: 1 + Math.abs(s) * 0.12, dy: 0 }; }
      return { key: Math.floor(time * 2.4) % 2 ? "slime-squash" : "slime", sx: 1, sy: 1, dy: 0 };
    }
    if (k === "golem") {
      const bob = this.state === "walk" ? Math.round(Math.abs(Math.sin(time * 6)) * -2) : Math.round(Math.sin(time * 2.2));
      return { key: "golem", sx: 1 + this.tele * 0.04, sy: 1 + this.tele * 0.06, dy: bob - this.lift };
    }
    const crouch = this.state === "dashWind" ? this.tele : 0;
    return { key: "knight", sx: 1 + crouch * 0.06, sy: 1 - crouch * 0.08, dy: this.state === "dash" ? 0 : Math.round(Math.sin(time * 2.4)) };
  }
}
