import { afterEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import * as footprint from "../src/sim/shipFootprint";
import { FIXED_STEP } from "../src/sim/config";
import { advanceShipKinematics, createShipKinematicSnapshot, shipKinematicParameters } from "../src/sim/navigationKinematics";
import { predictShipManeuver } from "../src/sim/shipManeuver";
import { createDeveloperShipState } from "../src/sim/simulation";

function shipFixture() {
  return createDeveloperShipState({ id: "maneuver-check", team: "player", shipClassId: "edinburgh",
    position: { x: 0, y: 0, z: 0 }, heading: 0, mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
}
function approach(time: 565 | 570) {
  const s = shipFixture();
  Object.assign(s, time === 565 ? {
    position: { x: 1716.718394917268, y: 0, z: 1259.1558367375565 },
    heading: -.37734690229167844, speedKnots: 4.954934015343935, rudder: -.82,
  } : {
    position: { x: 1709.2207212463877, y: 0, z: 1276.7945001027338 },
    heading: -.42555538571451523, speedKnots: 5.140756822288761, rudder: -.6301487062467948,
  });
  s.modules.engine.health = 170.0268526021338;
  s.modules.steering.health = 136.97632928536274;
  return s;
}
afterEach(() => vi.restoreAllMocks());

describe("prospective physical helm and braking trajectory", () => {
  it("finds the natural Edinburgh approach collision while the current pose is clear", () => {
    const s = approach(565), original = structuredClone(s);
    expect(footprint.shipTerrainFootprintContact("atoll-prototype", s.shipClassId, s).blocked).toBe(false);
    const prediction = predictShipManeuver("atoll-prototype", s,
      { segments: [{ durationSeconds: 12, throttle: .35, rudder: -.82 }], brakeToStop: false });
    expect(prediction.status).toBe("blocked");
    expect(prediction.contact?.zoneIds).toContain("mountain-ne");
    // Independent oracle: archived pre-refactor moveShip, constant damage, 60 Hz.
    expect(prediction.elapsedSeconds).toBeCloseTo(8, 8);
    expect(prediction.lastClearSeconds).toBeCloseTo(8 - FIXED_STEP, 8);
    expect(s).toEqual(original);
  });

  it.each([0, .5, 1])("can safely brake at the earlier real pose after %s seconds of the actual order", delay => {
    const prediction = predictShipManeuver("atoll-prototype", approach(565), {
      segments: [{ durationSeconds: delay, throttle: .35, rudder: -.82 }], brakeToStop: true,
    });
    expect(prediction.status).toBe("clear"); expect(prediction.stopped).toBe(true);
    expect(prediction.end.speedKnots).toBe(0); expect(prediction.end.rudder).toBe(0);
    expect(prediction.lastClearSeconds).toBe(prediction.elapsedSeconds);
    if (delay === 0) expect(prediction.elapsedSeconds).toBeCloseTo(7.4666666667, 8);
  });

  it("does not assume zero throttle instantly removes headway or residual helm at the late pose", () => {
    const s = approach(570);
    const prediction = predictShipManeuver("atoll-prototype", s, { segments: [], brakeToStop: true });
    expect(prediction.status).toBe("blocked"); expect(prediction.stopped).toBe(false);
    expect(prediction.contact?.zoneIds).toContain("mountain-ne");
    expect(prediction.elapsedSeconds).toBeCloseTo(3.7333333333, 8);
    expect(prediction.end.speedKnots).toBeGreaterThan(0);
  });

  it("rejects an already embedded starting hull without pretending to repair its pose", () => {
    const s = shipFixture(); s.position = { x: 1700, y: 0, z: 1600 };
    const before = structuredClone(s);
    const prediction = predictShipManeuver("atoll-prototype", s, { segments: [], brakeToStop: true });
    expect(prediction.reason).toBe("initial-contact"); expect(prediction.status).toBe("blocked");
    expect(prediction.motionSteps).toBe(0); expect(s).toEqual(before);
  });

  it("checks a real curved arc rather than just its start, end or connecting chord", () => {
    const s = shipFixture(); s.shipClassId = "fletcher"; s.speedKnots = 60; s.rudder = .82;
    s.developer = { enabled: true, unrestrictedWeapons: false, infiniteAmmunition: false,
      instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 60 };
    const state = createShipKinematicSnapshot(s), params = shipKinematicParameters(s);
    let middle = { ...state.position };
    for (let i = 0; i < 30 / FIXED_STEP; i++) {
      advanceShipKinematics(state, params, { throttle: .8, rudder: .82 }, 1, FIXED_STEP);
      if (i === 900) middle = { ...state.position };
    }
    const synthetic: terrain.BattleMapDefinition = { id: "open-sea-range", name: "Arc counterexample",
      halfExtentMeters: 10000, terrain: [{ id: "mid-arc", kind: "sandbar", x: middle.x, z: middle.z,
        radiusX: 4, radiusZ: 4, radialProfile: [1, 1, 1, 1], rotation: 0, heightMeters: 3 }] };
    vi.spyOn(terrain, "battleMapDefinition").mockReturnValue(synthetic);
    expect(footprint.shipTerrainFootprintContact(synthetic, s.shipClassId, s).blocked).toBe(false);
    expect(footprint.shipTerrainFootprintContact(synthetic, s.shipClassId, state).blocked).toBe(false);
    const point = (t: number) => ({ position: { x: state.position.x * t, z: state.position.z * t }, heading: state.heading * t });
    for (let i = 1; i <= 120; i++) {
      expect(footprint.constrainShipTerrainMotion(synthetic, s.shipClassId, point((i - 1) / 120), point(i / 120)).blocked).toBe(false);
    }
    const prediction = predictShipManeuver("open-sea-range", s,
      { segments: [{ durationSeconds: 30, throttle: .8, rudder: .82 }], brakeToStop: false });
    expect(prediction.status).toBe("blocked"); expect(prediction.contact?.zoneIds).toContain("mid-arc");
    expect(prediction.elapsedSeconds).toBeGreaterThan(10); expect(prediction.elapsedSeconds).toBeLessThan(17);
  });

  it("distinguishes an exhausted motion budget from a clear completed trajectory", () => {
    const s = shipFixture(); s.speedKnots = 8;
    const prediction = predictShipManeuver("open-sea-range", s, { segments: [], brakeToStop: true }, { maxMotionSteps: 10 });
    expect(prediction.status).toBe("incomplete"); expect(prediction.reason).toBe("motion-budget");
    expect(prediction.motionSteps).toBe(10); expect(prediction.stopped).toBe(false);
  });

  it("does not publish unverified geometry when the query budget runs out", () => {
    const s = shipFixture(); s.speedKnots = 8;
    const prediction = predictShipManeuver("open-sea-range", s,
      { segments: [{ durationSeconds: 1, throttle: .5, rudder: .4 }], brakeToStop: false }, { maxTerrainQueries: 1 });
    expect(prediction.status).toBe("incomplete"); expect(prediction.reason).toBe("terrain-budget");
    expect(prediction.terrainQueries).toBe(1); expect(prediction.lastClearSeconds).toBe(0);
  });

  it.each([-2, 0])("forced nonzero speed cannot be certified stopped from current speed %s", speed => {
    const s = shipFixture(); s.speedKnots = speed;
    s.developer = { enabled: true, unrestrictedWeapons: false, infiniteAmmunition: false,
      instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 8 };
    const prediction = predictShipManeuver("open-sea-range", s, { segments: [], brakeToStop: true }, { maxMotionSteps: 20 });
    expect(prediction.status).toBe("incomplete"); expect(prediction.stopped).toBe(false);
    expect(prediction.end.speedKnots).toBe(8); expect(prediction.motionSteps).toBe(20);
  });

  it("keeps powerless reverse inertia instead of inventing braking", () => {
    const s = shipFixture(); s.speedKnots = -2; s.modules.engine.health = 0;
    const prediction = predictShipManeuver("open-sea-range", s, { segments: [], brakeToStop: true }, { maxMotionSteps: 20 });
    expect(prediction.status).toBe("incomplete"); expect(prediction.end.speedKnots).toBe(-2);
    expect(prediction.end.position.z).toBeLessThan(0); expect(s.position.z).toBe(0);
  });

  it.each([NaN, Infinity, -1])("rejects invalid duration %s without an accidental zero-step safe result", duration => {
    const prediction = predictShipManeuver("open-sea-range", shipFixture(),
      { segments: [{ durationSeconds: duration, throttle: .5, rudder: 0 }], brakeToStop: false });
    expect(prediction.status).toBe("incomplete"); expect(prediction.reason).toBe("invalid-input");
    expect(prediction.motionSteps).toBe(0);
  });

  it.each([1e12, 1e308])("rejects huge finite turn multipliers %s before entering angle normalization", multiplier => {
    const s = shipFixture(); s.performance.turnMultiplier = multiplier; s.speedKnots = 10;
    const prediction = predictShipManeuver("open-sea-range", s,
      { segments: [{ durationSeconds: 1, throttle: .5, rudder: 1 }], brakeToStop: true });
    expect(prediction.status).toBe("incomplete"); expect(prediction.reason).toBe("invalid-input");
    expect(prediction.motionSteps).toBe(0);
  });

  it("uses bounded batches in open water and does not mutate its inputs", () => {
    const s = shipFixture(), before = structuredClone(s);
    const plan = { segments: [{ durationSeconds: 10, throttle: .8, rudder: .4 }], brakeToStop: false };
    const copy = structuredClone(plan), first = predictShipManeuver("open-sea-range", s, plan);
    expect(first.status).toBe("clear"); expect(first.motionSteps).toBe(600);
    expect(first.terrainQueries).toBe(21); // Initial hull + twenty half-second envelopes.
    expect(predictShipManeuver("open-sea-range", s, plan)).toEqual(first);
    expect(s).toEqual(before); expect(plan).toEqual(copy);
  });

  it("refines an obstructed conservative envelope instead of rejecting every contained safe arc", () => {
    const query = vi.spyOn(footprint, "shipTerrainTrajectoryEnvelopeContact")
      .mockReturnValue({ blocked: true, boundary: false, zoneIds: ["conservative-pocket"] });
    const prediction = predictShipManeuver("open-sea-range", shipFixture(),
      { segments: [{ durationSeconds: .5, throttle: .5, rudder: .82 }], brakeToStop: false });
    expect(query).toHaveBeenCalledTimes(1); expect(prediction.status).toBe("clear");
    expect(prediction.terrainQueries).toBe(32); expect(prediction.motionSteps).toBe(30);
  });

  it("stops refinement on its geometry budget and never calls the untested suffix safe", () => {
    vi.spyOn(footprint, "shipTerrainTrajectoryEnvelopeContact")
      .mockReturnValue({ blocked: true, boundary: false, zoneIds: ["conservative-pocket"] });
    const prediction = predictShipManeuver("open-sea-range", shipFixture(),
      { segments: [{ durationSeconds: .5, throttle: .5, rudder: .82 }], brakeToStop: false }, { maxTerrainQueries: 3 });
    expect(prediction.status).toBe("incomplete"); expect(prediction.terrainQueries).toBe(3);
    expect(prediction.lastClearSeconds).toBeCloseTo(FIXED_STEP, 12);
  });

  it("never treats the resolver's translation-only yaw fallback as the requested physical trajectory", () => {
    vi.spyOn(footprint, "shipTerrainTrajectoryEnvelopeContact")
      .mockReturnValue({ blocked: true, boundary: false, zoneIds: ["bank"] });
    vi.spyOn(footprint, "constrainShipTerrainMotion").mockReturnValue({
      blocked: false, rotationBlocked: true, fraction: 1, position: { x: 0, z: 0 }, heading: 0,
      startedOverlapping: true, exiting: true, budgetExhausted: false,
      contact: { blocked: false, boundary: false, zoneIds: [] },
    });
    const prediction = predictShipManeuver("open-sea-range", shipFixture(),
      { segments: [{ durationSeconds: .5, throttle: .5, rudder: .82 }], brakeToStop: false });
    expect(prediction.status).toBe("blocked"); expect(prediction.elapsedSeconds).toBe(FIXED_STEP);
  });
});
