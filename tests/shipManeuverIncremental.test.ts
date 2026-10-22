import { afterEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import * as footprint from "../src/sim/shipFootprint";
import { FIXED_STEP } from "../src/sim/config";
import { createShipManeuverPrediction, predictShipManeuver,
  type ShipManeuverPrediction, type ShipManeuverPredictionTask, type ShipManeuverSliceBudget,
} from "../src/sim/shipManeuver";
import { createDeveloperShipState } from "../src/sim/simulation";

function fixture(kind = "base") {
  const s = createDeveloperShipState({
    id: "incremental-check", team: "player", shipClassId: "edinburgh",
    position: { x: 0, y: 0, z: 0 }, heading: 0,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  if (kind === "early" || kind === "late") {
    Object.assign(s, kind === "early" ? {
      position: { x: 1716.718394917268, y: 0, z: 1259.1558367375565 },
      heading: -.37734690229167844, speedKnots: 4.954934015343935, rudder: -.82,
    } : {
      position: { x: 1709.2207212463877, y: 0, z: 1276.7945001027338 },
      heading: -.42555538571451523, speedKnots: 5.140756822288761, rudder: -.6301487062467948,
    });
    s.modules.engine.health = 170.0268526021338;
    s.modules.steering.health = 136.97632928536274;
  }
  if (kind === "embedded") s.position = { x: 1700, y: 0, z: 1600 };
  if (kind === "moving") { s.speedKnots = 8; s.rudder = .4; }
  if (kind === "powerless") { s.speedKnots = -2; s.modules.engine.health = 0; }
  if (kind === "forced") s.developer = { enabled: true, unrestrictedWeapons: false,
    infiniteAmmunition: false, instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 8 };
  return s;
}
const parityCases = [
  { name: "fractional controls", kind: "moving", atoll: false,
    plan: { segments: [{ durationSeconds: .037, throttle: .8, rudder: -.7 },
      { durationSeconds: .11, throttle: -.2, rudder: .4 }, { durationSeconds: 0, throttle: 0, rudder: 0 }], brakeToStop: false } },
  { name: "early safe braking", kind: "early", atoll: true,
    plan: { segments: [{ durationSeconds: .5, throttle: .35, rudder: -.82 }], brakeToStop: true } },
  { name: "natural approach contact", kind: "early", atoll: true,
    plan: { segments: [{ durationSeconds: 12, throttle: .35, rudder: -.82 }], brakeToStop: false } },
  { name: "late braking collision", kind: "late", atoll: true,
    plan: { segments: [], brakeToStop: true } },
  { name: "initial overlap", kind: "embedded", atoll: true,
    plan: { segments: [], brakeToStop: true } },
  { name: "total motion cap", kind: "moving", atoll: false,
    plan: { segments: [], brakeToStop: true }, budget: { maxMotionSteps: 7 } },
  { name: "total query cap", kind: "moving", atoll: false,
    plan: { segments: [{ durationSeconds: 1, throttle: .5, rudder: .4 }], brakeToStop: false },
    budget: { maxTerrainQueries: 1 } },
  { name: "powerless astern", kind: "powerless", atoll: false,
    plan: { segments: [], brakeToStop: true }, budget: { maxMotionSteps: 20 } },
  { name: "forced speed", kind: "forced", atoll: false,
    plan: { segments: [], brakeToStop: true }, budget: { maxMotionSteps: 20 } },
  { name: "invalid duration", kind: "base", atoll: false,
    plan: { segments: [{ durationSeconds: -1, throttle: .5, rudder: .4 }], brakeToStop: false } },
];

// Independent golden output from unmodified bd508ef predictor.
// Source SHA-256: 389351aca2fa0c8a61d735d28ce24d93db5c77074b1e068f4160e7d2dffb19ed
const legacyResults = {
  "fractional controls": {
    "status": "clear",
    "reason": "completed",
    "end": {
      "position": {
        "x": 0.0005007611818307052,
        "y": 0,
        "z": 0.9052015503094947
      },
      "heading": 0.001003361061648229,
      "speedKnots": 7.933419999999999,
      "rudder": 0.4,
      "throttle": -0.2,
      "rudderCommand": 0.4,
      "turnRateRadians": 0.006856177517562917,
      "distanceTravelled": 0.9052017261120401
    },
    "elapsedSeconds": 0.147,
    "lastClearSeconds": 0.147,
    "motionSteps": 10,
    "terrainQueries": 2,
    "stopped": false
  },
  "early safe braking": {
    "status": "clear",
    "reason": "completed",
    "end": {
      "position": {
        "x": 1710.5702597100903,
        "y": 0,
        "z": 1274.0608792577193
      },
      "heading": -0.39588553717533287,
      "speedKnots": 0,
      "rudder": 0,
      "throttle": 0,
      "rudderCommand": 0,
      "turnRateRadians": 0,
      "distanceTravelled": 16.12352872144191
    },
    "elapsedSeconds": 7.966666666666644,
    "lastClearSeconds": 7.966666666666644,
    "motionSteps": 478,
    "terrainQueries": 17,
    "stopped": true
  },
  "natural approach contact": {
    "status": "blocked",
    "reason": "terrain-contact",
    "end": {
      "position": {
        "x": 1704.3439222238046,
        "y": 0,
        "z": 1287.1209268925686
      },
      "heading": -0.45568402287755694,
      "speedKnots": 4.954934015343935,
      "rudder": -0.82,
      "throttle": 0.35,
      "rudderCommand": -0.82,
      "turnRateRadians": -0.009792140073234812,
      "distanceTravelled": 30.588432895074895
    },
    "elapsedSeconds": 7.999999999999977,
    "lastClearSeconds": 7.98333333333331,
    "motionSteps": 480,
    "terrainQueries": 47,
    "stopped": false,
    "contact": {
      "blocked": true,
      "boundary": false,
      "zoneIds": [
        "mountain-ne"
      ]
    }
  },
  "late braking collision": {
    "status": "blocked",
    "reason": "terrain-contact",
    "end": {
      "position": {
        "x": 1704.5257070010166,
        "y": 0,
        "z": 1286.9822200931244
      },
      "heading": -0.4338177642908571,
      "speedKnots": 2.657899681164289,
      "rudder": 0,
      "throttle": 0,
      "rudderCommand": 0,
      "turnRateRadians": 0,
      "distanceTravelled": 11.217555592545827
    },
    "elapsedSeconds": 3.733333333333325,
    "lastClearSeconds": 3.7166666666666583,
    "motionSteps": 240,
    "terrainQueries": 23,
    "stopped": false,
    "contact": {
      "blocked": true,
      "boundary": false,
      "zoneIds": [
        "mountain-ne"
      ]
    }
  },
  "initial overlap": {
    "status": "blocked",
    "reason": "initial-contact",
    "end": {
      "position": {
        "x": 1700,
        "y": 0,
        "z": 1600
      },
      "heading": 0,
      "speedKnots": 0,
      "rudder": 0,
      "throttle": 0,
      "rudderCommand": 0,
      "turnRateRadians": 0,
      "distanceTravelled": 0
    },
    "elapsedSeconds": 0,
    "lastClearSeconds": 0,
    "motionSteps": 0,
    "terrainQueries": 1,
    "stopped": true,
    "contact": {
      "blocked": true,
      "boundary": false,
      "zoneIds": [
        "mountain-ne"
      ]
    }
  },
  "total motion cap": {
    "status": "incomplete",
    "reason": "motion-budget",
    "end": {
      "position": {
        "x": 0.00031431369280959456,
        "y": 0,
        "z": 0.7156601109396017
      },
      "heading": 0.0007586805238521728,
      "speedKnots": 7.911333333333331,
      "rudder": 0.3632500000000002,
      "throttle": 0,
      "rudderCommand": 0,
      "turnRateRadians": 0.006217669174248372,
      "distanceTravelled": 0.7156601965333332
    },
    "elapsedSeconds": 0.11666666666666665,
    "lastClearSeconds": 0.11666666666666665,
    "motionSteps": 7,
    "terrainQueries": 2,
    "stopped": false
  },
  "total query cap": {
    "status": "incomplete",
    "reason": "terrain-budget",
    "end": {
      "position": {
        "x": 0.00562531849640369,
        "y": 0,
        "z": 3.1325072019981506
      },
      "heading": 0.0034678247266862897,
      "speedKnots": 8.230000000000015,
      "rudder": 0.4,
      "throttle": 0.5,
      "rudderCommand": 0.4,
      "turnRateRadians": 0.006983297753733082,
      "distanceTravelled": 3.1325138215000026
    },
    "elapsedSeconds": 0.49999999999999994,
    "lastClearSeconds": 0,
    "motionSteps": 30,
    "terrainQueries": 1,
    "stopped": false
  },
  "powerless astern": {
    "status": "incomplete",
    "reason": "motion-budget",
    "end": {
      "position": {
        "x": 0,
        "y": 0,
        "z": -0.5144439999999997
      },
      "heading": 0,
      "speedKnots": -2,
      "rudder": 0,
      "throttle": 0,
      "rudderCommand": 0,
      "turnRateRadians": 0,
      "distanceTravelled": 0.5144439999999997
    },
    "elapsedSeconds": 0.3333333333333333,
    "lastClearSeconds": 0.3333333333333333,
    "motionSteps": 20,
    "terrainQueries": 2,
    "stopped": false
  },
  "forced speed": {
    "status": "incomplete",
    "reason": "motion-budget",
    "end": {
      "position": {
        "x": 0,
        "y": 0,
        "z": 2.0577759999999987
      },
      "heading": 0,
      "speedKnots": 8,
      "rudder": 0,
      "throttle": 0,
      "rudderCommand": 0,
      "turnRateRadians": 0,
      "distanceTravelled": 2.0577759999999987
    },
    "elapsedSeconds": 0.3333333333333333,
    "lastClearSeconds": 0.3333333333333333,
    "motionSteps": 20,
    "terrainQueries": 2,
    "stopped": false
  },
  "invalid duration": {
    "status": "incomplete",
    "reason": "invalid-input",
    "end": {
      "position": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "heading": 0,
      "speedKnots": 0,
      "rudder": 0,
      "throttle": 0,
      "rudderCommand": 0,
      "turnRateRadians": 0,
      "distanceTravelled": 0
    },
    "elapsedSeconds": 0,
    "lastClearSeconds": 0,
    "motionSteps": 0,
    "terrainQueries": 0,
    "stopped": true
  }
};

const schedules: readonly (readonly ShipManeuverSliceBudget[])[] = [
  [{ maxMotionSteps: 1, maxTerrainQueries: 1 }],
  [{ maxMotionSteps: 30, maxTerrainQueries: 2 }],
  [{ maxMotionSteps: 0, maxTerrainQueries: 2 }, { maxMotionSteps: 7, maxTerrainQueries: 0 },
    { maxMotionSteps: 3, maxTerrainQueries: 1 }],
];
function finish(task: ShipManeuverPredictionTask, schedule = schedules[1]!): ShipManeuverPrediction {
  let motion = 0, queries = 0;
  for (let i = 0; i < 20000; i++) {
    const budget = schedule[i % schedule.length]!, slice = task.advance(budget);
    expect(slice.motionSteps).toBeLessThanOrEqual(budget.maxMotionSteps);
    expect(slice.terrainQueries).toBeLessThanOrEqual(budget.maxTerrainQueries);
    motion += slice.motionSteps; queries += slice.terrainQueries;
    if (slice.status === "complete") {
      expect(slice.result.motionSteps).toBe(motion);
      expect(slice.result.terrainQueries).toBe(queries);
      return slice.result;
    }
  }
  throw new Error("Prediction did not converge within the bounded test schedule");
}
afterEach(() => vi.restoreAllMocks());

describe("incremental maneuver predictions", () => {
  it.each(parityCases)("$name matches frozen bd508ef results under every slice schedule", spec => {
    const map = spec.atoll ? "atoll-prototype" : "open-sea-range";
    const expected = legacyResults[spec.name as keyof typeof legacyResults];
    expect(predictShipManeuver(map, fixture(spec.kind), spec.plan, spec.budget)).toEqual(expected);
    for (const schedule of schedules) {
      const task = createShipManeuverPrediction(map, fixture(spec.kind), spec.plan, spec.budget);
      expect(finish(task, schedule)).toEqual(expected);
    }
  });

  it("defers the first expensive contact query until a slice has query budget", () => {
    const contact = vi.spyOn(footprint, "shipTerrainFootprintContact");
    const envelope = vi.spyOn(footprint, "shipTerrainTrajectoryEnvelopeContact");
    const sweep = vi.spyOn(footprint, "constrainShipTerrainMotion");
    const task = createShipManeuverPrediction("atoll-prototype", fixture("embedded"),
      { segments: [], brakeToStop: true });
    expect(contact).not.toHaveBeenCalled();
    expect(task.advance({ maxMotionSteps: 30, maxTerrainQueries: 0 }))
      .toEqual({ status: "pending", motionSteps: 0, terrainQueries: 0 });
    expect(contact).not.toHaveBeenCalled();
    const next = task.advance({ maxMotionSteps: 0, maxTerrainQueries: 1 });
    expect(next.status).toBe("complete");
    expect(next.terrainQueries).toBe(1); expect(next.motionSteps).toBe(0);
    expect(contact).toHaveBeenCalledTimes(1);
    expect(envelope).not.toHaveBeenCalled(); expect(sweep).not.toHaveBeenCalled();
  });

  it("never runs a 30-query refinement flush inside a two-query slice", () => {
    const contact = vi.spyOn(footprint, "shipTerrainFootprintContact");
    const envelope = vi.spyOn(footprint, "shipTerrainTrajectoryEnvelopeContact")
      .mockReturnValue({ blocked: true, boundary: false, zoneIds: ["conservative-pocket"] });
    const sweep = vi.spyOn(footprint, "constrainShipTerrainMotion");
    const water = vi.spyOn(terrain, "terrainNavigationAt");
    const task = createShipManeuverPrediction("open-sea-range", fixture(),
      { segments: [{ durationSeconds: .5, throttle: .5, rudder: .82 }], brakeToStop: false });
    let final: ShipManeuverPrediction | undefined;
    let slices = 0, refinementOnlySlices = 0;
    while (!final && slices++ < 40) {
      const geometryBefore = contact.mock.calls.length + envelope.mock.calls.length + sweep.mock.calls.length;
      const waterBefore = water.mock.calls.length;
      const slice = task.advance({ maxMotionSteps: 30, maxTerrainQueries: 2 });
      const actualQueries = contact.mock.calls.length + envelope.mock.calls.length + sweep.mock.calls.length - geometryBefore;
      expect(actualQueries).toBe(slice.terrainQueries); expect(actualQueries).toBeLessThanOrEqual(2);
      expect(water.mock.calls.length - waterBefore).toBe(slice.motionSteps);
      if (slice.motionSteps === 0 && slice.terrainQueries > 0) refinementOnlySlices++;
      if (slice.status === "complete") final = slice.result;
    }
    expect(final?.status).toBe("clear");
    expect(final?.motionSteps).toBe(30); expect(final?.terrainQueries).toBe(32);
    expect(contact).toHaveBeenCalledTimes(1); expect(envelope).toHaveBeenCalledTimes(1);
    expect(sweep).toHaveBeenCalledTimes(30); expect(refinementOnlySlices).toBeGreaterThan(10);
  });

  it("preserves a paused refinement position when the total terrain budget expires", () => {
    vi.spyOn(footprint, "shipTerrainTrajectoryEnvelopeContact")
      .mockReturnValue({ blocked: true, boundary: false, zoneIds: ["conservative-pocket"] });
    const task = createShipManeuverPrediction("open-sea-range", fixture(),
      { segments: [{ durationSeconds: .5, throttle: .5, rudder: .82 }], brakeToStop: false },
      { maxTerrainQueries: 3 });
    const first = task.advance({ maxMotionSteps: 30, maxTerrainQueries: 2 });
    expect(first.status).toBe("pending");
    const second = task.advance({ maxMotionSteps: 0, maxTerrainQueries: 1 });
    expect(second.status).toBe("complete");
    if (second.status !== "complete") throw new Error("Missing terminal result");
    expect(second.result.reason).toBe("terrain-budget");
    expect(second.result.lastClearSeconds).toBe(FIXED_STEP);
    expect(second.result.terrainQueries).toBe(3);
  });

  it("captures motion, damage, developer overrides, segment members and total budgets at creation", () => {
    const ship = fixture("early");
    const plan = { segments: [{ durationSeconds: .5, throttle: .35, rudder: -.82 }], brakeToStop: true };
    const budget = { maxMotionSteps: 7200, maxTerrainQueries: 1024 };
    const expected = predictShipManeuver("atoll-prototype", ship, plan, budget);
    const task = createShipManeuverPrediction("atoll-prototype", ship, plan, budget);
    ship.position.x = 50000; ship.heading = 500; ship.speedKnots = 200;
    ship.modules.engine.health = 0; ship.modules.steering.health = 0;
    ship.performance.turnMultiplier = 1e12; ship.flooding = 100;
    ship.shipClassId = "yamato";
    ship.developer = { enabled: true, speedMultiplier: 6, forcedSpeedKnots: 200,
      instantReload: true, unrestrictedWeapons: true, infiniteAmmunition: true };
    plan.segments[0]!.durationSeconds = 100; plan.segments[0]!.throttle = 1;
    plan.segments[0]!.rudder = 1; plan.segments.push({ durationSeconds: 120, throttle: 1, rudder: 1 });
    plan.brakeToStop = false; budget.maxMotionSteps = 1; budget.maxTerrainQueries = 1;
    expect(finish(task)).toEqual(expected);
  });

  it("leaves original inputs untouched after many pauses and returns detached terminal snapshots", () => {
    const ship = fixture("moving"), before = structuredClone(ship);
    const plan = { segments: [{ durationSeconds: .73, throttle: .4, rudder: -.3 }], brakeToStop: true };
    const originalPlan = structuredClone(plan), task = createShipManeuverPrediction("open-sea-range", ship, plan);
    const final = finish(task, schedules[0]);
    expect(ship).toEqual(before); expect(plan).toEqual(originalPlan);
    const expected = structuredClone(final);
    final.end.position.x = 99999;
    const repeated = task.advance({ maxMotionSteps: 0, maxTerrainQueries: 0 });
    expect(repeated).toEqual({ status: "complete", result: expected, motionSteps: 0, terrainQueries: 0 });
  });

  it("finishes invalid input without spending motion or query work", () => {
    const contact = vi.spyOn(footprint, "shipTerrainFootprintContact");
    const task = createShipManeuverPrediction("open-sea-range", fixture(),
      { segments: [{ durationSeconds: NaN, throttle: .5, rudder: .5 }], brakeToStop: true });
    const slice = task.advance({ maxMotionSteps: 0, maxTerrainQueries: 0 });
    expect(slice.status).toBe("complete"); expect(slice.motionSteps).toBe(0); expect(slice.terrainQueries).toBe(0);
    if (slice.status === "complete") expect(slice.result.reason).toBe("invalid-input");
    expect(contact).not.toHaveBeenCalled();
  });

  it.each([
    { maxMotionSteps: -1, maxTerrainQueries: 1 },
    { maxMotionSteps: 1.5, maxTerrainQueries: 1 },
    { maxMotionSteps: NaN, maxTerrainQueries: 1 },
    { maxMotionSteps: 1, maxTerrainQueries: Infinity },
    { maxMotionSteps: 7201, maxTerrainQueries: 1 },
    { maxMotionSteps: 1, maxTerrainQueries: 1025 },
  ])("rejects invalid slice budgets without consuming the task: %j", invalid => {
    const ship = fixture(), plan = { segments: [{ durationSeconds: .1, throttle: .5, rudder: .1 }], brakeToStop: false };
    const expected = predictShipManeuver("open-sea-range", ship, plan);
    const task = createShipManeuverPrediction("open-sea-range", ship, plan);
    expect(() => task.advance(invalid)).toThrow(RangeError);
    expect(finish(task)).toEqual(expected);
  });

  it("keeps a zero-budget slice pending instead of converting it into incomplete", () => {
    const task = createShipManeuverPrediction("open-sea-range", fixture(),
      { segments: [{ durationSeconds: .1, throttle: .5, rudder: .1 }], brakeToStop: false });
    for (let i = 0; i < 10; i++) {
      expect(task.advance({ maxMotionSteps: 0, maxTerrainQueries: 0 }))
        .toEqual({ status: "pending", motionSteps: 0, terrainQueries: 0 });
    }
    expect(finish(task).status).toBe("clear");
  });
});
