import { describe, expect, it } from "vitest";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import { shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { FIXED_STEP, NAVIGATION_PACE, shipSpeedMetersPerSecond } from "../src/sim/config";
import { advanceShipKinematics, createShipKinematicSnapshot, shipKinematicParameters } from "../src/sim/navigationKinematics";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ModuleId, ShipState } from "../src/sim/types";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};
function moduleRatio(ship: ShipState, id: ModuleId): number {
  const module = ship.modules[id];
  return module.maxHealth === 0 ? 0 : module.health / module.maxHealth;
}

// Frozen unmodified moveShip propulsion block from 3e98d416cdc2914dbf7d9780a35a30af9dfdacc5.
// Original block SHA-256: eea7f8fd00f0233cb34e8166ef06be37b7fd997c42a8428419ed595b200e2ecd
// Independent of the shared production helper: guards numerical drift.
function legacyMotion(ship: ShipState, controls: Pick<ControlCommand, "throttle" | "rudder">,
  navigationSpeedMultiplier: number, dt: number): void {
  const hullDefinition = getShipClass(ship.shipClassId);
  const navigation = { speedMultiplier: navigationSpeedMultiplier };
  ship.throttle = clamp(controls.throttle, -.25, 1);
  ship.rudderCommand = clamp(controls.rudder, -1, 1);
  const engineRatio = moduleRatio(ship, "engine");
  const steeringRatio = moduleRatio(ship, "steering");
  const rudderShiftRate = steeringRatio <= 0
    ? 0
    : hullDefinition.rudderShiftPerSecond * (0.18 + steeringRatio * 0.82) * NAVIGATION_PACE.travelTimeScale;
  ship.rudder += clamp(
    ship.rudderCommand - ship.rudder,
    -rudderShiftRate * dt,
    rudderShiftRate * dt,
  );
  const floodingSpeedFactor = 1 - clamp(ship.flooding / 100, 0, 1) * 0.32;
  const developerSpeedMultiplier = ship.developer?.enabled
    ? clamp(ship.developer.speedMultiplier, .1, 6)
    : 1;
  const equippedMaxSpeed = hullDefinition.maxSpeedKnots
    * ship.performance.maxSpeedMultiplier * developerSpeedMultiplier;
  const effectiveMaxSpeed = equippedMaxSpeed * engineRatio * floodingSpeedFactor
    * navigation.speedMultiplier * Math.max(0, ship.throttle);
  const reverseTarget = ship.throttle < 0 ? equippedMaxSpeed * ship.throttle * 0.28 : effectiveMaxSpeed;
  const orderedSpeed = ship.throttle < 0 ? reverseTarget : effectiveMaxSpeed;
  const turningSpeedFactor = 1
    - Math.abs(ship.rudder) * hullDefinition.maximumTurningSpeedLoss;
  const targetSpeed = orderedSpeed * turningSpeedFactor;
  const propulsionResponse = engineRatio <= 0 ? 0 : 0.2 + engineRatio * 0.8;
  const rate = (targetSpeed >= ship.speedKnots
    ? hullDefinition.accelerationKnotsPerSecond * propulsionResponse
    : hullDefinition.brakingKnotsPerSecond * (0.45 + engineRatio * 0.55))
    * ship.performance.accelerationMultiplier * NAVIGATION_PACE.propulsionResponseScale;
  ship.speedKnots += clamp(targetSpeed - ship.speedKnots, -rate * dt, rate * dt);
  if (ship.developer?.enabled && ship.developer.forcedSpeedKnots !== undefined) {
    ship.speedKnots = clamp(ship.developer.forcedSpeedKnots, -40, 200);
  }

  const speedRatio = clamp(Math.abs(ship.speedKnots) / equippedMaxSpeed, 0, 1);
  const turnAuthority = steeringRatio * (0.2 + 0.8 * speedRatio);
  const previousHeading = ship.heading;
  ship.heading += ship.rudder * hullDefinition.maxTurnRateRadians
    * ship.performance.turnMultiplier * turnAuthority
    * NAVIGATION_PACE.travelTimeScale * dt;
  ship.turnRateRadians = wrapAngle(ship.heading - previousHeading) / Math.max(dt, 0.0001);

  const metersPerSecond = shipSpeedMetersPerSecond(ship.speedKnots);
  const moveX = Math.sin(ship.heading) * metersPerSecond * dt;
  const moveZ = Math.cos(ship.heading) * metersPerSecond * dt;
  ship.position.x += moveX;
  ship.position.z += moveZ;
  ship.distanceTravelled += Math.hypot(moveX, moveZ);
}

