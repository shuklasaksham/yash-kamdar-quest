// Unified input: keyboard and on-screen (touch/mouse) buttons map to the same actions.

export type Action = "left" | "right" | "up" | "down" | "act" | "back" | "menu";

const KEYS: Record<string, Action> = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  KeyE: "act", Enter: "act", Space: "act",
  Escape: "menu", KeyP: "menu",
  Backspace: "back", KeyB: "back",
};

type Listener = (a: Action) => void;

export class Input {
  private held = new Set<Action>();
  private listeners: Listener[] = [];

  constructor() {
    addEventListener("keydown", (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      // let typing/clicking inside real form controls behave normally
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      // Enter/Space on a focused button or link should activate that control, not the game
      if (a === "act" && (t?.tagName === "BUTTON" || t?.tagName === "A")) return;
      e.preventDefault();
      if (!e.repeat) this.press(a);
      this.held.add(a);
    });
    addEventListener("keyup", (e) => {
      const a = KEYS[e.code];
      if (a) this.held.delete(a);
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
