// Yash: a small platformer controller tuned to feel like a 16-bit Mario game —
// momentum, a run that builds up, skids, variable jump height, coyote time and jump buffering.

import type { SpriteKey } from "../engine/assets";
import type { Input } from "../engine/input";
import { sfx } from "../engine/audio";
import { damp, type Effects } from "./effects";
import { GROUND } from "./world";

export const HERO_W = 18;
export const HERO_H = 50;

const WALK = 100;          // art px / s
const RUN = 172;
const RUN_RAMP = 0.45;     // holding a direction this long breaks into a run (touch-friendly)
const ACCEL = 760;
const TURN = 1900;         // pushing against your momentum: a skid
const FRICTION = 1150;
const AIR_ACCEL = 720;
const AIR_DRAG = 140;
const JUMP_V = 410;
const JUMP_RUN_BONUS = 0.17; // faster runs jump a little higher, like Mario
const G_UP = 1000;           // gravity while rising with jump held
const G_CUT = 2700;          // jump released early: short hop
const G_DOWN = 1650;
const MAX_FALL = 520;
const COYOTE = 0.09;
const BUFFER = 0.13;

const ATTACK_WINDUP = 0.06;
const ATTACK_ACTIVE = 0.17;
const ATTACK_END = 0.27;
const ATTACK_CD = 0.32;

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Solid extends Box { onBump?: () => void }

