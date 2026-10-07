import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultLocalProfile, normalizeLocalProfile, type LocalProfile, type SavedShipBuild } from "../src/profile/localProfile";
import { voyageText } from "../src/i18n/voyageLocale";
import { DockPanel, loadBuildIntoEditor } from "../src/ui/dockPanel";
import type { DockPreview } from "../src/render/dockPreview";
import { EQUIPMENT_BY_ID } from "../src/profile/equipmentCatalog";
import { equipmentLocale } from "../src/i18n/equipmentLocale";
import { SUPPORTED_GAME_LOCALES, translateGameText, type GameLocale } from "../src/i18n/gameLocale";

// Rendering hardware and text-node traversal are outside these controller tests.
// The actual DockPanel constructor, render, delegated click handler and save path run.
vi.mock("../src/render/dockPreview", () => ({ DockPreview: class {} }));
vi.mock("../src/i18n/gameLocale", async (original) => ({
  ...await original<typeof import("../src/i18n/gameLocale")>(),
  localizeElement: vi.fn(),
}));

class ElementStub {
  className = "";
  textContent = "";
  innerHTML = "";
  value = "";
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  nodes = new Map<string, ElementStub>();
  listeners = new Map<string, ((event: Event) => void)[]>();
  classes = new Set<string>();
  classList = {
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const enabled = force ?? !this.classes.has(name);
      if (enabled) this.classes.add(name); else this.classes.delete(name);
      return enabled;
    },
  };
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  querySelector<T extends Element = Element>(selector: string): T {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new ElementStub());
    return this.nodes.get(selector) as unknown as T;
  }
  querySelectorAll(): Element[] { return []; }
  closest<T extends Element = Element>(): T { return this as unknown as T; }
  after(): void {}
  addEventListener(type: string, callback: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback); this.listeners.set(type, listeners);
  }
  click(dataset: Record<string, string>, classNames: string[] = []): void {
    const button = new ElementStub();
    button.dataset = dataset;
    classNames.forEach((name) => button.classes.add(name));
    for (const listener of this.listeners.get("click") ?? []) listener({ target: button } as unknown as Event);
  }
  element(selector: string): ElementStub { return this.querySelector(selector) as unknown as ElementStub; }
}

function profileWithAlternateBuild(): { profile: LocalProfile; build: SavedShipBuild } {
  const source = createDefaultLocalProfile();
  const slots = structuredClone(source.slotLoadoutsByShipClass.cleveland);
  expect(slots.mainGun.length).toBeGreaterThan(1);
  slots.mainGun = slots.mainGun.map((_, index, all) => index === all.length - 1 ? "mainGun-common" : null);
  const build: SavedShipBuild = { id: "alternate-cruiser", name: "Sparse cruiser", shipClassId: "cleveland", slots };
  const profile = normalizeLocalProfile({ ...source, savedShipBuilds: [...source.savedShipBuilds, build] });
  return { profile, build: profile.savedShipBuilds.find((entry) => entry.id === build.id)! };
}

