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
  private panelTabs = $("#panel-tabs");
  private panelStatus = $("#panel-status");
  private tab: TabId = "about";
  private lastFocus: Element | null = null;

  private menuEl = $("#menu");
  private menuList = $("#menu-list");
  private titleEl = $("#title");
  private titleList = $("#title-list");
  private listSel = 0;
  private listItems: MenuItem[] = [];
  private listPick: ((id: string) => void) | null = null;

  /** Called when the player asks to fight a section's guardian from inside the panel. */
  onFight: (s: SectionId) => void = () => {};
  /** Which guardians are already beaten (for the panel status line + HUD). */
  defeated = new Set<SectionId>();

  constructor() {
    this.dlgAction.addEventListener("click", () => this.dialogueAct());
    $("#panel-close").addEventListener("click", () => this.closePanel());
    $("#panel-prev").addEventListener("click", () => this.stepTab(-1));
    $("#panel-next").addEventListener("click", () => this.stepTab(1));
    this.panel.addEventListener("click", (e) => { if (e.target === this.panel) this.closePanel(); });
    this.panelTabs.innerHTML = TABS.map((t) => `<button role="tab" class="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel-body">${t.label}</button>`).join("");
    this.panelTabs.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
      if (b) this.showTab(b.dataset.tab as TabId);
    });
    this.panelStatus.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-fight]");
      if (b) { const s = b.dataset.fight as SectionId; this.closePanel(); this.onFight(s); }
    });
    this.swipe(this.panelBody, (d) => this.stepTab(d));
    $("#hud-quest").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-open]");
      if (b) this.openPanel(b.dataset.open as TabId);
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

  // ---------------------------------------------------------------- HUD + banner
  showHud(on: boolean) {
    $("#hud").classList.toggle("is-on", on);
    $("#hud-tools").classList.toggle("is-on", on);
  }

  setProgress(defeated: Set<SectionId>) {
    this.defeated = defeated;
    const rows: [SectionId, string][] = [["about", "Defeat the Slime King · About"], ["work", "Defeat the Stone Golem · Work"], ["portfolio", "Defeat the Shadow Knight · Portfolio"]];
    $("#hud-quest").innerHTML = rows.map(([id, label]) =>
      `<li class="${defeated.has(id) ? "done" : ""}"><button data-open="${id}" title="Open ${id}"><i aria-hidden="true"></i>${label}</button></li>`).join("") +
      `<li class="${defeated.size === 3 ? "" : "locked"}"><button data-open="contact"><i aria-hidden="true"></i>??? Find what truly matters</button></li>`;
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
    this.dlgSpeaker.textContent = speaker;
    this.dlgPortrait.src = `${import.meta.env.BASE_URL}sprites/${portrait}.png`;
    this.dlgOnAction = action?.run ?? null;
    this.dlgAction.hidden = !action;
    if (action) this.dlgAction.innerHTML = `<kbd>${action.key}</kbd>${action.label}`;
    this.dlg.classList.add("is-on");
    this.dlg.setAttribute("aria-hidden", "false");
    return new Promise<void>((resolve) => {
      if (reducedMotion()) { this.dlgText.textContent = text; resolve(); return; }
      this.typing = { full: text, shown: 0, done: resolve };
      this.dlgText.textContent = "";
    });
  }

  hideDialogue() {
    this.dlg.classList.remove("is-on");
    this.dlg.setAttribute("aria-hidden", "true");
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
  floatText(text: string, x: number, y: number, kind: "big" | "dmg" | "info" = "big") {
    const el = document.createElement("div");
    el.className = `float float--${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $("#fxtext").appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // ---------------------------------------------------------------- section panel (tabs)
  get panelOpen() { return !this.panel.hidden; }

  openPanel(tab: TabId) {
    this.lastFocus = document.activeElement;
    this.panel.hidden = false;
    requestAnimationFrame(() => this.panel.classList.add("is-on"));
    this.showTab(tab, true);
    sfx.confirm();
    $<HTMLButtonElement>(`#tab-${tab}`).focus({ preventScroll: true });
  }

  async closePanel() {
    if (this.panel.hidden) return;
    this.panel.classList.remove("is-on");
    sfx.select();
    await wait(reducedMotion() ? 0 : 220);
    this.panel.hidden = true;
    (this.lastFocus as HTMLElement | null)?.focus?.({ preventScroll: true });
    this.panelClosed?.();
  }
  panelClosed: (() => void) | null = null;

  private showTab(id: TabId, instant = false) {
    const info = TABS.find((t) => t.id === id)!;
    const changed = id !== this.tab;
    this.tab = id;
    for (const b of this.panelTabs.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
      const on = b.dataset.tab === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    $("#panel-title").textContent = info.title;
    $("#panel-sub").textContent = info.sub;
    const sec = id === "contact" ? null : (id as SectionId);
    this.panelStatus.innerHTML = !sec ? "" : this.defeated.has(sec)
      ? `<span class="ok">✓ Guardian defeated</span>`
      : `<span>The guardian of ${info.label} still stands.</span><button class="btn btn--gold btn--sm" data-fight="${sec}"><kbd>⚔</kbd>Fight it</button>`;
    const render = () => {
      this.panelBody.innerHTML = renderTab(id);
      this.panelBody.scrollTop = 0;
      this.panelBody.setAttribute("aria-labelledby", `tab-${id}`);
    };
    if (instant || reducedMotion() || !changed) { render(); return; }
    sfx.select();
    this.panelBody.classList.add("is-leaving");
    setTimeout(() => { render(); this.panelBody.classList.remove("is-leaving"); }, 140);
  }

  private stepTab(d: number) {
    const i = TABS.findIndex((t) => t.id === this.tab);
    const next = TABS[(i + d + TABS.length) % TABS.length].id;
    this.showTab(next);
    $<HTMLButtonElement>(`#tab-${next}`).focus({ preventScroll: true });
  }

  private swipe(el: HTMLElement, fn: (dir: number) => void) {
    let x0 = 0, y0 = 0, on = false;
    el.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { x0 = e.clientX; y0 = e.clientY; on = true; } });
    el.addEventListener("pointerup", (e) => {
      if (!on) return;
      on = false;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) fn(dx < 0 ? 1 : -1);
    });
  }

  // ---------------------------------------------------------------- menus (title + pause share one list behaviour)
  showTitle(items: MenuItem[], pick: (id: string) => void) {
    this.titleEl.hidden = false;
    document.documentElement.classList.add("in-title");
    requestAnimationFrame(() => this.titleEl.classList.add("is-on"));
    this.renderList(this.titleList, items, pick);
  }

  async hideTitle() {
    this.titleEl.classList.remove("is-on");
    document.documentElement.classList.remove("in-title");
    this.listPick = null;
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
      if (a === "left") this.stepTab(-1);
      else if (a === "right") this.stepTab(1);
      else if (a === "menu" || a === "back") void this.closePanel();
      return true;
    }
    const list = this.menuOpen || !this.titleEl.hidden;
    if (list && this.listPick) {
      const n = this.listItems.length;
      if (a === "up") { this.setListSel((this.listSel - 1 + n) % n); sfx.select(); }
      else if (a === "down") { this.setListSel((this.listSel + 1) % n); sfx.select(); }
      else if (a === "act") { sfx.confirm(); this.listPick(this.listItems[this.listSel].id); }
      else if ((a === "menu" || a === "back") && this.menuOpen) void this.closeMenu();
      return true;
    }
    if (this.dialogueOpen && a === "act" && (this.typing || this.dlgOnAction)) { this.dialogueAct(); return true; }
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
