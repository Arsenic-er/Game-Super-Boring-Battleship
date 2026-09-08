import { describe, it, expect, vi } from "vitest";
import { VoyageSession } from "../src/app/voyageSession";
import { createDefaultLocalProfile, type ProfileSaveResult } from "../src/profile/localProfile";
import { createInitialState } from "../src/sim/simulation";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { voyageResultMarkup } from "../src/ui/voyagePanel";
import type { GameLaunchRequest } from "../src/sim/battleSetup";
import type { BattleStepOutput } from "../src/session/battleSession";

const id1 = "12345678-1234-4123-8123-123456789001";
const id2 = "12345678-1234-4123-8123-123456789002";
const saved: () => ProfileSaveResult = () => ({ ok: true });
function started(save = saved, tutorial = false) {
  const app = new VoyageSession(createDefaultLocalProfile(), save);
  const request = app.tutorialRequest()!;
  const launch = app.launch(request, tutorial, () => id1);
  if (!launch.ok) throw new Error("Expected launch");
  const e = launch.equipment;
  const state = createInitialState(123, "battle", e.mainGunId, e, e.torpedoId, e.shipClassId, { teamSize: 1, weatherId: "clear" });
  const frame = new LocalBattleSession(state);
  const output = (): BattleStepOutput => ({ state, shots: [], impacts: [], airEvents: [] });
  return { app, request, launch, state, frame, output };
}
describe("first-voyage application lifecycle", () => {
  it("starts the chosen saved ship as real clear 1v1, preserves installed slot order", () => {
    const { app, request, state, launch } = started(saved, true);
    expect(request).toMatchObject({ mode: "battle", teamSize: 1, weatherId: "clear" });
    expect(state.ships.filter((s) => s.team === "player")).toHaveLength(1);
    expect(state.ships.filter((s) => s.team === "enemy")).toHaveLength(1);
    expect(state.ships[0]!.speedKnots).toBe(0);
    expect(state.ships[0]!.installedEquipment).toEqual(app.profile.savedShipBuilds[0]!.slots);
    expect(launch.context?.savedBuildId).toBe(app.profile.selectedBattleBuildId);
    expect(app.tutorialActive).toBe(true);
  });
  it("never substitutes an unrelated editable loadout for a deleted or unselected blueprint", () => {
    const { app, request } = started();
    expect(app.launch({ ...request, buildId: "missing" } as GameLaunchRequest)).toEqual({ ok: false, reason: "buildUnavailable" });
    expect(app.context?.battleId).toBe(id1);
  });
  it("requires real movement, aiming, a player gun shot, then actual map opening", () => {
    const { app, state, output } = started(saved, true);
    state.ships[0]!.distanceTravelled = 29;
    app.observe(output(), false); expect(app.profile.onboarding.currentStepId).toBe("move");
    state.ships[0]!.distanceTravelled = 30;
    app.observe(output(), false); expect(app.profile.onboarding.currentStepId).toBe("aim");
    app.advance({ mapOpened: true }); expect(app.profile.onboarding.currentStepId).toBe("aim");
    app.observe(output(), true); expect(app.profile.onboarding.currentStepId).toBe("fire");
    app.observe({ ...output(), shots: [{ id: 1, ownerId: "ally", team: "player", kind: "shell", position: { x: 0, y: 0, z: 0 } }] }, true);
    expect(app.profile.onboarding.currentStepId).toBe("fire");
    app.observe({ ...output(), shots: [{ id: 2, ownerId: "player", team: "player", kind: "shell", weaponSource: "mainGun", position: { x: 0, y: 0, z: 0 } }] }, true);
    expect(app.profile.onboarding.currentStepId).toBe("objective");
    app.advance({ mapOpened: true }); expect(app.profile.onboarding.status).toBe("completed");
  });
  it("queues replay from pause without replacing or invalidating this battle", () => {
    const { app, state } = started(saved, true);
    app.queueTutorialReplay();
    expect(app.context?.battleId).toBe(id1); expect(app.tutorialActive).toBe(false);
    state.status = "player-won";
    expect(app.finish(state)?.eligible).toBe(true);
    expect(app.profile.onboarding.status).toBe("not-started");
    const request = app.tutorialRequest()!;
    expect(app.launch(request, true, () => id2).ok).toBe(true);
    expect(app.context?.battleId).toBe(id2); expect(app.tutorialActive).toBe(true);
  });
  it("persists immutable rewards once, retains target across returning to menu", () => {
    const save = vi.fn(saved); const { app, state } = started(save);
    state.status = "player-won"; state.endReason = "score";
    const first = app.finish(state)!; const count = save.mock.calls.length;
    expect(app.finish(state)).toBe(first); expect(save).toHaveBeenCalledTimes(count);
    expect(app.profile.battlesCompleted).toBe(1);
    const target = app.getDockTarget(); app.leave();
    expect(app.context).toBe(null); expect(app.getDockTarget()).toEqual(target);
    app.clearDockTarget(); expect(app.getDockTarget()).toBeUndefined();
  });
  it("retains pending across menu and sea trials, blocks another reward match", () => {
    let fail = true;
    const save = vi.fn((): ProfileSaveResult => fail ? { ok: false, error: "quota" } : { ok: true });
    const { app, state, request } = started(save);
    state.status = "enemy-won";
    const completion = app.finish(state)!; const pending = app.progression.pending;
    expect(completion.saveResult?.ok).toBe(false); expect(app.profile.battlesCompleted).toBe(0);
    app.leave(); expect(app.progression.pending).toBe(pending);
    expect(app.launch({ mode: "sea-trials" }, false, () => id2).ok).toBe(true);
    expect(app.progression.pending).toBe(pending);
    expect(app.launch(request, false, () => id2)).toEqual({ ok: false, reason: "profileLocked" });
    expect(app.progression.updateProfile({ ...app.profile, commanderName: "wrong" })).toEqual({ ok: false, error: "pending-settlement" });
    fail = false; expect(app.retry().ok).toBe(true); expect(app.profile.battlesCompleted).toBe(1);
    expect(app.progression.pending).toBeNull();
    expect(app.launch(request, false, () => id2).ok).toBe(true);
  });
  it("developer mutation removes economic eligibility without hiding the report", () => {
    const { app, state } = started();
    app.invalidateRewards(); state.status = "player-won";
    expect(app.finish(state)?.eligible).toBe(false); expect(app.profile.battlesCompleted).toBe(0);
  });
  it("renders pending balance as unavailable and does not offer another reward battle", () => {
    const html = voyageResultMarkup({ status: "player-won", reason: "<not-markup>", durationSeconds: 930,
      damageDealt: 120, shellHits: 5, torpedoHits: 2, shipsSunk: 1, playerScore: 375, enemyScore: 50,
      reward: { credits: 99, researchPoints: 10, steel: 2, parts: 2, supplyTokens: 1 },
      balances: { credits: 999999, researchPoints: 10, steel: 2, parts: 2, supplyTokens: 1 }, saveState: "pending" }, "en-US");
    expect(html).toContain("15:30"); expect(html).toContain('data-voyage="retry"');
    expect(html).toContain('data-voyage="again" disabled'); expect(html).not.toContain("999,999");
    expect(html).toContain("&lt;not-markup&gt;");
  });
});