function panelFixture(profile: LocalProfile, accepted = true, locked = false, locale: GameLocale = "zh-CN") {
  vi.stubGlobal("document", { createElement: () => new ElementStub() });
  // Do not start the recurring anchor animation loop in a unit test.
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
  const host = new ElementStub();
  const preview = {
    getInternalModuleAnchors: vi.fn(() => []),
    setLoadout: vi.fn(async (_plan: unknown) => ({ status: "applied" })),
    previewEquipment: vi.fn(),
  };
  const onChange = vi.fn((_next: LocalProfile) => accepted);
  const panel = new DockPanel(host as unknown as HTMLElement, preview as unknown as DockPreview,
    () => profile, () => locale, () => locked, onChange);
  return { host, panel, onChange, preview };
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("DockPanel inspect/edit/save behavior", () => {
  it("loads another ship class into the editor without changing the selected departure blueprint", () => {
    const { profile, build } = profileWithAlternateBuild();
    const before = structuredClone(profile);
    const loaded = loadBuildIntoEditor(profile, build);
    expect(loaded.shipClassId).toBe("cleveland");
    expect(loaded.selectedBattleBuildId).toBe("default-fletcher");
    expect(loaded.savedShipBuilds).toEqual(before.savedShipBuilds);
    expect(loaded.slotLoadoutsByShipClass.cleveland).toEqual(build.slots);
    expect(loaded.slotLoadoutsByShipClass.fletcher).toEqual(before.slotLoadoutsByShipClass.fletcher);
    expect(profile).toEqual(before);
  });

  it("preserves ordered empty slots and deep-copies editor arrays away from the saved blueprint and input profile", () => {
    const { profile, build } = profileWithAlternateBuild();
    const slotsBefore = structuredClone(build.slots);
    const loaded = loadBuildIntoEditor(profile, build);
    const editor = loaded.slotLoadoutsByShipClass.cleveland;
    expect(editor.mainGun).toEqual(slotsBefore.mainGun);
    expect(editor.mainGun[0]).toBeNull();
    expect(editor.mainGun.at(-1)).toBe("mainGun-common");
    for (const category of Object.keys(editor) as (keyof typeof editor)[]) {
      expect(editor[category]).not.toBe(build.slots[category]);
      expect(editor[category]).not.toBe(loaded.savedShipBuilds.find((entry) => entry.id === build.id)!.slots[category]);
    }
    editor.mainGun[0] = "mainGun-common";
    expect(build.slots).toEqual(slotsBefore);
    expect(loaded.savedShipBuilds.find((entry) => entry.id === build.id)!.slots).toEqual(slotsBefore);
    build.slots.mainGun[build.slots.mainGun.length - 1] = null;
    expect(editor.mainGun.at(-1)).toBe("mainGun-common");
  });

  it.each([false, true])("inspects a saved build and renders its real plan without writing profile (locked=%s)", async (locked) => {
    const { profile, build } = profileWithAlternateBuild();
    const before = structuredClone(profile);
    const { host, panel, onChange, preview } = panelFixture(profile, true, locked);
    panel.inspect(build.id);
    await Promise.resolve();
    expect(host.classList.contains("is-inspecting")).toBe(true);
    expect(preview.setLoadout).toHaveBeenCalledTimes(1);
    expect(preview.setLoadout.mock.calls[0]![0]).toMatchObject({ shipClassId: "cleveland" });
    expect(onChange).not.toHaveBeenCalled();
    expect(profile).toEqual(before);
    host.click({ dockAction: "edit" });
    await Promise.resolve();
    expect(host.classList.contains("is-inspecting")).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(profile).toEqual(before);
  });

  it("delegated inspect clicks remain read-only rather than selecting or loading the build", async () => {
    const { profile, build } = profileWithAlternateBuild();
    const before = structuredClone(profile);
    const { host, onChange } = panelFixture(profile);
    host.click({ buildInspect: build.id });
    await Promise.resolve();
    expect(host.classList.contains("is-inspecting")).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(profile).toEqual(before);
  });

  it("reports a failed save callback, keeps the typed name, and never claims local persistence", () => {
    const profile = createDefaultLocalProfile();
    const before = structuredClone(profile);
    const { host, onChange } = panelFixture(profile, false);
    host.element(".build-name").value = "Keep this draft";
    host.click({}, ["save-ship-build"]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].savedShipBuilds.at(-1)?.name).toBe("Keep this draft");
    expect(host.element(".dock-save-state").textContent).toBe(voyageText("zh-CN", "saveFailed"));
    expect(host.element(".dock-save-state").textContent).not.toContain("方案已保存");
    expect(host.element(".build-name").value).toBe("Keep this draft");
    expect(profile).toEqual(before);
  });

  it("clears the name and reports success only when the save callback accepts the profile", () => {
    const { host, onChange } = panelFixture(createDefaultLocalProfile(), true);
    host.element(".build-name").value = "Accepted draft";
    host.click({}, ["save-ship-build"]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(host.element(".build-name").value).toBe("");
    expect(host.element(".dock-save-state").textContent).toBe("方案已保存（本机）");
  });

  it("blocks save clicks while rewards hold the profile write lock", () => {
    const { host, onChange } = panelFixture(createDefaultLocalProfile(), true, true);
    host.element(".build-name").value = "Do not write";
    host.click({}, ["save-ship-build"]);
    expect(onChange).not.toHaveBeenCalled();
    expect(host.element(".build-name").value).toBe("Do not write");
  });
});

function slotProfile(): LocalProfile {
  const profile = createDefaultLocalProfile();
  profile.shipClassId = "fletcher";
  profile.inventory["mainGun-gold"] = 10;
  return profile;
}

describe("DockPanel explicit equipment slots", () => {
  it("keeps the clicked aft mount when selecting another same-category candidate and installs exactly there", async () => {
    const profile = slotProfile();
    const index = profile.slotLoadoutsByShipClass.fletcher.mainGun.length - 1;
    profile.slotLoadoutsByShipClass.fletcher.mainGun[index] = "mainGun-common";
    const before = structuredClone(profile);
    const { panel, host, preview, onChange } = panelFixture(profile);
    panel.inspectEquipment("mainGun", "mainGun-common", index);
    host.click({ item: "mainGun-gold" });
    await Promise.resolve();
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], index);
    expect(host.element(".component-detail").innerHTML).toContain('data-dock-slot="' + index + '" aria-pressed="true"');
    expect(host.element(".component-detail").innerHTML).toContain("替换所选槽位");
    host.click({}, ["equip-selected"]);
    const next = onChange.mock.calls.at(-1)![0];
    expect(next.slotLoadoutsByShipClass.fletcher.mainGun).toEqual(
      before.slotLoadoutsByShipClass.fletcher.mainGun.map((id, i) => i === index ? "mainGun-gold" : id));
    expect(next.inventory).toEqual(before.inventory);
    expect(next.savedShipBuilds).toEqual(before.savedShipBuilds);
    expect(profile).toEqual(before);
  });

  it("selects an empty slot independently of automatic placement and displays its real current contents", async () => {
    const profile = slotProfile();
    profile.slotLoadoutsByShipClass.fletcher.mainGun = profile.slotLoadoutsByShipClass.fletcher.mainGun.map((_, i) => i === 0 ? "mainGun-common" : null);
    const index = profile.slotLoadoutsByShipClass.fletcher.mainGun.length - 1;
    const { panel, host, preview, onChange } = panelFixture(profile);
    panel.inspectEquipment("mainGun", "mainGun-gold");
    host.click({ dockSlot: String(index) });
    await Promise.resolve();
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], index);
    expect(host.element(".component-detail").innerHTML).toContain("安装到空槽");
    expect(host.element(".component-detail").innerHTML).toContain(equipmentLocale("zh-CN", "mainGun-common").name);
    expect(host.element(".component-detail").innerHTML).toContain("空槽");
    host.click({}, ["equip-selected"]);
    expect(onChange.mock.calls.at(-1)![0].slotLoadoutsByShipClass.fletcher.mainGun[index]).toBe("mainGun-gold");
    expect(onChange.mock.calls.at(-1)![0].slotLoadoutsByShipClass.fletcher.mainGun[0]).toBe("mainGun-common");
  });

  it("can return to the unchanged automatic placement policy", async () => {
    const profile = slotProfile();
    const { panel, host, preview, onChange } = panelFixture(profile);
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    host.click({ dockSlot: "auto" });
    await Promise.resolve();
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], 0);
    expect(host.element(".component-detail").innerHTML).toContain('data-dock-slot="auto" aria-pressed="true"');
    host.click({}, ["equip-selected"]);
    expect(onChange.mock.calls.at(-1)![0].slotLoadoutsByShipClass.fletcher.mainGun[0]).toBe("mainGun-gold");
  });

  it.each(["-1", "1.5", "999", "", "x"])("rejects malformed or unavailable explicit slot %s without changing the chosen target", async (value) => {
    const { panel, host, preview } = panelFixture(slotProfile());
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    await Promise.resolve();
    preview.previewEquipment.mockClear();
    host.click({ dockSlot: value });
    expect(preview.previewEquipment).not.toHaveBeenCalled();
    host.click({ item: "mainGun-gold" });
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], 2);
  });

  it("clears the explicit target on category change and when switching ship class", async () => {
    const { panel, host, preview } = panelFixture(slotProfile());
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    host.click({ dockCategory: "engine" });
    host.click({ dockCategory: "mainGun" });
    host.click({ item: "mainGun-gold" });
    await Promise.resolve();
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], 0);
    host.click({ dockSlot: "2" });
    host.click({ shipClassId: "cleveland" });
    panel.render();
    await Promise.resolve();
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], 0);
  });

  it("read-only blueprint inspection clears the target and cannot change its slots or the editor", async () => {
    const { profile, build } = profileWithAlternateBuild();
    profile.inventory["mainGun-gold"] = 10;
    const before = structuredClone(profile);
    const { panel, host, preview, onChange } = panelFixture(profile);
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    panel.inspect(build.id);
    await Promise.resolve();
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], 0);
    const detail = host.element(".component-detail").innerHTML;
    expect(detail).toContain('data-dock-slot="auto" aria-pressed="true" disabled');
    host.click({ dockSlot: "2" });
    host.click({}, ["equip-selected"]);
    expect(onChange).not.toHaveBeenCalled();
    expect(profile).toEqual(before);
    host.click({ dockAction: "edit" });
    await Promise.resolve();
    expect(host.element(".component-detail").innerHTML).toContain('data-dock-slot="auto" aria-pressed="true"');
  });

  it("uses the latest slot selection when an asynchronous loadout finishes", async () => {
    const { panel, host, preview } = panelFixture(slotProfile());
    let finish!: (result: { status: string }) => void;
    preview.setLoadout.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    panel.inspectEquipment("mainGun", "mainGun-gold", 1);
    host.click({ dockSlot: "3" });
    finish({ status: "applied" });
    await Promise.resolve();
    expect(preview.previewEquipment).toHaveBeenLastCalledWith(EQUIPMENT_BY_ID["mainGun-gold"], 3);
  });

  it("keeps exhausted inventory blocked even with an explicit empty target", () => {
    const profile = slotProfile();
    profile.inventory["mainGun-gold"] = 1;
    profile.slotLoadoutsByShipClass.fletcher.mainGun[0] = "mainGun-gold";
    profile.slotLoadoutsByShipClass.fletcher.mainGun[2] = null;
    const { panel, host, onChange } = panelFixture(profile);
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    expect(host.element(".component-detail").innerHTML).toContain('<button class="equip-selected" disabled>组件不足</button>');
    host.click({}, ["equip-selected"]);
    expect(onChange.mock.calls.at(-1)![0].slotLoadoutsByShipClass.fletcher.mainGun[2]).toBeNull();
  });

  it.each(SUPPORTED_GAME_LOCALES)("renders accessible, translated slot controls in %s", (locale) => {
    const profile = slotProfile();
    profile.slotLoadoutsByShipClass.fletcher.mainGun[2] = null;
    const { panel, host } = panelFixture(profile, true, false, locale);
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    const detail = host.element(".component-detail").innerHTML;
    for (const source of ["装配位置", "自动选择槽位", "空槽"])
      expect(detail).toContain(translateGameText(source, locale));
    expect(detail).toContain('data-dock-slot="2" aria-pressed="true"');
    expect(detail).toContain("<fieldset");
    if (["en-US", "es-ES", "de-DE", "ru-RU"].includes(locale)) {
      const picker = detail.slice(detail.indexOf('<fieldset'), detail.indexOf("</fieldset>"));
      expect(picker).not.toMatch(/[\u3400-\u9fff]/);
    }
  });
});

