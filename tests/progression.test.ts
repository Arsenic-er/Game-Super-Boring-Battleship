import { describe, expect, it, vi } from "vitest";
import {
  createDefaultLocalProfile, isUsableProfileV7, loadLocalProfile, loadLocalProfileWithStatus,
  normalizeLocalProfile, PROFILE_STORAGE_KEY, saveLocalProfile, setCommanderName,
  type LocalProfile, type ProfileSaveResult, type ProfileStorage,
} from "../src/profile/localProfile";
import { BattleProgression, createBattleLaunchContext, settleBattle, type BattleResult } from "../src/progression/battleProgression";
import { normalizeSettledBattles } from "../src/progression/settlementRecords";
import {
  advanceOnboarding, createOnboardingState, normalizeOnboardingState, ONBOARDING_MOVE_METERS,
  shouldOfferOnboarding, skipOnboarding, startOnboarding,
} from "../src/progression/onboarding";
import { createInitialState } from "../src/sim/simulation";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reward = { credits: 2200, researchPoints: 90, steel: 4, parts: 12, supplyTokens: 1 };
const zeroReward = { credits: 0, researchPoints: 0, steel: 0, parts: 0, supplyTokens: 0 };
const result = (n = 1, status: BattleResult["status"] = "player-won"): BattleResult => ({
  battleId: id(n), status,
  performance: { durationSeconds: 99, damageDealt: 75, shellHits: 3, torpedoHits: 2, shipsSunk: 1, playerScore: 42, enemyScore: 17 },
});
const context = (n = 1) => createBattleLaunchContext({ origin: "solo", mode: "battle", tutorialEligible: true }, () => id(n))!;
function storage(entries: Record<string, unknown> = {}, error?: string) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]));
  const target: ProfileStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: vi.fn((key, value) => { if (error) throw Object.assign(new Error("blocked"), { name: error }); values.set(key, value); }),
  };
  return { target, values };
}
const legacy = () => ({ ...createDefaultLocalProfile(), version: 6, onboarding: undefined, settledBattles: undefined,
  commanderName: "Veteran", credits: 34751, researchPoints: 1567, battlesCompleted: 9, drawCount: 23 });

