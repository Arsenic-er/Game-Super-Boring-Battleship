import type { LocalProfile } from "../profile/localProfile";
import { SHIP_CLASSES, type ShipClassId } from "../ships/classes";
import { translateGameText, type GameLocale } from "../i18n/gameLocale";
import { portText, type PortMessageKey } from "../i18n/portLocale";
import type { DockComponentHover, DockPreview } from "../render/dockPreview";
import { portEnter, portVisibility } from "./portMotion";

type Tab = "mission" | "store" | "dock" | "codex";
type Drawer = "equipment" | "builds" | "profile" | "help";
interface Options {
  getLocale: () => GameLocale;
  getProfile: () => LocalProfile;
  navigate: (tab: Tab) => void;
  selectComponent: (hover: DockComponentHover) => void;
  preview: DockPreview;
}
const icons = { mission: "fa-anchor", dock: "fa-anchor", store: "fa-boxes-stacked", codex: "fa-book-open" };
const navKeys = { mission: "sail", dock: "port", store: "armory", codex: "codex" } as const;

/** Adapts the existing game menus. No duplicate inventory, save, launch or LAN logic. */
export class PortShell {
  private readonly dock: HTMLElement;
  private readonly drawers = new Map<Drawer, HTMLElement>();
  private opened?: Drawer;
  private returnFocus?: HTMLElement;
  private tab: Tab = "dock";
  private readonly header: HTMLElement;
  private readonly name: HTMLElement;
  private readonly origin: HTMLElement;
  private readonly account: HTMLButtonElement;
  private readonly shipList: HTMLElement;
  private readonly scene: HTMLElement;

