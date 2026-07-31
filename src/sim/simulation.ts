import {
  AMMUNITION,
  ARMOR_THICKNESS_MM,
  BASE_REPAIR_PER_SECOND,
  BATTLE_DURATION_SECONDS,
  COLLISION,
  COLLISION_DAMAGE_MULTIPLIER,
  COMPARTMENT_MAX_HEALTH,
  DAMAGE_CONTROL,
  DEPTH_CHARGE,
  FIXED_STEP,
  GUN,
  HULL_REPAIR,
  HYDRO,
  KNOT_TO_MPS,
  MODULE_MAX_HEALTH,
  OBJECTIVE,
  SENSOR,
  TURRET,
  TORPEDO,
  SMOKE,
} from "./config";
import {
  DEFAULT_MAIN_GUN_ID,
  FRONT_TURRET_TRAVERSE_LIMIT_RADIANS,
} from "../ships/components";
import type { MainGunId } from "../ships/components";
import { DEFAULT_HULL_ID, getHull } from "../ships/hulls";
import type { HullId } from "../ships/hulls";
import { DEFAULT_SHIP_CLASS_ID, getShipClass, isShipClassId } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import { DEFAULT_TORPEDO_ID, getTorpedo } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import { getSecondaryGun } from "../ships/secondaryGuns";
import type { SecondaryGunId } from "../ships/secondaryGuns";
import {
  getMainBattery,
  mainBatteryMountLocalPosition,
  mainBatteryMuzzleLocalHeight,
  MAIN_BATTERY_TRAVERSE_LIMIT_RADIANS,
  mainBatteryMountRestHeading,
} from "../ships/mainBatteries";
import { classArmorThickness } from "../ships/armorProfiles";
import { effectiveTorpedoDetectionRange } from "./detection";
import type {
  AmmoType,
  ArmorZoneId,
  AirMissionCommand,
  AirMissionRejectReason,
  BattleState,
  CompartmentId,
  ControlCommand,
  DamageControlAllocation,
  DamageControlPriority,
  GameMode,
  ModuleId,
  ProjectileState,
  PenetrationResult,
  ShipState,
  Team,
  Vec3,
  ShipPerformanceModifiers,
  SensorContact,
  ShellPenetrationProfile,
  TorpedoLaunchSolution,
  TorpedoSpreadMode,
  TorpedoThreat,
} from "./types";
import {
  advanceAirSquadronPhase,
  airTransitionEventKind,
  issueAirMissionOrder,
} from "./airOperations";
import type { AirMissionIssueResult } from "./airOperations";