describe("profile v7 persistence", () => {
  it("preserves every v6 economy, inventory, slot, and blueprint field and marks veterans complete", () => {
    const source = legacy();
    const { target, values } = storage({ "grey-sea-local-profile-v6": source });
    const oldBytes = values.get("grey-sea-local-profile-v6");
    const loaded = loadLocalProfileWithStatus(target);
    expect(loaded.source).toBe("v7");
    expect(loaded.migrationSaveResult).toEqual({ ok: true });
    for (const [key, value] of Object.entries(source)) {
      if (!["version", "onboarding", "settledBattles"].includes(key)) expect(loaded.profile[key as keyof LocalProfile]).toEqual(value);
    }
    expect(loaded.profile.onboarding.status).toBe("completed");
    expect(loaded.profile.settledBattles).toEqual([]);
    expect(values.get("grey-sea-local-profile-v6")).toBe(oldBytes);
    expect(JSON.parse(values.get(PROFILE_STORAGE_KEY)!)).toEqual(loaded.profile);
  });
  it("does not offer veteran teaching but keeps a zero-battle migrated profile new", () => {
    expect(normalizeLocalProfile({ ...legacy(), battlesCompleted: 0 }).onboarding.status).toBe("not-started");
  });
  it.each([
    ["version", 6], ["commanderName", null], ["credits", "9"], ["researchPoints", null],
    ["supplyTokens", {}], ["drawCount", "1"], ["battlesCompleted", []],
    ["materials", []], ["inventory", null], ["unlockedEquipment", []], ["loadout", []],
    ["slotLoadoutsByShipClass", 9], ["onboarding", []], ["recentDraws", {}],
    ["savedShipBuilds", null], ["settledBattles", {}], ["hullId", 3], ["shipClassId", false],
    ["selectedBattleBuildId", {}], ["credits", -1], ["shipClassId", "unknown"],
  ])("falls back to untouched valid v6 for fatal %s corruption (%j)", (key, value) => {
    const corrupt = { ...createDefaultLocalProfile(), [key]: value };
    expect(isUsableProfileV7(corrupt)).toBe(false);
    const { target } = storage({ [PROFILE_STORAGE_KEY]: corrupt, "grey-sea-local-profile-v6": legacy() });
    expect(loadLocalProfile(target).credits).toBe(34751);
  });
  it("rejects nonfinite top-level economics before normalization", () => {
    expect(isUsableProfileV7({ ...createDefaultLocalProfile(), credits: Infinity })).toBe(false);
  });
  it("repairs bounded numbers, invalid nested entries, and malformed onboarding without resetting the profile", () => {
    const source = { ...createDefaultLocalProfile(), credits: 3_000_000, drawCount: -3,
      materials: { steel: -9, parts: "bad" }, inventory: { unknown: 12 },
      savedShipBuilds: [{ shipClassId: "bad" }], onboarding: { version: 22, status: "bad" },
      settledBattles: [{ battleId: id(1), reward: { credits: "bad" } }] };
    expect(isUsableProfileV7(source)).toBe(true);
    const { target } = storage({ [PROFILE_STORAGE_KEY]: source, "grey-sea-local-profile-v6": legacy() });
    const loaded = loadLocalProfile(target);
    expect(loaded.credits).toBe(999999);
    expect(loaded.drawCount).toBe(0);
    expect(loaded.materials.steel).toBe(0);
    expect(loaded.inventory.unknown).toBeUndefined();
    expect(loaded.savedShipBuilds).toEqual([]);
    expect(loaded.onboarding.status).toBe("not-started");
    expect(loaded.settledBattles).toEqual([{ battleId: id(1), reward: zeroReward }]);
  });
  it("keeps legacy bytes and legacy source status on migration write failure", () => {
    const { target, values } = storage({ "grey-sea-local-profile-v6": legacy() }, "QuotaExceededError");
    const before = new Map(values);
    const loaded = loadLocalProfileWithStatus(target);
    expect(loaded.source).toBe("legacy");
    expect(loaded.profile.commanderName).toBe("Veteran");
    expect(loaded.migrationSaveResult).toEqual({ ok: false, error: "quota" });
    expect(values).toEqual(before);
  });
  it("skips unparsable v7 and structurally empty v6 and reaches an older valid profile", () => {
    const { target, values } = storage({ "grey-sea-local-profile-v6": {}, "grey-sea-local-profile-v5": legacy() });
    values.set(PROFILE_STORAGE_KEY, "{broken");
    expect(loadLocalProfile(target).credits).toBe(34751);
  });
  it.each([["QuotaExceededError", "quota"], ["SecurityError", "storage-unavailable"], ["Error", "unknown"]])(
    "reports %s save errors explicitly", (name, expected) => {
      expect(saveLocalProfile(createDefaultLocalProfile(), storage({}, name).target)).toEqual({ ok: false, error: expected });
    },
  );
});

