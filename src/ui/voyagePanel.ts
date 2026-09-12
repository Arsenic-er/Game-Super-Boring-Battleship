import type { GameLocale } from "../i18n/gameLocale";
import { formatGameNumber, translateGameText } from "../i18n/gameLocale";
import { voyageText, type VoyageMessageKey } from "../i18n/voyageLocale";

export type VoyageStep = "move" | "aim" | "fire" | "objective";
export interface VoyageResultView {
  status: "player-won" | "enemy-won" | "draw";
  reason: string;
  durationSeconds: number;
  damageDealt: number;
  shellHits: number;
  torpedoHits: number;
  shipsSunk: number;
  playerScore: number;
  enemyScore: number;
  reward?: { credits: number; researchPoints: number; steel: number; parts: number; supplyTokens: number };
  balances?: { credits: number; researchPoints: number; steel: number; parts: number; supplyTokens: number };
  saveState: "saved" | "pending" | "ineligible";
}

const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]!));

export function voyageResultMarkup(result: VoyageResultView, locale: GameLocale): string {
  const t = (key: VoyageMessageKey) => escape(voyageText(locale, key));
  const n = (value: number) => formatGameNumber(Math.max(0, Math.round(value)), locale);
  const values: [VoyageMessageKey, string][] = [
    ["duration", `${Math.floor(result.durationSeconds / 60)}:${String(Math.floor(result.durationSeconds % 60)).padStart(2, "0")}`],
    ["damage", n(result.damageDealt)], ["shellHits", n(result.shellHits)],
    ["torpedoHits", n(result.torpedoHits)], ["shipsSunk", n(result.shipsSunk)],
    ["teamScore", `${n(result.playerScore)} / ${n(result.enemyScore)}`],
  ];
  const economy: [VoyageMessageKey, keyof NonNullable<VoyageResultView["reward"]>][] = [
    ["credits", "credits"], ["researchPoints", "researchPoints"], ["steel", "steel"],
    ["parts", "parts"], ["supplyTokens", "supplyTokens"],
  ];
  return `<p class="eyebrow">${t("battleReport")}</p><h1>${t(result.status === "player-won" ? "victory" : result.status === "enemy-won" ? "defeat" : "draw")}</h1>
    <p>${escape(translateGameText(result.reason, locale))}</p>
    <dl class="voyage-stats">${values.map(([key, value]) => `<div><dt>${t(key)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>
    ${result.reward ? `<table class="voyage-economy"><thead><tr><th></th><th>${t("reward")}</th><th>${t("balance")}</th></tr></thead><tbody>${economy.map(([key, field]) => `<tr><th>${t(key)}</th><td>+${n(result.reward![field])}</td><td>${result.saveState === "saved" && result.balances ? n(result.balances[field]) : "—"}</td></tr>`).join("")}</tbody></table>` : ""}
    <p class="voyage-save-state" role="status">${t(result.saveState === "saved" ? "saved" : result.saveState === "pending" ? "savePending" : "noRewards")}</p>
    ${result.saveState === "pending" ? `<p class="voyage-warning">${t("sessionOnly")}</p><button data-voyage="retry">${t("retrySave")}</button>` : ""}
    <div class="voyage-actions"><button data-voyage="again" ${result.saveState === "pending" ? "disabled" : ""}>${t("playAgain")}</button><button data-voyage="dock">${t("returnDock")}</button><button data-voyage="menu">${t("returnMenu")}</button></div>`;
}

export class VoyagePanel {
  private readonly briefing: HTMLElement;
  private readonly tutorial: HTMLElement;
  private readonly result: HTMLElement;
  private readonly pending: HTMLElement;
  private readonly notice: HTMLElement;
  private step: VoyageStep | null = null;
  private resultView?: VoyageResultView;
  private pendingVisible = false;
  private noticeKey?: VoyageMessageKey;
  private briefingActions?: { begin: () => void; skip: () => void };
  private previousFocus?: HTMLElement;

  constructor(private readonly parent: HTMLElement, private locale: GameLocale,
    private readonly callbacks: { skip: () => void; retry: () => void; again: () => void; dock: () => void; menu: () => void }) {
    this.briefing = this.create("voyage-modal voyage-briefing", "dialog");
    this.briefing.setAttribute("aria-modal", "true");
    this.tutorial = this.create("voyage-tutorial", "status");
    this.result = this.create("voyage-modal voyage-result", "dialog");
    this.result.setAttribute("aria-modal", "true");
    this.pending = this.create("voyage-pending", "status");
    new ResizeObserver(() => {
      const height = this.pending.hidden ? 0 : Math.ceil(this.pending.getBoundingClientRect().height) + 24;
      this.parent.style.setProperty("--voyage-pending-height", `${height}px`);
    }).observe(this.pending);
    this.notice = this.create("voyage-notice", "status");
    this.notice.addEventListener("click", () => { this.notice.hidden = true; });
    for (const element of [this.briefing, this.tutorial, this.result, this.pending]) {
      element.addEventListener("click", (event) => {
        const action = (event.target as Element).closest<HTMLElement>("[data-voyage]")?.dataset.voyage;
        if (!action) return;
        if (action === "begin" || action === "briefing-skip") {
          const handlers = this.briefingActions;
          this.hideBriefing();
          if (action === "begin") handlers?.begin(); else handlers?.skip();
        } else if (action in this.callbacks) this.callbacks[action as keyof typeof this.callbacks]();
      });
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || !element.classList.contains("voyage-modal")) return;
        const buttons = [...element.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        if (!buttons.length) return;
        const first = buttons[0]!; const last = buttons[buttons.length - 1]!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    }
    this.render();
  }

  private create(className: string, role: string): HTMLElement {
    const element = document.createElement("section");
    element.className = className; element.hidden = true; element.setAttribute("role", role);
    element.setAttribute("data-i18n-keyed", "");
    this.parent.append(element); return element;
  }
  setLocale(locale: GameLocale): void { this.locale = locale; this.render(); }
  showNotice(key: VoyageMessageKey): void {
    this.noticeKey = key;
    this.notice.textContent = voyageText(this.locale, key);
    this.notice.hidden = false;
  }
  showBriefing(begin: () => void, skip: () => void): void {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.briefingActions = { begin, skip }; this.briefing.hidden = false; this.render();
    this.briefing.querySelector<HTMLButtonElement>("button")?.focus();
  }
  hideBriefing(): void { this.briefing.hidden = true; this.briefingActions = undefined; this.previousFocus?.focus(); }
  isBriefingOpen(): boolean { return !this.briefing.hidden; }
  setTutorial(step: VoyageStep | null, visible = true): void {
    if (step !== this.step) { this.step = step; this.renderTutorial(); }
    this.tutorial.hidden = !step || !visible;
  }
  showResult(result: VoyageResultView): void {
    const newlyVisible = this.result.hidden;
    this.resultView = result; this.result.hidden = false;
    this.parent.classList.add("voyage-result-active"); this.tutorial.hidden = true;
    this.renderResult(); this.renderPending();
    if (newlyVisible) this.result.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  clearBattle(): void {
    this.resultView = undefined; this.result.hidden = true; this.setTutorial(null);
    this.parent.classList.remove("voyage-result-active"); this.hideBriefing(); this.renderPending();
  }
  setPending(pending: boolean): void { this.pendingVisible = pending; this.renderPending(); }
  private render(): void {
    const t = (key: VoyageMessageKey) => escape(voyageText(this.locale, key));
    if (this.noticeKey) this.notice.textContent = voyageText(this.locale, this.noticeKey);
    this.briefing.setAttribute("aria-label", voyageText(this.locale, "firstVoyage"));
    this.briefing.innerHTML = `<div class="voyage-dialog-inner"><p class="eyebrow">0.7.2 · 1 v 1</p><h1>${t("firstVoyage")}</h1><p>${t("briefing")}</p><div class="voyage-actions"><button data-voyage="begin">${t("beginTutorial")}</button><button data-voyage="briefing-skip">${t("skipTutorial")}</button></div></div>`;
    this.renderTutorial(); this.renderResult(); this.renderPending();
  }
  private renderTutorial(): void {
    if (!this.step) return;
    const index = ["move", "aim", "fire", "objective"].indexOf(this.step) + 1;
    this.tutorial.innerHTML = `<b>${index} / 4 · ${escape(voyageText(this.locale, `${this.step}Title`))}</b><p>${escape(voyageText(this.locale, `${this.step}Body`))}</p><small><kbd>F1</kbd> ${escape(voyageText(this.locale, "skipTutorial"))}</small>`;
  }
  private renderResult(): void {
    if (!this.resultView) return;
    this.result.setAttribute("aria-label", voyageText(this.locale, "battleReport"));
    this.result.innerHTML = `<div class="voyage-dialog-inner">${voyageResultMarkup(this.resultView, this.locale)}</div>`;
  }
  private renderPending(): void {
    this.pending.hidden = !this.pendingVisible || !this.result.hidden;
    this.parent.classList.toggle("voyage-save-pending", !this.pending.hidden);
    if (!this.pendingVisible) return;
    this.pending.innerHTML = `<b>${escape(voyageText(this.locale, "savePending"))}</b><p>${escape(voyageText(this.locale, "sessionOnly"))}</p><button data-voyage="retry">${escape(voyageText(this.locale, "retrySave"))}</button>`;
  }
}