const zeroCommand: ControlCommand = {
  throttle: 0,
  rudder: 0,
  aimPoint: { x: 0, y: 0, z: 1_000 },
  fire: false,
  repairHull: false,
  damageControlPriority: "balanced",
  weaponSlot: "mainGun",
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function mainGunBloomRemaining(
  time: number,
  ship: Pick<ShipState, "lastMainGunFiredAt">,
): number {
  if (ship.lastMainGunFiredAt === undefined) return 0;
  return Math.max(0, SENSOR.gunBloomSeconds - (time - ship.lastMainGunFiredAt));
}

function gunBloomSignature(state: BattleState, observer: ShipState): string {
  return state.ships
    .filter((ship) => ship.team !== observer.team && ship.hull > 0)
    .map((ship) => `${ship.id}:${mainGunBloomRemaining(state.time, ship) > 0 ? 1 : 0}`)
    .join("|");
}

const copyVec = (value: Vec3): Vec3 => ({ ...value });

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

function stringSeed(value: string): number {
  let seed = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

function sensorUnit(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ mixed >>> 16, 0x7feb352d);
  mixed = Math.imul(mixed ^ mixed >>> 15, 0x846ca68b);
  return ((mixed ^ mixed >>> 16) >>> 0) / 0x1_0000_0000;
}

const sensorSigned = (value: number): number => sensorUnit(value) * 2 - 1;

function createModules(): ShipState["modules"] {
  return {
    gun: { health: MODULE_MAX_HEALTH.gun, maxHealth: MODULE_MAX_HEALTH.gun },
    torpedoTubes: {
      health: MODULE_MAX_HEALTH.torpedoTubes,
      maxHealth: MODULE_MAX_HEALTH.torpedoTubes,
    },
    engine: { health: MODULE_MAX_HEALTH.engine, maxHealth: MODULE_MAX_HEALTH.engine },
    steering: { health: MODULE_MAX_HEALTH.steering, maxHealth: MODULE_MAX_HEALTH.steering },
    magazine: { health: MODULE_MAX_HEALTH.magazine, maxHealth: MODULE_MAX_HEALTH.magazine },
    crew: { health: MODULE_MAX_HEALTH.crew, maxHealth: MODULE_MAX_HEALTH.crew },
  };
}

function createSecondaryMounts(
  ids: readonly SecondaryGunId[],
  heading: number,
  shipClassId: ShipClassId,
): ShipState["secondaryMounts"] {
  const definition = getShipClass(shipClassId);
  const pairCount = Math.max(1, Math.ceil(ids.length / 2));
  return ids.map((definitionId, index) => {
    const pairIndex = Math.floor(index / 2);
    const progress = pairCount <= 1 ? 0.5 : pairIndex / (pairCount - 1);
    const side = (index % 2 === 0 ? -1 : 1) as -1 | 1;
    return {
      definitionId,
      side,
      longitudinalOffset: definition.length * (0.28 - progress * 0.56),
      heading: wrapAngle(heading + side * Math.PI / 2),
      reloadRemaining: 0,
    };
  });
}

function createMainBatteryMounts(
  shipClassId: ShipClassId,
  mainGunId: MainGunId,
  equippedMounts: number,
  shipHeading: number,
): ShipState["mainBatteryMounts"] {
  const battery = getMainBattery(shipClassId, mainGunId, equippedMounts);
  return battery.mounts.map((mount, mountIndex) => ({
    mountIndex,
    restHeadingOffset: mainBatteryMountRestHeading(mount),
    heading: wrapAngle(shipHeading + mainBatteryMountRestHeading(mount)),
    reloadRemaining: 0,
    health: 100,
    maxHealth: 100,
  }));
}

function createShip(
  id: string,
  team: Team,
  x: number,
  z: number,
  heading: number,
  mainGunId: MainGunId = DEFAULT_MAIN_GUN_ID,
  torpedoId: TorpedoId = DEFAULT_TORPEDO_ID,
  performance: ShipPerformanceModifiers = {
    maxSpeedMultiplier: 1,
    accelerationMultiplier: 1,
    turnMultiplier: 1,
    reloadMultiplier: 1,
    magazineRiskMultiplier: 1,
  },
  shipClassId: ShipClassId = DEFAULT_SHIP_CLASS_ID,
  mainGunMounts = 1,
  torpedoLauncherMounts = 1,
  depthChargeMounts = 0,
  secondaryGunIds: readonly SecondaryGunId[] = [],
): ShipState {
  const hullDefinition = getShipClass(shipClassId);
  const hullId = hullDefinition.hullId;
  const compartments = Object.fromEntries(
    Object.entries(COMPARTMENT_MAX_HEALTH).map(([id, health]) => [
      id,
      health * hullDefinition.compartmentHealthMultiplier,
    ]),
  ) as ShipState["compartments"];
  return {
    id,
    team,
    hullId,
    shipClassId,
    position: { x, y: 0, z },
    previousPosition: { x, y: 0, z },
    heading,
    turretHeading: heading,
    speedKnots: 12,
    throttle: 0.55,
    rudderCommand: 0,
    rudder: 0,
    hull: hullDefinition.maxHull,
    maxHull: hullDefinition.maxHull,
    recoverableHull: hullDefinition.maxHull,
    compartments,
    modules: createModules(),
    mainGunId,
    torpedoId,
    mainGunMounts: Math.max(1, mainGunMounts),
    mainBatteryMounts: createMainBatteryMounts(
      shipClassId,
      mainGunId,
      Math.max(1, mainGunMounts),
      heading,
    ),
    torpedoLauncherMounts: Math.max(0, torpedoLauncherMounts),
    depthChargeMounts: Math.max(0, depthChargeMounts),
    secondaryMounts: createSecondaryMounts(secondaryGunIds, heading, shipClassId),
    secondaryBatteryStatus: secondaryGunIds.length > 0 ? "searching" : "unavailable",
    secondaryAcquisitionSamples: 0,
    performance,
    gunTraverseBlocked: false,
    reloadRemaining: 0,
    torpedoReloadRemaining: 0,
    torpedoReloadDuration: getTorpedo(torpedoId).reloadSeconds,
    torpedoLauncherHeading: wrapAngle(heading + Math.PI / 2),
    torpedoesLoaded: hullDefinition.slotCounts.torpedo > 0 && torpedoLauncherMounts > 0 ? 2 : 0,
    torpedoReserveSalvos: hullDefinition.slotCounts.torpedo > 0 && torpedoLauncherMounts > 0
      ? getTorpedo(torpedoId).reserveSalvos
      : 0,
    torpedoSpreadMode: "narrow",
    depthChargeReloadRemaining: 0,
    depthChargeSalvos: hullId === "destroyer" && depthChargeMounts > 0
      ? DEPTH_CHARGE.salvos
      : 0,
    aimPoint: { x, y: 0, z: z + Math.cos(heading) * 1_800 },
    ammoType: "he",
    fireIntensity: 0,
    flooding: 0,
    smokeCharges: SMOKE.charges,
    smokeCooldownRemaining: 0,
    smokeDeploymentRemaining: 0,
    smokeNextPuffAt: 0,
    hydroCharges: HYDRO.charges,
    hydroCooldownRemaining: 0,
    hydroActiveRemaining: 0,
    damageControlPriority: "balanced",
    damageControlAllocation: { fire: 0, flood: 0, module: 0, hull: 0 },
    hullRepairActive: false,
    distanceTravelled: 0,
    turnRateRadians: 0,
  };
}

export function createInitialState(
  seed = 0x5ea1,
  mode: GameMode = "battle",
  playerMainGunId: MainGunId = DEFAULT_MAIN_GUN_ID,
  playerPerformance?: Partial<ShipPerformanceModifiers>,
  playerTorpedoId: TorpedoId = DEFAULT_TORPEDO_ID,
  playerShipClassId: ShipClassId = DEFAULT_SHIP_CLASS_ID,
): BattleState {
  const playerShipClass = getShipClass(playerShipClassId);
  const armament = playerPerformance as (Partial<ShipPerformanceModifiers> & {
    mainGunMounts?: number;
    torpedoLauncherMounts?: number;
    depthChargeMounts?: number;
    secondaryGunIds?: SecondaryGunId[];
  }) | undefined;
  const mainGunMounts = armament?.mainGunMounts ?? 1;
  const torpedoLauncherMounts = armament?.torpedoLauncherMounts
    ?? (playerShipClass.slotCounts.torpedo > 0 ? 1 : 0);
  const depthChargeMounts = armament?.depthChargeMounts
    ?? (playerShipClass.slotCounts.depthCharge > 0 ? 1 : 0);
  const secondaryGunIds = armament?.secondaryGunIds
    ?? Array.from(
      { length: playerShipClass.starterSlots.sideGun },
      () => "sideGun-common" as const,
    );
  const enemySecondaryGunIds = Array.from(
    { length: playerShipClass.starterSlots.sideGun },
    () => "sideGun-common" as const,
  );
  const player = createShip("player", "player", 0, -900, 0, playerMainGunId, playerTorpedoId, {
    maxSpeedMultiplier: playerPerformance?.maxSpeedMultiplier ?? 1,
    accelerationMultiplier: playerPerformance?.accelerationMultiplier ?? 1,
    turnMultiplier: playerPerformance?.turnMultiplier ?? 1,
    reloadMultiplier: playerPerformance?.reloadMultiplier ?? 1,
    magazineRiskMultiplier: playerPerformance?.magazineRiskMultiplier ?? 1,
  }, playerShipClassId, mainGunMounts, torpedoLauncherMounts, depthChargeMounts, secondaryGunIds);
  const testTarget = createShip(
    "test-target",
    "enemy",
    0,
    -460,
    Math.PI / 2,
    DEFAULT_MAIN_GUN_ID,
    DEFAULT_TORPEDO_ID,
    undefined,
    playerShipClassId,
    mainGunMounts,
    torpedoLauncherMounts,
    0,
    [],
  );
  testTarget.speedKnots = 0;
  testTarget.throttle = 0;
  testTarget.isTestTarget = true;
  return {
    mode,
    time: 0,
    status: "running",
    objective: {
      center: { x: OBJECTIVE.centerX, y: 0, z: OBJECTIVE.centerZ },
      radius: OBJECTIVE.radiusMeters,
      captureProgress: 0,
      contested: false,
      occupants: { player: 0, enemy: 0 },
      scores: { player: 0, enemy: 0 },
    },
    ships: mode === "battle"
      ? [player, createShip(
        "enemy",
        "enemy",
        180,
        1_250,
        Math.PI,
        DEFAULT_MAIN_GUN_ID,
        DEFAULT_TORPEDO_ID,
        undefined,
        playerShipClassId,
        mainGunMounts,
        torpedoLauncherMounts,
        0,
        enemySecondaryGunIds,
      )]
      : [player, testTarget],
    airSquadrons: [],
    airEvents: [],
    projectiles: [],
    depthCharges: [],
    underwaterTargets: mode === "sea-trials" ? [{
      id: "submerged-training-target",
      position: { x: 0, y: -18, z: -330 },
      previousPosition: { x: 0, y: -18, z: -330 },
      hull: 1_000,
      maxHull: 1_000,
      radius: 6,
      length: 52,
      isTrainingTarget: true,
    }] : [],
    shots: [],
    impacts: [],
    smokeClouds: [],
    nextEntityId: 1,
    randomSeed: seed >>> 0,
    collisionCooldowns: {},
    sensorSnapshots: {},
  };
}

function random(state: BattleState): number {
  state.randomSeed = (Math.imul(1_664_525, state.randomSeed) + 1_013_904_223) >>> 0;
  return state.randomSeed / 0x1_0000_0000;
}

function moduleRatio(ship: ShipState, id: ModuleId): number {
  const module = ship.modules[id];
  return module.maxHealth === 0 ? 0 : module.health / module.maxHealth;
}

function applyHullDamage(ship: ShipState, damage: number, permanentFraction: number): void {
  ship.hull = Math.max(0, ship.hull - damage);
  ship.recoverableHull = Math.max(
    ship.hull,
    Math.min(ship.maxHull, ship.recoverableHull - damage * permanentFraction),
  );
}

function desiredTurretHeading(
  ship: ShipState,
  mountIndex = 0,
): { heading: number; blocked: boolean } {
  const desiredHeading = Math.atan2(
    ship.aimPoint.x - ship.position.x,
    ship.aimPoint.z - ship.position.z,
  );
  const mount = ship.mainBatteryMounts[mountIndex];
  const restHeading = mount?.restHeadingOffset ?? 0;
  const traverseLimit = mount
    ? MAIN_BATTERY_TRAVERSE_LIMIT_RADIANS
    : FRONT_TURRET_TRAVERSE_LIMIT_RADIANS;
  const desiredRelativeFromRest = wrapAngle(desiredHeading - ship.heading - restHeading);
  const blocked = Math.abs(desiredRelativeFromRest) > traverseLimit;
  const safeRelative = restHeading + clamp(
    desiredRelativeFromRest,
    -traverseLimit,
    traverseLimit,
  );
  return { heading: wrapAngle(ship.heading + safeRelative), blocked };
}

export function mainBatteryMountCanBear(
  ship: Readonly<ShipState>,
  mountIndex: number,
  aimPoint: Readonly<Vec3> = ship.aimPoint,
): boolean {
  const mount = ship.mainBatteryMounts[mountIndex];
  if (!mount || mount.health <= 0) return false;
  const desiredHeading = Math.atan2(
    aimPoint.x - ship.position.x,
    aimPoint.z - ship.position.z,
  );
  return Math.abs(wrapAngle(desiredHeading - ship.heading - mount.restHeadingOffset))
    <= MAIN_BATTERY_TRAVERSE_LIMIT_RADIANS;
}

export function turretAlignmentError(ship: ShipState, mountIndex = 0): number {
  const mount = ship.mainBatteryMounts[mountIndex];
  return wrapAngle(desiredTurretHeading(ship, mountIndex).heading - (mount?.heading ?? ship.turretHeading));
}

export function isGunBearingBlocked(ship: ShipState): boolean {
  return ship.mainBatteryMounts.every((mount) =>
    !mainBatteryMountCanBear(ship, mount.mountIndex));
}

export function isGunFireBlocked(ship: ShipState): boolean {
  return ship.modules.gun.health <= 0
    || ship.mainBatteryMounts.every((mount) => mount.health <= 0);
}

export function isTurretAligned(ship: ShipState): boolean {
  return ship.mainBatteryMounts.some((mount) =>
    mount.health > 0
    && !desiredTurretHeading(ship, mount.mountIndex).blocked
    && Math.abs(turretAlignmentError(ship, mount.mountIndex)) <= TURRET.fireToleranceRadians
  );
}

function desiredTorpedoLauncherHeading(ship: ShipState): number {
  const bearing = Math.atan2(
    ship.aimPoint.x - ship.position.x,
    ship.aimPoint.z - ship.position.z,
  );
  const relative = wrapAngle(bearing - ship.heading);
  const currentRelative = wrapAngle(ship.torpedoLauncherHeading - ship.heading);
  const side = Math.abs(relative) > 0.001
    ? Math.sign(relative)
    : Math.sign(currentRelative) || 1;
  const safeMagnitude = clamp(
    Math.abs(relative),
    TORPEDO.minimumLaunchAngleRadians,
    TORPEDO.maximumLaunchAngleRadians,
  );
  return wrapAngle(ship.heading + side * safeMagnitude);
}

export function torpedoLauncherAlignmentError(ship: ShipState): number {
  return wrapAngle(desiredTorpedoLauncherHeading(ship) - ship.torpedoLauncherHeading);
}

function moveShip(ship: ShipState, command: ControlCommand, dt: number): void {
  const hullDefinition = getShipClass(ship.shipClassId);
  ship.previousPosition = copyVec(ship.position);
  ship.throttle = clamp(command.throttle, -0.25, 1);
  ship.rudderCommand = clamp(command.rudder, -1, 1);
  ship.aimPoint = copyVec(command.aimPoint);

  if (command.ammoType === ship.ammoType && ship.pendingAmmoType) {
    ship.pendingAmmoType = undefined;
  } else if (
    command.ammoType
    && command.ammoType !== ship.ammoType
    && command.ammoType !== ship.pendingAmmoType
  ) {
    ship.pendingAmmoType = command.ammoType;
    const gunDefinition = getMainBattery(ship.shipClassId, ship.mainGunId, ship.mainGunMounts);
    const gunRatio = Math.max(0.25, moduleRatio(ship, "gun"));
    const switchDuration = gunDefinition.reloadSeconds * ship.performance.reloadMultiplier / gunRatio;
    for (const mount of ship.mainBatteryMounts) {
      mount.reloadRemaining = Math.max(mount.reloadRemaining, switchDuration);
    }
    ship.reloadRemaining = Math.max(ship.reloadRemaining, switchDuration);
  }

  const engineRatio = moduleRatio(ship, "engine");
  const steeringRatio = moduleRatio(ship, "steering");
  const rudderShiftRate = steeringRatio <= 0
    ? 0
    : hullDefinition.rudderShiftPerSecond * (0.18 + steeringRatio * 0.82);
  ship.rudder += clamp(
    ship.rudderCommand - ship.rudder,
    -rudderShiftRate * dt,
    rudderShiftRate * dt,
  );
  const floodingSpeedFactor = 1 - clamp(ship.flooding / 100, 0, 1) * 0.32;
  const equippedMaxSpeed = hullDefinition.maxSpeedKnots * ship.performance.maxSpeedMultiplier;
  const effectiveMaxSpeed = equippedMaxSpeed * engineRatio * floodingSpeedFactor * Math.max(0, ship.throttle);
  const reverseTarget = ship.throttle < 0 ? equippedMaxSpeed * ship.throttle * 0.28 : effectiveMaxSpeed;
  const orderedSpeed = ship.throttle < 0 ? reverseTarget : effectiveMaxSpeed;
  const turningSpeedFactor = 1
    - Math.abs(ship.rudder) * hullDefinition.maximumTurningSpeedLoss;
  const targetSpeed = orderedSpeed * turningSpeedFactor;
  const propulsionResponse = engineRatio <= 0 ? 0 : 0.2 + engineRatio * 0.8;
  const rate = (targetSpeed >= ship.speedKnots
    ? hullDefinition.accelerationKnotsPerSecond * propulsionResponse
    : hullDefinition.brakingKnotsPerSecond * (0.45 + engineRatio * 0.55))
    * ship.performance.accelerationMultiplier;
  ship.speedKnots += clamp(targetSpeed - ship.speedKnots, -rate * dt, rate * dt);

  const speedRatio = clamp(Math.abs(ship.speedKnots) / equippedMaxSpeed, 0, 1);
  const turnAuthority = steeringRatio * (0.2 + 0.8 * speedRatio);
  const previousHeading = ship.heading;
  ship.heading += ship.rudder * hullDefinition.maxTurnRateRadians
    * ship.performance.turnMultiplier * turnAuthority * dt;
  ship.turnRateRadians = wrapAngle(ship.heading - previousHeading) / Math.max(dt, 0.0001);

  const metersPerSecond = ship.speedKnots * KNOT_TO_MPS;
  const moveX = Math.sin(ship.heading) * metersPerSecond * dt;
  const moveZ = Math.cos(ship.heading) * metersPerSecond * dt;
  ship.position.x += moveX;
  ship.position.z += moveZ;
  ship.distanceTravelled += Math.hypot(moveX, moveZ);
  const gunRatio = moduleRatio(ship, "gun");
  const gunDefinition = getMainBattery(ship.shipClassId, ship.mainGunId, ship.mainGunMounts);
  const traverseRate = gunRatio <= 0
    ? 0
    : gunDefinition.traverseDegreesPerSecond * Math.PI / 180 * (0.3 + gunRatio * 0.7);
  let anyMountCanBear = false;
  for (const mount of ship.mainBatteryMounts) {
    const turretTarget = desiredTurretHeading(ship, mount.mountIndex);
    if (!turretTarget.blocked && mount.health > 0) anyMountCanBear = true;
    if (mount.health <= 0) continue;
    const alignmentError = wrapAngle(turretTarget.heading - mount.heading);
    const mountRatio = mount.health / mount.maxHealth;
    const mountTraverseRate = traverseRate * (0.25 + mountRatio * 0.75);
    mount.heading = wrapAngle(
      mount.heading + clamp(alignmentError, -mountTraverseRate * dt, mountTraverseRate * dt),
    );
  }
  ship.gunTraverseBlocked = !anyMountCanBear;
  ship.turretHeading = ship.mainBatteryMounts[0]?.heading ?? ship.turretHeading;
  const tubeRatio = moduleRatio(ship, "torpedoTubes");
  const launcherRate = tubeRatio <= 0
    ? 0
    : TORPEDO.launcherTraverseRadiansPerSecond * (0.25 + tubeRatio * 0.75);
  const launcherError = torpedoLauncherAlignmentError(ship);
  ship.torpedoLauncherHeading = wrapAngle(
    ship.torpedoLauncherHeading
      + clamp(launcherError, -launcherRate * dt, launcherRate * dt),
  );
  let maximumMainBatteryReload = 0;
  let allMainBatteryMountsLoaded = true;
  for (const mount of ship.mainBatteryMounts) {
    mount.reloadRemaining = Math.max(0, mount.reloadRemaining - dt);
    maximumMainBatteryReload = Math.max(maximumMainBatteryReload, mount.reloadRemaining);
    if (mount.reloadRemaining > 0) allMainBatteryMountsLoaded = false;
  }
  ship.reloadRemaining = maximumMainBatteryReload;
  ship.depthChargeReloadRemaining = Math.max(0, ship.depthChargeReloadRemaining - dt);
  for (const mount of ship.secondaryMounts) {
    mount.reloadRemaining = Math.max(0, mount.reloadRemaining - dt);
  }
  if (allMainBatteryMountsLoaded && ship.pendingAmmoType) {
    ship.ammoType = ship.pendingAmmoType;
    ship.pendingAmmoType = undefined;
  }
  if (ship.torpedoReloadRemaining > 0 && tubeRatio > 0) {
    ship.torpedoReloadRemaining = Math.max(
      0,
      ship.torpedoReloadRemaining - dt * tubeRatio,
    );
    if (ship.torpedoReloadRemaining <= 0) ship.torpedoesLoaded = 2;
  }
}

export function ballisticVelocity(
  origin: Vec3,
  target: Vec3,
  muzzleVelocity: number = GUN.muzzleVelocity,
): Vec3 | null {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const range = Math.hypot(dx, dz);
  if (range < 1) return null;

  const speed = muzzleVelocity;
  const verticalOffset = target.y - origin.y;
  const discriminant = speed ** 4
    - GUN.gravity * (GUN.gravity * range ** 2 + 2 * verticalOffset * speed ** 2);
  if (discriminant < 0) return null;

  const angle = Math.atan((speed ** 2 - Math.sqrt(discriminant)) / (GUN.gravity * range));
  const horizontalSpeed = speed * Math.cos(angle);
  return {
    x: (dx / range) * horizontalSpeed,
    y: speed * Math.sin(angle),
    z: (dz / range) * horizontalSpeed,
  };
}

export function predictTrajectory(
  origin: Vec3,
  target: Vec3,
  points = 28,
  muzzleVelocity: number = GUN.muzzleVelocity,
): Vec3[] {
  const velocity = ballisticVelocity(origin, target, muzzleVelocity);
  if (!velocity) return [];
  const horizontalRange = Math.hypot(target.x - origin.x, target.z - origin.z);
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  const flightTime = horizontalRange / horizontalSpeed;
  return Array.from({ length: points }, (_, index) => {
    const t = (flightTime * index) / (points - 1);
    return {
      x: origin.x + velocity.x * t,
      y: origin.y + velocity.y * t - 0.5 * GUN.gravity * t * t,
      z: origin.z + velocity.z * t,
    };
  });
}

export function dispersionAtRange(
  range: number,
  gunHealthRatio = 1,
  upgradeMultiplier = 1,
): { longitudinal: number; lateral: number } {
  const gunDamageFactor = 1 + (1 - clamp(gunHealthRatio, 0, 1)) * 0.8;
  return {
    longitudinal: (12 + range * 0.012) * gunDamageFactor * upgradeMultiplier,
    lateral: (5 + range * 0.007) * gunDamageFactor * upgradeMultiplier,
  };
}

export function gunMuzzleOrigin(ship: ShipState): Vec3 {
  return gunMuzzleOrigins(ship)[0] ?? {
    x: ship.position.x,
    y: GUN.muzzleHeight,
    z: ship.position.z,
  };
}

export function gunMuzzleOrigins(ship: ShipState): Vec3[] {
  const battery = getMainBattery(ship.shipClassId, ship.mainGunId, ship.mainGunMounts);
  return battery.mounts.flatMap((_, mountIndex) => gunMuzzleOriginsForMount(ship, mountIndex));
}

function gunMuzzleOriginsForMount(ship: ShipState, mountIndex: number): Vec3[] {
  const hull = getShipClass(ship.shipClassId);
  const gunDefinition = getMainBattery(ship.shipClassId, ship.mainGunId, ship.mainGunMounts);
  const mount = gunDefinition.mounts[mountIndex];
  if (!mount) return [];
  const turretHeading = ship.mainBatteryMounts[mountIndex]?.heading ?? ship.turretHeading;
  const hardpoint = mainBatteryMountLocalPosition(mount);
  const barrelScale = hull.renderScale.x;
  const barrelDistance = gunDefinition.visual.barrelLength * .88 * hull.renderScale.z;
  const longitudinal = hardpoint.z * hull.renderScale.z;
  const lateral = hardpoint.x * hull.renderScale.x;
  const offsets = Array.from(
    { length: mount.barrelCount },
    (_, index) => (index - (mount.barrelCount - 1) / 2) * gunDefinition.visual.barrelSpacing,
  );
  const center = {
    x: ship.position.x
      + Math.sin(ship.heading) * longitudinal
      + Math.cos(ship.heading) * lateral
      + Math.sin(turretHeading) * barrelDistance,
    y: (hull.hullId === "destroyer"
      ? GUN.muzzleHeight
      : mainBatteryMuzzleLocalHeight(mount)) * hull.renderScale.y,
    z: ship.position.z
      + Math.cos(ship.heading) * longitudinal
      - Math.sin(ship.heading) * lateral
      + Math.cos(turretHeading) * barrelDistance,
  };
  return offsets.map((offset) => ({
    x: center.x + Math.cos(turretHeading) * offset * barrelScale,
    y: center.y,
    z: center.z - Math.sin(turretHeading) * offset * barrelScale,
  }));
}

export function turretAimPoint(ship: ShipState, origin = gunMuzzleOrigin(ship)): Vec3 {
  const range = Math.max(
    1,
    Math.hypot(ship.aimPoint.x - origin.x, ship.aimPoint.z - origin.z),
  );
  return {
    x: origin.x + Math.sin(ship.turretHeading) * range,
    y: ship.aimPoint.y,
    z: origin.z + Math.cos(ship.turretHeading) * range,
  };
}

function dispersedAimPoint(
  state: BattleState,
  ship: ShipState,
  origin: Vec3,
  target: Vec3,
): Vec3 {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const range = Math.max(1, Math.hypot(dx, dz));
  const forwardX = dx / range;
  const forwardZ = dz / range;
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const gunDefinition = getMainBattery(ship.shipClassId, ship.mainGunId, ship.mainGunMounts);
  const dispersion = dispersionAtRange(
    range,
    moduleRatio(ship, "gun"),
    gunDefinition.dispersionMultiplier,
  );
  const centeredNoise = (): number =>
    ((random(state) + random(state) + random(state)) - 1.5) / 1.5;
  const longitudinalError = centeredNoise() * dispersion.longitudinal;
  const lateralError = centeredNoise() * dispersion.lateral;
  return {
    x: target.x + forwardX * longitudinalError + rightX * lateralError,
    y: target.y,
    z: target.z + forwardZ * longitudinalError + rightZ * lateralError,
  };
}

function fireGun(state: BattleState, ship: ShipState): void {
  if (ship.modules.gun.health <= 0) return;
  const gunDefinition = getMainBattery(ship.shipClassId, ship.mainGunId, ship.mainGunMounts);
  const requestedRange = Math.hypot(
    ship.aimPoint.x - ship.position.x,
    ship.aimPoint.z - ship.position.z,
  );
  if (
    requestedRange < GUN.minAimRange
    || requestedRange > gunDefinition.maximumRangeMeters + 0.001
  ) return;
  const damagePerShell = gunDefinition.damagePerShell;
  let firedShells = 0;
  let salvoId: number | undefined;
  const gunRatio = Math.max(0.25, moduleRatio(ship, "gun"));
  const reloadDuration = gunDefinition.reloadSeconds * ship.performance.reloadMultiplier / gunRatio;
  for (const mount of ship.mainBatteryMounts) {
    if (
      mount.reloadRemaining > 0
      || !mainBatteryMountCanBear(ship, mount.mountIndex)
    ) continue;
    const origins = gunMuzzleOriginsForMount(ship, mount.mountIndex);
    const turretHeading = mount.heading;
    let mountFiredShells = 0;
    for (const origin of origins) {
      const range = Math.max(1, Math.hypot(ship.aimPoint.x - origin.x, ship.aimPoint.z - origin.z));
      const barrelAimPoint = {
        x: origin.x + Math.sin(turretHeading) * range,
        y: ship.aimPoint.y,
        z: origin.z + Math.cos(turretHeading) * range,
      };
      const actualAimPoint = dispersedAimPoint(state, ship, origin, barrelAimPoint);
      const velocity = ballisticVelocity(origin, actualAimPoint, gunDefinition.muzzleVelocity);
      if (!velocity) continue;
      if (salvoId === undefined) salvoId = state.nextEntityId++;
      state.projectiles.push({
        id: state.nextEntityId++,
        ownerId: ship.id,
        team: ship.team,
        kind: "shell",
        ammoType: ship.ammoType,
        weaponSource: "mainGun",
        salvoId,
        shellProfile: gunDefinition.shellProfile,
        position: copyVec(origin),
        previousPosition: copyVec(origin),
        velocity,
        damage: damagePerShell,
        age: 0,
      });
      state.shots.push({
        id: state.nextEntityId++,
        ownerId: ship.id,
        team: ship.team,
        kind: "shell",
        ammoType: ship.ammoType,
        weaponSource: "mainGun",
        salvoId,
        position: copyVec(origin),
      });
      mountFiredShells += 1;
      firedShells += 1;
    }
    if (mountFiredShells > 0) {
      mount.reloadRemaining = reloadDuration;
      mount.lastFiredAt = state.time;
    }
  }
  if (firedShells === 0) return;
  ship.lastMainGunFiredAt = state.time;
  ship.reloadRemaining = ship.mainBatteryMounts.reduce(
    (maximum, mount) => Math.max(maximum, mount.reloadRemaining),
    0,
  );
}

export function secondaryMountOrigin(
  ship: ShipState,
  mount: ShipState["secondaryMounts"][number],
): Vec3 {
  const definition = getShipClass(ship.shipClassId);
  const forwardX = Math.sin(ship.heading);
  const forwardZ = Math.cos(ship.heading);
  const rightX = Math.cos(ship.heading);
  const rightZ = -Math.sin(ship.heading);
  const lateral = mount.side * definition.beam * 0.43;
  return {
    x: ship.position.x + forwardX * mount.longitudinalOffset + rightX * lateral,
    y: definition.deckHeight * 0.82,
    z: ship.position.z + forwardZ * mount.longitudinalOffset + rightZ * lateral,
  };
}

export function secondaryMountCanBear(
  ship: Pick<ShipState, "heading">,
  side: -1 | 1,
  bearing: number,
): boolean {
  const relative = wrapAngle(bearing - ship.heading);
  const absolute = Math.abs(relative);
  const targetSide = relative >= 0 ? 1 : -1;
  return side === targetSide
    && absolute >= 25 * Math.PI / 180
    && absolute <= 155 * Math.PI / 180;
}

function secondaryAimPoint(
  state: BattleState,
  ship: ShipState,
  contact: SensorContact,
  origin: Vec3,
  muzzleVelocity: number,
  dispersionMultiplier: number,
): Vec3 {
  const range = Math.max(1, Math.hypot(
    contact.position.x - origin.x,
    contact.position.z - origin.z,
  ));
  const leadSeconds = range / muzzleVelocity;
  const targetSpeed = contact.speedKnots * KNOT_TO_MPS;
  const target = {
    x: contact.position.x + Math.sin(contact.heading) * targetSpeed * leadSeconds,
    y: 3,
    z: contact.position.z + Math.cos(contact.heading) * targetSpeed * leadSeconds,
  };
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const forwardX = dx / range;
  const forwardZ = dz / range;
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const gunRatio = Math.max(0.25, moduleRatio(ship, "gun"));
  const longitudinal = (18 + range * 0.018) * dispersionMultiplier / gunRatio;
  const lateral = (9 + range * 0.011) * dispersionMultiplier / gunRatio;
  const centeredNoise = (): number =>
    ((random(state) + random(state) + random(state)) - 1.5) / 1.5;
  const longitudinalError = centeredNoise() * longitudinal;
  const lateralError = centeredNoise() * lateral;
  return {
    x: target.x + forwardX * longitudinalError + rightX * lateralError,
    y: target.y,
    z: target.z + forwardZ * longitudinalError + rightZ * lateralError,
  };
}

function updateSecondaryBattery(state: BattleState, ship: ShipState, dt: number): void {
  if (ship.secondaryMounts.length === 0) {
    ship.secondaryBatteryStatus = "unavailable";
    return;
  }
  if (ship.modules.gun.health <= 0) {
    ship.secondaryBatteryStatus = "disabled";
    return;
  }
  const observation = observe(state, ship.id);
  const target = [...observation.contacts]
    .filter((contact) => contact.confidence >= 0.55)
    .sort((left, right) => left.rangeMeters - right.rangeMeters)[0];
  if (!target) {
    ship.secondaryBatteryStatus = "searching";
    ship.secondaryTargetId = undefined;
    ship.secondaryAcquisitionSamples = 0;
    ship.secondaryLastObservationAt = undefined;
    return;
  }
  if (target.observedAt !== ship.secondaryLastObservationAt) {
    ship.secondaryAcquisitionSamples = ship.secondaryTargetId === target.id
      ? ship.secondaryAcquisitionSamples + 1
      : 1;
    ship.secondaryTargetId = target.id;
    ship.secondaryLastObservationAt = target.observedAt;
  }

  const bearing = Math.atan2(
    target.position.x - ship.position.x,
    target.position.z - ship.position.z,
  );
  const gunRatio = Math.max(0.25, moduleRatio(ship, "gun"));
  let inSector = false;
  let inRange = false;
  let aligned = false;
  let ready = false;
  let fired = false;
  for (const mount of ship.secondaryMounts) {
    if (!secondaryMountCanBear(ship, mount.side, bearing)) continue;
    inSector = true;
    const definition = getSecondaryGun(mount.definitionId);
    const range = Math.hypot(
      target.position.x - ship.position.x,
      target.position.z - ship.position.z,
    );
    if (range < 200 || range > definition.maximumRangeMeters) continue;
    inRange = true;
    const traverseRate = definition.traverseRadiansPerSecond * gunRatio;
    const headingError = wrapAngle(bearing - mount.heading);
    mount.heading = wrapAngle(
      mount.heading + clamp(headingError, -traverseRate * dt, traverseRate * dt),
    );
    const mountAligned = Math.abs(wrapAngle(bearing - mount.heading)) <= 4 * Math.PI / 180;
    aligned ||= mountAligned;
    if (!mountAligned || ship.secondaryAcquisitionSamples < SENSOR.acquisitionSamples) continue;
    if (mount.reloadRemaining > 0) continue;
    ready = true;
    const origin = secondaryMountOrigin(ship, mount);
    const aimPoint = secondaryAimPoint(
      state,
      ship,
      target,
      origin,
      definition.muzzleVelocity,
      definition.dispersionMultiplier,
    );
    const velocity = ballisticVelocity(origin, aimPoint, definition.muzzleVelocity);
    if (!velocity) continue;
    state.projectiles.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      kind: "shell",
      ammoType: "he",
      weaponSource: "secondary",
      position: copyVec(origin),
      previousPosition: copyVec(origin),
      velocity,
      damage: definition.damage,
      age: 0,
    });
    state.shots.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      kind: "shell",
      ammoType: "he",
      weaponSource: "secondary",
      position: copyVec(origin),
    });
    mount.reloadRemaining = definition.reloadSeconds
      * ship.performance.reloadMultiplier / gunRatio;
    fired = true;
  }
  if (fired) {
    ship.lastSecondaryFiredAt = state.time;
    ship.secondaryBatteryStatus = "firing";
  } else if (ship.secondaryAcquisitionSamples < SENSOR.acquisitionSamples) {
    ship.secondaryBatteryStatus = "acquiring";
  } else if (!inSector) {
    ship.secondaryBatteryStatus = "sector";
  } else if (!inRange) {
    ship.secondaryBatteryStatus = "out-of-range";
  } else if (!aligned) {
    ship.secondaryBatteryStatus = "traversing";
  } else if (!ready) {
    ship.secondaryBatteryStatus = "reloading";
  }
}

