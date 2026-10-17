import type { Action } from "../engine/input";
import { sfx } from "../engine/audio";
import type { SectionId } from "../content";
import { TABS, renderTab, type TabId } from "./sections";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface MenuItem { id: string; label: string; sub?: string }

/** Owns every DOM element layered over (or under) the canvas. */
export class UI {
  private dlg = $("#dialogue");
  private dlgText = $("#dialogue-text");
  private dlgSpeaker = $("#dialogue-speaker");
  private dlgPortrait = $<HTMLImageElement>("#dialogue-portrait");
  private dlgAction = $<HTMLButtonElement>("#dialogue-action");
  private typing: { full: string; shown: number; done: () => void } | null = null;
  private dlgOnAction: (() => void) | null = null;

  private panel = $("#panel");
  private panelBody = $("#panel-body");
  private lastFocus: Element | null = null;

  private menuEl = $("#menu");
  private menuList = $("#menu-list");
  private titleEl = $("#title");
  private titleList = $("#title-list");
  private listSel = 0;
  private listItems: MenuItem[] = [];
  private listPick: ((id: string) => void) | null = null;
  private listBack: (() => void) | null = null;

  /** The HUD quest log was clicked. */
  onQuest: (id: TabId) => void = () => {};
  /** Called once each time the section panel finishes closing. */
  panelClosed: (() => void) | null = null;

