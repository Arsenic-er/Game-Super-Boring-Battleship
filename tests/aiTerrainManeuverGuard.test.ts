import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTerrainManeuverGuard, needsTerrainManeuverPrediction } from "../src/controllers/aiTerrainManeuverGuard";
import * as terrain from "../src/maps/atollMap";
import { AiManeuverScheduler } from "../src/sim/aiManeuverScheduler";
import { FIXED_STEP } from "../src/sim/config";
import { advanceShipKinematics, createShipKinematicSnapshot, shipKinematicParameters } from "../src/sim/navigationKinematics";
import { constrainShipTerrainMotion, shipTerrainFootprintContact } from "../src/sim/shipFootprint";
import { createDeveloperShipState } from "../src/sim/simulation";
import type { Observation, ShipState } from "../src/sim/types";

type Controls = { throttle: number; rudder: number };
const ordered: Controls = { throttle: .35, rudder: -.82 };
function approach(id = "a4-565"): ShipState {
  const ship = createDeveloperShipState({ id, team: "player", shipClassId: "edinburgh",
    position: { x: 1716.718394917268, y: 0, z: 1259.1558367375565 }, heading: -.37734690229167844,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  ship.speedKnots = 4.954934015343935; ship.rudder = -.82;
  ship.modules.engine.health = 170.0268526021338; ship.modules.steering.health = 136.97632928536274;
  return ship;
}
function observation(ship: ShipState, time: number, mapId: terrain.BattleMapId = "atoll-prototype"): Observation {
  return { self: ship, time, mapId, contacts: [], friendlies: [], incomingTorpedoes: [],
    objective: { center: { x: 0, y: 0, z: 0 }, radius: 500, captureProgress: 0,
      contested: false, scores: { player: 0, enemy: 0 } } };
}
/** Real motion kernel with frozen damage: never collision-correct or teleport a failed trajectory. */
function advance(ship: ShipState, controls: Controls): boolean {
  const from = createShipKinematicSnapshot(ship), next = createShipKinematicSnapshot(ship);
  const water = terrain.terrainNavigationAt("atoll-prototype", from.position.x, from.position.z,
    terrain.shipDraftMeters(ship.shipClassId));
  advanceShipKinematics(next, shipKinematicParameters(ship), controls, water.speedMultiplier, FIXED_STEP);
  const sweep = constrainShipTerrainMotion("atoll-prototype", ship.shipClassId, from, next);
  Object.assign(ship, next);
  return sweep.blocked || Boolean(sweep.rotationBlocked) || sweep.contact.blocked;
}
function prepareAdvice() {
  const ship = approach(), guard = new AiTerrainManeuverGuard(), scheduler = new AiManeuverScheduler();
  for (let i = 0; i < 80; ++i) {
    const time = 565 + i * FIXED_STEP;
    scheduler.beginFrame(time, [ship.id]);
    const out = guard.command(observation(ship, time), ordered, scheduler);
    scheduler.runBackground();
    if (out.throttle === 0) return { ship, guard, scheduler, time };
  }
  throw new Error("Expected concrete blocked-primary/safe-stop advice within a bounded queue delay");
}
afterEach(() => vi.restoreAllMocks());

describe("preventive terrain maneuver advice", () => {
  it("reproduces the natural constant-order contact at 8 seconds without a guard", () => {
    const ship = approach(); let contactAt: number | undefined;
    for (let step = 0; step < 600; ++step) if (advance(ship, ordered)) {
      contactAt = (step + 1) * FIXED_STEP; break;
    }
    expect(contactAt).toBeCloseTo(8, 8);
  });

  it("uses actual guarded orders for a continuous approach, not just a one-frame safe prefix", () => {
    const ship = approach(), guard = new AiTerrainManeuverGuard(), scheduler = new AiManeuverScheduler();
    const start = { ...ship.position }; let firstBrake: number | undefined, collisionAt: number | undefined;
    let brakeRun = 0, longestBrakeRun = 0, brakeReleases = 0, previousBrake = false;
    for (let step = 0; step < 60 * 30; ++step) {
      const time = 565 + step * FIXED_STEP, before = structuredClone(ship);
      scheduler.beginFrame(time, [ship.id]);
      const output = guard.command(observation(ship, time), ordered, scheduler);
      expect(ship).toEqual(before);
      const braking = output.throttle === 0;
      if (braking) firstBrake ??= step * FIXED_STEP;
      if (previousBrake && !braking) brakeReleases++;
      brakeRun = braking ? brakeRun + FIXED_STEP : 0;
      longestBrakeRun = Math.max(longestBrakeRun, brakeRun); previousBrake = braking;
      scheduler.runBackground();
      expect(scheduler.work.motionSteps).toBeLessThanOrEqual(1024);
      expect(scheduler.work.terrainQueries).toBeLessThanOrEqual(64);
      if (advance(ship, output)) { collisionAt = (step + 1) * FIXED_STEP; break; }
    }
    expect({ collisionAt, firstBrake, longestBrakeRun, brakeReleases }).toMatchObject({ collisionAt: undefined });
    expect(firstBrake).toBeDefined(); expect(firstBrake!).toBeLessThan(1.5);
    expect(longestBrakeRun).toBeGreaterThan(5);
    // A clear one-tick prefix must not conceal repeated low-speed brake/release chatter.
    expect(brakeReleases).toBeLessThanOrEqual(10);
    expect(Math.hypot(ship.position.x - start.x, ship.position.z - start.z)).toBeLessThan(35);
  }, 10000);

  it("does not mutate live state while producing braking advice", () => {
    const { ship, guard, scheduler, time } = prepareAdvice(), before = structuredClone(ship);
    scheduler.beginFrame(time + FIXED_STEP, [ship.id]);
    expect(guard.command(observation(ship, time + FIXED_STEP), ordered, scheduler).throttle).toBe(0);
    expect(ship).toEqual(before);
  });

  it("gives explicit emergency/recovery controls priority and cancels old advice", () => {
    const { ship, guard, scheduler, time } = prepareAdvice();
    scheduler.beginFrame(time + FIXED_STEP, [ship.id]);
    expect(guard.command(observation(ship, time + FIXED_STEP), ordered, scheduler, true)).toEqual(ordered);
    expect(guard.getTelemetry()).toMatchObject({ phase: "inactive", reason: "existing-emergency-or-recovery" });
    expect(scheduler.getTelemetry().queuedOwners).toBe(0);
    expect(scheduler.getTelemetry().completedOwners).toBe(0);
  });

  it.each([
    ["engine", (s: ShipState) => { s.modules.engine.health *= .5; }],
    ["steering", (s: ShipState) => { s.modules.steering.health *= .5; }],
    ["equipment", (s: ShipState) => { s.performance.turnMultiplier = .5; }],
    ["flooding", (s: ShipState) => { s.flooding = 80; }],
    ["forced speed", (s: ShipState) => { s.developer = { enabled: true, unrestrictedWeapons: false,
      infiniteAmmunition: false, instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 15 }; }],
  ] as const)("discards old braking advice after material %s changes", (_name, change) => {
    const { ship, guard, scheduler, time } = prepareAdvice(); change(ship);
    scheduler.beginFrame(time + FIXED_STEP, [ship.id]);
    expect(guard.command(observation(ship, time + FIXED_STEP), ordered, scheduler)).toEqual(ordered);
    expect(guard.getTelemetry().phase).not.toBe("braking");
  });

  it.each(["time", "position", "heading", "controls"] as const)("does not reuse stale %s advice", kind => {
    const { ship, guard, scheduler, time } = prepareAdvice();
    const at = kind === "time" ? time + 2 : time + FIXED_STEP;
    if (kind === "position") ship.position.x += 50;
    if (kind === "heading") ship.heading += .4;
    const controls = kind === "controls" ? { throttle: .9, rudder: .82 } : ordered;
    scheduler.beginFrame(at, [ship.id]);
    expect(guard.command(observation(ship, at), controls, scheduler)).toEqual(controls);
    expect(guard.getTelemetry().phase).not.toBe("braking");
  });

  it("never reports pending zero-budget work as clear or applies an unverified override", () => {
    const ship = approach(), guard = new AiTerrainManeuverGuard();
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 0, maxTerrainQueries: 0 });
    for (let frame = 0; frame < 10; ++frame) {
      const time = 565 + frame * FIXED_STEP;
      scheduler.beginFrame(time, [ship.id]);
      expect(guard.command(observation(ship, time), ordered, scheduler)).toEqual(ordered);
      scheduler.runBackground();
      expect(guard.getTelemetry().phase).not.toBe("clear");
      expect(guard.getTelemetry().phase).not.toBe("braking");
      expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
    }
  });

  it("withholds a previously advised override when this tick has no fresh confirmation budget", () => {
    const { ship, guard, time } = prepareAdvice();
    const exhausted = new AiManeuverScheduler({ maxMotionSteps: 0, maxTerrainQueries: 0 });
    exhausted.beginFrame(time + FIXED_STEP, [ship.id]);
    expect(guard.command(observation(ship, time + FIXED_STEP), ordered, exhausted)).toEqual(ordered);
    expect(guard.getTelemetry().phase).toBe("unverified");
    expect(guard.getTelemetry().reason).toMatch(/budget/);
  });

  it("does not take ownership of a pre-existing hull/terrain overlap", () => {
    const ship = approach(), guard = new AiTerrainManeuverGuard(), scheduler = new AiManeuverScheduler();
    ship.position = { x: 1680, y: 0, z: 1790 };
    expect(shipTerrainFootprintContact("atoll-prototype", ship.shipClassId, ship).blocked).toBe(true);
    for (let i = 0; i < 25; ++i) {
      const time = 565 + i * FIXED_STEP; scheduler.beginFrame(time, [ship.id]);
      expect(guard.command(observation(ship, time), ordered, scheduler)).toEqual(ordered);
      scheduler.runBackground();
      expect(guard.getTelemetry().phase).not.toBe("braking");
    }
  });

  it("keeps fourteen approaching ships within one shared frame budget while giving every ship advice", () => {
    const fleet = Array.from({ length: 14 }, (_, i) => ({ ship: approach("shared-" + i),
      guard: new AiTerrainManeuverGuard(), firstBrake: undefined as number | undefined, collisionAt: undefined as number | undefined }));
    const scheduler = new AiManeuverScheduler(), ids = fleet.map(x => x.ship.id);
    for (let frame = 0; frame < 60 * 16; ++frame) {
      const time = 565 + frame * FIXED_STEP; scheduler.beginFrame(time, ids);
      const outputs = fleet.map(({ ship, guard }) => guard.command(observation(ship, time), ordered, scheduler));
      scheduler.runBackground();
      expect(scheduler.work.motionSteps).toBeLessThanOrEqual(1024);
      expect(scheduler.work.terrainQueries).toBeLessThanOrEqual(64);
      for (let i = 0; i < fleet.length; ++i) {
        const entry = fleet[i]!, output = outputs[i]!;
        if (output.throttle === 0) entry.firstBrake ??= frame * FIXED_STEP;
        if (advance(entry.ship, output)) entry.collisionAt ??= (frame + 1) * FIXED_STEP;
      }
      if (fleet.some(x => x.collisionAt !== undefined)) break;
    }
    expect(fleet.map(({ ship, firstBrake, collisionAt }) => ({ id: ship.id, firstBrake, collisionAt })))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "shared-13", collisionAt: undefined })]));
    for (const entry of fleet) {
      expect(entry.collisionAt, entry.ship.id).toBeUndefined();
      expect(entry.firstBrake, entry.ship.id).toBeDefined();
      expect(entry.firstBrake!, entry.ship.id).toBeLessThan(1.5);
    }
  }, 15000);
});