function deploySmokePuff(state: BattleState, ship: ShipState): void {
  state.smokeClouds.push({
    id: state.nextEntityId++,
    ownerId: ship.id,
    ownerTeam: ship.team,
    position: copyVec(ship.position),
    radius: SMOKE.puffRadiusMeters,
    spawnedAt: state.time,
    expiresAt: state.time + SMOKE.puffLifetimeSeconds,
  });
  if (state.smokeClouds.length > SMOKE.maximumClouds) {
    state.smokeClouds.splice(0, state.smokeClouds.length - SMOKE.maximumClouds);
  }
}

function updateSmokeGenerator(
  state: BattleState,
  ship: ShipState,
  activate: boolean,
  dt: number,
): void {
  ship.smokeCooldownRemaining = Math.max(0, ship.smokeCooldownRemaining - dt);
  if (
    activate
    && ship.smokeCharges > 0
    && ship.smokeCooldownRemaining <= 0
    && ship.smokeDeploymentRemaining <= 0
  ) {
    ship.smokeCharges -= 1;
    ship.smokeDeploymentRemaining = SMOKE.deploymentSeconds;
    ship.smokeCooldownRemaining = SMOKE.cooldownSeconds;
    ship.smokeNextPuffAt = state.time;
  }
  if (ship.smokeDeploymentRemaining <= 0) return;
  while (state.time + 0.0001 >= ship.smokeNextPuffAt && ship.smokeDeploymentRemaining > 0) {
    deploySmokePuff(state, ship);
    ship.smokeNextPuffAt += SMOKE.puffIntervalSeconds;
  }
  ship.smokeDeploymentRemaining = Math.max(0, ship.smokeDeploymentRemaining - dt);
}

