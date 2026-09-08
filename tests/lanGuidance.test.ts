import { describe, expect, it, vi } from "vitest";
import { LAN_GUIDANCE_REASONS, lanTroubleshootingState, rejectionGuidance, type LanGuidanceReason, type LanTroubleshootingState } from "../src/net/lanGuidance";
import { lanText } from "../src/i18n/lanLocale";
import { SUPPORTED_GAME_LOCALES, type GameLocale } from "../src/i18n/gameLocale";
import { MultiplayerMenu, type MultiplayerActionResult } from "../src/ui/multiplayerMenu";

interface MenuHarness {
  guidance?: LanTroubleshootingState;
  locale: GameLocale;
  screen: "directory" | "lobby";
  hostEndpoint?: { address: string; port: number };
  statusSource: string | null;
  root: { hidden: boolean; querySelector: ReturnType<typeof vi.fn>; querySelectorAll: () => [] };
  controller: { clearLobby: ReturnType<typeof vi.fn>; setLobby: ReturnType<typeof vi.fn>; getSelectedBuildId: () => string };
  capabilitiesLoaded: boolean;
  options: { callbacks: { searchRooms: ReturnType<typeof vi.fn>; createRoom: ReturnType<typeof vi.fn>; manualJoin: ReturnType<typeof vi.fn> } };
  roomName: string;
  manualAddress: string;
  manualPort: string;
  applySearchResults: ReturnType<typeof vi.fn>;
  currentCapabilities: () => { canManualConnect: true };
  render: ReturnType<typeof vi.fn>;
  setGuidance(reason: LanGuidanceReason): void;
  dismissGuidance(): void;
  returnToDirectory(): void;
  setLocale(locale: GameLocale): void;
  hide(): void;
  show(): Promise<void>;
  guidanceMarkup(): string;
  bindEvents(): void;
  handleSearchRooms(trigger: "search"): Promise<void>;
  handleCreateRoom(): Promise<void>;
  handleManualJoin(): Promise<void>;
}
function menuHarness(): MenuHarness {
  return Object.assign(Object.create(MultiplayerMenu.prototype) as MenuHarness, {
    locale: "en-US" as GameLocale, screen: "lobby" as const, statusSource: null,
    capabilitiesLoaded: true, root: { hidden: false, querySelector: vi.fn(() => null), querySelectorAll: () => [] },
    controller: { clearLobby: vi.fn(), setLobby: vi.fn(), getSelectedBuildId: () => "build-1" },
    options: { callbacks: { searchRooms: vi.fn(async () => ({ ok: true, rooms: [] })), createRoom: vi.fn(async () => ({ ok: true })), manualJoin: vi.fn(async () => ({ ok: true })) } },
    roomName: "Test room", manualAddress: "192.168.1.8", manualPort: "47778",
    applySearchResults: vi.fn(), currentCapabilities: () => ({ canManualConnect: true as const }), render: vi.fn(),
  });
}

describe("persistent structured LAN troubleshooting", () => {
  it("maps only network reasons to network actions and never generalizes precise rejections", () => {
    for (const reason of LAN_GUIDANCE_REASONS) {
      const state = lanTroubleshootingState(reason);
      expect(state.reason).toBe(reason);
      expect(state.titleKey).toBe(reason);
      expect(state.actionKeys.length > 0).toBe(!["version-mismatch", "content-mismatch", "room-full", "invalid-build"].includes(reason));
      for (const locale of SUPPORTED_GAME_LOCALES) {
        expect(lanText(locale, state.titleKey)).toBeTruthy();
        for (const action of state.actionKeys) expect(lanText(locale, action)).toBeTruthy();
      }
    }
    expect(lanTroubleshootingState("host-disconnected").actionKeys).toEqual(["newRoom"]);
    expect(rejectionGuidance("unknown error")).toBeUndefined();
  });

  it("persists across menu hide/show and directory return, and redraws immediately on locale changes", async () => {
    const menu = menuHarness();
    menu.setGuidance("host-disconnected");
    const state = menu.guidance;
    menu.hide(); await menu.show();
    menu.hostEndpoint = { address: "192.168.1.8", port: 47778 };
    menu.returnToDirectory();
    expect(menu.guidance).toBe(state);
    expect(menu.screen).toBe("directory");
    expect(menu.controller.clearLobby).toHaveBeenCalledOnce();
    expect(menu.hostEndpoint).toBeUndefined();
    for (const locale of SUPPORTED_GAME_LOCALES) {
      menu.setLocale(locale);
      expect(menu.guidanceMarkup()).toContain(lanText(locale, "host-disconnected"));
      expect(menu.guidanceMarkup()).toContain("data-i18n-keyed");
    }
    expect(menu.render.mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it.each(["search", "create", "join"] as const)("clears old advice at the start of a new %s operation and persists the new reason", async (operation) => {
    const menu = menuHarness();
    menu.setGuidance("host-disconnected");
    let resolve!: (result: MultiplayerActionResult) => void;
    const pending = new Promise<MultiplayerActionResult>((next) => { resolve = next; });
    const callback = operation === "search" ? menu.options.callbacks.searchRooms : operation === "create" ? menu.options.callbacks.createRoom : menu.options.callbacks.manualJoin;
    callback.mockImplementation(() => pending);
    const action = operation === "search" ? menu.handleSearchRooms("search") : operation === "create" ? menu.handleCreateRoom() : menu.handleManualJoin();
    expect(menu.guidance).toBeUndefined();
    resolve({ ok: false, guidanceReason: "version-mismatch", errorSource: "precise source" });
    await action;
    expect(menu.guidance?.reason).toBe("version-mismatch");
    expect(menu.guidance?.actionKeys).toEqual([]);
    expect(menu.guidanceMarkup()).not.toContain("<ol>");
  });

  it("dismisses only on the explicit close control", () => {
    const menu = menuHarness();
    let dismiss!: () => void;
    menu.root.querySelector.mockImplementation((selector: string) => selector === ".multiplayer-dismiss-guidance" ? { addEventListener: (_event: string, callback: () => void) => { dismiss = callback; } } : null);
    menu.setGuidance("search-empty");
    menu.bindEvents();
    expect(menu.guidance).toBeDefined();
    dismiss();
    expect(menu.guidance).toBeUndefined();
  });
});
