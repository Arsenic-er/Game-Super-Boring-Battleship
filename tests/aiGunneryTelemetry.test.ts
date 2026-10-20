import { describe, expect, it } from "vitest";
import { aiGunneryTelemetry, type AiGunneryDecisionFacts } from "../src/controllers/aiGunneryTelemetry";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { replicationViewFor } from "../src/net/replicationView";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { AiDecisionTelemetry, ControlCommand, ShipState } from "../src/sim/types";
import { fleetDiagnosticSnapshot } from "./helpers/fleetDiagnosticSnapshots";

const allowed: AiGunneryDecisionFacts = {
  preparingTorpedoes: false, fireIntent: true, concealmentRetreat: false,
  smokeSuppression: false, seekingCover: false, tracking: true,
  inRange: true, bearingAllowed: true, inSalvoWindow: true,
};
function fixture() {
  const ship = createDeveloperShipState({ id: "gun-diagnostics", team: "player",
    shipClassId: "richelieu", position: { x: 0, y: 0, z: 0 }, heading: 0,
    mainGunMounts: 2, torpedoLauncherMounts: 0, depthChargeMounts: 0, secondaryGunIds: [],
  });
  for (const mount of ship.mainBatteryMounts) mount.reloadRemaining = 0;
  const aim = { x: 0, y: 0, z: 2000 };
  const explain = (facts: Partial<AiGunneryDecisionFacts> = {}) => aiGunneryTelemetry(ship, aim, { ...allowed, ...facts });
  return { ship, aim, explain };
}
const idle = (ship: ShipState): ControlCommand => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } });
const decision = (): AiDecisionTelemetry => ({ role: "line", phase: "searching",
  desiredHeading: 0, throttle: 0, fireIntent: false,
  navigation: { phase: "reorienting", throttleLimit: 0, forwardClear: false, exitCommitted: true },
  gunnery: { requested: false, holdReasons: ["no-track"], readyMounts: 2, operationalMounts: 2, totalMounts: 2, reloadSeconds: 0 },
});