function updateHydroacousticSearch(
  state: BattleState,
  ship: ShipState,
  activate: boolean,
  dt: number,
): void {
  const wasActive = ship.hydroActiveRemaining > 0;
  let activated = false;
  if (
    activate
    && ship.hydroCharges > 0
    && ship.hydroCooldownRemaining <= 0
    && ship.hydroActiveRemaining <= 0
  ) {
    ship.hydroCharges -= 1;
    ship.hydroActiveRemaining = HYDRO.activeSeconds;
    activated = true;
  } else if (ship.hydroActiveRemaining <= 0) {
    ship.hydroCooldownRemaining = Math.max(0, ship.hydroCooldownRemaining - dt);
  }
  if (ship.hydroActiveRemaining > 0) {
    ship.hydroActiveRemaining = Math.max(0, ship.hydroActiveRemaining - dt);
    if (wasActive && ship.hydroActiveRemaining <= 0) {
      ship.hydroCooldownRemaining = HYDRO.cooldownSeconds;
    }
  }
  const isActive = ship.hydroActiveRemaining > 0;
  if (wasActive !== isActive || activated) delete state.sensorSnapshots[ship.id];
}

export function isPointInSmoke(
  state: Readonly<BattleState>,
  point: Readonly<Vec3>,
): boolean {
  return state.smokeClouds.some((cloud) =>
    cloud.expiresAt > state.time
    && Math.hypot(point.x - cloud.position.x, point.z - cloud.position.z) <= cloud.radius);
}

function segmentIntersectsSmoke(
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  cloud: Readonly<BattleState["smokeClouds"][number]>,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const projection = lengthSquared <= 0.001
    ? 0
    : clamp(((cloud.position.x - from.x) * dx + (cloud.position.z - from.z) * dz) / lengthSquared, 0, 1);
  const closestX = from.x + dx * projection;
  const closestZ = from.z + dz * projection;
  return Math.hypot(cloud.position.x - closestX, cloud.position.z - closestZ) <= cloud.radius;
}

export function isLineObscuredBySmoke(
  state: Readonly<BattleState>,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
): boolean {
  return state.smokeClouds.some((cloud) =>
    cloud.expiresAt > state.time && segmentIntersectsSmoke(from, to, cloud));
}

export function torpedoInterceptPoint(
  shooter: Pick<ShipState, "position" | "torpedoId">,
  target: Pick<SensorContact, "position" | "heading" | "speedKnots">,
): Vec3 | undefined {
  const torpedo = getTorpedo(shooter.torpedoId);
  const relativeX = target.position.x - shooter.position.x;
  const relativeZ = target.position.z - shooter.position.z;
  const targetSpeed = target.speedKnots * KNOT_TO_MPS;
  const targetVelocityX = Math.sin(target.heading) * targetSpeed;
  const targetVelocityZ = Math.cos(target.heading) * targetSpeed;
  const a = targetVelocityX ** 2 + targetVelocityZ ** 2
    - torpedo.speedMetersPerSecond ** 2;
  const b = 2 * (relativeX * targetVelocityX + relativeZ * targetVelocityZ);
  const c = relativeX ** 2 + relativeZ ** 2;
  let interceptSeconds: number | undefined;
  if (Math.abs(a) < 1e-6) {
    const linear = Math.abs(b) < 1e-6 ? Number.NaN : -c / b;
    if (linear > 0) interceptSeconds = linear;
  } else {
    const discriminant = b ** 2 - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const candidates = [
        (-b - root) / (2 * a),
        (-b + root) / (2 * a),
      ].filter((value) => value > 0);
      if (candidates.length > 0) interceptSeconds = Math.min(...candidates);
    }
  }
  if (
    interceptSeconds === undefined
    || interceptSeconds * torpedo.speedMetersPerSecond > torpedo.maximumRangeMeters
  ) {
    return undefined;
  }
  return {
    x: target.position.x + targetVelocityX * interceptSeconds,
    y: 0,
    z: target.position.z + targetVelocityZ * interceptSeconds,
  };
}

export function torpedoLaunchSolution(
  ship: Pick<ShipState, "position" | "heading">,
  aimPoint: Readonly<Vec3>,
  spread: TorpedoSpreadMode,
): TorpedoLaunchSolution {
  const bearing = Math.atan2(
    aimPoint.x - ship.position.x,
    aimPoint.z - ship.position.z,
  );
  const relativeBearing = wrapAngle(bearing - ship.heading);
  const absoluteBearing = Math.abs(relativeBearing);
  const allowed = absoluteBearing >= TORPEDO.minimumLaunchAngleRadians
    && absoluteBearing <= TORPEDO.maximumLaunchAngleRadians;
  const halfSpread = spread === "wide"
    ? TORPEDO.wideSpreadRadians
    : TORPEDO.narrowSpreadRadians;
  return {
    allowed,
    bearing,
    relativeBearing,
    side: relativeBearing < 0 ? "port" : "starboard",
    directions: [wrapAngle(bearing - halfSpread), wrapAngle(bearing + halfSpread)],
  };
}

function rejectTorpedoFire(
  state: BattleState,
  ship: ShipState,
  reason: NonNullable<ShipState["torpedoFireRejectReason"]>,
): void {
  ship.torpedoFireRejectReason = reason;
  ship.torpedoFireRejectedAt = state.time;
}

function fireTorpedoes(state: BattleState, ship: ShipState): void {
  const hullDefinition = getShipClass(ship.shipClassId);
  if (ship.modules.torpedoTubes.health <= 0) {
    rejectTorpedoFire(state, ship, "destroyed");
    return;
  }
  if (ship.torpedoReloadRemaining > 0) {
    rejectTorpedoFire(state, ship, "reloading");
    return;
  }
  if (ship.torpedoesLoaded <= 0) {
    rejectTorpedoFire(state, ship, "empty");
    return;
  }
  const torpedo = getTorpedo(ship.torpedoId);
  const solution = torpedoLaunchSolution(
    ship,
    ship.aimPoint,
    ship.torpedoSpreadMode,
  );
  if (!solution.allowed) {
    rejectTorpedoFire(state, ship, "sector");
    return;
  }
  const actualRelativeHeading = Math.abs(wrapAngle(
    ship.torpedoLauncherHeading - ship.heading,
  ));
  if (
    actualRelativeHeading < TORPEDO.minimumLaunchAngleRadians
    || actualRelativeHeading > TORPEDO.maximumLaunchAngleRadians
  ) {
    // The player may fire before the launcher reaches the requested bearing, but
    // never allow a physical tube direction that would pass through the hull.
    rejectTorpedoFire(state, ship, "sector");
    return;
  }
  ship.torpedoFireRejectReason = undefined;
  ship.torpedoFireRejectedAt = undefined;
  const shipForwardX = Math.sin(ship.heading);
  const shipForwardZ = Math.cos(ship.heading);
  const renderScale = hullDefinition.renderScale;
  const tubeCenter = {
    x: ship.position.x
      + shipForwardX * TORPEDO.tubeLongitudinalOffset * renderScale.z,
    y: 0.35,
    z: ship.position.z
      + shipForwardZ * TORPEDO.tubeLongitudinalOffset * renderScale.z,
  };
  const halfSpread = ship.torpedoSpreadMode === "wide"
    ? TORPEDO.wideSpreadRadians
    : TORPEDO.narrowSpreadRadians;
  const actualDirections = [
    wrapAngle(ship.torpedoLauncherHeading - halfSpread),
    wrapAngle(ship.torpedoLauncherHeading + halfSpread),
  ];
  for (const [index, direction] of actualDirections.entries()) {
    const forwardX = Math.sin(direction);
    const forwardZ = Math.cos(direction);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const barrelOffset = (index - 0.5) * TORPEDO.tubeBarrelSpacing * renderScale.x;
    const origin = {
      x: tubeCenter.x + forwardX * 3 * renderScale.z + rightX * barrelOffset,
      y: 0.35,
      z: tubeCenter.z + forwardZ * 3 * renderScale.z + rightZ * barrelOffset,
    };
    state.projectiles.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      kind: "torpedo",
      position: copyVec(origin),
      previousPosition: copyVec(origin),
      velocity: {
        x: forwardX * torpedo.speedMetersPerSecond,
        y: 0,
        z: forwardZ * torpedo.speedMetersPerSecond,
      },
      damage: torpedo.damage,
      age: 0,
      distanceTravelled: 0,
      armingDistance: torpedo.armingDistanceMeters,
      maximumRange: torpedo.maximumRangeMeters,
      detectionRange: torpedo.detectionRangeMeters,
    });
    state.shots.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      kind: "torpedo",
      position: copyVec(origin),
    });
  }
  ship.torpedoesLoaded = 0;
  ship.torpedoReloadDuration = torpedo.reloadSeconds;
  if (ship.torpedoReserveSalvos > 0) {
    ship.torpedoReserveSalvos -= 1;
    ship.torpedoReloadRemaining = ship.torpedoReloadDuration;
  } else {
    ship.torpedoReloadRemaining = 0;
  }
}

function rejectDepthChargeFire(
  state: BattleState,
  ship: ShipState,
  reason: NonNullable<ShipState["depthChargeFireRejectReason"]>,
): void {
  ship.depthChargeFireRejectReason = reason;
  ship.depthChargeFireRejectedAt = state.time;
}

function deployDepthChargePattern(state: BattleState, ship: ShipState): void {
  if (ship.hullId !== "destroyer") {
    rejectDepthChargeFire(state, ship, "wrong-hull");
    return;
  }
  if (ship.depthChargeMounts <= 0) {
    rejectDepthChargeFire(state, ship, "not-installed");
    return;
  }
  if (ship.depthChargeReloadRemaining > 0) {
    rejectDepthChargeFire(state, ship, "reloading");
    return;
  }
  if (ship.depthChargeSalvos <= 0) {
    rejectDepthChargeFire(state, ship, "empty");
    return;
  }
  if (!state.underwaterTargets.some((target) => target.hull > 0)) {
    rejectDepthChargeFire(state, ship, "no-target");
    return;
  }

  const definition = getShipClass(ship.shipClassId);
  const forwardX = Math.sin(ship.heading);
  const forwardZ = Math.cos(ship.heading);
  const rightX = Math.cos(ship.heading);
  const rightZ = -Math.sin(ship.heading);
  const inheritedSpeed = ship.speedKnots * KNOT_TO_MPS * 0.7;
  const lateral = definition.beam * 0.26;
  const stern = definition.length * 0.46;
  const offsets = [
    { lateral: -lateral, aft: 0 },
    { lateral, aft: 0 },
    { lateral: -lateral * 0.72, aft: 5 },
    { lateral: lateral * 0.72, aft: 5 },
  ];
  for (const offset of offsets.slice(0, DEPTH_CHARGE.chargesPerPattern)) {
    const position = {
      x: ship.position.x - forwardX * (stern + offset.aft) + rightX * offset.lateral,
      y: 0.6,
      z: ship.position.z - forwardZ * (stern + offset.aft) + rightZ * offset.lateral,
    };
    state.depthCharges.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      position,
      previousPosition: copyVec(position),
      velocity: {
        x: forwardX * inheritedSpeed,
        y: -DEPTH_CHARGE.sinkSpeedMetersPerSecond,
        z: forwardZ * inheritedSpeed,
      },
      age: 0,
      detonationDepth: DEPTH_CHARGE.detonationDepthMeters,
      blastRadius: DEPTH_CHARGE.blastRadiusMeters,
      damage: DEPTH_CHARGE.damage,
    });
  }
  state.shots.push({
    id: state.nextEntityId++,
    ownerId: ship.id,
    team: ship.team,
    kind: "depthCharge",
    position: copyVec(ship.position),
  });
  ship.depthChargeSalvos -= 1;
  ship.depthChargeReloadRemaining = ship.depthChargeSalvos > 0
    ? DEPTH_CHARGE.reloadSeconds
    : 0;
  ship.depthChargeFireRejectReason = undefined;
  ship.depthChargeFireRejectedAt = undefined;
}

function shipLocalPoint(
  ship: Pick<ShipState, "position" | "heading">,
  point: Vec3,
): { longitudinal: number; lateral: number } {
  const dx = point.x - ship.position.x;
  const dz = point.z - ship.position.z;
  const forwardX = Math.sin(ship.heading);
  const forwardZ = Math.cos(ship.heading);
  return {
    longitudinal: dx * forwardX + dz * forwardZ,
    lateral: dx * forwardZ - dz * forwardX,
  };
}

