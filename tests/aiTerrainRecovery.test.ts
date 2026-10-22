import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTerrainRecovery } from "../src/controllers/aiTerrainRecovery";
import { AiTerrainManeuverGuard } from "../src/controllers/aiTerrainManeuverGuard";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { AiManeuverScheduler } from "../src/sim/aiManeuverScheduler";
import { FIXED_STEP } from "../src/sim/config";
import { advanceShipKinematics, createShipKinematicSnapshot, shipKinematicParameters } from "../src/sim/navigationKinematics";
import { constrainShipTerrainMotion, shipTerrainFootprintContact } from "../src/sim/shipFootprint";
import { shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { createDeveloperShipState, createInitialState } from "../src/sim/simulation";
import type { Observation, ShipState } from "../src/sim/types";

type Controls = { throttle: number; rudder: number };
const ordinary: Controls = { throttle: .35, rudder: -.82 };
const mapId = "atoll-prototype" as const;
function makeApproach() {
  const ship = createDeveloperShipState({ id: "recovery-test", team: "player", shipClassId: "edinburgh",
    position: { x: 1716.718394917268, y: 0, z: 1259.1558367375565 }, heading: -.37734690229167844,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  ship.speedKnots = 4.954934015343935; ship.rudder = -.82;
  ship.modules.engine.health = 170.0268526021338;
  ship.modules.steering.health = 136.97632928536274;
  return ship;
}
function makeNeutralLock() {
  const ship = createDeveloperShipState({ id: "audit", team: "player", shipClassId: "edinburgh",
    position: { x: 1695, y: 0, z: 1282 }, heading: -.5, aiControlled: true,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  ship.speedKnots = .3; ship.rudder = -.82;
  return ship;
}
function observation(ship: ShipState, time: number): Observation {
  return { self: ship, time, mapId, contacts: [], friendlies: [], incomingTorpedoes: [],
    objective: { center: { x: 0, y: 0, z: 0 }, radius: 500, captureProgress: 0,
      contested: false, scores: { player: 0, enemy: 0 } } };
}
/** Independent safety observation; never write a collision-corrected pose into the test. */
function intendedMotion(ship: ShipState, controls: Controls) {
  const from = createShipKinematicSnapshot(ship), next = createShipKinematicSnapshot(ship);
  const water = terrainNavigationAt(mapId, ship.position.x, ship.position.z, shipDraftMeters(ship.shipClassId));
  advanceShipKinematics(next, shipKinematicParameters(ship), controls, water.speedMultiplier, FIXED_STEP);
  return { next, sweep: constrainShipTerrainMotion(mapId, ship.shipClassId, from, next) };
}
function budget(scheduler: AiManeuverScheduler) {
  expect(scheduler.work.motionSteps).toBeLessThanOrEqual(1024);
  expect(scheduler.work.terrainQueries).toBeLessThanOrEqual(64);
}
function ongoingRecovery() {
  const ship = makeApproach(), guard = new AiTerrainManeuverGuard(), scheduler = new AiManeuverScheduler();
  for (let frame = 0; frame < 120; frame++) {
    const time = 565 + frame * FIXED_STEP;
    scheduler.beginFrame(time, [ship.id]);
    const out = guard.command(observation(ship, time), ordinary, scheduler);
    scheduler.runBackground(); budget(scheduler);
    const { next, sweep } = intendedMotion(ship, out);
    expect(sweep.blocked || sweep.rotationBlocked || sweep.budgetExhausted || sweep.contact.blocked).toBeFalsy();
    Object.assign(ship, next);
    if (guard.getTelemetry().phase === "braking") return { ship, guard, scheduler, time: time + FIXED_STEP };
  }
  throw new Error("No real continuously integrated recovery episode began");
}
afterEach(() => vi.restoreAllMocks());

describe("experimental terrain recovery with real executed movement", () => {
  it("makes real progress from neutral lock for 60 seconds without treating arrest as recovery completion", () => {
    const state = createInitialState(123, "sea-trials");
    state.mapId = mapId; state.airSupport = "none"; state.airSquadrons = [];
    const human = state.ships.find(ship => ship.id === "player")!;
    human.position = { x: -5000, y: 0, z: -5000 };
    const ship = makeNeutralLock(); state.ships = [human, ship];
    expect(shipTerrainFootprintContact(mapId, ship.shipClassId, ship).blocked).toBe(false);
    const session = new LocalBattleSession(state, { experimentalTerrainManeuvers: true });
    const start = { ...ship.position };
    let path = 0, last30Path = 0, maxMotion = 0, maxGeometry = 0, ownedTicks = 0;
    let firstUnsafe: { time: number; kind: string } | undefined;
    const realCommand = RuleBasedAi.prototype.command;
    vi.spyOn(RuleBasedAi.prototype, "command").mockImplementation(function (this: RuleBasedAi, o, scheduler) {
      const out = realCommand.call(this, o, scheduler);
      if (o.self.id === ship.id) {
        const phase = this.getManeuverTelemetry().phase;
        if (["braking", "recovery-planning", "retreating", "turning", "settling"].includes(phase)) ownedTicks++;
        const { sweep } = intendedMotion(o.self as ShipState, out);
        if (sweep.blocked || sweep.rotationBlocked || sweep.budgetExhausted || sweep.contact.blocked) {
          firstUnsafe ??= { time: o.time, kind: "intended-full-hull-sweep" };
        }
      }
      return out;
    });
    const background = AiManeuverScheduler.prototype.runBackground;
    vi.spyOn(AiManeuverScheduler.prototype, "runBackground").mockImplementation(function (this: AiManeuverScheduler) {
      const out = background.call(this);
      maxMotion = Math.max(maxMotion, this.work.motionSteps);
      maxGeometry = Math.max(maxGeometry, this.work.terrainQueries);
      return out;
    });
    for (let frame = 0; frame < 3600; frame++) {
      const before = { ...ship.position };
      session.step(new Map(), FIXED_STEP);
      // distanceTravelled is not used: collision resolution can undo a kernel move without undoing that counter.
      const distance = Math.hypot(ship.position.x - before.x, ship.position.z - before.z);
      path += distance; if (frame >= 1800) last30Path += distance;
      if (shipTerrainFootprintContact(mapId, ship.shipClassId, ship).blocked) {
        firstUnsafe ??= { time: state.time, kind: "actual-full-hull-contact" };
      }
    }
    const net = Math.hypot(ship.position.x - start.x, ship.position.z - start.z);
    expect({ firstUnsafe, path, net, last30Path }).toMatchObject({ firstUnsafe: undefined });
    expect(path).toBeGreaterThan(5); expect(net).toBeGreaterThan(5); expect(last30Path).toBeGreaterThan(5);
    expect(ownedTicks).toBeGreaterThan(0);
    expect(maxMotion).toBeLessThanOrEqual(1024); expect(maxGeometry).toBeLessThanOrEqual(64);
  }, 15000);

  it("settles the actual damaged 565 hull and rudder after at most six seconds of steered braking before retreat", () => {
    const ship = makeApproach(), guard = new AiTerrainManeuverGuard(), scheduler = new AiManeuverScheduler();
    let firstBrake: number | undefined, neutralOrderAt: number | undefined, firstReverse: number | undefined;
    let stableTicks = 0, nonzeroActualRudderAtNeutralOrder = false, planningFromSettled = false;
    for (let frame = 0; frame < 60 * 60; frame++) {
      const time = 565 + frame * FIXED_STEP;
      stableTicks = ship.speedKnots === 0 && ship.rudder === 0 ? stableTicks + 1 : 0;
      scheduler.beginFrame(time, [ship.id]);
      const out = guard.command(observation(ship, time), ordinary, scheduler);
      const phase = guard.getTelemetry().phase;
      if (phase === "braking") {
        firstBrake ??= time;
        if (time - firstBrake >= 6 - 1e-8) expect(out.rudder).toBe(0);
        if (out.rudder === 0 && neutralOrderAt === undefined) {
          neutralOrderAt = time; nonzeroActualRudderAtNeutralOrder = Math.abs(ship.rudder) > .01;
        }
      }
      if (phase === "recovery-planning") {
        expect(ship.speedKnots).toBe(0); expect(ship.rudder).toBe(0);
        expect(stableTicks).toBeGreaterThanOrEqual(3); planningFromSettled = true;
      }
      if (out.throttle < 0 && firstReverse === undefined) {
        firstReverse = time;
        expect(ship.speedKnots).toBe(0); expect(ship.rudder).toBe(0);
        expect(stableTicks).toBeGreaterThanOrEqual(3);
      }
      scheduler.runBackground(); budget(scheduler);
      const { next, sweep } = intendedMotion(ship, out);
      expect(sweep.blocked || sweep.rotationBlocked || sweep.budgetExhausted || sweep.contact.blocked).toBeFalsy();
      Object.assign(ship, next);
      if (firstReverse !== undefined) break;
    }
    expect(firstBrake).toBeDefined(); expect(neutralOrderAt).toBeDefined();
    expect(neutralOrderAt! - firstBrake!).toBeLessThanOrEqual(6 + FIXED_STEP);
    expect(nonzeroActualRudderAtNeutralOrder).toBe(true); expect(planningFromSettled).toBe(true);
    expect(firstReverse).toBeDefined();
  }, 10000);

  it("retains recovery ownership after a verified retreat has become actual negative speed", () => {
    const ship = makeNeutralLock(), guard = new AiTerrainManeuverGuard(), scheduler = new AiManeuverScheduler();
    const controls = { throttle: .12, rudder: -.82 };
    let ownedNegativeTicks = 0;
    for (let frame = 0; frame < 60 * 45; frame++) {
      const time = frame * FIXED_STEP;
      scheduler.beginFrame(time, [ship.id]);
      const wasNegative = ship.speedKnots < -.05;
      const requested = wasNegative ? { throttle: .88, rudder: -.82 } : controls;
      const out = guard.command(observation(ship, time), requested, scheduler);
      scheduler.runBackground(); budget(scheduler);
      if (wasNegative && guard.getTelemetry().phase === "retreating") {
        expect(out).toEqual({ throttle: -.25, rudder: 0 }); ownedNegativeTicks++;
      }
      const { next, sweep } = intendedMotion(ship, out);
      expect(sweep.blocked || sweep.rotationBlocked || sweep.budgetExhausted || sweep.contact.blocked).toBeFalsy();
      Object.assign(ship, next);
      if (ownedNegativeTicks >= 30) break;
    }
    expect(ownedNegativeTicks).toBeGreaterThanOrEqual(30);
  }, 10000);

  it("does not starve checked retreat when ordinary helm tracking makes tiny changes every tick", () => {
    const ship = makeNeutralLock(); ship.speedKnots = 0; ship.rudder = 0;
    const controls = { throttle: .12, rudder: -.82 };
    const scheduler = new AiManeuverScheduler();
    const recovery = new AiTerrainRecovery(observation(ship, 0), controls, 0);
    const submissions = vi.spyOn(scheduler, "submit");
    let retreatTicks = 0, path = 0;
    for (let frame = 0; frame < 240; frame++) {
      const time = frame * FIXED_STEP, before = { ...ship.position };
      scheduler.beginFrame(time, [ship.id]);
      const result = recovery.command(observation(ship, time),
        { throttle: .12, rudder: -.82 + Math.sin(frame) * .0001 }, scheduler);
      scheduler.runBackground(); budget(scheduler);
      expect(result.done).toBe(false);
      if (recovery.getTelemetry().phase === "retreating") retreatTicks++;
      const { next, sweep } = intendedMotion(ship, result.controls);
      expect(sweep.blocked || sweep.rotationBlocked || sweep.budgetExhausted || sweep.contact.blocked).toBeFalsy();
      Object.assign(ship, next);
      path += Math.hypot(ship.position.x - before.x, ship.position.z - before.z);
    }
    expect(submissions.mock.calls.length).toBeLessThan(10);
    expect(retreatTicks).toBeGreaterThan(30); expect(path).toBeGreaterThan(1);
  });

  it("invalidates an ongoing sequence when the actual rudder reverses despite an unchanged helm order", () => {
    const { ship, guard, scheduler, time } = ongoingRecovery();
    ship.rudder = -ship.rudder; scheduler.beginFrame(time, [ship.id]);
    expect(guard.command(observation(ship, time), ordinary, scheduler)).toEqual(ordinary);
    expect(guard.getTelemetry()).toMatchObject({ phase: "recovery-failed", reason: "recovery-motion-diverged" });
    expect(scheduler.getTelemetry()).toMatchObject({ queuedOwners: 0, completedOwners: 0 });
  });

  it("yields immediately to emergency controls and cancels the existing recovery", () => {
    const { ship, guard, scheduler, time } = ongoingRecovery();
    const emergency = { throttle: -.2, rudder: .9 };
    scheduler.beginFrame(time, [ship.id]);
    expect(guard.command(observation(ship, time), emergency, scheduler, true)).toEqual(emergency);
    expect(guard.getTelemetry()).toMatchObject({ phase: "inactive", reason: "existing-emergency-or-recovery" });
    expect(scheduler.getTelemetry()).toMatchObject({ queuedOwners: 0, completedOwners: 0 });
    const { next } = intendedMotion(ship, emergency); Object.assign(ship, next);
    scheduler.beginFrame(time + FIXED_STEP, [ship.id]);
    guard.command(observation(ship, time + FIXED_STEP), ordinary, scheduler);
    expect(["braking", "retreating", "settling", "rejoined"]).not.toContain(guard.getTelemetry().phase);
  });

  it("hands an explicit external astern order priority over its active recovery", () => {
    const { ship, guard, scheduler, time } = ongoingRecovery();
    const external = { throttle: -.1, rudder: .7 };
    scheduler.beginFrame(time, [ship.id]);
    expect(guard.command(observation(ship, time), external, scheduler)).toEqual(external);
    expect(guard.getTelemetry()).toMatchObject({ phase: "inactive", reason: "external-astern-order" });
    expect(scheduler.getTelemetry()).toMatchObject({ queuedOwners: 0, completedOwners: 0 });
  });

  it.each([
    ["engine", (s: ShipState) => { s.modules.engine.health *= .5; }],
    ["steering", (s: ShipState) => { s.modules.steering.health *= .5; }],
    ["flooding", (s: ShipState) => { s.flooding = 80; }],
    ["equipment", (s: ShipState) => { s.performance.turnMultiplier *= .5; }],
    ["forced zero speed", (s: ShipState) => { s.developer = { enabled: true, unrestrictedWeapons: false,
      infiniteAmmunition: false, instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 0 }; }],
  ] as const)("invalidates the old recovery after a physical %s change", (_label, mutate) => {
    const { ship, guard, scheduler, time } = ongoingRecovery();
    mutate(ship); scheduler.beginFrame(time, [ship.id]);
    expect(guard.command(observation(ship, time), ordinary, scheduler)).toEqual(ordinary);
    expect(guard.getTelemetry()).toMatchObject({ phase: "recovery-failed", reason: "recovery-state-changed" });
    expect(scheduler.getTelemetry()).toMatchObject({ queuedOwners: 0, completedOwners: 0 });
  });

  it("does not continue an old sequence or label it safe when the live confirmation budget is exhausted", () => {
    const { ship, guard, time } = ongoingRecovery();
    const exhausted = new AiManeuverScheduler({ maxMotionSteps: 0, maxTerrainQueries: 0 });
    exhausted.beginFrame(time, [ship.id]);
    expect(guard.command(observation(ship, time), ordinary, exhausted)).toEqual(ordinary);
    expect(guard.getTelemetry().phase).toBe("unverified");
    expect(guard.getTelemetry().reason).toMatch(/budget/);
    expect(exhausted.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
  });

  it("refuses a non-fixed recovery step instead of overshooting a checked maneuver segment", () => {
    const { ship, guard, scheduler, time } = ongoingRecovery();
    const confirmation = vi.spyOn(scheduler, "confirm"), before = structuredClone(ship);
    scheduler.beginFrame(time, [ship.id], .17);
    expect(guard.command(observation(ship, time), ordinary, scheduler)).toEqual(ordinary);
    expect(guard.getTelemetry()).toMatchObject({ phase: "inactive", reason: "unsupported-step" });
    expect(confirmation).not.toHaveBeenCalled(); expect(ship).toEqual(before);
    expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
    expect(scheduler.getTelemetry()).toMatchObject({ queuedOwners: 0, completedOwners: 0 });
  });

  it.each(["position", "time rewind"] as const)("invalidates an ongoing sequence on unexpected %s", kind => {
    const { ship, guard, scheduler, time } = ongoingRecovery();
    const at = kind === "time rewind" ? time - 1 : time;
    if (kind === "position") ship.position.x += 2;
    scheduler.beginFrame(at, [ship.id]);
    expect(guard.command(observation(ship, at), ordinary, scheduler)).toEqual(ordinary);
    expect(guard.getTelemetry().phase).toBe(kind === "position" ? "recovery-failed" : "inactive");
    expect(guard.getTelemetry().reason).toBe(kind === "position" ? "recovery-motion-diverged" : "timeline-reset");
    expect(scheduler.getTelemetry()).toMatchObject({ queuedOwners: 0, completedOwners: 0 });
  });
});
