import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORY_META, EQUIPMENT_CATALOG } from "../src/profile/equipmentCatalog";
import { SHIP_CLASSES } from "../src/ships/classes";
import { GAME_LOCALE_MESSAGES, SUPPORTED_GAME_LOCALES, localizeElement, translateGameText } from "../src/i18n/gameLocale";
import { EQUIPMENT_LOCALIZATION_CATALOG, SHIP_CLASS_LOCALIZATION_CATALOG, HISTORICAL_MODEL_NAME_ALLOWLIST, equipmentLocale, shipClassLocale } from "../src/i18n/equipmentLocale";
import { VOYAGE_CATALOG, VOYAGE_MESSAGE_ROWS, voyageText, type VoyageMessageKey } from "../src/i18n/voyageLocale";
import { LAN_CATALOG, LAN_MESSAGE_ROWS } from "../src/i18n/lanLocale";

afterEach(() => vi.unstubAllGlobals());

describe("first-voyage complete localization catalogs", () => {
  it.each(SUPPORTED_GAME_LOCALES)("covers every equipment, ship and message in %s", (locale) => {
    expect(Object.keys(EQUIPMENT_LOCALIZATION_CATALOG[locale]).sort()).toEqual(EQUIPMENT_CATALOG.map(({ id }) => id).sort());
    expect(Object.keys(SHIP_CLASS_LOCALIZATION_CATALOG[locale]).sort()).toEqual(Object.keys(SHIP_CLASSES).sort());
    expect(Object.keys(VOYAGE_CATALOG[locale]).sort()).toEqual(Object.keys(VOYAGE_MESSAGE_ROWS).sort());
    expect(Object.keys(LAN_CATALOG[locale]).sort()).toEqual(Object.keys(LAN_MESSAGE_ROWS).sort());
    for (const item of EQUIPMENT_CATALOG) {
      const entry = equipmentLocale(locale, item.id);
      expect(Object.keys(entry).sort()).toEqual(["description", "modelName", "name", "origin"]);
      for (const value of Object.values(entry)) expect(value.trim().length).toBeGreaterThan(0);
      if (locale !== "zh-CN" && locale !== "zh-TW") {
        expect(entry.description).not.toBe(equipmentLocale("zh-CN", item.id).description);
        expect(entry.name).not.toBe(equipmentLocale("zh-CN", item.id).name);
        expect(entry.origin).not.toBe(equipmentLocale("zh-CN", item.id).origin);
      }
      if (["en-US", "es-ES", "de-DE", "ru-RU"].includes(locale)) {
        for (const value of Object.values(entry)) expect(value).not.toMatch(/[\u3400-\u9fff]/);
      }
    }
    for (const id of Object.keys(SHIP_CLASSES) as Array<keyof typeof SHIP_CLASSES>) {
      const text = shipClassLocale(locale, id).historicalArmament;
      expect(text.length).toBeGreaterThan(10);
      if (locale !== "zh-CN" && locale !== "zh-TW") expect(text).not.toBe(shipClassLocale("zh-CN", id).historicalArmament);
      if (["en-US", "es-ES", "de-DE", "ru-RU"].includes(locale)) expect(text).not.toMatch(/[\u3400-\u9fff]/);
    }
    for (const value of [...Object.values(VOYAGE_CATALOG[locale]), ...Object.values(LAN_CATALOG[locale])]) expect(value.trim()).not.toBe("");
  });

  it("allows shared model designations only from the explicit historical whitelist", () => {
    for (const item of EQUIPMENT_CATALOG) {
      const names = new Set(SUPPORTED_GAME_LOCALES.map((locale) => equipmentLocale(locale, item.id).modelName));
      if (names.size === 1) expect(HISTORICAL_MODEL_NAME_ALLOWLIST.has([...names][0]!)).toBe(true);
    }
    expect(() => equipmentLocale("en-US", "missing-equipment")).toThrow("Missing equipment localization");
  });

  it("keeps interpolation keys isomorphic and substitutes all dynamic values", () => {
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(VOYAGE_MESSAGE_ROWS) as VoyageMessageKey[]) {
      const expected = placeholders(VOYAGE_CATALOG["zh-CN"][key]);
      for (const locale of SUPPORTED_GAME_LOCALES) {
        expect(placeholders(VOYAGE_CATALOG[locale][key])).toEqual(expected);
        const params = Object.fromEntries(expected.map((name) => [name, 42]));
        expect(voyageText(locale, key, params)).not.toMatch(/\{\w+\}/);
      }
    }
    for (const locale of SUPPORTED_GAME_LOCALES) {
      expect(voyageText(locale, "moveBody")).toContain("30");
      expect(voyageText(locale, "aimBody")).toContain("R");
      expect(voyageText(locale, "fireBody")).toContain("1");
      expect(voyageText(locale, "objectiveBody")).toContain("M");
      expect(voyageText(locale, "slot", { number: 7 })).toContain("7");
    }
  });

  it("protects keyed catalog text from legacy substring translation while translating surrounding labels", () => {
    const keyed = { closest: () => ({}) };
    const ordinary = { closest: () => null };
    const name = equipmentLocale("en-US", "steering-gold").name;
    const nodes = [{ textContent: name, parentElement: keyed }, { textContent: "当前装备", parentElement: ordinary }];
    let cursor = 0;
    vi.stubGlobal("document", { createTreeWalker: () => ({ nextNode: () => nodes[cursor++] ?? null }) });
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
    const root = { querySelectorAll: () => [], getAttribute: () => null, closest: () => null } as unknown as Element;
    localizeElement(root, "zh-CN");
    expect(nodes[0]!.textContent).toBe(name);
    cursor = 0;
    localizeElement(root, "en-US");
    expect(nodes[1]!.textContent).not.toBe("当前装备");
    expect(nodes[0]!.textContent).toBe(name);
  });

  it("translates each authoritative battle-end reason in all seven locales", () => {
    for (const source of ["目标积分达到胜利门槛", "战斗时间结束", "一方舰队被击沉"]) {
      expect(translateGameText(source, "zh-CN")).toBe(source);
      for (const locale of SUPPORTED_GAME_LOCALES.filter((locale) => locale !== "zh-CN")) {
        expect(translateGameText(source, locale)).not.toBe(source);
      }
    }
  });

  it("covers all DockPanel direct and conditional source strings, categories, countries and ship names", () => {
    const sources = new Set([
      "标准配置", "继承配置", "配置", "最多保存 24 套方案", "请输入方案名称", "方案已保存（本机）",
      "可出击", "未达到最低出海配置", "设为出击舰", "以当前配装覆盖", "删除", "全部", "核心增益",
      "槽位占用", "安装到空槽", "替换首个槽位", "该舰级不可安装", "选择组件查看详情", "当前已安装", "候选装配预览", "槽",
      ...Object.values(CATEGORY_META).map(({ label }) => label),
      ...Object.values(SHIP_CLASSES).flatMap(({ name, country, serviceYear }) => [name, country, ...(/^\d+$/.test(serviceYear) ? [] : [serviceYear])]),
    ]);
    for (const source of sources) {
      const row = GAME_LOCALE_MESSAGES.find((entry) => entry.source === source);
      expect(row, `Missing exact DockPanel source: ${source}`).toBeDefined();
      for (const locale of SUPPORTED_GAME_LOCALES) {
        const translated = translateGameText(source, locale);
        expect(translated.trim()).not.toBe("");
        if (["en-US", "es-ES", "de-DE", "ru-RU"].includes(locale)) expect(translated, `${source} -> ${locale}`).not.toMatch(/[\u3400-\u9fff]/);
      }
    }
    expect(translateGameText("核心增益", "ja-JP")).toBe("コア効果");
    expect(translateGameText("弗莱彻级", "zh-TW")).toBe("弗萊徹級");
    expect(translateGameText("阳炎级", "zh-TW")).toBe("陽炎級");
  });

  it("keeps the current keyed settings and replay labels stable under legacy localization", () => {
    for (const locale of SUPPORTED_GAME_LOCALES) {
      for (const key of ["settings", "replayTutorial"] as const) {
        const text = voyageText(locale, key);
        expect(translateGameText(text, locale)).toBe(text);
      }
    }
  });

  it("translates the standalone main title and view control label", () => {
    for (const source of ["灰海行动", "视角"]) {
      for (const locale of SUPPORTED_GAME_LOCALES.filter((locale) => locale !== "zh-CN")) {
        expect(translateGameText(source, locale)).not.toBe(source);
      }
    }
    expect(translateGameText("灰海行动", "en-US")).toBe("Grey Sea Action");
  });

  it("translates the exact dock-preview rotation and zoom hint", () => {
    const source = "拖动舰船预览可旋转 · 滚轮缩放";
    expect(GAME_LOCALE_MESSAGES.filter((row) => row.source === source)).toHaveLength(1);
    for (const locale of SUPPORTED_GAME_LOCALES.filter((locale) => locale !== "zh-CN")) {
      expect(translateGameText(source, locale)).not.toBe(source);
    }
    expect(translateGameText(source, "en-US")).toBe("Drag the ship preview to rotate · Scroll to zoom");
  });

  it("translates the updated mission subtitle and the complete codex paragraph without sentence splitting", () => {
    for (const source of [
      "二战海战 · 单人与双人局域网合作",
      "防空炮已接入舰载机空战，其防空效能随装备数量与性能变化。",
      "历史鱼雷与侧炮型号已接入实际战斗性能；轻巡洋舰和战列舰的侧炮会在火控连续确认目标后自动接战。防空炮已接入舰载机空战，其防空效能随装备数量与性能变化。",
    ]) {
      expect(GAME_LOCALE_MESSAGES.filter((row) => row.source === source)).toHaveLength(1);
      for (const locale of SUPPORTED_GAME_LOCALES.filter((locale) => locale !== "zh-CN")) {
        const translated = translateGameText(source, locale);
        expect(translated).not.toBe(source);
        if (["en-US", "es-ES", "de-DE", "ru-RU"].includes(locale)) expect(translated).not.toMatch(/[\u3400-\u9fff]/);
      }
    }
  });
});
