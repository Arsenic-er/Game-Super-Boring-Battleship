import { describe, expect, it } from "vitest";
import type { AiDecisionTelemetry, AiMainGunHoldReason } from "../src/sim/types";
import { SUPPORTED_GAME_LOCALES } from "../src/i18n/gameLocale";
import { AI_DECISION_MESSAGES, aiDecisionText } from "../src/i18n/aiDecisionLocale";
import { formatAiDecisionStatus } from "../src/ui/aiDecisionStatus";

type Diagnostics = Pick<AiDecisionTelemetry, "navigation" | "gunnery">;
const allReasons: AiMainGunHoldReason[] = [
  "torpedo-selected", "withdrawal", "smoke", "cover", "no-track", "out-of-range",
  "arc", "salvo-window", "no-guns", "gun-disabled", "reloading",
];
const diagnostics = (): Diagnostics => ({
  navigation: { phase: "reorienting", throttleLimit: 0, forwardClear: false, exitCommitted: true },
  gunnery: { requested: false, holdReasons: ["arc", "salvo-window"], readyMounts: 1,
    operationalMounts: 3, totalMounts: 4, reloadSeconds: 12.5 },
});

describe("developer AI decision diagnostics", () => {
  it("keeps every dedicated label and reason populated in all seven languages", () => {
    for (const row of Object.values(AI_DECISION_MESSAGES)) {
      expect(row).toHaveLength(7);
      for (const text of row) expect(text.trim()).not.toBe("");
    }
    for (const locale of SUPPORTED_GAME_LOCALES) {
      const input = diagnostics();
      input.gunnery!.holdReasons = allReasons;
      const view = formatAiDecisionStatus(input, locale);
      for (const reason of allReasons) expect(view.gunnery).toContain(aiDecisionText(locale, reason));
      expect(view.navigation).toContain(aiDecisionText(locale, "reorienting"));
      expect(view.mounts).toContain(aiDecisionText(locale, "mounts"));
      expect(Object.values(view).join(" ")).not.toMatch(/undefined|NaN/);
    }
  });

  it("switches languages directly without retaining earlier translated strings or mutating telemetry", () => {
    const input = diagnostics();
    const before = structuredClone(input);
    const chinese = formatAiDecisionStatus(input, "zh-CN");
    const english = formatAiDecisionStatus(input, "en-US");
    const russian = formatAiDecisionStatus(input, "ru-RU");
    expect(english.navigation).toContain("Reorienting");
    expect(english.gunnery).not.toMatch(/[㐀-鿿]/);
    expect(russian.gunnery).toContain("Намерение ГК");
    expect(russian.gunnery).not.toContain("Main-gun");
    expect(formatAiDecisionStatus(input, "zh-CN")).toEqual(chinese);
    expect(input).toEqual(before);
  });

  it("renders absent legacy diagnostics as unknown in every language", () => {
    for (const locale of SUPPORTED_GAME_LOCALES) {
      for (const input of [undefined, {}]) {
        const view = formatAiDecisionStatus(input, locale);
        for (const value of Object.values(view)) expect(value).toContain(aiDecisionText(locale, "unknown"));
        expect(view.gunnery).not.toContain(aiDecisionText(locale, "requested"));
      }
    }
  });

  it("does not interpret absent navigation observations as a blocked path or a released heading", () => {
    const view = formatAiDecisionStatus({ navigation: { phase: "cruising" } }, "en-US");
    expect(view.navigation).toBe("Navigation (last plan): Regular navigation · Forward corridor: Unknown · Exit heading held: Unknown · Throttle limit: Unknown");
    expect(view.gunnery).toContain("Unknown");
    expect(view.mounts).toContain("Unknown");
  });

  it("keeps an explicit false corridor and zero throttle distinct from unknown", () => {
    const view = formatAiDecisionStatus(diagnostics(), "en-US");
    expect(view.navigation).toContain("Forward corridor: Blocked");
    expect(view.navigation).toContain("Exit heading held: Yes");
    expect(view.navigation).toContain("Throttle limit: 0%");
    expect(view.navigation).not.toContain("Unknown");
  });

  it("labels all navigation phases without claiming a successful recovery", () => {
    for (const phase of ["cruising", "reversing", "reorienting"] as const) {
      const view = formatAiDecisionStatus({ navigation: { phase, forwardClear: true, exitCommitted: false } }, "en-US");
      expect(view.navigation).toContain(aiDecisionText("en-US", phase));
      expect(view.navigation).toContain("Forward corridor: Clear");
      expect(view.navigation).toContain("Exit heading held: No");
      expect(view.navigation).not.toContain("Recovered");
    }
  });

  it("separates a fire request from an unready or disabled main battery", () => {
    const input = diagnostics();
    input.gunnery = { requested: true, holdReasons: ["reloading", "gun-disabled"],
      readyMounts: 0, operationalMounts: 2, totalMounts: 4, reloadSeconds: 18 };
    const view = formatAiDecisionStatus(input, "en-US");
    expect(view.gunnery).toBe("Main-gun intent (not a firing result): Fire requested · Restrictions: Reloading / Main guns disabled");
    expect(view.mounts).toContain("Mounts at decision time · Ready: 0/4 · Operational: 2/4");
    expect(view.mounts).toContain("18.0 s");
    expect(Object.values(view).join(" ")).not.toMatch(/fired|hit|已发射|已命中/);
  });

  it("shows multiple restriction reasons in supplied order without duplicates", () => {
    const input = diagnostics();
    input.gunnery!.holdReasons = ["withdrawal", "cover", "no-track", "cover"];
    const view = formatAiDecisionStatus(input, "en-US");
    expect(view.gunnery).toContain("Restrictions: Concealment during withdrawal / Seeking cover / No stable local track");
    expect(view.gunnery.match(/Seeking cover/g)).toHaveLength(1);
  });

  it("shows no restrictions as none without turning readiness into a firing claim", () => {
    const input = diagnostics();
    input.gunnery = { requested: false, holdReasons: [], readyMounts: 4, operationalMounts: 4, totalMounts: 4, reloadSeconds: 0 };
    const view = formatAiDecisionStatus(input, "en-US");
    expect(view.gunnery).toContain("No fire request · Restrictions: None");
    expect(view.mounts).toContain("Ready: 4/4");
    expect(view.mounts).toContain("Earliest reload: 0.0 s");
  });

  it("does not display an infinite or missing reload as zero", () => {
    const input = diagnostics();
    input.gunnery!.reloadSeconds = Infinity;
    expect(formatAiDecisionStatus(input, "en-US").mounts).toContain("Earliest reload: No finite estimate");
    for (const reload of [undefined, NaN, -Infinity]) {
      input.gunnery!.reloadSeconds = reload;
      expect(formatAiDecisionStatus(input, "en-US").mounts).toContain("Earliest reload: Unknown");
    }
    input.gunnery!.reloadSeconds = -0.001;
    expect(formatAiDecisionStatus(input, "en-US").mounts).toContain("Earliest reload: 0.0 s");
  });

  it("uses locale-aware numeric formatting for fractional reloads", () => {
    expect(formatAiDecisionStatus(diagnostics(), "en-US").mounts).toContain("12.5 s");
    expect(formatAiDecisionStatus(diagnostics(), "de-DE").mounts).toContain("12,5 s");
  });
});