describe("read-only main-gun decision diagnostics", () => {
  it("reports loaded eligible mounts without claiming an actual shot", () => {
    const { ship, aim, explain } = fixture();
    const before = structuredClone({ ship, aim });
    expect(explain()).toEqual({ requested: true, holdReasons: [], readyMounts: 2, operationalMounts: 2, totalMounts: 2, reloadSeconds: 0 });
    expect({ ship, aim }).toEqual(before);
    expect(explain({ fireIntent: false }).requested).toBe(false);
  });
  it("keeps actual fire intent while reload blocks mount readiness, without a health-scaled timer", () => {
    const { ship, explain } = fixture();
    ship.modules.gun.health *= .5;
    ship.mainBatteryMounts[0]!.reloadRemaining = 9;
    ship.mainBatteryMounts[1]!.reloadRemaining = 4;
    expect(explain()).toMatchObject({ requested: true, holdReasons: ["reloading"], readyMounts: 0, operationalMounts: 2, reloadSeconds: 4 });
    ship.mainBatteryMounts[1]!.reloadRemaining = 0;
    expect(explain()).toMatchObject({ holdReasons: [], readyMounts: 1, reloadSeconds: 0 });
  });
  it("does not confuse a torpedo request with a main-gun request", () => {
    expect(fixture().explain({ preparingTorpedoes: true })).toMatchObject({ requested: false, holdReasons: ["torpedo-selected"] });
  });
  it.each([
    ["concealmentRetreat", "withdrawal"], ["smokeSuppression", "smoke"], ["seekingCover", "cover"],
  ] as const)("explains the existing %s policy without replacing its command", (flag, reason) => {
    expect(fixture().explain({ [flag]: true, fireIntent: false })).toMatchObject({ requested: false, holdReasons: [reason] });
  });
  it("reports overlapping policy restrictions while avoiding fictitious target range checks without tracking", () => {
    const { explain } = fixture();
    expect(explain({ tracking: false, inRange: false, bearingAllowed: false, inSalvoWindow: false,
      concealmentRetreat: true, seekingCover: true, fireIntent: false }).holdReasons).toEqual(["withdrawal", "cover", "no-track"]);
    expect(explain({ inRange: false, bearingAllowed: false, inSalvoWindow: false, fireIntent: false }).holdReasons)
      .toEqual(["out-of-range", "salvo-window", "arc"]);
  });
  it("separates absent guns, disabled guns, and damaged individual mounts", () => {
    const { ship, explain } = fixture();
    ship.mainBatteryMounts[0]!.health = 0;
    expect(explain()).toMatchObject({ readyMounts: 1, operationalMounts: 1, totalMounts: 2 });
    ship.modules.gun.health = 0;
    expect(explain()).toMatchObject({ requested: true, readyMounts: 0, operationalMounts: 0, holdReasons: ["gun-disabled"], reloadSeconds: undefined });
    ship.modules.gun.health = ship.modules.gun.maxHealth;
    ship.mainBatteryMounts[1]!.health = 0;
    expect(explain().holdReasons).toEqual(["gun-disabled"]);
    ship.mainBatteryMounts = [];
    expect(explain()).toMatchObject({ readyMounts: 0, totalMounts: 0, holdReasons: ["no-guns"] });
  });
  it("uses the given own gun aim for readiness; illegal arcs have no reload estimate", () => {
    const { ship, aim, explain } = fixture();
    aim.z = -2000;
    const before = structuredClone(ship);
    expect(explain({ bearingAllowed: false })).toMatchObject({ holdReasons: ["arc"], readyMounts: 0, operationalMounts: 2, reloadSeconds: undefined });
    expect(ship).toEqual(before);
  });
  it("wires real AI command intent and no-track restriction without inventing a target", () => {
    const state = createInitialState(889, "sea-trials");
    state.mapId = "open-sea-range";
    const { ship } = fixture(); state.ships = [ship];
    const command = new RuleBasedAi(771).command(observe(state, ship.id));
    expect(command.fire).toBe(false);
    expect(command.aiDecision?.gunnery?.requested).toBe(false);
    expect(command.aiDecision?.gunnery?.holdReasons).toContain("no-track");
    expect(command.aiDecision?.navigation?.phase).toBe("cruising");
  });
  it("isolates nested telemetry in simulation and diagnostic snapshots", () => {
    const state = createInitialState(890, "sea-trials");
    state.mapId = "open-sea-range";
    const { ship } = fixture(); state.ships = [ship];
    const original = decision();
    stepSimulation(state, new Map([[ship.id, { ...idle(ship), aiDecision: original }]]), FIXED_STEP);
    expect(ship.aiDecision).toEqual(original);
    original.navigation!.exitCommitted = false;
    original.gunnery!.holdReasons.push("smoke");
    expect(ship.aiDecision!.navigation!.exitCommitted).toBe(true);
    expect(ship.aiDecision!.gunnery!.holdReasons).toEqual(["no-track"]);
    const snapshot = fleetDiagnosticSnapshot(state);
    snapshot.ships[0]!.aiDecision!.navigation!.forwardClear = true;
    snapshot.ships[0]!.aiDecision!.gunnery!.holdReasons.push("cover");
    expect(ship.aiDecision!.navigation!.forwardClear).toBe(false);
    expect(ship.aiDecision!.gunnery!.holdReasons).toEqual(["no-track"]);
  });
  it("does not add AI policy information to any replicated ship", () => {
    const state = createInitialState(891, "battle");
    const baseline = replicationViewFor(state, "player", 6, 0);
    for (const ship of state.ships) ship.aiDecision = decision();
    expect(replicationViewFor(state, "player", 6, 0)).toEqual(baseline);
    expect(JSON.stringify(baseline)).not.toContain("aiDecision");
  });
});
