import { describe, expect, it, vi } from "vitest";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import { FIXED_STEP, NAVIGATION_PACE, shipSpeedMetersPerSecond } from "../src/sim/config";
import { forwardStoppingDistance } from "../src/sim/navigationKinematics";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";

// Freeze only automatic engine repair so damage stays constant during the
// experiment. Production propulsion, movement, collision and time steps run.
vi.mock("../src/sim/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/sim/config")>();
  return { ...actual, BASE_REPAIR_PER_SECOND: { ...actual.BASE_REPAIR_PER_SECOND, engine: 0 } };
});

function fixture(shipClassId: ShipClassId = "yamato", speed = 8, engineRatio = 1, acceleration = 1) {
  const state = createInitialState(8122, "sea-trials");
  state.mapId = "open-sea-range"; state.airSupport = "none"; state.airSquadrons = [];
  const ship = createDeveloperShipState({ id: "player", team: "player", shipClassId,
    position: { x: 0, y: 0, z: 0 }, heading: 0, mainGunMounts: 0,
    torpedoLauncherMounts: 0, secondaryGunIds: [], depthChargeMounts: 0 });
  ship.speedKnots = speed; ship.rudder = 0; ship.rudderCommand = 0;
  ship.modules.engine.health = ship.modules.engine.maxHealth * engineRatio;
  ship.performance.accelerationMultiplier = acceleration;
  state.ships = [ship];
  return { state, ship };
}

function forceSpeed(ship: ReturnType<typeof fixture>["ship"], speed: number, enabled = true): void {
  ship.developer = { enabled, unrestrictedWeapons: false, infiniteAmmunition: false,
    instantReload: false, speedMultiplier: 1, forcedSpeedKnots: speed };
}

describe("forward stopping distance matches zero-throttle propulsion", () => {
  it("preserves the weak-engine Yamato counterexample without a braking floor", () => {
    const { ship } = fixture("yamato", 8, .01, .5);
    const hull = getShipClass(ship.shipClassId);
    const previous = shipSpeedMetersPerSecond(8) * 8
      / (2 * hull.brakingKnotsPerSecond * NAVIGATION_PACE.propulsionResponseScale);
    expect(previous).toBeCloseTo(56.1211636364, 8);
    expect(forwardStoppingDistance(ship)).toBeCloseTo(246.4156471410, 8);
    expect(forwardStoppingDistance(ship)).toBeGreaterThan(previous * 4);
  });

  const cases = [
    { shipClassId: "fletcher", speed: 12, engineRatio: 1, acceleration: 1 },
    { shipClassId: "cleveland", speed: 10, engineRatio: .35, acceleration: 1.3 },
    { shipClassId: "yamato", speed: 8, engineRatio: .01, acceleration: .5 },
    { shipClassId: "richelieu", speed: 6, engineRatio: 0, acceleration: 1 },
  ] as const;
  for (const spec of cases) {
    it(spec.shipClassId + " bounds real fixed-step braking with engine ratio " + spec.engineRatio, () => {
      const { state, ship } = fixture(spec.shipClassId, spec.speed, spec.engineRatio, spec.acceleration);
      const predicted = forwardStoppingDistance(ship), engineHealth = ship.modules.engine.health;
      const commands = new Map([[ship.id, { throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } }]]);
      let steps = 0;
      while (ship.speedKnots > 0 && steps < 120 / FIXED_STEP) {
        stepSimulation(state, commands, FIXED_STEP); ++steps;
        expect(ship.modules.engine.health).toBe(engineHealth);
        expect(ship.heading).toBe(0);
        expect(ship.rudder).toBe(0);
        expect(ship.navigationZone).toBe("deep");
      }
      expect(ship.speedKnots).toBe(0);
      const actual = ship.position.z;
      expect(actual).toBeGreaterThan(0);
      expect(predicted + 1e-8).toBeGreaterThanOrEqual(actual);
      // Semi-implicit fixed-step integration moves after braking each tick,
      // so the continuous bound may overestimate by at most one initial step.
      expect(predicted - actual).toBeLessThanOrEqual(shipSpeedMetersPerSecond(spec.speed) * FIXED_STEP + 1e-8);
      expect(state.status).toBe("running");
    });
  }

  it.each([0, -0.01, -2, -20])("has no forward stopping corridor at %s knots", speed => {
    expect(forwardStoppingDistance(fixture("yamato", speed).ship)).toBe(0);
  });

  it("keeps destroyed-engine positive headway finite because forward drag remains", () => {
    const { ship } = fixture("yamato", 8, 0);
    const expected = shipSpeedMetersPerSecond(8) * 8
      / (2 * getShipClass("yamato").brakingKnotsPerSecond * NAVIGATION_PACE.propulsionResponseScale * .45);
    expect(forwardStoppingDistance(ship)).toBeCloseTo(expected, 10);
    ship.modules.engine.maxHealth = 0;
    expect(forwardStoppingDistance(ship)).toBeCloseTo(expected, 10);
  });

  it.each([0, -.5, NaN])("does not invent finite stopping at acceleration multiplier %s", acceleration => {
    expect(forwardStoppingDistance(fixture("yamato", 8, 1, acceleration).ship)).toBe(Infinity);
  });

  it.each(["engine", "acceleration"] as const)("does not treat non-finite %s braking as an immediate safe stop", source => {
    const { ship } = fixture();
    if (source === "engine") ship.modules.engine.health = Infinity;
    else ship.performance.accelerationMultiplier = Infinity;
    expect(forwardStoppingDistance(ship)).toBe(Infinity);
  });

  it("does not floor very weak but positive braking", () => {
    const { ship } = fixture("yamato", 8, 0, .001);
    expect(forwardStoppingDistance(ship)).toBeGreaterThan(100000);
  });

  it.each([8, -2, Infinity, NaN])("reports that nonzero forced speed %s cannot be stopped by throttle", forced => {
    const { ship } = fixture(); forceSpeed(ship, forced);
    expect(forwardStoppingDistance(ship)).toBe(Infinity);
  });

  it("handles forced zero and disabled developer overrides explicitly", () => {
    const { state, ship } = fixture();
    const normal = forwardStoppingDistance(ship);
    forceSpeed(ship, 8, false);
    expect(forwardStoppingDistance(ship)).toBe(normal);
    forceSpeed(ship, 0);
    expect(forwardStoppingDistance(ship)).toBe(0);
    stepSimulation(state, new Map([[ship.id, { throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } }]]), FIXED_STEP);
    expect(ship.speedKnots).toBe(0); expect(ship.position.z).toBe(0);
    forceSpeed(ship, 8);
    expect(forwardStoppingDistance(ship)).toBe(0); // Current headway is still zero.
  });

  it("reads only the ship and leaves state and random seed unchanged", () => {
    const { state, ship } = fixture("cleveland", 10, .2, .7);
    const original = structuredClone(ship), seed = state.randomSeed;
    const first = forwardStoppingDistance(ship);
    for (let i = 0; i < 20; ++i) expect(forwardStoppingDistance(ship)).toBe(first);
    expect(ship).toEqual(original); expect(state.randomSeed).toBe(seed);
  });
});