describe("bounded settlement ledger and immutable transaction", () => {
  it("keeps the newest duplicate and only the most recent 128 valid UUIDs", () => {
    const entries = Array.from({ length: 140 }, (_, n) => ({ battleId: id(n), reward }));
    const normalized = normalizeSettledBattles([...entries, { battleId: id(20), reward: zeroReward }, { battleId: "bad", reward }]);
    expect(normalized).toHaveLength(128);
    expect(normalized[0]!.battleId).toBe(id(12));
    expect(normalized.at(-1)).toEqual({ battleId: id(20), reward: zeroReward });
    expect(new Set(normalized.map((entry) => entry.battleId)).size).toBe(128);
  });
  it("preserves valid IDs with damaged reward as zero and never rewards them again", () => {
    const profile = normalizeLocalProfile({ ...createDefaultLocalProfile(), settledBattles: [{ battleId: id(1), reward: null }] });
    const settled = settleBattle(profile, result());
    expect(settled.applied).toBe(false);
    expect(settled.reward).toEqual(zeroReward);
    expect(settled.profileAfter.credits).toBe(profile.credits);
  });
  it.each([["player-won", 2200], ["enemy-won", 1400], ["draw", 1700]] as const)("awards %s once, including after restart", (status, credits) => {
    const profile = createDefaultLocalProfile();
    const first = settleBattle(profile, result(1, status));
    expect(first.applied).toBe(true);
    expect(first.reward.credits).toBe(credits);
    expect(first.profileAfter.credits).toBe(profile.credits + credits);
    expect(first.profileAfter.battlesCompleted).toBe(1);
    expect(profile.battlesCompleted).toBe(0);
    const { target } = storage();
    expect(saveLocalProfile(first.profileAfter, target).ok).toBe(true);
    const duplicate = settleBattle(loadLocalProfile(target), result(1, "enemy-won"));
    expect(duplicate.applied).toBe(false);
    expect(duplicate.reward).toEqual(first.reward);
    expect(duplicate.profileAfter).toEqual(first.profileAfter);
  });
  it("reuses the identical frozen profileAfter across navigation, failed retries, and write locks", () => {
    let failing = true;
    const writes: LocalProfile[] = [];
    const save = vi.fn((profile: LocalProfile): ProfileSaveResult => {
      writes.push(profile); return failing ? { ok: false, error: "quota" } : { ok: true };
    });
    const progress = new BattleProgression(createDefaultLocalProfile(), save);
    progress.beginBattle(context());
    const original = result();
    progress.finishBattle(context(), original);
    const pending = progress.pending!;
    original.performance.damageDealt = 999;
    expect(pending.result.performance.damageDealt).toBe(75);
    expect(Object.isFrozen(pending.settlement.profileAfter.inventory)).toBe(true);
    expect(() => { pending.settlement.profileAfter.credits = 1; }).toThrow();
    expect(() => { progress.profile.credits = 1; }).toThrow();
    expect(progress.profile.credits).toBe(12000);
    progress.leaveBattle();
    expect(progress.beginBattle(null)).toEqual({ ok: true });
    expect(progress.pending).toBe(pending);
    expect(progress.updateProfile(setCommanderName(progress.profile, "Changed"))).toEqual({ ok: false, error: "pending-settlement" });
    expect(progress.updateOnboarding(startOnboarding())).toEqual({ ok: false, error: "pending-settlement" });
    expect(progress.beginBattle(context(2))).toEqual({ ok: false, error: "quota" });
    expect(progress.pending).toBe(pending);
    expect(progress.profile.battlesCompleted).toBe(0);
    failing = false;
    expect(progress.retryPending()).toEqual({ ok: true });
    expect(writes.every((profile) => profile === pending.settlement.profileAfter)).toBe(true);
    expect(progress.pending).toBeNull();
    expect(progress.profile.battlesCompleted).toBe(1);
    expect(progress.profile.credits).toBe(14200);
    expect(progress.beginBattle(context(2))).toEqual({ ok: true });
    expect(progress.updateProfile(setCommanderName(progress.profile, "Changed")).ok).toBe(true);
  });
  it("does not recalculate or resave repeated successful terminal rendering", () => {
    const save = vi.fn((): ProfileSaveResult => ({ ok: true }));
    const progress = new BattleProgression(createDefaultLocalProfile(), save);
    progress.beginBattle(context());
    const first = progress.finishBattle(context(), result());
    expect(progress.finishBattle(context(), result(1, "enemy-won"))).toBe(first);
    expect(save).toHaveBeenCalledTimes(1);
    expect(progress.profile.battlesCompleted).toBe(1);
  });
  it("never rewards LAN, sea trials, stale launch contexts, or developer-invalidated battles", () => {
    const progress = new BattleProgression(createDefaultLocalProfile(), () => ({ ok: true }));
    for (const origin of ["lan", "sea-trials"] as const) {
      expect(createBattleLaunchContext({ origin, mode: "battle" }, () => { throw new Error("no UUID expected"); })).toBeNull();
    }
    expect(createBattleLaunchContext({ origin: "solo", mode: "sea-trials" })).toBeNull();
    expect(progress.finishBattle(context(), result()).eligible).toBe(false);
    progress.beginBattle(context()); progress.invalidateRewards();
    expect(progress.finishBattle(context(), result()).eligible).toBe(false);
    progress.beginBattle(context(2)); progress.leaveBattle();
    expect(progress.finishBattle(context(2), result(2)).eligible).toBe(false);
    expect(progress.finishBattle(null, result()).eligible).toBe(false);
    expect(progress.profile.battlesCompleted).toBe(0);
  });
  it("generates new immutable UUIDs for new starts and rejects malformed IDs", () => {
    let next = 1;
    const launch = () => createBattleLaunchContext({ origin: "solo", mode: "battle", savedBuildId: "build" }, () => id(next++))!;
    const first = launch();
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.savedBuildId).toBe("build");
    expect(launch().battleId).not.toBe(first.battleId);
    expect(() => createBattleLaunchContext({ origin: "solo", mode: "battle" }, () => "bad")).toThrow();
  });
});