describe("all-direction terrain activation broad phase", () => {
  function base() { const s = approach(); s.position = { x: 0, y: 0, z: 0 }; s.heading = 0; return s; }
  function fakeMap(zone: terrain.AtollTerrainZone, halfExtentMeters = 6000) {
    vi.spyOn(terrain, "battleMapDefinition").mockReturnValue({ id: "atoll-prototype", name: "test",
      halfExtentMeters, terrain: [zone] });
  }
  const lateral: terrain.AtollTerrainZone = { id: "lateral", kind: "mountain", x: 350, z: 0,
    radiusX: 10, radiusZ: 10, rotation: 0 };
  it("activates for a side obstacle outside the bow ray", () => {
    fakeMap(lateral); expect(needsTerrainManeuverPrediction("atoll-prototype", base())).toBe(true);
  });
  it("skips deep water in a shallow terrain zone but retains draft-blocking water", () => {
    fakeMap({ ...lateral, kind: "shallow", depthMeters: 9 });
    expect(needsTerrainManeuverPrediction("atoll-prototype", base())).toBe(false);
    vi.restoreAllMocks(); fakeMap({ ...lateral, kind: "shallow", depthMeters: 7 });
    expect(needsTerrainManeuverPrediction("atoll-prototype", base())).toBe(true);
  });
  it("keeps the existing default 80m depth for an unspecified shallow depth", () => {
    fakeMap({ ...lateral, kind: "shallow" });
    expect(needsTerrainManeuverPrediction("atoll-prototype", base())).toBe(false);
  });
  it("checks map edges without activating everywhere in open water", () => {
    const s = base();
    expect(needsTerrainManeuverPrediction("open-sea-range", s)).toBe(false);
    s.position.x = 5900;
    expect(needsTerrainManeuverPrediction("open-sea-range", s)).toBe(true);
  });
  it("does not equate signed radial clearance with shortest shoreline distance", () => {
    const s = base(); s.position = { x: 1130, y: 0, z: 1690 };
    const z = terrain.ATOLL_MAP.terrain.find(z => z.id === "mountain-ne")!;
    expect(terrain.terrainZoneClearance(z, s.position.x, s.position.z)).toBeGreaterThan(190);
    const nearestSample = Math.min(...terrain.terrainContour(z, 2400).map(p =>
      Math.hypot(p.x - s.position.x, p.z - s.position.z)));
    expect(nearestSample).toBeLessThan(80);
    expect(needsTerrainManeuverPrediction("atoll-prototype", s)).toBe(true);
  });
});