function compartmentAt(
  longitudinal: number,
  hullId: HullId | ShipClassId = DEFAULT_HULL_ID,
): CompartmentId {
  const length = isShipClassId(hullId) ? getShipClass(hullId).length : getHull(hullId).length;
  if (longitudinal > length * 0.27) return "bow";
  if (longitudinal > length * 0.06) return "bridge";
  if (longitudinal > -length * 0.14) return "engineRoom";
  if (longitudinal > -length * 0.31) return "magazine";
  return "stern";
}

export function collisionDamageMultiplierFor(compartment: CompartmentId): number {
  return COLLISION_DAMAGE_MULTIPLIER[compartment];
}

export interface ProjectileHitContact {
  point: Vec3;
  localPoint: {
    longitudinal: number;
    lateral: number;
    height: number;
  };
  surfaceNormal: Vec3;
  armorZone: ArmorZoneId;
  distanceFraction: number;
}

interface SlabAxis {
  start: number;
  delta: number;
  minimum: number;
  maximum: number;
  normal: Vec3;
  armorZone: ArmorZoneId;
}

/**
 * Continuous line-segment versus oriented hull box intersection. This avoids
 * tunnelling when a fast shell crosses the complete beam within one fixed tick
 * and returns the actual entry surface for armor-angle calculations.
 */
export function projectileHitContact(
  projectile: Pick<ProjectileState, "previousPosition" | "position">,
  ship: Pick<ShipState, "position" | "heading" | "hullId"> & Partial<Pick<ShipState, "shipClassId">>,
): ProjectileHitContact | null {
  const hullDefinition = ship.shipClassId ? getShipClass(ship.shipClassId) : getHull(ship.hullId);
  const localStart = shipLocalPoint(ship, projectile.previousPosition);
  const localEnd = shipLocalPoint(ship, projectile.position);
  const startHeight = projectile.previousPosition.y - ship.position.y;
  const endHeight = projectile.position.y - ship.position.y;
  const forward = { x: Math.sin(ship.heading), y: 0, z: Math.cos(ship.heading) };
  const right = { x: Math.cos(ship.heading), y: 0, z: -Math.sin(ship.heading) };
  const axes: SlabAxis[] = [
    {
      start: localStart.longitudinal,
      delta: localEnd.longitudinal - localStart.longitudinal,
      minimum: -hullDefinition.length / 2,
      maximum: hullDefinition.length / 2,
      normal: forward,
      armorZone: "end",
    },
    {
      start: localStart.lateral,
      delta: localEnd.lateral - localStart.lateral,
      minimum: -hullDefinition.beam / 2 - 2,
      maximum: hullDefinition.beam / 2 + 2,
      normal: right,
      armorZone: "side",
    },
    {
      start: startHeight,
      delta: endHeight - startHeight,
      minimum: 0,
      maximum: hullDefinition.deckHeight + 5,
      normal: { x: 0, y: 1, z: 0 },
      armorZone: "deck",
    },
  ];
  let enter = 0;
  let exit = 1;
  let entryAxis: SlabAxis | undefined;
  let entryNormalSign = 1;
  for (const axis of axes) {
    if (Math.abs(axis.delta) < 1e-9) {
      if (axis.start < axis.minimum || axis.start > axis.maximum) return null;
      continue;
    }
    const enteringMinimum = axis.delta > 0;
    const near = (
      (enteringMinimum ? axis.minimum : axis.maximum) - axis.start
    ) / axis.delta;
    const far = (
      (enteringMinimum ? axis.maximum : axis.minimum) - axis.start
    ) / axis.delta;
    if (near > enter) {
      enter = near;
      entryAxis = axis;
      entryNormalSign = enteringMinimum ? -1 : 1;
    }
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  if (enter < 0 || enter > 1 || !entryAxis) return null;
  const point = {
    x: projectile.previousPosition.x
      + (projectile.position.x - projectile.previousPosition.x) * enter,
    y: projectile.previousPosition.y
      + (projectile.position.y - projectile.previousPosition.y) * enter,
    z: projectile.previousPosition.z
      + (projectile.position.z - projectile.previousPosition.z) * enter,
  };
  const localPoint = shipLocalPoint(ship, point);
  const impactHeight = point.y - ship.position.y;
  const armorZone = entryAxis.armorZone === "side"
    && impactHeight > hullDefinition.deckHeight * .58
    ? "superstructure"
    : entryAxis.armorZone;
  return {
    point,
    localPoint: {
      longitudinal: localPoint.longitudinal,
      lateral: localPoint.lateral,
      height: impactHeight,
    },
    surfaceNormal: {
      x: entryAxis.normal.x * entryNormalSign,
      y: entryAxis.normal.y * entryNormalSign,
      z: entryAxis.normal.z * entryNormalSign,
    },
    armorZone,
    distanceFraction: enter,
  };
}

export interface ArmorResolution {
  result: PenetrationResult;
  penetrationMm: number;
  effectiveArmorMm: number;
  damageMultiplier: number;
  moduleDamageMultiplier: number;
  fireChanceMultiplier: number;
  floodingChanceMultiplier: number;
}

export function armorThicknessFor(
  compartment: CompartmentId,
  armorZone: ArmorZoneId = "side",
  hullId: HullId | ShipClassId = DEFAULT_HULL_ID,
): number {
  if (isShipClassId(hullId)) return classArmorThickness(hullId, compartment, armorZone);
  const multiplier = isShipClassId(hullId) ? getShipClass(hullId).armorMultiplier : getHull(hullId).armorMultiplier;
  if (armorZone === "superstructure") return 8 * multiplier;
  if (armorZone === "deck") return 10 * multiplier;
  if (armorZone === "end") return 12 * multiplier;
  return ARMOR_THICKNESS_MM[compartment] * multiplier;
}

export function resolveArmorInteraction(
  ammoType: AmmoType,
  armorThicknessMm: number,
  impactAngleDegrees: number,
  flightSeconds: number,
  internalPathMeters = Number.POSITIVE_INFINITY,
  ricochetRoll = 0.5,
  shellProfile?: ShellPenetrationProfile,
): ArmorResolution {
  const safeArmor = Math.max(0.1, armorThicknessMm);
  const safeAngle = clamp(impactAngleDegrees, 0, 89.9);

  if (ammoType === "he") {
    const penetrationMm = shellProfile?.hePenetrationMm ?? AMMUNITION.he.penetrationMm;
    const penetrated = penetrationMm >= safeArmor;
    return {
      result: penetrated ? "penetration" : "shatter",
      penetrationMm,
      effectiveArmorMm: safeArmor,
      damageMultiplier: penetrated
        ? AMMUNITION.he.penetrationDamageMultiplier
        : AMMUNITION.he.shatterDamageMultiplier,
      moduleDamageMultiplier: penetrated
        ? AMMUNITION.he.moduleDamageMultiplier
        : AMMUNITION.he.shatterModuleDamageMultiplier,
      fireChanceMultiplier: AMMUNITION.he.baseFireChanceMultiplier
        * (penetrated ? 1 : 0.55),
      floodingChanceMultiplier: 0,
    };
  }

  const penetrationMm = Math.max(
    shellProfile?.apMinimumPenetrationMm ?? AMMUNITION.ap.minimumPenetrationMm,
    (shellProfile?.apMuzzlePenetrationMm ?? AMMUNITION.ap.muzzlePenetrationMm)
      - Math.max(0, flightSeconds)
        * (shellProfile?.apPenetrationLossMmPerSecond ?? AMMUNITION.ap.penetrationLossMmPerSecond),
  );
  const overmatched = safeArmor <= (shellProfile?.apOvermatchArmorMm ?? AMMUNITION.ap.overmatchArmorMm);
  const ricochetChance = safeAngle <= AMMUNITION.ap.ricochetStartDegrees
    ? 0
    : safeAngle >= AMMUNITION.ap.ricochetGuaranteedDegrees
      ? 1
      : (safeAngle - AMMUNITION.ap.ricochetStartDegrees)
        / (AMMUNITION.ap.ricochetGuaranteedDegrees - AMMUNITION.ap.ricochetStartDegrees);
  const normalizedAngle = Math.max(
    0,
    safeAngle - (shellProfile?.apNormalizationDegrees ?? AMMUNITION.ap.normalizationDegrees),
  );
  const cosine = Math.max(0.08, Math.cos(normalizedAngle * Math.PI / 180));
  const effectiveArmorMm = safeArmor / cosine;
  if (!overmatched && ricochetRoll < ricochetChance) {
    return {
      result: "ricochet",
      penetrationMm,
      effectiveArmorMm,
      damageMultiplier: 0,
      moduleDamageMultiplier: 0,
      fireChanceMultiplier: 0,
      floodingChanceMultiplier: 0,
    };
  }
  if (penetrationMm < effectiveArmorMm) {
    return {
      result: "shatter",
      penetrationMm,
      effectiveArmorMm,
      damageMultiplier: 0,
      moduleDamageMultiplier: 0,
      fireChanceMultiplier: 0,
      floodingChanceMultiplier: 0,
    };
  }
  const overpenetrated = safeArmor < (shellProfile?.apFuseArmingArmorMm ?? AMMUNITION.ap.fuseArmingArmorMm)
    || internalPathMeters < (shellProfile?.apFuseTravelMeters ?? AMMUNITION.ap.fuseTravelMeters);
  return {
    result: overpenetrated ? "overpenetration" : "penetration",
    penetrationMm,
    effectiveArmorMm,
    damageMultiplier: overpenetrated
      ? AMMUNITION.ap.overpenetrationDamageMultiplier
      : AMMUNITION.ap.penetrationDamageMultiplier,
    moduleDamageMultiplier: overpenetrated ? 0.16 : AMMUNITION.ap.moduleDamageMultiplier,
    fireChanceMultiplier: 0,
    floodingChanceMultiplier: 0,
  };
}

export function projectileImpactAngleDegrees(
  projectile: Pick<ProjectileState, "velocity">,
  surfaceNormal: Pick<Vec3, "x" | "y" | "z">,
): number {
  const speed = Math.max(
    0.0001,
    Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z),
  );
  const normalLength = Math.max(
    0.0001,
    Math.hypot(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z),
  );
  const normalComponent = clamp(Math.abs(
    projectile.velocity.x / speed * surfaceNormal.x / normalLength
    + projectile.velocity.y / speed * surfaceNormal.y / normalLength
    + projectile.velocity.z / speed * surfaceNormal.z / normalLength
  ), 0, 1);
  return Math.acos(normalComponent) * 180 / Math.PI;
}

function damageModule(
  state: BattleState,
  ship: ShipState,
  compartment: CompartmentId,
  baseDamage: number,
  preferredModule?: ModuleId,
): { moduleId: ModuleId; moduleDamage: number } {
  const candidates: Record<CompartmentId, ModuleId[]> = {
    bow: ["gun", "gun", "crew"],
    bridge: ["crew", "steering", "gun", "crew"],
    engineRoom: ["engine", "torpedoTubes", "engine", "crew"],
    magazine: ["magazine", "magazine", "engine", "crew"],
    stern: ["steering", "engine", "crew"],
  };
  const list = candidates[compartment];
  const moduleId = preferredModule
    ?? list[Math.floor(random(state) * list.length)]
    ?? "crew";
  const module = ship.modules[moduleId];
  const riskMultiplier = moduleId === "magazine"
    ? ship.performance.magazineRiskMultiplier
    : moduleId === "torpedoTubes"
      ? getTorpedo(ship.torpedoId).storageRiskMultiplier
      : 1;
  const moduleDamage = baseDamage * (0.42 + random(state) * 0.28) * riskMultiplier;
  module.health = Math.max(0, module.health - moduleDamage);

  if (moduleId === "gun" && ship.mainBatteryMounts.length > 0) {
    const mountIndex = ship.mainBatteryMounts.length === 1
      ? 0
      : Math.min(
        ship.mainBatteryMounts.length - 1,
        Math.floor(random(state) * ship.mainBatteryMounts.length),
      );
    const mount = ship.mainBatteryMounts[mountIndex];
    if (mount) mount.health = Math.max(0, mount.health - moduleDamage);
  }

  if (moduleId === "magazine") {
    applyHullDamage(ship, baseDamage * 0.35, 0.72);
  } else if (moduleId === "torpedoTubes" && riskMultiplier > 1) {
    applyHullDamage(ship, baseDamage * (riskMultiplier - 1) * 0.8, 0.8);
  }
  return { moduleId, moduleDamage };
}

export function moduleForProjectileHit(
  compartment: CompartmentId,
  height: number,
  hullId: HullId | ShipClassId = DEFAULT_HULL_ID,
): ModuleId {
  const deckHeight = isShipClassId(hullId) ? getShipClass(hullId).deckHeight : getHull(hullId).deckHeight;
  if (compartment === "bow") return height >= deckHeight * 0.55 ? "gun" : "crew";
  if (compartment === "bridge") return "crew";
  if (compartment === "engineRoom") {
    return height >= deckHeight * 0.55 ? "torpedoTubes" : "engine";
  }
  if (compartment === "magazine") return "magazine";
  return "steering";
}

function projectileInternalPathMeters(
  projectile: ProjectileState,
  contact: ProjectileHitContact,
  ship: ShipState,
): number {
  const speed = Math.max(
    0.0001,
    Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z),
  );
  const normalLength = Math.max(
    0.0001,
    Math.hypot(contact.surfaceNormal.x, contact.surfaceNormal.y, contact.surfaceNormal.z),
  );
  const normalComponent = Math.max(0.2, Math.abs(
    projectile.velocity.x / speed * contact.surfaceNormal.x / normalLength
      + projectile.velocity.y / speed * contact.surfaceNormal.y / normalLength
      + projectile.velocity.z / speed * contact.surfaceNormal.z / normalLength,
  ));
  const hullDefinition = getShipClass(ship.shipClassId);
  const directPath = contact.armorZone === "side"
    ? hullDefinition.beam
    : contact.armorZone === "end"
      ? hullDefinition.length * 0.42
      : contact.armorZone === "superstructure"
        ? ship.hullId === "destroyer"
          ? hullDefinition.beam
          : Math.max(5, hullDefinition.beam * .35)
        : hullDefinition.deckHeight * 0.62;
  return directPath / normalComponent;
}

