import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTerrainManeuverGuard } from "../src/controllers/aiTerrainManeuverGuard";
import { AiTerrainRecovery } from "../src/controllers/aiTerrainRecovery";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { AiManeuverScheduler } from "../src/sim/aiManeuverScheduler";
import { FIXED_STEP } from "../src/sim/config";
import { advanceShipKinematics, createShipKinematicSnapshot, shipKinematicParameters } from "../src/sim/navigationKinematics";
import { constrainShipTerrainMotion, shipTerrainFootprintContact } from "../src/sim/shipFootprint";
import { terrainNavigationAt, shipDraftMeters } from "../src/maps/atollMap";
import { createInitialState, createDeveloperShipState } from "../src/sim/simulation";
import type { Observation, ShipState } from "../src/sim/types";

type Controls = { throttle: number; rudder: number };
const mapId = "atoll-prototype" as const;
const ordinary: Controls = { throttle: .35, rudder: -.82 };
const neutral: Controls = { throttle: 0, rudder: 0 };
function approach() {
  const ship = createDeveloperShipState({ id: "continuation", team: "player", shipClassId: "edinburgh",
    position: { x: 1716.718394917268, y: 0, z: 1259.1558367375565 }, heading: -.37734690229167844,
    aiControlled: true, mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  ship.speedKnots = 4.954934015343935; ship.rudder = -.82;
  ship.modules.engine.health = 170.0268526021338; ship.modules.steering.health = 136.97632928536274;
  return ship;
}
function stationary() {
  const ship = createDeveloperShipState({ id: "continuation", team: "player", shipClassId: "edinburgh",
    position: { x: 1695, y: 0, z: 1282 }, heading: -.5,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  ship.speedKnots = 0; ship.rudder = 0; return ship;
}
function observation(ship: ShipState, time: number): Observation {
  return { self: ship, time, mapId, contacts: [], friendlies: [], incomingTorpedoes: [],
    objective: { center: { x: 0, y: 0, z: 0 }, radius: 500, captureProgress: 0, contested: false,
      scores: { player: 0, enemy: 0 } } };
}
function motion(ship: Readonly<ShipState>, controls: Controls) {
  const from = createShipKinematicSnapshot(ship), next = createShipKinematicSnapshot(ship);
  const water = terrainNavigationAt(mapId, ship.position.x, ship.position.z, shipDraftMeters(ship.shipClassId));
  advanceShipKinematics(next, shipKinematicParameters(ship), controls, water.speedMultiplier, FIXED_STEP);
  return { next, sweep: constrainShipTerrainMotion(mapId, ship.shipClassId, from, next) };
}
function advanceChecked(ship: ShipState, controls: Controls) {
  const { next, sweep } = motion(ship, controls);
  expect(sweep.blocked || sweep.rotationBlocked || sweep.budgetExhausted || sweep.contact.blocked).toBeFalsy();
  // Apply the real unconstrained kernel output, never the collision-corrected safe pose.
  Object.assign(ship, next);
  expect(shipTerrainFootprintContact(mapId, ship.shipClassId, ship).blocked).toBe(false);
}
function checkBudget(scheduler: AiManeuverScheduler) {
  expect(scheduler.work.motionSteps).toBeLessThanOrEqual(1024);
  expect(scheduler.work.terrainQueries).toBeLessThanOrEqual(64);
}
function runningGuard() {
  const ship = approach(), guard = new AiTerrainManeuverGuard(), scheduler = new AiManeuverScheduler();
  for (let frame = 0; frame < 120; frame++) {
    const time = 565 + frame * FIXED_STEP;
    scheduler.beginFrame(time, [ship.id]);
    const out = guard.command(observation(ship, time), ordinary, scheduler);
    scheduler.runBackground(); checkBudget(scheduler); advanceChecked(ship, out);
    if (guard.getTelemetry().phase === "braking") return { ship, guard, scheduler, time: time + FIXED_STEP };
  }
  throw new Error("The continuously integrated approach did not enter a real recovery episode");
}
afterEach(() => vi.restoreAllMocks());

describe("safe continuation after a terrain plan becomes invalid", () => {
  it("keeps checked neutral ownership during natural repair without declaring that stopping completed recovery", () => {
    const state = createInitialState(123, "sea-trials");
    state.mapId = mapId; state.airSupport = "none"; state.airSquadrons = [];
    const human = state.ships.find(s => s.id === "player")!; human.position = { x: -5000, y: 0, z: -5000 };
    const ship = approach(); state.ships = [human, ship];
    const session = new LocalBattleSession(state, { experimentalTerrainManeuvers: true });
    const initialEngine = ship.modules.engine.health, start = { ...ship.position };
    let parameterChanges = 0, checkedContinuations = 0, ownerStarted = false, unsafe = 0, releases = 0, rejoined = 0;
    let previousEngine = initialEngine, actualPath = 0;
    let lastConfirmation: { shipId: string; engine: number; status: string } | undefined;
    const confirm = AiManeuverScheduler.prototype.confirm;
    vi.spyOn(AiManeuverScheduler.prototype, "confirm").mockImplementation(function (this: AiManeuverScheduler, id, map, s, plan) {
      const out = confirm.call(this, id, map, s, plan);
      lastConfirmation = { shipId: id, engine: s.modules.engine.health, status: out.status };
      return out;
    });
    const command = RuleBasedAi.prototype.command;
    vi.spyOn(RuleBasedAi.prototype, "command").mockImplementation(function (this: RuleBasedAi, o, scheduler) {
      const out = command.call(this, o, scheduler);
      if (o.self.id !== ship.id) return out;
      const telemetry = this.getManeuverTelemetry();
      ownerStarted ||= telemetry.phase === "braking";
      if (ownerStarted && out.throttle > 0) releases++;
      if (telemetry.phase === "rejoined") rejoined++;
      if (telemetry.reason === "physical-parameters-changed") {
        expect(out.throttle).toBe(0); expect(out.rudder).toBe(0);
        expect(telemetry.phase).toBe("settling");
        expect(lastConfirmation).toEqual({ shipId: ship.id, engine: o.self.modules.engine.health, status: "clear" });
        checkedContinuations++;
      }
      const { sweep } = motion(o.self, out);
      if (sweep.blocked || sweep.rotationBlocked || sweep.budgetExhausted || sweep.contact.blocked) unsafe++;
      return out;
    });
    const background = AiManeuverScheduler.prototype.runBackground;
    vi.spyOn(AiManeuverScheduler.prototype, "runBackground").mockImplementation(function (this: AiManeuverScheduler) {
      background.call(this); checkBudget(this);
    });
    for (let frame = 0; frame < 1200; frame++) {
      const previous = { ...ship.position }; session.step(new Map(), FIXED_STEP);
      actualPath += Math.hypot(ship.position.x - previous.x, ship.position.z - previous.z);
      if (ship.modules.engine.health !== previousEngine) parameterChanges++;
      previousEngine = ship.modules.engine.health;
      if (shipTerrainFootprintContact(mapId, ship.shipClassId, ship).blocked) unsafe++;
    }
    expect(parameterChanges).toBeGreaterThan(100); expect(checkedContinuations).toBeGreaterThan(100);
    expect(ship.modules.engine.health).toBeGreaterThan(initialEngine);
    expect(unsafe).toBe(0); expect(releases).toBe(0); expect(rejoined).toBe(0);
    expect(ship.speedKnots).toBe(0); expect(ship.rudder).toBe(0);
    expect(actualPath).toBeGreaterThan(5);
    expect(Math.hypot(ship.position.x - start.x, ship.position.z - start.z)).toBeGreaterThan(5);
    // This is safe arrest/continuation only. Sustained useful travel and rejoin remain separate strict QA gates.
  }, 10000);

  it.each([
    ["engine damage", (s: ShipState) => { s.modules.engine.health *= .5; }],
    ["steering damage", (s: ShipState) => { s.modules.steering.health *= .5; }],
    ["flooding", (s: ShipState) => { s.flooding = 80; }],
    ["equipment", (s: ShipState) => { s.performance.turnMultiplier *= .5; }],
    ["forced zero speed", (s: ShipState) => { s.developer = { enabled: true, unrestrictedWeapons: false,
      infiniteAmmunition: false, instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 0 }; }],
  ] as const)("uses a fresh current-state neutral prefix after %s instead of resuming the invalid old sequence", (_label, change) => {
    const { ship, guard, scheduler, time } = runningGuard();
    change(ship); const changedParameters = shipKinematicParameters(ship), confirmation = vi.spyOn(scheduler, "confirm");
    const before = structuredClone(ship); scheduler.beginFrame(time, [ship.id]);
    const out = guard.command(observation(ship, time), ordinary, scheduler);
    expect(ship).toEqual(before); expect(out).toEqual(neutral);
    expect(guard.getTelemetry()).toMatchObject({ phase: "settling", reason: "physical-parameters-changed" });
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(shipKinematicParameters(confirmation.mock.calls[0]![2])).toEqual(changedParameters);
    expect(confirmation.mock.results[0]!.value.status).toBe("clear");
    scheduler.runBackground(); checkBudget(scheduler); advanceChecked(ship, out);
    for (let frame = 1; frame < 600; frame++) {
      scheduler.beginFrame(time + frame * FIXED_STEP, [ship.id]);
      const next = guard.command(observation(ship, time + frame * FIXED_STEP), ordinary, scheduler);
      scheduler.runBackground(); checkBudget(scheduler); advanceChecked(ship, next);
      expect(guard.getTelemetry().phase).not.toBe("recovery-failed");
    }
  }, 10000);

  it("discards a genuinely completed old-physics receipt and later submits a new generation after settling", () => {
    const ship = stationary(), scheduler = new AiManeuverScheduler(), controls = { throttle: .12, rudder: -.82 };
    const recovery = new AiTerrainRecovery(observation(ship, 0), controls, 0);
    let time = 0, oldGeneration: number | undefined;
    for (let frame = 0; frame < 120; frame++) {
      time = frame * FIXED_STEP; scheduler.beginFrame(time, [ship.id]);
      const result = recovery.command(observation(ship, time), controls, scheduler);
      scheduler.runBackground(); checkBudget(scheduler); advanceChecked(ship, result.controls);
      const completed = scheduler.result(ship.id);
      if (completed) { oldGeneration = completed.generation; time += FIXED_STEP; break; }
    }
    expect(oldGeneration).toBeDefined();
    const submit = vi.spyOn(scheduler, "submit");
    ship.modules.engine.health *= .5;
    scheduler.beginFrame(time, [ship.id]);
    const changed = recovery.command(observation(ship, time), controls, scheduler);
    expect(changed).toEqual({ controls: neutral, done: false });
    expect(scheduler.result(ship.id)).toBeUndefined();
    expect(recovery.getTelemetry().phase).toBe("settling");
    scheduler.runBackground(); advanceChecked(ship, changed.controls);
    for (let frame = 1; frame < 120 && submit.mock.calls.length === 0; frame++) {
      const at = time + frame * FIXED_STEP; scheduler.beginFrame(at, [ship.id]);
      const result = recovery.command(observation(ship, at), controls, scheduler);
      scheduler.runBackground(); checkBudget(scheduler); advanceChecked(ship, result.controls);
    }
    expect(submit.mock.calls.length).toBeGreaterThan(0);
    expect(submit.mock.results.some(result => typeof result.value === "number" && result.value > oldGeneration!)).toBe(true);
  });

  it("retains explicitly unverified neutral control through a temporary empty budget and freshly confirms when budget returns", () => {
    const { ship, guard, scheduler, time } = runningGuard();
    const unavailable = new AiManeuverScheduler({ maxMotionSteps: 0, maxTerrainQueries: 0 });
    for (let frame = 0; frame < 3; frame++) {
      const at = time + frame * FIXED_STEP; unavailable.beginFrame(at, [ship.id]);
      const out = guard.command(observation(ship, at), ordinary, unavailable);
      expect(out).toEqual(neutral);
      expect(guard.getTelemetry().phase).toBe("unverified"); expect(guard.getTelemetry().reason).toMatch(/budget/);
      unavailable.runBackground(); expect(unavailable.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
      // Independent fixture observation does not turn the controller's unavailable proof into a clear result.
      advanceChecked(ship, out);
    }
    const confirmation = vi.spyOn(scheduler, "confirm"), at = time + 3 * FIXED_STEP;
    scheduler.beginFrame(at, [ship.id]);
    const out = guard.command(observation(ship, at), ordinary, scheduler);
    expect(out).toEqual(neutral); expect(confirmation).toHaveBeenCalledTimes(1);
    expect(confirmation.mock.results[0]!.value.status).toBe("clear");
    expect(guard.getTelemetry().phase).toBe("holding");
    expect(guard.getTelemetry().phase).not.toBe("rejoined");
    scheduler.runBackground(); checkBudget(scheduler); advanceChecked(ship, out);
  });

  it("retains checked hold after the deadline without resetting an episode or declaring stationary progress", () => {
    const ship = stationary(), scheduler = new AiManeuverScheduler(), controls = { throttle: .12, rudder: -.82 };
    ship.modules.engine.health = 150;
    const recovery = new AiTerrainRecovery(observation(ship, 0), controls, 0);
    const submissions = vi.spyOn(scheduler, "submit");
    const start = { ...ship.position }; let held: Controls = neutral, deadlineSeen = false, path = 0;
    // Controller observations are 0.2s apart (within its documented freshness bound).
    // Every intervening 60Hz physics tick still executes the held order and full-hull sweep.
    for (let observationIndex = 0; observationIndex <= 520; observationIndex++) {
      if (observationIndex > 0) for (let tick = 0; tick < 12; tick++) {
        const before = { ...ship.position }; advanceChecked(ship, held);
        path += Math.hypot(ship.position.x - before.x, ship.position.z - before.z);
      }
      const time = observationIndex * .2;
      // Periodic repair prevents stable-parameter planning; it must not reset the episode's original deadline.
      if (time <= 100) ship.modules.engine.health += .001;
      scheduler.beginFrame(time, [ship.id]);
      const result = recovery.command(observation(ship, time), controls, scheduler);
      const telemetry = recovery.getTelemetry();
      expect(result.done).toBe(false); expect(result.controls).toEqual(neutral);
      expect(telemetry.phase).not.toBe("rejoined");
      if (time > 100 && telemetry.reason === "recovery-deadline") deadlineSeen = true;
      held = result.controls; scheduler.runBackground(); checkBudget(scheduler);
    }
    expect(deadlineSeen).toBe(true); expect(path).toBe(0); expect(ship.position).toEqual(start);
    expect(submissions.mock.calls.length).toBeGreaterThan(0);
    // After exploration has expired, a periodic forward rejoin check must not restart turn/retreat attempts.
    expect(submissions.mock.calls.every(call => call[3].length === 1)).toBe(true);
    expect(recovery.getTelemetry().attempts).toBe(0);
  }, 10000);
});