  constructor() {
    this.dlgAction.addEventListener("click", () => this.dialogueAct());
    $("#panel-close").addEventListener("click", () => void this.closePanel());
    $("#panel-done").addEventListener("click", () => void this.closePanel());
    this.panel.addEventListener("click", (e) => { if (e.target === this.panel) void this.closePanel(); });
    $("#hud-quest").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-quest]");
      if (b) { b.blur(); this.onQuest(b.dataset.quest as TabId); }
    });
    this.menuList.addEventListener("click", (e) => this.listClick(e));
    this.titleList.addEventListener("click", (e) => this.listClick(e));
    for (const list of [this.menuList, this.titleList]) {
      list.addEventListener("pointerover", (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-id]");
        if (b) this.setListSel(Number(b.dataset.index));
      });
    }
  }

  // ---------------------------------------------------------------- HUD, boss bar, hints, banner
  showHud(on: boolean) {
    $("#hud").classList.toggle("is-on", on);
    $("#hud-tools").classList.toggle("is-on", on);
  }

  setProgress(defeated: Set<SectionId>) {
    const rows: [SectionId, string, string][] = [
      ["about", "Defeat the Slime King · About", "Read · About"],
      ["work", "Defeat the Stone Golem · Work", "Read · Work"],
      ["portfolio", "Defeat the Shadow Knight · Portfolio", "Read · Portfolio"],
    ];
    const all = defeated.size === rows.length;
    $("#hud-quest").innerHTML = rows.map(([id, todo, done]) => {
      const won = defeated.has(id);
      return `<li class="${won ? "done" : ""}"><button data-quest="${id}" title="${won ? "Read it again" : "Teleport to this guardian"}"><i aria-hidden="true"></i>${won ? done : todo}</button></li>`;
    }).join("") +
      `<li class="${all ? "" : "locked"}"><button data-quest="contact"><i aria-hidden="true"></i>${all ? "Head east · find what truly matters" : "??? Find what truly matters"}</button></li>`;
  }

  setHearts(hp: number, max: number) {
    const el = $("#hud-hearts");
    const lost = Number(el.dataset.hp ?? max) > hp;
    el.dataset.hp = String(hp);
    el.setAttribute("aria-label", `${hp} of ${max} hearts`);
    el.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < hp ? "" : "is-empty"}">♥</span>`).join("");
    if (lost) this.pulse(el, "is-hit");
  }

  setCoins(n: number) {
    const el = $("#hud-coins");
    el.textContent = `×${String(n).padStart(2, "0")}`;
    if (n > 0) this.pulse(el, "is-bump");
  }

  private pulse(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** The guardian health bar; pass null to hide it. */
  boss(name: string | null, hp = 0, max = 1) {
    const el = $("#boss");
    if (!name) { el.classList.remove("is-on"); return; }
    $("#boss-name").textContent = name;
    const pct = `${Math.max(0, hp / max) * 100}%`;
    $("#boss-fill").style.width = pct;
    $("#boss-lag").style.width = pct;
    el.classList.add("is-on");
  }

  hint(text: string | null) {
    const el = $("#hint");
    if (text) { el.textContent = text; el.classList.add("is-on"); }
    else el.classList.remove("is-on");
  }

  private bannerTimer = 0;
  banner(name: string, sub: string) {
    const el = $("#banner");
    el.innerHTML = `<strong>${name}</strong><span>${sub}</span>`;
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.classList.add("is-on");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.remove("is-on"), 2600);
  }

  // ---------------------------------------------------------------- dialogue
  say(speaker: string, portrait: string, text: string, action?: { label: string; key: string; run: () => void }) {
    this.typing?.done();
    this.dlgSpeaker.textContent = speaker;
    this.dlgPortrait.src = `${import.meta.env.BASE_URL}sprites/${portrait}.png`;
    this.dlgOnAction = action?.run ?? null;
    this.dlgAction.hidden = !action;
    if (action) this.dlgAction.innerHTML = `<kbd>${action.key}</kbd>${action.label}`;
    this.dlg.classList.add("is-on");
    this.dlg.setAttribute("aria-hidden", "false");
    return new Promise<void>((resolve) => {
      if (reducedMotion()) { this.typing = null; this.dlgText.textContent = text; resolve(); return; }
      this.typing = { full: text, shown: 0, done: resolve };
      this.dlgText.textContent = "";
    });
  }

  hideDialogue() {
    this.dlg.classList.remove("is-on");
    this.dlg.setAttribute("aria-hidden", "true");
    this.typing?.done();
    this.typing = null;
    this.dlgOnAction = null;
  }

  get dialogueOpen() { return this.dlg.classList.contains("is-on"); }

  private dialogueAct() {
    if (this.typing) { this.finishTyping(); return; }
    const fn = this.dlgOnAction;
    if (fn) { sfx.confirm(); fn(); }
  }

  private finishTyping() {
    if (!this.typing) return;
    this.dlgText.textContent = this.typing.full;
    const done = this.typing.done;
    this.typing = null;
    done();
  }

  /** Advance the typewriter; called from the game loop so it pauses with the game. */
  tick(dt: number) {
    if (!this.typing) return;
    const before = Math.floor(this.typing.shown);
    this.typing.shown += dt * 52;
    const n = Math.floor(this.typing.shown);
    if (n !== before) {
      this.dlgText.textContent = this.typing.full.slice(0, n);
      if (n % 3 === 0) sfx.blip();
    }
    if (n >= this.typing.full.length) this.finishTyping();
  }

  // ---------------------------------------------------------------- floating combat text
  floatText(text: string, x: number, y: number, kind: "big" | "dmg" | "info" | "hurt" = "big") {
    const el = document.createElement("div");
    el.className = `float float--${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $("#fxtext").appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // ---------------------------------------------------------------- section panel: one earned section at a time
  get panelOpen() { return !this.panel.hidden; }

  openPanel(id: TabId) {
    const info = TABS.find((t) => t.id === id)!;
    this.lastFocus = document.activeElement;
    $("#panel-title").textContent = info.title;
    $("#panel-sub").textContent = info.sub;
    this.panelBody.innerHTML = renderTab(id);
    this.panelBody.scrollTop = 0;
    this.panel.hidden = false;
    requestAnimationFrame(() => this.panel.classList.add("is-on"));
    sfx.confirm();
    this.panelBody.focus({ preventScroll: true });
  }

  async closePanel() {
    if (this.panel.hidden || !this.panel.classList.contains("is-on")) return;
    this.panel.classList.remove("is-on");
    sfx.select();
    await wait(reducedMotion() ? 0 : 220);
    this.panel.hidden = true;
    (this.lastFocus as HTMLElement | null)?.focus?.({ preventScroll: true });
    this.panelClosed?.();
  }

  // ---------------------------------------------------------------- menus (title + pause share one list behaviour)
  showTitle(items: MenuItem[], pick: (id: string) => void, back: (() => void) | null = null) {
    this.titleEl.hidden = false;
    document.documentElement.classList.add("in-title");
    requestAnimationFrame(() => this.titleEl.classList.add("is-on"));
    this.renderList(this.titleList, items, pick);
    this.listBack = back;
  }

  async hideTitle() {
    this.titleEl.classList.remove("is-on");
    document.documentElement.classList.remove("in-title");
    this.listPick = null;
    this.listBack = null;
    await wait(reducedMotion() ? 0 : 400);
    this.titleEl.hidden = true;
  }

  get menuOpen() { return !this.menuEl.hidden; }

  openMenu(items: MenuItem[], pick: (id: string) => void) {
    this.menuEl.hidden = false;
    requestAnimationFrame(() => this.menuEl.classList.add("is-on"));
    this.renderList(this.menuList, items, pick);
    sfx.select();
  }

  async closeMenu() {
    this.menuEl.classList.remove("is-on");
    await wait(reducedMotion() ? 0 : 200);
    this.menuEl.hidden = true;
  }

  private renderList(list: HTMLElement, items: MenuItem[], pick: (id: string) => void) {
    this.listItems = items;
    this.listPick = pick;
    list.innerHTML = items.map((it, i) =>
      `<li><button class="menu-item" data-id="${it.id}" data-index="${i}"><span class="cursor" aria-hidden="true"></span><span class="menu-item__label">${it.label}</span>${it.sub ? `<span class="menu-item__sub">${it.sub}</span>` : ""}</button></li>`).join("");
    this.setListSel(0, list);
  }

  private activeList() { return this.menuOpen ? this.menuList : this.titleList; }

  private setListSel(i: number, list = this.activeList()) {
    this.listSel = i;
    list.querySelectorAll(".menu-item").forEach((b, j) => b.classList.toggle("is-sel", j === i));
  }

  private listClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-id]");
    if (b && this.listPick) { sfx.confirm(); this.listPick(b.dataset.id!); }
  }

  // ---------------------------------------------------------------- routing input to whatever UI has focus
  /** Returns true when a UI layer consumed the action. */
  handle(a: Action): boolean {
    if (this.panelOpen) {
      // a panel shows one section; the only way out is back to the game
      if (a === "menu" || a === "back") void this.closePanel();
      return true;
    }
    const list = this.menuOpen || !this.titleEl.hidden;
    if (list && this.listPick) {
      const n = this.listItems.length;
      if (a === "up") { this.setListSel((this.listSel - 1 + n) % n); sfx.select(); }
      else if (a === "down") { this.setListSel((this.listSel + 1) % n); sfx.select(); }
      else if (a === "act") { sfx.confirm(); this.listPick(this.listItems[this.listSel].id); }
      else if ((a === "menu" || a === "back") && this.menuOpen) void this.closeMenu();
      else if (a === "back" && this.listBack) { sfx.select(); this.listBack(); }
      return true;
    }
    if (this.dialogueOpen && a === "confirm" && (this.typing || this.dlgOnAction)) { this.dialogueAct(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- fades, loading, credits
  async fade(to: 0 | 1, ms = 450) {
    const el = $("#fade");
    el.style.transitionDuration = `${reducedMotion() ? 0 : ms}ms`;
    el.classList.toggle("is-on", to === 1);
    await wait(reducedMotion() ? 0 : ms);
  }

  async flash(color: string, ms = 520) {
    const el = $("#flash");
    el.style.background = color;
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.style.animationDuration = `${ms}ms`;
    el.classList.add("is-on");
  }

  loading(done: number, total: number) {
    $("#loading-bar").style.transform = `scaleX(${done / total})`;
  }

  async hideLoading() {
    const el = $("#loading");
    el.classList.add("is-off");
    await wait(500);
    el.remove();
  }

  showCredits(on: boolean) {
    const el = $("#credits");
    if (on) { el.hidden = false; requestAnimationFrame(() => el.classList.add("is-on")); }
    else { el.classList.remove("is-on"); el.hidden = true; }
  }

  setMuted(m: boolean) {
    const b = $("#btn-mute");
    b.setAttribute("aria-pressed", String(m));
    b.innerHTML = m ? "♪ OFF" : "♪ ON";
  }
}