export function compartmentSaturationMultiplier(
  compartmentHealth: number,
  compartmentMaxHealth: number,
): number {
  if (compartmentHealth <= 0) return 0.1;
  if (compartmentHealth <= compartmentMaxHealth * 0.5) return 0.5;
  return 1;
}

function applyHit(
  state: BattleState,
  projectile: ProjectileState,
  ship: ShipState,
  contact: ProjectileHitContact,
): void {
  const compartment = compartmentAt(contact.localPoint.longitudinal, ship.shipClassId);
  const hullDefinition = getShipClass(ship.shipClassId);
  const armorThicknessMm = armorThicknessFor(
    compartment,
    contact.armorZone,
    ship.shipClassId,
  );
  const impactAngleDegrees = projectile.kind === "torpedo"
    ? 0 : projectileImpactAngleDegrees(projectile, contact.surfaceNormal);
  const armor = projectile.kind === "torpedo"
    ? {
      result: "penetration" as const,
      penetrationMm: 1_000,
      effectiveArmorMm: armorThicknessMm,
      damageMultiplier: 1,
      moduleDamageMultiplier: 1.2,
      fireChanceMultiplier: 0.08,
      floodingChanceMultiplier: 1.2,
    }
    : resolveArmorInteraction(
      projectile.ammoType ?? "he",
      armorThicknessMm,
      impactAngleDegrees,
      projectile.age,
      projectileInternalPathMeters(projectile, contact, ship),
      random(state),
      projectile.shellProfile,
    );
  const compartmentHealth = ship.compartments[compartment];
  const saturationMultiplier = projectile.kind === "shell"
    && armor.result !== "overpenetration"
    ? compartmentSaturationMultiplier(
      compartmentHealth,
      COMPARTMENT_MAX_HEALTH[compartment]
        * hullDefinition.compartmentHealthMultiplier,
    )
    : 1;
  const damage = Math.min(
    projectile.damage * armor.damageMultiplier * saturationMultiplier,
    compartmentHealth + 30,
  );
  ship.compartments[compartment] = Math.max(0, compartmentHealth - damage * 0.72);
  applyHullDamage(ship, damage, 0.38);
  const moduleBaseDamage = projectile.damage * 0.33 * armor.moduleDamageMultiplier;
  const moduleHit = moduleBaseDamage > 0.01
    ? damageModule(
      state,
      ship,
      compartment,
      moduleBaseDamage,
      moduleForProjectileHit(compartment, contact.localPoint.height, ship.shipClassId),
    )
    : undefined;
  const fireChance = compartment === "magazine" ? 0.48
    : compartment === "engineRoom" || compartment === "bridge" ? 0.34 : 0.2;
  const startedFire = armor.fireChanceMultiplier > 0
    && (projectile.kind === "torpedo" || projectile.ammoType === "he")
    && random(state) < fireChance * armor.fireChanceMultiplier;
  const startedFlooding = projectile.kind === "torpedo"
    && damage > 0
    && random(state) < 0.55 * armor.floodingChanceMultiplier;
  if (startedFire) ship.fireIntensity = clamp(ship.fireIntensity + 18 + random(state) * 28, 0, 100);
  if (startedFlooding) ship.flooding = clamp(
    ship.flooding + (projectile.kind === "torpedo" ? 38 : 14) + random(state) * 24,
    0,
    100,
  );
  state.impacts.push({
    id: state.nextEntityId++,
    kind: "hit",
    position: copyVec(contact.point),
    sourceId: projectile.ownerId,
    sourceTeam: projectile.team,
    salvoId: projectile.salvoId,
    targetId: ship.id,
    damage,
    compartment,
    module: moduleHit?.moduleId,
    moduleDamage: moduleHit?.moduleDamage,
    startedFire,
    startedFlooding,
    ammoType: projectile.ammoType,
    penetrationResult: armor.result,
    armorThicknessMm,
    penetrationMm: armor.penetrationMm,
    effectiveArmorMm: armor.effectiveArmorMm,
    impactAngleDegrees,
    armorZone: contact.armorZone,
    projectileKind: projectile.kind,
    weaponSource: projectile.weaponSource,
  });
}

interface HorizontalAxis {
  x: number;
  z: number;
}

function shipAxes(ship: ShipState): { forward: HorizontalAxis; right: HorizontalAxis } {
  return {
    forward: { x: Math.sin(ship.heading), z: Math.cos(ship.heading) },
    right: { x: Math.cos(ship.heading), z: -Math.sin(ship.heading) },
  };
}

function projectionRadius(ship: ShipState, axis: HorizontalAxis): number {
  const axes = shipAxes(ship);
  const hullDefinition = getShipClass(ship.shipClassId);
  const forwardDot = Math.abs(axes.forward.x * axis.x + axes.forward.z * axis.z);
  const rightDot = Math.abs(axes.right.x * axis.x + axes.right.z * axis.z);
  return hullDefinition.length * 0.48 * forwardDot
    + hullDefinition.beam * 0.55 * rightDot;
}

interface CollisionManifold {
  normal: HorizontalAxis;
  penetration: number;
}

function collisionManifold(left: ShipState, right: ShipState): CollisionManifold | null {
  const delta = {
    x: right.position.x - left.position.x,
    z: right.position.z - left.position.z,
  };
  const leftAxes = shipAxes(left);
  const rightAxes = shipAxes(right);
  const axes = [leftAxes.forward, leftAxes.right, rightAxes.forward, rightAxes.right];
  let minimumPenetration = Number.POSITIVE_INFINITY;
  let minimumAxis = axes[0] ?? { x: 1, z: 0 };
  for (const axis of axes) {
    const centerProjection = Math.abs(delta.x * axis.x + delta.z * axis.z);
    const penetration = projectionRadius(left, axis) + projectionRadius(right, axis) - centerProjection;
    if (penetration < 0) return null;
    if (penetration < minimumPenetration) {
      minimumPenetration = penetration;
      const direction = delta.x * axis.x + delta.z * axis.z >= 0 ? 1 : -1;
      minimumAxis = { x: axis.x * direction, z: axis.z * direction };
    }
  }
  return { normal: minimumAxis, penetration: minimumPenetration };
}

function collisionCompartment(ship: ShipState, other: ShipState): CompartmentId {
  const local = shipLocalPoint(ship, other.position);
  const length = getShipClass(ship.shipClassId).length;
  return compartmentAt(
    clamp(local.longitudinal, -length / 2, length / 2),
    ship.shipClassId,
  );
}

function applyCollisionDamage(
  state: BattleState,
  ship: ShipState,
  other: ShipState,
  baseDamage: number,
  position: Vec3,
): void {
  const compartment = collisionCompartment(ship, other);
  const damage = baseDamage * collisionDamageMultiplierFor(compartment);
  const compartmentHealth = ship.compartments[compartment];
  ship.compartments[compartment] = Math.max(0, compartmentHealth - damage * 0.58);
  applyHullDamage(ship, damage, 0.58);
  const moduleHit = damageModule(state, ship, compartment, damage);
  const startedFlooding = random(state) < Math.min(0.68, 0.12 + damage / 210);
  if (startedFlooding) ship.flooding = clamp(ship.flooding + 10 + damage * 0.22, 0, 100);
  state.impacts.push({
    id: state.nextEntityId++,
    kind: "collision",
    position: copyVec(position),
    sourceId: other.id,
    sourceTeam: other.team,
    targetId: ship.id,
    otherShipId: other.id,
    damage,
    compartment,
    module: moduleHit.moduleId,
    moduleDamage: moduleHit.moduleDamage,
    startedFlooding,
  });
}

function resolveShipCollisions(state: BattleState): void {
  for (let leftIndex = 0; leftIndex < state.ships.length; leftIndex += 1) {
    const left = state.ships[leftIndex];
    if (!left || left.hull <= 0) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < state.ships.length; rightIndex += 1) {
      const right = state.ships[rightIndex];
      if (!right || right.hull <= 0) continue;
      const manifold = collisionManifold(left, right);
      if (!manifold) continue;
      const separation = manifold.penetration + 0.8;
      const leftMass = getShipClass(left.shipClassId).massFactor;
      const rightMass = getShipClass(right.shipClassId).massFactor;
      const massTotal = leftMass + rightMass;
      const leftShare = right.isTestTarget
        ? 1
        : left.isTestTarget ? 0 : rightMass / massTotal;
      const rightShare = left.isTestTarget
        ? 1
        : right.isTestTarget ? 0 : leftMass / massTotal;
      left.position.x -= manifold.normal.x * separation * leftShare;
      left.position.z -= manifold.normal.z * separation * leftShare;
      right.position.x += manifold.normal.x * separation * rightShare;
      right.position.z += manifold.normal.z * separation * rightShare;

      const leftVelocity = left.speedKnots * KNOT_TO_MPS;
      const rightVelocity = right.speedKnots * KNOT_TO_MPS;
      const relativeX = Math.sin(left.heading) * leftVelocity - Math.sin(right.heading) * rightVelocity;
      const relativeZ = Math.cos(left.heading) * leftVelocity - Math.cos(right.heading) * rightVelocity;
      const relativeSpeed = Math.hypot(relativeX, relativeZ);
      const baseDamage = clamp(
        (relativeSpeed - COLLISION.minimumRelativeSpeedMps) * COLLISION.damagePerRelativeMps,
        0,
        COLLISION.maximumBaseDamage,
      );
      const pairKey = [left.id, right.id].sort().join(":");
      const ready = (state.collisionCooldowns[pairKey] ?? 0) <= state.time;
      if (baseDamage > 0.5 && ready) {
        const impactPosition = {
          x: (left.position.x + right.position.x) / 2,
          y: Math.min(
            getShipClass(left.shipClassId).deckHeight,
            getShipClass(right.shipClassId).deckHeight,
          ) * 0.45,
          z: (left.position.z + right.position.z) / 2,
        };
        applyCollisionDamage(state, left, right, baseDamage, impactPosition);
        applyCollisionDamage(state, right, left, baseDamage, impactPosition);
        state.collisionCooldowns[pairKey] = state.time + COLLISION.cooldownSeconds;
      }
      left.speedKnots *= left.isTestTarget ? 0 : 0.12;
      right.speedKnots *= right.isTestTarget ? 0 : 0.12;
    }
  }
}

function advanceProjectiles(state: BattleState, dt: number): void {
  const active: ProjectileState[] = [];
  for (const projectile of state.projectiles) {
    projectile.previousPosition = copyVec(projectile.position);
    projectile.position.x += projectile.velocity.x * dt;
    projectile.position.y += projectile.velocity.y * dt;
    projectile.position.z += projectile.velocity.z * dt;
    if (projectile.kind === "shell") projectile.velocity.y -= GUN.gravity * dt;
    projectile.age += dt;
    if (projectile.kind === "torpedo") {
      projectile.distanceTravelled = (projectile.distanceTravelled ?? 0)
        + Math.hypot(projectile.velocity.x, projectile.velocity.z) * dt;
    }

    let consumed = false;
    const armed = projectile.kind !== "torpedo"
      || (projectile.distanceTravelled ?? 0) >= (projectile.armingDistance ?? 0);
    if (armed) {
      for (const ship of state.ships) {
        if (ship.team === projectile.team || ship.hull <= 0) continue;
        const contact = projectileHitContact(projectile, ship);
        if (contact) {
          applyHit(state, projectile, ship, contact);
          consumed = true;
          break;
        }
      }
    }

    if (!consumed && projectile.kind === "shell" && projectile.position.y <= 0 && projectile.age > 0.1) {
      state.impacts.push({
        id: state.nextEntityId++,
        kind: "splash",
        position: { x: projectile.position.x, y: 0, z: projectile.position.z },
        sourceId: projectile.ownerId,
        sourceTeam: projectile.team,
        salvoId: projectile.salvoId,
      });
      consumed = true;
    }
    const withinLifetime = projectile.kind === "torpedo"
      ? (projectile.distanceTravelled ?? 0) < (projectile.maximumRange ?? TORPEDO.maximumRangeMeters)
      : projectile.age < 18;
    if (!consumed && withinLifetime) active.push(projectile);
  }
  state.projectiles = active;
}

function advanceDepthCharges(state: BattleState, dt: number): void {
  const active = [] as BattleState["depthCharges"];
  const horizontalDrag = Math.exp(-DEPTH_CHARGE.horizontalDragPerSecond * dt);
  for (const charge of state.depthCharges) {
    charge.previousPosition = copyVec(charge.position);
    charge.velocity.x *= horizontalDrag;
    charge.velocity.z *= horizontalDrag;
    charge.position.x += charge.velocity.x * dt;
    charge.position.y += charge.velocity.y * dt;
    charge.position.z += charge.velocity.z * dt;
    charge.age += dt;
    const detonated = charge.position.y <= -charge.detonationDepth;
    if (detonated) {
      let hitTargetId: string | undefined;
      let dealtDamage = 0;
      for (const target of state.underwaterTargets) {
        if (target.hull <= 0) continue;
        const distance = Math.hypot(
          charge.position.x - target.position.x,
          charge.position.y - target.position.y,
          charge.position.z - target.position.z,
        );
        const effectiveDistance = Math.max(0, distance - target.radius);
        if (effectiveDistance > charge.blastRadius) continue;
        const falloff = effectiveDistance <= DEPTH_CHARGE.fullDamageRadiusMeters
          ? 1
          : 1 - (effectiveDistance - DEPTH_CHARGE.fullDamageRadiusMeters)
            / (charge.blastRadius - DEPTH_CHARGE.fullDamageRadiusMeters);
        const damage = Math.max(0, charge.damage * falloff);
        target.hull = Math.max(0, target.hull - damage);
        hitTargetId = target.id;
        dealtDamage = damage;
      }
      state.impacts.push({
        id: state.nextEntityId++,
        kind: "underwater-explosion",
        projectileKind: "depthCharge",
        position: copyVec(charge.position),
        sourceId: charge.ownerId,
        sourceTeam: charge.team,
        targetId: hitTargetId,
        damage: dealtDamage || undefined,
      });
      continue;
    }
    if (charge.age < DEPTH_CHARGE.maximumLifetimeSeconds) active.push(charge);
  }
  state.depthCharges = active;
}

