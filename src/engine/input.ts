// Unified input: keyboard and on-screen (touch/mouse) buttons map to the same actions.
// One key can drive several actions — Space jumps in play and confirms in menus.

export type Action = "left" | "right" | "up" | "down" | "jump" | "attack" | "run" | "act" | "confirm" | "back" | "menu";

const KEYS: Record<string, Action[]> = {
  ArrowLeft: ["left"], KeyA: ["left"],
  ArrowRight: ["right"], KeyD: ["right"],
  ArrowUp: ["up", "jump"], KeyW: ["up", "jump"],
  ArrowDown: ["down"], KeyS: ["down"],
  Space: ["jump", "act"], KeyZ: ["jump"], KeyK: ["jump"],
  KeyJ: ["attack"], KeyX: ["attack"], KeyE: ["attack"],
  ShiftLeft: ["run"], ShiftRight: ["run"],
  Enter: ["act", "confirm"], NumpadEnter: ["act", "confirm"],
  Escape: ["menu"], KeyP: ["menu"],
  Backspace: ["back"], KeyB: ["back"],
};

type Listener = (a: Action) => void;

export class Input {
  private held = new Set<Action>();
  private listeners: Listener[] = [];

  constructor() {
    addEventListener("keydown", (e) => {
      const actions = KEYS[e.code];
      if (!actions) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      // Enter/Space on a focused control inside a window (panel, menu, credits) activates that control
      const control = t?.tagName === "BUTTON" || t?.tagName === "A";
      if (control && (e.code === "Enter" || e.code === "Space")) {
        if (t!.closest(".modal, .title, .credits, .dialogue")) return;
        t!.blur(); // a HUD button keeps focus after a click; give the keys back to the game
      }
      e.preventDefault();
      for (const a of actions) {
        if (!e.repeat) this.press(a);
        this.held.add(a);
      }
    });
    addEventListener("keyup", (e) => {
      for (const a of KEYS[e.code] ?? []) this.held.delete(a);
    });
    addEventListener("blur", () => this.held.clear());
  }

  /** Wire an on-screen button: holding it holds the action, tapping it fires it once. */
  bindButton(el: HTMLElement, a: Action) {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add("is-down");
      this.held.add(a);
      this.press(a);
    };
    const up = () => {
      el.classList.remove("is-down");
      this.held.delete(a);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  isHeld(a: Action) {
    return this.held.has(a);
  }

  onPress(fn: Listener) {
    this.listeners.push(fn);
  }

  private press(a: Action) {
    for (const fn of this.listeners) fn(a);
  }
}