export const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export class Hero {
  x: number;
  y = GROUND;
  vx = 0;
  vy = 0;
  facing = 1;
  alpha = 1;
  grounded = true;
  /** false during cutscenes, teleports and the victory pose */
  control = true;
  hp = 5;
  readonly maxHp = 5;
  /** invulnerable after a hit */
  inv = 0;
  /** knocked back: no control for a moment */
  stun = 0;
  bounds: [number, number] = [28, 10000];
  /** forced pose for cutscenes */
  pose: "victory" | "teleport" | "walk" | null = null;

  attackT = -1;
  attackHit = false;
  private attackCd = 0;
  private coyote = 0;
  private buffer = 0;
  private holdTime = 0;
  private lastDir = 0;
  private sx = 1;
  private sy = 1;
  private anim = 0;
  private frame = -1;
  private skidding = false;
  private dustT = 0;
  private hitFlash = 0;

  constructor(x: number, private fx: Effects) {
    this.x = x;
  }

  get box(): Box {
    return { x0: this.x - HERO_W / 2, x1: this.x + HERO_W / 2, y0: this.y - HERO_H, y1: this.y };
  }

  /** The sword's reach while the swing is live, else null. */
  get hitbox(): Box | null {
    if (this.attackT < ATTACK_WINDUP || this.attackT > ATTACK_ACTIVE) return null;
    const f = this.facing;
    return { x0: f > 0 ? this.x + 2 : this.x - 48, x1: f > 0 ? this.x + 48 : this.x - 2, y0: this.y - 56, y1: this.y - 4 };
  }

  get canAct() {
    return this.control && this.stun <= 0;
  }

  pressJump() {
    if (this.canAct) this.buffer = BUFFER;
  }

  pressAttack() {
    if (!this.canAct || this.attackCd > 0) return;
    this.attackT = 0;
    this.attackHit = false;
    this.attackCd = ATTACK_CD;
    sfx.swing();
  }

  /** Bounce off an enemy's head. */
  bounce() {
    this.vy = -(JUMP_V * 0.82);
    this.grounded = false;
    this.sx = 0.84;
    this.sy = 1.16;
  }

  /** Take a hit from something at world x `from`. Returns false while invulnerable. */
  hurt(from: number) {
    if (this.inv > 0 || !this.control) return false;
    this.hp = Math.max(0, this.hp - 1);
    this.inv = 1.2;
    this.stun = 0.34;
    this.hitFlash = 0.09;
    this.vx = (this.x < from ? -1 : 1) * 150;
    this.vy = -230;
    this.grounded = false;
    this.attackT = -1;
    sfx.hurt();
    return true;
  }

  heal() {
    this.hp = this.maxHp;
  }

  place(x: number, y = GROUND) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
    this.attackT = -1;
    this.stun = 0;
  }

  update(dt: number, input: Input, solids: Solid[]) {
    this.inv = Math.max(0, this.inv - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.buffer -= dt;
    this.coyote -= dt;
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (this.attackT > ATTACK_END) this.attackT = -1;
    }

    // ------------------------------------------------ horizontal
    const dir = this.canAct ? (input.isHeld("right") ? 1 : 0) - (input.isHeld("left") ? 1 : 0) : 0;
    this.holdTime = dir !== 0 && dir === this.lastDir ? this.holdTime + dt : 0;
    this.lastDir = dir;
    const running = dir !== 0 && (input.isHeld("run") || this.holdTime > RUN_RAMP);
    let max = running ? RUN : WALK;
    if (this.attackT >= 0 && this.grounded) max *= 0.45; // plant your feet to swing
    this.skidding = false;
    if (this.grounded) {
      if (dir !== 0 && this.vx !== 0 && Math.sign(this.vx) !== dir) {
        this.vx = approach(this.vx, 0, TURN * dt);
        this.skidding = Math.abs(this.vx) > 45;
      } else if (dir !== 0) {
        this.vx = Math.abs(this.vx) > max && Math.sign(this.vx) === dir ? approach(this.vx, dir * max, FRICTION * dt) : approach(this.vx, dir * max, ACCEL * dt);
      } else {
        this.vx = approach(this.vx, 0, FRICTION * dt);
      }
    } else if (this.stun <= 0) {
      this.vx = dir !== 0 ? approach(this.vx, dir * Math.max(max, Math.abs(this.vx)), AIR_ACCEL * dt) : approach(this.vx, 0, AIR_DRAG * dt);
    }
    if (dir !== 0 && this.attackT < 0 && this.stun <= 0) this.facing = dir;

    // ------------------------------------------------ jump
    if (this.grounded) this.coyote = COYOTE;
    if (this.buffer > 0 && this.coyote > 0 && this.canAct) {
      this.vy = -(JUMP_V + Math.abs(this.vx) * JUMP_RUN_BONUS);
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.sx = 0.82;
      this.sy = 1.18;
      sfx.jump();
      this.fx.dust(this.x, this.y, Math.sign(this.vx), 5);
    }
    const g = this.vy < 0 ? (input.isHeld("jump") && this.canAct ? G_UP : G_CUT) : G_DOWN;
    this.vy = Math.min(MAX_FALL, this.vy + g * dt);

    // ------------------------------------------------ move + collide (x then y)
    this.x += this.vx * dt;
    if (this.x < this.bounds[0]) { this.x = this.bounds[0]; this.vx = Math.max(0, this.vx); }
    if (this.x > this.bounds[1]) { this.x = this.bounds[1]; this.vx = Math.min(0, this.vx); }
    for (const s of solids) {
      if (!overlaps(this.box, s)) continue;
      if (this.vx > 0 || this.x < (s.x0 + s.x1) / 2) this.x = s.x0 - HERO_W / 2;
      else this.x = s.x1 + HERO_W / 2;
      this.vx = 0;
    }

    const prevY = this.y;
    const wasGrounded = this.grounded;
    const fallSpeed = this.vy;
    this.y += this.vy * dt;
    this.grounded = false;
    let landed = false;
    if (this.y >= GROUND) { this.y = GROUND; landed = true; }
    for (const s of solids) {
      if (!overlaps(this.box, s)) continue;
      if (this.vy >= 0 && prevY <= s.y0 + 0.5) {
        this.y = s.y0;
        landed = true;
      } else if (this.vy < 0 && prevY - HERO_H >= s.y1 - 2) {
        this.y = s.y1 + HERO_H;
        this.vy = 40;
        s.onBump?.();
      }
    }
    if (landed) {
      this.vy = 0;
      this.grounded = true;
      if (!wasGrounded) {
        const impact = Math.min(1, fallSpeed / MAX_FALL);
        this.sx = 1 + 0.22 * impact;
        this.sy = 1 - 0.2 * impact;
        if (impact > 0.3) { sfx.land(); this.fx.dust(this.x, this.y, 0, 6); }
      }
    }

    // ------------------------------------------------ juice
    this.sx += (1 - this.sx) * damp(13, dt);
    this.sy += (1 - this.sy) * damp(13, dt);
    this.dustT -= dt;
    if (this.grounded && this.dustT <= 0 && (this.skidding || Math.abs(this.vx) > WALK + 20)) {
      this.fx.dust(this.x - Math.sign(this.vx) * 4, this.y, Math.sign(this.vx), this.skidding ? 3 : 1);
      if (this.skidding) sfx.skid();
      this.dustT = this.skidding ? 0.09 : 0.16;
    }
  }

  /** Walk-cycle only, for scripted walks where x is tweened (ending, teleports). */
  animate(dt: number, speed: number) {
    this.anim += (dt * speed) / 12;
  }

  sprite(dt: number): SpriteKey {
    if (this.pose === "victory") return "hero-victory";
    if (this.pose === "teleport") return "hero-teleport";
    if (this.pose === "walk") return this.cycle(["hero-walk1", "hero-idle", "hero-walk2", "hero-idle"]);
    if (this.stun > 0) return "hero-hurt";
    if (this.attackT >= 0) return this.attackT < ATTACK_WINDUP ? "hero-windup" : "hero-slash";
    if (!this.grounded) return this.vy < 60 ? "hero-jump" : "hero-fall";
    if (this.skidding) return "hero-skid";
    const speed = Math.abs(this.vx);
    if (speed > 8) {
      this.anim += (dt * Math.max(speed, 50)) / (speed > WALK + 10 ? 13 : 11);
      return speed > WALK + 10
        ? this.cycle(["hero-run1", "hero-walk1", "hero-run2", "hero-walk2"])
        : this.cycle(["hero-walk1", "hero-idle", "hero-walk2", "hero-idle"]);
    }
    this.anim += dt * 1.6;
    this.frame = -1;
    return Math.floor(this.anim) % 2 ? "hero-idle2" : "hero-idle";
  }

  private cycle(frames: SpriteKey[]): SpriteKey {
    const f = Math.floor(this.anim) % frames.length;
    if (f !== this.frame && f % 2 === 0 && this.grounded) sfx.step();
    this.frame = f;
    return frames[f];
  }

  /** Draw state that the renderer needs beyond the sprite key. */
  look() {
    const blink = this.inv > 0 && this.control && Math.floor(this.inv * 14) % 2 === 0;
    return {
      // a skid keeps facing the old direction of travel, feet planted forward
      flip: this.skidding ? this.vx < 0 : this.facing < 0,
      alpha: this.alpha * (blink ? 0.3 : 1),
      sx: this.sx,
      sy: this.sy,
      tint: this.hitFlash > 0 ? "#ffffff" : undefined,
    };
  }
}