const moduleRepairUrgency: Record<ModuleId, number> = {
  steering: 1.3,
  engine: 1.25,
  torpedoTubes: 1.15,
  gun: 1.1,
  crew: 1,
  magazine: 0.8,
};

function selectModuleRepairTarget(ship: ShipState): ModuleId | undefined {
  let selected: ModuleId | undefined;
  let selectedScore = 0;
  for (const moduleId of Object.keys(ship.modules) as ModuleId[]) {
    const module = ship.modules[moduleId];
    if (module.health <= 0 || module.health >= module.maxHealth) continue;
    const score = (1 - module.health / module.maxHealth) * moduleRepairUrgency[moduleId];
    if (score > selectedScore) {
      selected = moduleId;
      selectedScore = score;
    }
  }
  return selected;
}

const priorityWeights: Record<
  DamageControlPriority,
  Pick<DamageControlAllocation, "fire" | "flood" | "module">
> = {
  balanced: { fire: 1, flood: 1, module: 1 },
  fire: {
    fire: DAMAGE_CONTROL.focusedTaskWeight,
    flood: DAMAGE_CONTROL.secondaryTaskWeight,
    module: DAMAGE_CONTROL.secondaryTaskWeight,
  },
  flood: {
    fire: DAMAGE_CONTROL.secondaryTaskWeight,
    flood: DAMAGE_CONTROL.focusedTaskWeight,
    module: DAMAGE_CONTROL.secondaryTaskWeight,
  },
  module: {
    fire: DAMAGE_CONTROL.secondaryTaskWeight,
    flood: DAMAGE_CONTROL.secondaryTaskWeight,
    module: DAMAGE_CONTROL.focusedTaskWeight,
  },
};

export function damageControlAllocationFor(
  ship: ShipState,
  hullRepairRequested: boolean,
): DamageControlAllocation {
  const moduleTarget = selectModuleRepairTarget(ship);
  const weights = priorityWeights[ship.damageControlPriority];
  const weighted: DamageControlAllocation = {
    fire: ship.fireIntensity > 0 ? weights.fire : 0,
    flood: ship.flooding > 0 ? weights.flood : 0,
    module: moduleTarget ? weights.module : 0,
    hull: hullRepairRequested && ship.hull < ship.recoverableHull
      ? DAMAGE_CONTROL.hullRepairWeight
      : 0,
  };
  const total = weighted.fire + weighted.flood + weighted.module + weighted.hull;
  if (total <= 0) return { fire: 0, flood: 0, module: 0, hull: 0 };
  return {
    fire: weighted.fire / total,
    flood: weighted.flood / total,
    module: weighted.module / total,
    hull: weighted.hull / total,
  };
}

const treatmentMultiplier = (allocation: number): number =>
  DAMAGE_CONTROL.passiveTreatmentMultiplier
  + allocation * DAMAGE_CONTROL.allocatedTreatmentMultiplier;

function repairModule(ship: ShipState, allocation: number, dt: number): void {
  const moduleId = selectModuleRepairTarget(ship);
  ship.damageControlModule = moduleId;
  if (!moduleId || allocation <= 0) return;
  const module = ship.modules[moduleId];
  const crewRatio = moduleRatio(ship, "crew");
  const crewFactor = moduleId === "crew" ? 1 : 0.15 + 0.85 * crewRatio;
  const previousHealth = module.health;
  module.health = Math.min(
    module.maxHealth,
    module.health
      + BASE_REPAIR_PER_SECOND[moduleId]
      * crewFactor
      * treatmentMultiplier(allocation)
      * dt,
  );
  if (moduleId === "gun") {
    const damagedMount = ship.mainBatteryMounts
      .filter((mount) => mount.health < mount.maxHealth)
      .sort((left, right) => left.health / left.maxHealth - right.health / right.maxHealth)[0];
    if (damagedMount) {
      damagedMount.health = Math.min(
        damagedMount.maxHealth,
        damagedMount.health + (module.health - previousHealth),
      );
    }
  }
}

function updateDamageControl(
  ship: ShipState,
  allocation: DamageControlAllocation,
  dt: number,
): void {
  const crewRatio = moduleRatio(ship, "crew");
  const damageControl = 0.18 + crewRatio * 0.82;
  if (ship.fireIntensity > 0) {
    applyHullDamage(
      ship,
      ship.fireIntensity * DAMAGE_CONTROL.fireHullDamagePerPointSecond * dt,
      0.52,
    );
    ship.fireIntensity = Math.max(
      0,
      ship.fireIntensity
        - DAMAGE_CONTROL.baseFireReductionPerSecond
        * damageControl
        * treatmentMultiplier(allocation.fire)
        * dt,
    );
  }
  if (ship.flooding > 0) {
    applyHullDamage(
      ship,
      ship.flooding * DAMAGE_CONTROL.floodingHullDamagePerPointSecond * dt,
      0.6,
    );
    ship.flooding = Math.max(
      0,
      ship.flooding
        - DAMAGE_CONTROL.baseFloodReductionPerSecond
        * damageControl
        * treatmentMultiplier(allocation.flood)
        * dt,
    );
  }
}

function repairHull(ship: ShipState, allocation: number, dt: number): void {
  if (allocation <= 0 || ship.hull <= 0 || ship.hull >= ship.recoverableHull) return;
  const crewRatio = moduleRatio(ship, "crew");
  const crewFactor = HULL_REPAIR.minimumCrewFactor
    + (1 - HULL_REPAIR.minimumCrewFactor) * crewRatio;
  ship.hull = Math.min(
    ship.recoverableHull,
    ship.hull
      + HULL_REPAIR.pointsPerSecond
      * crewFactor
      * (0.25 + allocation * 0.75)
      * dt,
  );
}

export function updateObjective(state: BattleState, dt: number): void {
  if (state.mode === "sea-trials") return;
  const objective = state.objective;
  objective.occupants.player = 0;
  objective.occupants.enemy = 0;
  for (const ship of state.ships) {
    if (ship.hull <= 0) continue;
    const distance = Math.hypot(
      ship.position.x - objective.center.x,
      ship.position.z - objective.center.z,
    );
    if (distance <= objective.radius) objective.occupants[ship.team] += 1;
  }

  const playerPresent = objective.occupants.player > 0;
  const enemyPresent = objective.occupants.enemy > 0;
  objective.contested = playerPresent && enemyPresent;
  let captureRateMultiplier = 1;
  if (objective.contested) {
    const influence: Record<Team, number> = { player: 0, enemy: 0 };
    for (const ship of state.ships) {
      if (ship.hull <= 0) continue;
      const distance = Math.hypot(
        ship.position.x - objective.center.x,
        ship.position.z - objective.center.z,
      );
      if (distance <= objective.radius) influence[ship.team] += ship.hull / ship.maxHull;
    }
    const difference = influence.player - influence.enemy;
    objective.capturingTeam = Math.abs(difference) >= OBJECTIVE.dominanceHullDifference
      ? difference > 0 ? "player" : "enemy"
      : undefined;
    captureRateMultiplier = OBJECTIVE.contestedCaptureMultiplier;
  } else {
    objective.capturingTeam = playerPresent ? "player" : enemyPresent ? "enemy" : undefined;
  }

  if (objective.capturingTeam) {
    const direction = objective.capturingTeam === "player" ? 1 : -1;
    objective.captureProgress = clamp(
      objective.captureProgress
        + direction * dt / OBJECTIVE.captureSeconds * captureRateMultiplier,
      -1,
      1,
    );
    if (objective.owner === "player" && objective.captureProgress <= 0) {
      objective.owner = undefined;
    } else if (objective.owner === "enemy" && objective.captureProgress >= 0) {
      objective.owner = undefined;
    }
    if (objective.captureProgress >= 1) objective.owner = "player";
    if (objective.captureProgress <= -1) objective.owner = "enemy";
  }

  if (objective.owner) {
    const blockingTeam: Team = objective.owner === "player" ? "enemy" : "player";
    const scoreMultiplier = objective.occupants[blockingTeam] === 0
      ? 1
      : objective.capturingTeam === objective.owner
        ? OBJECTIVE.contestedScoreMultiplier
        : 0;
    if (scoreMultiplier > 0) {
      objective.scores[objective.owner] = Math.min(
        OBJECTIVE.scoreToWin,
        objective.scores[objective.owner]
          + OBJECTIVE.scorePerSecond * scoreMultiplier * dt,
      );
    }
  }
}

function updateStatus(state: BattleState): void {
  const player = state.ships.find((ship) => ship.team === "player");
  const enemy = state.ships.find((ship) => ship.team === "enemy");
  const playerDestroyed = !player || player.hull <= 0;
  const enemyDestroyed = !enemy || enemy.hull <= 0;
  if (playerDestroyed && enemyDestroyed) {
    state.objective.scores.player = Math.min(
      OBJECTIVE.scoreToWin,
      state.objective.scores.player + OBJECTIVE.destroyScore,
    );
    state.objective.scores.enemy = Math.min(
      OBJECTIVE.scoreToWin,
      state.objective.scores.enemy + OBJECTIVE.destroyScore,
    );
    state.status = "draw";
    state.endReason = "destroyed";
  } else if (playerDestroyed) {
    state.objective.scores.enemy = Math.min(
      OBJECTIVE.scoreToWin,
      state.objective.scores.enemy + OBJECTIVE.destroyScore,
    );
    state.status = "enemy-won";
    state.endReason = "destroyed";
  } else if (state.mode === "sea-trials") {
    return;
  } else if (enemyDestroyed) {
    state.objective.scores.player = Math.min(
      OBJECTIVE.scoreToWin,
      state.objective.scores.player + OBJECTIVE.destroyScore,
    );
    state.status = "player-won";
    state.endReason = "destroyed";
  } else if (state.objective.scores.player >= OBJECTIVE.scoreToWin) {
    state.status = "player-won";
    state.endReason = "score";
  } else if (state.objective.scores.enemy >= OBJECTIVE.scoreToWin) {
    state.status = "enemy-won";
    state.endReason = "score";
  } else if (state.time >= BATTLE_DURATION_SECONDS) {
    const scoreDifference = state.objective.scores.player - state.objective.scores.enemy;
    const playerRatio = player.hull / player.maxHull;
    const enemyRatio = enemy.hull / enemy.maxHull;
    state.status = Math.abs(scoreDifference) >= 1
      ? scoreDifference > 0 ? "player-won" : "enemy-won"
      : Math.abs(playerRatio - enemyRatio) < 0.01
        ? "draw"
        : playerRatio > enemyRatio
          ? "player-won"
          : "enemy-won";
    state.endReason = "time";
  }
}

export function torpedoThreatsFor(
  state: Readonly<BattleState>,
  shipId: string,
): TorpedoThreat[] {
  const ship = state.ships.find((candidate) => candidate.id === shipId);
  if (!ship) return [];
  const shipSpeed = ship.speedKnots * KNOT_TO_MPS;
  const shipVelocity = {
    x: Math.sin(ship.heading) * shipSpeed,
    z: Math.cos(ship.heading) * shipSpeed,
  };
  return state.projectiles
    .filter((projectile) => projectile.kind === "torpedo" && projectile.team !== ship.team)
    .filter((projectile) => Math.hypot(
      projectile.position.x - ship.position.x,
      projectile.position.z - ship.position.z,
    ) <= effectiveTorpedoDetectionRange(ship, projectile))
    .map((projectile) => {
      const relativeX = projectile.position.x - ship.position.x;
      const relativeZ = projectile.position.z - ship.position.z;
      const distanceMeters = Math.hypot(
        relativeX,
        relativeZ,
      );
      const relativeVelocityX = projectile.velocity.x - shipVelocity.x;
      const relativeVelocityZ = projectile.velocity.z - shipVelocity.z;
      const relativeSpeedSquared = relativeVelocityX ** 2 + relativeVelocityZ ** 2;
      const dot = relativeX * relativeVelocityX + relativeZ * relativeVelocityZ;
      const timeToClosestApproach = relativeSpeedSquared <= 0.001
        ? 0
        : clamp(-dot / relativeSpeedSquared, 0, TORPEDO.threatLookaheadSeconds);
      const closestX = relativeX + relativeVelocityX * timeToClosestApproach;
      const closestZ = relativeZ + relativeVelocityZ * timeToClosestApproach;
      const localLateral = relativeX * Math.cos(ship.heading)
        - relativeZ * Math.sin(ship.heading);
      return {
        id: projectile.id,
        position: copyVec(projectile.position),
        velocity: copyVec(projectile.velocity),
        distanceMeters,
        armed: (projectile.distanceTravelled ?? 0) >= (projectile.armingDistance ?? 0),
        side: localLateral < 0 ? "port" as const : "starboard" as const,
        closingSpeedMetersPerSecond: distanceMeters <= 0.001 ? 0 : -dot / distanceMeters,
        closestApproachMeters: Math.hypot(closestX, closestZ),
        timeToClosestApproach,
      };
    })
    .filter((threat) =>
      threat.closingSpeedMetersPerSecond > 0.5
      && threat.timeToClosestApproach > 0
      && threat.closestApproachMeters <= TORPEDO.threatClosestApproachMeters)
    .sort((left, right) =>
      left.timeToClosestApproach - right.timeToClosestApproach
      || left.distanceMeters - right.distanceMeters);
}