describe("DockPanel rejects stale explicit component selections", () => {
  it.each([-1, 1.5, 999, Number.NaN, Number.POSITIVE_INFINITY])("rejects index %s before changing category, candidate or target", async (slotIndex) => {
    const { panel, host, preview, onChange } = panelFixture(slotProfile());
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    await Promise.resolve();
    const detail = host.element(".component-detail").innerHTML;
    const filters = host.element(".component-filters").innerHTML;
    preview.previewEquipment.mockClear();
    panel.inspectEquipment("engine", "engine-common", slotIndex);
    expect(host.element(".component-detail").innerHTML).toBe(detail);
    expect(host.element(".component-filters").innerHTML).toBe(filters);
    expect(preview.previewEquipment).not.toHaveBeenCalled();
    host.click({}, ["equip-selected"]);
    const selected = onChange.mock.calls.at(-1)![0].slotLoadoutsByShipClass.fletcher.mainGun;
    expect(selected[2]).toBe("mainGun-gold");
    expect(selected[0]).not.toBe("mainGun-gold");
  });

  it("rejects a component/category mismatch without losing the current target", async () => {
    const { panel, host, preview } = panelFixture(slotProfile());
    panel.inspectEquipment("mainGun", "mainGun-gold", 2);
    await Promise.resolve();
    const before = host.element(".component-detail").innerHTML;
    preview.previewEquipment.mockClear();
    panel.inspectEquipment("engine", "mainGun-common", 0);
    expect(host.element(".component-detail").innerHTML).toBe(before);
    expect(preview.previewEquipment).not.toHaveBeenCalled();
  });
});