interface Spec {
  name: string; shipClassId: ShipClassId; speed?: number; engine?: number; steering?: number;
  flooding?: number; acceleration?: number; turn?: number; maxSpeed?: number;
  multiplier?: number; forced?: number; enabled?: boolean; zeroMaxHealth?: boolean;
}
const specs: readonly Spec[] = [
  { name: "destroyer from rest", shipClassId: "fletcher" },
  { name: "cruiser with headway", shipClassId: "cleveland", speed: 17 },
  { name: "battleship braking", shipClassId: "yamato", speed: 19 },
  { name: "reverse inertia", shipClassId: "edinburgh", speed: -4 },
  { name: "damaged engine and steering", shipClassId: "bismarck", speed: 8, engine: .17, steering: .31, flooding: 43 },
  { name: "destroyed engine astern", shipClassId: "richelieu", speed: -3, engine: 0 },
  { name: "destroyed engine forward drag", shipClassId: "north-carolina", speed: 12, engine: 0 },
  { name: "jammed rudder", shipClassId: "agano", speed: 13, steering: 0 },
  { name: "zero module denominators", shipClassId: "dido", speed: 3, zeroMaxHealth: true },
  { name: "upgraded performance", shipClassId: "tashkent", speed: 12, acceleration: 1.27, turn: 1.16, maxSpeed: 1.08 },
  { name: "developer speed multiplier", shipClassId: "j-class", multiplier: 2.4 },
  { name: "developer multiplier upper clamp", shipClassId: "type-1936a", multiplier: 10 },
  { name: "forced forward speed", shipClassId: "nurnberg", forced: 57 },
  { name: "forced astern lower clamp", shipClassId: "king-george-v", forced: -70 },
  { name: "forced stop", shipClassId: "kagero", speed: 10, forced: 0 },
  { name: "disabled overrides", shipClassId: "yamato", multiplier: 5, forced: 100, enabled: false },
];
function fixture(spec: Spec): ShipState {
  const ship = createDeveloperShipState({
    id: "player", team: "player", shipClassId: spec.shipClassId,
    position: { x: 35, y: 1.3, z: -80 }, heading: 3.12,
    secondaryGunIds: [], torpedoLauncherMounts: 0, depthChargeMounts: 0, antiAirMounts: 0,
  });
  ship.speedKnots = spec.speed ?? 0; ship.rudder = -.23; ship.distanceTravelled = 27.5;
  ship.modules.engine.health = ship.modules.engine.maxHealth * (spec.engine ?? 1);
  ship.modules.steering.health = ship.modules.steering.maxHealth * (spec.steering ?? 1);
  if (spec.zeroMaxHealth) {
    ship.modules.engine.maxHealth = 0; ship.modules.steering.maxHealth = 0;
  }
  ship.flooding = spec.flooding ?? 0;
  ship.performance.accelerationMultiplier = spec.acceleration ?? 1;
  ship.performance.maxSpeedMultiplier = spec.maxSpeed ?? 1;
  ship.performance.turnMultiplier = spec.turn ?? 1;
  if (spec.multiplier !== undefined || spec.forced !== undefined) {
    ship.developer = { enabled: spec.enabled ?? true, unrestrictedWeapons: false,
      infiniteAmmunition: false, instantReload: false, speedMultiplier: spec.multiplier ?? 1,
      forcedSpeedKnots: spec.forced };
  }
  return ship;
}
function controlsAt(tick: number): Pick<ControlCommand, "throttle" | "rudder"> {
  const phase = Math.floor(tick / 120) % 5;
  return [
    { throttle: 1.4, rudder: 1.2 }, { throttle: .35, rudder: -.82 },
    { throttle: 0, rudder: .18 }, { throttle: -.7, rudder: -.9 },
    { throttle: .8, rudder: 0 },
  ][phase]!;
}
describe("shared ship kinematics preserves pre-extraction movement", () => {
  it.each(specs)("$name matches the frozen legacy block at every fixed step", spec => {
    const legacy = fixture(spec), motion = createShipKinematicSnapshot(legacy);
    const parameters = shipKinematicParameters(legacy);
    for (let tick = 0; tick < 600; tick++) {
      const navigationSpeed = [1, .82, .66, .42, 0][Math.floor(tick / 120)]!;
      const controls = controlsAt(tick);
      legacyMotion(legacy, controls, navigationSpeed, FIXED_STEP);
      advanceShipKinematics(motion, parameters, controls, navigationSpeed, FIXED_STEP);
      expect(motion).toEqual(createShipKinematicSnapshot(legacy));
    }
  });
  it.each([1 / 120, 1 / 30, .2, 0])("retains original arithmetic at dt=%s", dt => {
    const legacy = fixture(specs[4]!), motion = createShipKinematicSnapshot(legacy);
    const parameters = shipKinematicParameters(legacy);
    for (let tick = 0; tick < 80; tick++) {
      legacyMotion(legacy, controlsAt(tick), .66, dt);
      advanceShipKinematics(motion, parameters, controlsAt(tick), .66, dt);
      expect(motion).toEqual(createShipKinematicSnapshot(legacy));
    }
  });
  it.each(specs)("$name matches real production simulation at every fixed step", spec => {
    const state = createInitialState(881733, "sea-trials");
    state.mapId = "open-sea-range"; state.airSupport = "none"; state.airSquadrons = [];
    const ship = fixture(spec), legacy = structuredClone(ship);
    state.ships = [ship];
    const engine = ship.modules.engine.health, steering = ship.modules.steering.health;
    const initialFlooding = ship.flooding;
    for (let tick = 0; tick < 600; tick++) {
      // Fixed-parameter motion experiment: restore automatic post-movement
      // repair/flood inputs, without claiming to predict future damage control.
      ship.modules.engine.health = engine; ship.modules.steering.health = steering;
      ship.flooding = initialFlooding;
      const controls = controlsAt(tick), previous = { ...ship.position };
      legacyMotion(legacy, controls, 1, FIXED_STEP);
      stepSimulation(state, new Map([[ship.id, { ...controls, fire: false, aimPoint: { ...ship.aimPoint } }]]), FIXED_STEP);
      expect(createShipKinematicSnapshot(ship)).toEqual(createShipKinematicSnapshot(legacy));
      expect(ship.previousPosition).toEqual(previous);
      expect(state.status).toBe("running");
      expect(ship.navigationZone).toBe("deep");
    }
    expect(state.randomSeed).toBe(881733);
  });
  it("samples real shallow water at each old center before advancing", () => {
    const state = createInitialState(881733, "sea-trials");
    state.mapId = "atoll-prototype"; state.airSupport = "none"; state.airSquadrons = [];
    const ship = fixture({ name: "shallow", shipClassId: "fletcher", speed: 2 });
    ship.position = { x: -950, y: 0, z: 1100 }; ship.heading = 0; ship.rudder = 0;
    const legacy = structuredClone(ship); state.ships = [ship];
    for (let tick = 0; tick < 120; tick++) {
      const navigation = terrainNavigationAt(state.mapId, legacy.position.x, legacy.position.z, shipDraftMeters(legacy.shipClassId));
      expect(navigation.kind).toBe("shallow");
      const controls = { throttle: .2, rudder: .3 };
      legacyMotion(legacy, controls, navigation.speedMultiplier, FIXED_STEP);
      stepSimulation(state, new Map([[ship.id, { ...controls, fire: false, aimPoint: { ...ship.aimPoint } }]]), FIXED_STEP);
      expect(createShipKinematicSnapshot(ship)).toEqual(createShipKinematicSnapshot(legacy));
      expect(ship.navigationZone).toBe("shallow");
    }
  });
  it("does not alias position or frozen parameters and leaves the real ship untouched", () => {
    const ship = fixture(specs[4]!), before = structuredClone(ship);
    const motion = createShipKinematicSnapshot(ship), parameters = Object.freeze(shipKinematicParameters(ship));
    for (let i = 0; i < 300; i++) advanceShipKinematics(motion, parameters, controlsAt(i), .66, FIXED_STEP);
    expect(ship).toEqual(before);
    expect(motion.position).not.toBe(ship.position);
    expect(motion.position).not.toEqual(ship.position);
    ship.modules.engine.health = 0; ship.flooding = 100; ship.performance.turnMultiplier = 0;
    expect(parameters).toEqual(shipKinematicParameters(before));
  });
  it("refreshes live movement parameters after damage between real steps", () => {
    const state = createInitialState(881733, "sea-trials");
    state.mapId = "open-sea-range"; state.airSupport = "none"; state.airSquadrons = [];
    const ship = fixture(specs[1]!); state.ships = [ship];
    for (let tick = 0; tick < 120; tick++) {
      ship.modules.engine.health = ship.modules.engine.maxHealth * (tick < 60 ? 1 : .1);
      ship.modules.steering.health = ship.modules.steering.maxHealth * (tick < 60 ? 1 : .2);
      ship.flooding = tick < 60 ? 0 : 80;
      const legacy = structuredClone(ship), controls = controlsAt(tick);
      legacyMotion(legacy, controls, 1, FIXED_STEP);
      stepSimulation(state, new Map([[ship.id, { ...controls, fire: false, aimPoint: { ...ship.aimPoint } }]]), FIXED_STEP);
      expect(createShipKinematicSnapshot(ship)).toEqual(createShipKinematicSnapshot(legacy));
    }
  });
});