export function observe(state: BattleState, shipId: string) {
  const self = state.ships.find((ship) => ship.id === shipId);
  if (!self) throw new Error(`Unknown ship: ${shipId}`);
  const incomingTorpedoes = torpedoThreatsFor(state, shipId);
  const objective = {
    center: { ...state.objective.center },
    radius: state.objective.radius,
    captureProgress: state.objective.captureProgress,
    owner: state.objective.owner,
    capturingTeam: state.objective.capturingTeam,
    contested: state.objective.contested,
    scores: { ...state.objective.scores },
  };
  const sampleIndex = Math.floor(state.time / SENSOR.observationIntervalSeconds);
  const hydroActive = self.hydroActiveRemaining > 0;
  const currentGunBloomSignature = gunBloomSignature(state, self);
  const cached = state.sensorSnapshots[shipId];
  if (
    cached?.sampleIndex === sampleIndex
    && cached.hydroActive === hydroActive
    && cached.gunBloomSignature === currentGunBloomSignature
  ) {
    return {
      self,
      contacts: cached.contacts,
      objective,
      incomingTorpedoes,
      time: state.time,
    };
  }
  const sampleSeed = (state.randomSeed ^ sampleIndex ^ stringSeed(shipId)) >>> 0;
  const contacts: SensorContact[] = [];
  for (const target of state.ships) {
    if (target.team === self.team || target.hull <= 0) continue;
    const dx = target.position.x - self.position.x;
    const dz = target.position.z - self.position.z;
    const actualRange = Math.hypot(dx, dz);
    const hydroDetected = hydroActive && actualRange <= HYDRO.shipDetectionMeters;
    const smokeBlocked = isLineObscuredBySmoke(state, self.position, target.position);
    const targetInSmoke = isPointInSmoke(state, target.position);
    const recentlyFiredMainGun = mainGunBloomRemaining(state.time, target) > 0;
    const smokeFiringReveal = targetInSmoke
      && recentlyFiredMainGun
      && actualRange <= SMOKE.firingDetectionMeters;
    if (!hydroDetected && smokeBlocked && actualRange > SMOKE.guaranteedDetectionMeters) {
      const separateSmokeWall = state.smokeClouds.some((cloud) =>
        cloud.expiresAt > state.time
        && segmentIntersectsSmoke(self.position, target.position, cloud)
        && Math.hypot(
          target.position.x - cloud.position.x,
          target.position.z - cloud.position.z,
        ) > cloud.radius);
      if (!smokeFiringReveal || separateSmokeWall) continue;
    }
    const targetHull = getShipClass(target.shipClassId);
    const passiveDetectionRange = SENSOR.maximumDetectionMeters
      + targetHull.detectionBonusMeters
      + target.fireIntensity / 100 * SENSOR.burningDetectionBonusMeters
      + clamp(Math.abs(target.speedKnots) / targetHull.maxSpeedKnots, 0, 1)
        * SENSOR.highSpeedDetectionBonusMeters;
    const targetMainBatteryRange = Math.min(
      SENSOR.gunBloomDetectionMeters,
      getMainBattery(target.shipClassId, target.mainGunId, target.mainGunMounts)
        .maximumRangeMeters,
    );
    const detectionRange = recentlyFiredMainGun
      ? Math.max(passiveDetectionRange, targetMainBatteryRange)
      : passiveDetectionRange;
    const gunBloomReveal = recentlyFiredMainGun
      && actualRange <= targetMainBatteryRange;
    const rangeFactor = hydroDetected ? 0 : clamp(
      (actualRange - SENSOR.guaranteedDetectionMeters)
        / Math.max(1, detectionRange - SENSOR.guaranteedDetectionMeters),
      0,
      1,
    );
    const detectionChance = 1 - rangeFactor * 0.72;
    if (
      (!hydroDetected && actualRange > detectionRange)
      || (!smokeFiringReveal && !gunBloomReveal
        && actualRange > SENSOR.guaranteedDetectionMeters
        && !hydroDetected
        && sensorUnit(sampleSeed ^ stringSeed(target.id) ^ 0x91e10da5) > detectionChance)
    ) {
      continue;
    }
    const confidence = hydroDetected ? 0.98 : clamp(
      0.94 - rangeFactor * 0.52 + target.fireIntensity / 100 * 0.08,
      0.3,
      0.98,
    );
    const actualBearing = Math.atan2(dx, dz);
    const bearingErrorLimit = SENSOR.nearBearingErrorRadians
      + (SENSOR.farBearingErrorRadians - SENSOR.nearBearingErrorRadians) * rangeFactor;
    const bearingError = sensorSigned(sampleSeed ^ stringSeed(target.id) ^ 0x4c957f2d)
      * bearingErrorLimit;
    const rangeErrorFraction = SENSOR.nearRangeErrorFraction
      + (SENSOR.farRangeErrorFraction - SENSOR.nearRangeErrorFraction) * rangeFactor;
    const observedRange = Math.max(
      1,
      actualRange * (
        1
        + sensorSigned(sampleSeed ^ stringSeed(target.id) ^ 0x7f4a7c15)
        * rangeErrorFraction
      ),
    );
    const observedBearing = actualBearing + bearingError;
    contacts.push({
      id: target.id,
      team: target.team,
      observedAt: sampleIndex * SENSOR.observationIntervalSeconds,
      position: {
        x: self.position.x + Math.sin(observedBearing) * observedRange,
        y: target.position.y,
        z: self.position.z + Math.cos(observedBearing) * observedRange,
      },
      heading: wrapAngle(
        target.heading
          + sensorSigned(sampleSeed ^ stringSeed(target.id) ^ 0x6d2b79f5)
          * SENSOR.headingErrorRadians
          * (1.15 - confidence),
      ),
      speedKnots: Math.max(
        0,
        target.speedKnots
          + sensorSigned(sampleSeed ^ stringSeed(target.id) ^ 0x2c1b3c6d)
          * SENSOR.speedErrorKnots
          * (1.15 - confidence),
      ),
      rangeMeters: observedRange,
      confidence,
      estimatedHullRatio: clamp(
        Math.round((
          target.hull / target.maxHull
          + sensorSigned(sampleSeed ^ stringSeed(target.id) ^ 0x3a6f2d91)
            * (0.06 + rangeFactor * 0.12)
        ) * 20) / 20,
        0,
        1,
      ),
    });
  }
  state.sensorSnapshots[shipId] = {
    sampleIndex,
    hydroActive,
    gunBloomSignature: currentGunBloomSignature,
    contacts,
  };
  return {
    self,
    contacts,
    objective,
    incomingTorpedoes,
    time: state.time,
  };
}

export interface AirMissionTargetValidation {
  rejectReason?: AirMissionRejectReason;
  lastKnownPosition?: Vec3;
}

export const AIR_CONTACT_VALID_SECONDS = 5;

/** Resolves targets against authoritative battle perception, never client coordinates. */
export function validateAirMissionTarget(
  state: BattleState,
  issuer: Readonly<ShipState>,
  mission: Readonly<AirMissionCommand>,
): AirMissionTargetValidation {
  if (mission.kind === "strikeShip") {
    if (!mission.targetId) return {};
    const target = state.ships.find((ship) => ship.id === mission.targetId);
    if (!target || target.team === issuer.team || target.hull <= 0) {
      return { rejectReason: "invalid-target" };
    }
    const contact = observe(state, issuer.id).contacts.find(({ id }) => id === target.id);
    return contact
      ? { lastKnownPosition: copyVec(contact.position) }
      : { rejectReason: "invalid-target" };
  }
  if (mission.kind === "interceptSquadron") {
    if (!mission.targetId) return {};
    const target = state.airSquadrons.find((candidate) =>
      candidate.id === mission.targetId
      && candidate.team !== issuer.team
      && candidate.phase !== "ready"
      && candidate.phase !== "rearming"
      && candidate.phase !== "destroyed"
      && candidate.aircraftOperational > 0);
    const contact = target?.contactsByTeam[issuer.team];
    return contact && state.time - contact.observedAt <= AIR_CONTACT_VALID_SECONDS
      ? { lastKnownPosition: copyVec(contact.lastKnownPosition) }
      : { rejectReason: "invalid-target" };
  }
  return {};
}

export function stepSimulation(
  state: BattleState,
  commands: ReadonlyMap<string, ControlCommand>,
  dt = FIXED_STEP,
): void {
  if (state.status !== "running") return;
  state.shots = [];
  state.impacts = [];
  state.airEvents = [];
  state.time += dt;
  state.airSquadrons = state.airSquadrons.map((squadron) => {
    const advanced = advanceAirSquadronPhase(squadron, state.time);
    const eventKind = airTransitionEventKind(squadron.phase, advanced.phase);
    if (eventKind) {
      state.airEvents.push({
        id: state.nextEntityId++,
        time: state.time,
        kind: eventKind,
        team: advanced.team,
        controllerId: advanced.controllerId,
        squadronId: advanced.id,
        orderKind: advanced.order?.kind,
        targetId: advanced.order?.targetId,
      });
    }
    return advanced;
  });
  state.smokeClouds = state.smokeClouds.filter((cloud) => cloud.expiresAt > state.time);
  for (const ship of state.ships) {
    if (ship.hull <= 0) continue;
    const command = commands.get(ship.id) ?? { ...zeroCommand, aimPoint: ship.aimPoint };
    if (command.airMission) {
      const squadronIndex = state.airSquadrons.findIndex((squadron) =>
        squadron.id === command.airMission?.squadronId
        && squadron.controllerId === ship.id
        && squadron.team === ship.team);
      let result: AirMissionIssueResult;
      const validation = squadronIndex >= 0
        ? validateAirMissionTarget(state, ship, command.airMission)
        : {};
      if (squadronIndex < 0) {
        result = issueAirMissionOrder(undefined, command.airMission, state.time);
      } else if (validation.rejectReason) {
        result = { accepted: false, reason: validation.rejectReason };
      } else {
        result = issueAirMissionOrder(
          squadronIndex >= 0 ? state.airSquadrons[squadronIndex] : undefined,
          command.airMission,
          state.time,
          validation.lastKnownPosition,
        );
      }
      const previousSquadron = squadronIndex >= 0 ? state.airSquadrons[squadronIndex] : undefined;
      if (result.accepted && result.squadron && squadronIndex >= 0) {
        state.airSquadrons[squadronIndex] = result.squadron;
      }
      if (!result.accepted || result.changed !== false) {
        state.airEvents.push({
          id: state.nextEntityId++,
          time: state.time,
          kind: result.accepted ? "orderAccepted" : "orderRejected",
          team: ship.team,
          controllerId: ship.id,
          squadronId: command.airMission.squadronId,
          orderKind: command.airMission.kind,
          targetId: command.airMission.targetId,
          rejectReason: result.reason,
        });
      }
      if (result.accepted && result.changed && previousSquadron && result.squadron) {
        const eventKind = airTransitionEventKind(
          previousSquadron.phase,
          result.squadron.phase,
        );
        if (eventKind) {
          state.airEvents.push({
            id: state.nextEntityId++,
            time: state.time,
            kind: eventKind,
            team: ship.team,
            controllerId: ship.id,
            squadronId: result.squadron.id,
            orderKind: result.squadron.order?.kind,
            targetId: result.squadron.order?.targetId,
          });
        }
      }
    }
    if (command.perception) {
      ship.perception = {
        ...command.perception,
        estimatedPosition: command.perception.estimatedPosition
          ? { ...command.perception.estimatedPosition }
          : undefined,
      };
    }
    ship.torpedoSpreadMode = command.torpedoSpread ?? ship.torpedoSpreadMode;
    ship.damageControlPriority = command.damageControlPriority ?? ship.damageControlPriority;
    const damageControlAllocation = damageControlAllocationFor(
      ship,
      Boolean(command.repairHull),
    );
    ship.damageControlAllocation = damageControlAllocation;
    ship.hullRepairActive = damageControlAllocation.hull > 0;
    moveShip(ship, command, dt);
    updateSmokeGenerator(state, ship, Boolean(command.activateSmoke), dt);
    updateHydroacousticSearch(state, ship, Boolean(command.activateHydro), dt);
    repairModule(ship, damageControlAllocation.module, dt);
    updateDamageControl(ship, damageControlAllocation, dt);
    repairHull(ship, damageControlAllocation.hull, dt);
    if (command.fire) {
      if ((command.weaponSlot ?? "mainGun") === "mainGun") fireGun(state, ship);
      else if (command.weaponSlot === "torpedo") fireTorpedoes(state, ship);
    }
    if (command.deployDepthCharge) deployDepthChargePattern(state, ship);
  }
  for (const ship of state.ships) {
    if (ship.hull > 0) updateSecondaryBattery(state, ship, dt);
  }
  resolveShipCollisions(state);
  advanceProjectiles(state, dt);
  advanceDepthCharges(state, dt);
  updateObjective(state, dt);
  updateStatus(state);
}