  constructor(private readonly host: HTMLElement, private readonly options: Options) {
    host.classList.add("port-shell");
    const card = host.querySelector<HTMLElement>(".command-center")!;
    this.dock = host.querySelector<HTMLElement>(".dock-panel")!;
    this.scene = this.dock.querySelector<HTMLElement>(".dock-blueprint")!;
    this.header = document.createElement("header");
    this.header.className = "port-brand";
    this.header.setAttribute("data-i18n-keyed", "");
    this.header.innerHTML = `<h1 data-port-copy="title"></h1><p>SUPER BORING BATTLESHIP GAME</p>`;
    card.prepend(this.header);
    this.account = document.createElement("button");
    this.account.type = "button"; this.account.className = "port-account";
    this.account.setAttribute("data-i18n-keyed", "");
    this.account.innerHTML = `<i class="fa-solid fa-user" aria-hidden="true"></i><span></span>`;
    this.account.addEventListener("click", () => this.toggleDrawer("profile", this.account));
    card.append(this.account);

    const footer = document.createElement("div"); footer.className = "port-utilities";
    const settings = host.querySelector<HTMLElement>(".main-open-settings")!;
    footer.append(settings, this.button("help", "fa-circle-question", () => this.toggleDrawer("help")));
    card.append(footer);

    // The existing mission tab becomes the single primary departure action.
    const departure = host.querySelector<HTMLButtonElement>('[data-menu-tab="mission"]')!;
    departure.classList.add("port-departure"); departure.removeAttribute("role");
    card.append(departure);
    const dockTab = host.querySelector('[data-menu-tab="dock"]')!;
    host.querySelector(".command-tabs")!.prepend(dockTab);
    for (const tab of ["mission", "dock", "store", "codex"] as const) {
      const button = host.querySelector<HTMLButtonElement>(`[data-menu-tab="${tab}"]`)!;
      button.setAttribute("data-i18n-keyed", "");
      button.innerHTML = `<i class="fa-solid ${icons[tab]}" aria-hidden="true"></i><span data-port-copy="${navKeys[tab]}"></span>`;
    }

    const shipCaption = document.createElement("section"); shipCaption.className = "port-ship-caption";
    shipCaption.setAttribute("data-i18n-keyed", "");
    this.name = document.createElement("h2"); this.origin = document.createElement("p");
    const actions = document.createElement("div"); actions.className = "port-ship-actions";
    actions.append(this.button("equipment", "fa-wrench", () => this.toggleDrawer("equipment")),
      this.button("builds", "fa-floppy-disk", () => this.toggleDrawer("builds")));
    shipCaption.append(this.name, this.origin, actions); this.dock.append(shipCaption);

    this.shipList = this.dock.querySelector<HTMLElement>(".hull-list")!;
    this.shipList.setAttribute("aria-label", "Ships");
    for (const button of this.shipList.querySelectorAll<HTMLButtonElement>("[data-ship-class-id]")) {
      const art = document.createElement("img");
      art.src = `${import.meta.env.BASE_URL}assets/ui/ships/${button.dataset.shipClassId}.png`;
      art.alt = ""; art.draggable = false; art.loading = "lazy";
      button.prepend(art);
    }
    const paging = document.createElement("div"); paging.className = "port-ship-paging";
    paging.append(this.button("previousShips", "fa-chevron-left", () => this.scrollShips(-1), true),
      this.button("nextShips", "fa-chevron-right", () => this.scrollShips(1), true));
    this.dock.append(paging);

    const equipment = this.dock.querySelector<HTMLElement>(".component-library")!;
    const equipmentHeading = equipment.querySelector("h3"); equipmentHeading?.remove();
    equipment.prepend(this.dock.querySelector(".slot-list")!);
    const status = this.scene.querySelector(".dock-preview-status"); if (status) equipment.append(status);
    this.scene.querySelector("small")?.remove();
    this.prepareDrawer("equipment", equipment, "equipment");

    const builds = document.createElement("section"); this.dock.append(builds);
    const buildTools = this.dock.querySelector(".dock-build-tools")!;
    builds.append(buildTools, this.dock.querySelector(".dock-view-state")!, this.dock.querySelector(".saved-build-list")!);
    this.dock.querySelector(".screen-heading")?.remove();
    this.prepareDrawer("builds", builds, "builds");

    const profile = document.createElement("section"); card.append(profile);
    profile.append(host.querySelector(".profile-strip")!);
    this.prepareDrawer("profile", profile, "profile");
    const help = document.createElement("section"); card.append(help);
    const previewHelp = document.createElement("p"); previewHelp.dataset.portCopy = "previewHelp";
    previewHelp.setAttribute("data-i18n-keyed", ""); help.append(previewHelp);
    const controlHelp = host.querySelector(".menu-controls"); if (controlHelp) help.append(controlHelp);
    const brief = host.querySelector(".mission-brief"); if (brief) help.append(brief);
    this.prepareDrawer("help", help, "help");
    for (const tab of ["mission", "store", "codex"] as const) {
      const panel = host.querySelector<HTMLElement>(`[data-menu-panel="${tab}"]`)!;
      const back = this.button("back", "fa-arrow-left", () => options.navigate("dock"));
      back.classList.add("port-panel-back"); panel.prepend(back);
    }
    const missionTitle = host.querySelector<HTMLElement>(".mission-panel > h1")!;
    missionTitle.dataset.portCopy = "chooseMode"; missionTitle.setAttribute("data-i18n-keyed", "");
    const choices = ["fa-crosshairs", "fa-people-group", "fa-compass"];
    host.querySelectorAll<HTMLElement>(".mode-card").forEach((button, index) => {
      const icon = document.createElement("i"); icon.className = `fa-solid ${choices[index] ?? "fa-anchor"}`;
      icon.setAttribute("aria-hidden", "true"); button.prepend(icon);
    });
    this.dock.addEventListener("dock-preview-change", () => this.refresh());

    let press: { x: number; y: number; hover?: DockComponentHover } | undefined;
    const canvas = this.scene.querySelector("canvas")!;
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button === 0) press = { x: event.clientX, y: event.clientY, hover: options.preview.getComponentHover() };
    }, true);
    canvas.addEventListener("pointerup", (event) => {
      if (press?.hover && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5) {
        options.selectComponent(press.hover); this.openDrawer("equipment");
      }
      press = undefined;
    });
    canvas.addEventListener("pointercancel", () => { press = undefined; });
    host.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && this.opened) this.trapFocus(event);
    });
    this.refresh();
  }

  private button(key: PortMessageKey, icon: string, action: () => void, iconOnly = false): HTMLButtonElement {
    const button = document.createElement("button"); button.type = "button";
    button.className = iconOnly ? "port-button port-icon-button" : "port-button";
    button.setAttribute("data-i18n-keyed", ""); button.dataset.portLabel = key;
    button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>${iconOnly ? "" : `<span data-port-copy="${key}"></span>`}`;
    button.addEventListener("click", () => { if (key !== "close") this.returnFocus = button; action(); });
    return button;
  }
  private prepareDrawer(id: Drawer, element: HTMLElement, key: PortMessageKey): void {
    element.classList.add("port-drawer", `port-drawer-${id}`); element.hidden = true; element.inert = true;
    element.setAttribute("role", "dialog"); element.setAttribute("aria-modal", "false");
    element.dataset.portLabel = key; element.tabIndex = -1;
    const heading = document.createElement("header"); heading.className = "port-drawer-heading";
    const title = document.createElement("h2"); title.dataset.portCopy = key; title.setAttribute("data-i18n-keyed", "");
    heading.append(title, this.button("close", "fa-xmark", () => this.closeDrawer(), true));
    element.prepend(heading); this.drawers.set(id, element);
  }
  private toggleDrawer(id: Drawer, origin?: HTMLElement): void {
    if (origin) this.returnFocus = origin;
    if (this.opened === id) this.closeDrawer(); else this.openDrawer(id);
  }
  private openDrawer(id: Drawer): void {
    this.closeDrawer(false);
    this.opened = id; this.host.dataset.portDrawer = id;
    const panel = this.drawers.get(id)!; portVisibility(panel, true);
    panel.focus({ preventScroll: true });
  }
  private closeDrawer(restoreFocus = true): void {
    if (this.opened) portVisibility(this.drawers.get(this.opened)!, false);
    this.opened = undefined; delete this.host.dataset.portDrawer;
    if (restoreFocus && this.returnFocus?.isConnected && !this.returnFocus.closest("[hidden],[inert]"))
      this.returnFocus.focus({ preventScroll: true });
  }
  private scrollShips(direction: number): void {
    this.shipList.scrollBy({ left: direction * this.shipList.clientWidth * .75,
      behavior: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  private trapFocus(event: KeyboardEvent): void {
    const panel = this.drawers.get(this.opened!)!;
    const candidates = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')]
      .filter(element => element.offsetParent && !element.closest("[hidden]"));
    const first = candidates[0], last = candidates.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last!.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  handleEscape(): boolean {
    if (this.opened) { this.closeDrawer(); return true; }
    if (this.tab !== "dock") { this.options.navigate("dock"); return true; }
    return false;
  }
  onTab(tab: Tab): void {
    this.tab = tab; this.closeDrawer(false); this.host.dataset.portTab = tab;
    const panel = this.host.querySelector<HTMLElement>(`[data-menu-panel="${tab}"]`)!;
    if (tab !== "dock") portEnter(panel);
    else this.options.preview.resize();
    this.host.querySelector('[data-menu-tab="mission"]')?.removeAttribute("aria-selected");
    this.refresh();
  }
  refresh(): void {
    const locale = this.options.getLocale();
    this.host.dataset.portLocale = locale;
    document.title = portText(locale, "title");
    const settings = this.host.querySelector<HTMLElement>(".main-open-settings");
    if (settings) {
      settings.setAttribute("data-i18n-keyed", "");
      settings.innerHTML = `<i class="fa-solid fa-gear" aria-hidden="true"></i><span>${portText(locale, "settings")}</span>`;
    }
    for (const element of this.host.querySelectorAll<HTMLElement>("[data-port-copy]"))
      element.textContent = portText(locale, element.dataset.portCopy as PortMessageKey);
    for (const element of this.host.querySelectorAll<HTMLElement>("[data-port-label]")) {
      const label = portText(locale, element.dataset.portLabel as PortMessageKey);
      element.setAttribute("aria-label", label); if (element.classList.contains("port-icon-button")) element.title = label;
    }
    const profile = this.options.getProfile();
    this.account.querySelector("span")!.textContent = profile.commanderName;
    this.account.setAttribute("aria-label", portText(locale, "profile"));
    const selected = this.shipList.querySelector<HTMLElement>(".hull-option.active");
    const id = (selected?.dataset.shipClassId ?? profile.shipClassId) as ShipClassId;
    const ship = SHIP_CLASSES[id];
    this.name.textContent = translateGameText(ship.name, locale);
    this.origin.textContent = `${translateGameText(ship.country, locale)} · ${translateGameText(ship.serviceYear, locale)}`;
    this.shipList.setAttribute("aria-label", portText(locale, "port"));
  }
}