describe("first-voyage successful actions", () => {
  it("requires thirty travelled metres, actual aim, a real shot, and a successfully opened map in order", () => {
    let state = startOnboarding();
    expect(ONBOARDING_MOVE_METERS).toBe(30);
    expect(advanceOnboarding(state, { distanceTravelled: 29, isAiming: true, playerShot: true, mapOpened: true })).toBe(state);
    state = advanceOnboarding(state, { distanceTravelled: 30 });
    expect(state.currentStepId).toBe("aim");
    expect(advanceOnboarding(state, { playerShot: true })).toBe(state);
    state = advanceOnboarding(state, { isAiming: true });
    expect(state.currentStepId).toBe("fire");
    expect(advanceOnboarding(state, { playerShot: false })).toBe(state);
    state = advanceOnboarding(state, { playerShot: true });
    expect(state.currentStepId).toBe("objective");
    expect(advanceOnboarding(state, { mapOpened: false })).toBe(state);
    state = advanceOnboarding(state, { mapOpened: true });
    expect(state.status).toBe("completed");
    expect(shouldOfferOnboarding(state)).toBe(false);
  });
  it("persists and resumes the current step, supports both skip paths, and restarts completed tutorials", () => {
    const active = advanceOnboarding(startOnboarding(), { distanceTravelled: 30 });
    const { target } = storage();
    saveLocalProfile({ ...createDefaultLocalProfile(), onboarding: active }, target);
    expect(startOnboarding(loadLocalProfile(target).onboarding)).toEqual(active);
    expect(skipOnboarding(createOnboardingState()).status).toBe("skipped");
    expect(skipOnboarding(active).seenStepIds).toEqual(["move"]);
    expect(startOnboarding(createOnboardingState(true)).currentStepId).toBe("move");
    expect(normalizeOnboardingState({ version: 1, status: "active", currentStepId: "bogus" }).currentStepId).toBe("move");
  });
  it("keeps unsaved tutorial progress in memory while failed ordinary writes remain uncommitted", () => {
    const progress = new BattleProgression(createDefaultLocalProfile(), () => ({ ok: false, error: "quota" }));
    expect(progress.updateProfile(setCommanderName(progress.profile, "not saved")).ok).toBe(false);
    expect(progress.profile.commanderName).not.toBe("not saved");
    expect(progress.updateOnboarding(startOnboarding()).ok).toBe(false);
    expect(progress.profile.onboarding.status).toBe("active");
  });
  it("really constructs one ship on each side in clear weather", () => {
    const state = createInitialState(17, "battle", undefined, undefined, undefined, undefined, { teamSize: 1, weatherId: "clear" });
    expect(state.ships.filter((ship) => ship.team === "player")).toHaveLength(1);
    expect(state.ships.filter((ship) => ship.team === "enemy")).toHaveLength(1);
    expect(state.weatherId).toBe("clear");
  });
});
