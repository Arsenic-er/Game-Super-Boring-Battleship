import {
  AMMUNITION,
  ARMOR_THICKNESS_MM,
  BASE_REPAIR_PER_SECOND,
  BATTLE_DURATION_SECONDS,
  COLLISION,
  COLLISION_DAMAGE_MULTIPLIER,
  COMPARTMENT_MAX_HEALTH,
  DAMAGE_CONTROL,
  FIXED_STEP,
  GUN,
  HULL_REPAIR,
  KNOT_TO_MPS,
  MODULE_MAX_HEALTH,
  OBJECTIVE,
  SHIP,
  TURRET,
} from "./config";
import {
  DEFAULT_MAIN_GUN_ID,
  FRONT_TURRET_TRAVERSE_LIMIT_RADIANS,
  getMainGun,
} from "../ships/components";
import type { MainGunId } from "../ships/components";
import type {
  AmmoType,
  ArmorZoneId,
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
} from "./types";

const zeroCommand: ControlCommand = {
  throttle: 0,
  rudder: 0,
  aimPoint: { x: 0, y: 0, z: 1_000 },
  fire: false,
  repairHull: false,
  damageControlPriority: "balanced",
  weaponSlot: "mainGun",
};

const TORPEDO = {
  speedMetersPerSecond: 26,
  reloadSeconds: 42,
  damage: 145,
  lifetimeSeconds: 125,
  launchOffset: 4.2,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const copyVec = (value: Vec3): Vec3 => ({ ...value });

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

function createModules(): ShipState["modules"] {
  return {
    gun: { health: MODULE_MAX_HEALTH.gun, maxHealth: MODULE_MAX_HEALTH.gun },
    engine: { health: MODULE_MAX_HEALTH.engine, maxHealth: MODULE_MAX_HEALTH.engine },
    steering: { health: MODULE_MAX_HEALTH.steering, maxHealth: MODULE_MAX_HEALTH.steering },
    magazine: { health: MODULE_MAX_HEALTH.magazine, maxHealth: MODULE_MAX_HEALTH.magazine },
    crew: { health: MODULE_MAX_HEALTH.crew, maxHealth: MODULE_MAX_HEALTH.crew },
  };
}

function createShip(
  id: string,
  team: Team,
  x: number,
  z: number,
  heading: number,
  mainGunId: MainGunId = DEFAULT_MAIN_GUN_ID,
  performance: ShipPerformanceModifiers = {
    maxSpeedMultiplier: 1,
    accelerationMultiplier: 1,
    turnMultiplier: 1,
    reloadMultiplier: 1,
    magazineRiskMultiplier: 1,
  },
): ShipState {
  return {
    id,
    team,
    position: { x, y: 0, z },
    previousPosition: { x, y: 0, z },
    heading,
    turretHeading: heading,
    speedKnots: 12,
    throttle: 0.55,
    rudder: 0,
    hull: SHIP.maxHull,
    maxHull: SHIP.maxHull,
    recoverableHull: SHIP.maxHull,
    compartments: { ...COMPARTMENT_MAX_HEALTH },
    modules: createModules(),
    mainGunId,
    performance,
    gunTraverseBlocked: false,
    reloadRemaining: 0,
    torpedoReloadRemaining: 0,
    aimPoint: { x, y: 0, z: z + Math.cos(heading) * 1_800 },
    ammoType: "he",
    fireIntensity: 0,
    flooding: 0,
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
): BattleState {
  const player = createShip("player", "player", 0, -900, 0, playerMainGunId, {
    maxSpeedMultiplier: playerPerformance?.maxSpeedMultiplier ?? 1,
    accelerationMultiplier: playerPerformance?.accelerationMultiplier ?? 1,
    turnMultiplier: playerPerformance?.turnMultiplier ?? 1,
    reloadMultiplier: playerPerformance?.reloadMultiplier ?? 1,
    magazineRiskMultiplier: playerPerformance?.magazineRiskMultiplier ?? 1,
  });
  const testTarget = createShip("test-target", "enemy", 0, -460, Math.PI / 2);
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
      ? [player, createShip("enemy", "enemy", 180, 1_250, Math.PI)]
      : [player, testTarget],
    projectiles: [],
    shots: [],
    impacts: [],
    nextEntityId: 1,
    randomSeed: seed >>> 0,
    collisionCooldowns: {},
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

function desiredTurretHeading(ship: ShipState): { heading: number; blocked: boolean } {
  const desiredHeading = Math.atan2(
    ship.aimPoint.x - ship.position.x,
    ship.aimPoint.z - ship.position.z,
  );
  const desiredRelative = wrapAngle(desiredHeading - ship.heading);
  const blocked = Math.abs(desiredRelative) > FRONT_TURRET_TRAVERSE_LIMIT_RADIANS;
  const safeRelative = clamp(
    desiredRelative,
    -FRONT_TURRET_TRAVERSE_LIMIT_RADIANS,
    FRONT_TURRET_TRAVERSE_LIMIT_RADIANS,
  );
  return { heading: wrapAngle(ship.heading + safeRelative), blocked };
}

export function turretAlignmentError(ship: ShipState): number {
  return wrapAngle(desiredTurretHeading(ship).heading - ship.turretHeading);
}

export function isGunBearingBlocked(ship: ShipState): boolean {
  return desiredTurretHeading(ship).blocked;
}

export function isGunFireBlocked(ship: ShipState): boolean {
  const actualRelative = Math.abs(wrapAngle(ship.turretHeading - ship.heading));
  return isGunBearingBlocked(ship)
    || actualRelative > FRONT_TURRET_TRAVERSE_LIMIT_RADIANS + 0.5 * Math.PI / 180;
}

export function isTurretAligned(ship: ShipState): boolean {
  return Math.abs(turretAlignmentError(ship)) <= TURRET.fireToleranceRadians;
}

function moveShip(ship: ShipState, command: ControlCommand, dt: number): void {
  ship.previousPosition = copyVec(ship.position);
  ship.throttle = clamp(command.throttle, -0.25, 1);
  ship.rudder = clamp(command.rudder, -1, 1);
  ship.aimPoint = copyVec(command.aimPoint);

  if (command.ammoType && command.ammoType !== ship.ammoType) {
    ship.ammoType = command.ammoType;
    const gunDefinition = getMainGun(ship.mainGunId);
    const gunRatio = Math.max(0.25, moduleRatio(ship, "gun"));
    ship.reloadRemaining = Math.max(
      ship.reloadRemaining,
      gunDefinition.reloadSeconds * ship.performance.reloadMultiplier / gunRatio,
    );
  }

  const engineRatio = moduleRatio(ship, "engine");
  const steeringRatio = moduleRatio(ship, "steering");
  const floodingSpeedFactor = 1 - clamp(ship.flooding / 100, 0, 1) * 0.32;
  const equippedMaxSpeed = SHIP.maxSpeedKnots * ship.performance.maxSpeedMultiplier;
  const effectiveMaxSpeed = equippedMaxSpeed * engineRatio * floodingSpeedFactor * Math.max(0, ship.throttle);
  const reverseTarget = ship.throttle < 0 ? equippedMaxSpeed * ship.throttle * 0.28 : effectiveMaxSpeed;
  const targetSpeed = ship.throttle < 0 ? reverseTarget : effectiveMaxSpeed;
  const rate = (targetSpeed >= ship.speedKnots
    ? SHIP.accelerationKnotsPerSecond
    : SHIP.brakingKnotsPerSecond) * ship.performance.accelerationMultiplier;
  ship.speedKnots += clamp(targetSpeed - ship.speedKnots, -rate * dt, rate * dt);

  const speedRatio = clamp(Math.abs(ship.speedKnots) / equippedMaxSpeed, 0, 1);
  const turnAuthority = steeringRatio * (0.2 + 0.8 * speedRatio);
  const previousHeading = ship.heading;
  ship.heading += ship.rudder * SHIP.maxTurnRateRadians * ship.performance.turnMultiplier * turnAuthority * dt;
  ship.turnRateRadians = wrapAngle(ship.heading - previousHeading) / Math.max(dt, 0.0001);

  const metersPerSecond = ship.speedKnots * KNOT_TO_MPS;
  const moveX = Math.sin(ship.heading) * metersPerSecond * dt;
  const moveZ = Math.cos(ship.heading) * metersPerSecond * dt;
  ship.position.x += moveX;
  ship.position.z += moveZ;
  ship.distanceTravelled += Math.hypot(moveX, moveZ);
  const gunRatio = moduleRatio(ship, "gun");
  const gunDefinition = getMainGun(ship.mainGunId);
  const traverseRate = gunRatio <= 0
    ? 0
    : gunDefinition.traverseDegreesPerSecond * Math.PI / 180 * (0.3 + gunRatio * 0.7);
  const turretTarget = desiredTurretHeading(ship);
  ship.gunTraverseBlocked = turretTarget.blocked;
  const alignmentError = turretAlignmentError(ship);
  ship.turretHeading = wrapAngle(
    ship.turretHeading + clamp(alignmentError, -traverseRate * dt, traverseRate * dt),
  );
  ship.reloadRemaining = Math.max(0, ship.reloadRemaining - dt);
  ship.torpedoReloadRemaining = Math.max(0, ship.torpedoReloadRemaining - dt);
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
  const mountDistance = 31;
  const barrelDistance = getMainGun(ship.mainGunId).visual.barrelLength * 0.88;
  return {
    x: ship.position.x
      + Math.sin(ship.heading) * mountDistance
      + Math.sin(ship.turretHeading) * barrelDistance,
    y: GUN.muzzleHeight,
    z: ship.position.z
      + Math.cos(ship.heading) * mountDistance
      + Math.cos(ship.turretHeading) * barrelDistance,
  };
}

export function gunMuzzleOrigins(ship: ShipState): Vec3[] {
  const center = gunMuzzleOrigin(ship);
  const gunDefinition = getMainGun(ship.mainGunId);
  const offsets = gunDefinition.visual.barrelCount === 2
    ? [-gunDefinition.visual.barrelSpacing / 2, gunDefinition.visual.barrelSpacing / 2]
    : [0];
  return offsets.map((offset) => ({
    x: center.x + Math.cos(ship.turretHeading) * offset,
    y: center.y,
    z: center.z - Math.sin(ship.turretHeading) * offset,
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
  const gunDefinition = getMainGun(ship.mainGunId);
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
  if (ship.reloadRemaining > 0 || ship.modules.gun.health <= 0 || isGunFireBlocked(ship)) return;
  const gunDefinition = getMainGun(ship.mainGunId);
  const origins = gunMuzzleOrigins(ship);
  const damagePerShell = gunDefinition.damage / origins.length;
  let firedShells = 0;
  for (const origin of origins) {
    const barrelAimPoint = turretAimPoint(ship, origin);
    const actualAimPoint = dispersedAimPoint(state, ship, origin, barrelAimPoint);
    const velocity = ballisticVelocity(origin, actualAimPoint, gunDefinition.muzzleVelocity);
    if (!velocity) continue;
    state.projectiles.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      kind: "shell",
      ammoType: ship.ammoType,
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
      position: copyVec(origin),
    });
    firedShells += 1;
  }
  if (firedShells === 0) return;
  const gunRatio = Math.max(0.25, moduleRatio(ship, "gun"));
  ship.reloadRemaining = gunDefinition.reloadSeconds * ship.performance.reloadMultiplier / gunRatio;
}

function fireTorpedoes(state: BattleState, ship: ShipState): void {
  if (ship.torpedoReloadRemaining > 0 || ship.modules.gun.health <= 0) return;
  const dx = ship.aimPoint.x - ship.position.x;
  const dz = ship.aimPoint.z - ship.position.z;
  const length = Math.max(1, Math.hypot(dx, dz));
  const forwardX = dx / length;
  const forwardZ = dz / length;
  const rightX = forwardZ;
  const rightZ = -forwardX;
  for (const side of [-1, 1]) {
    const origin = {
      x: ship.position.x + forwardX * 3 + rightX * TORPEDO.launchOffset * side,
      y: 0.35,
      z: ship.position.z + forwardZ * 3 + rightZ * TORPEDO.launchOffset * side,
    };
    state.projectiles.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      kind: "torpedo",
      position: copyVec(origin),
      previousPosition: copyVec(origin),
      velocity: {
        x: forwardX * TORPEDO.speedMetersPerSecond,
        y: 0,
        z: forwardZ * TORPEDO.speedMetersPerSecond,
      },
      damage: TORPEDO.damage,
      age: 0,
    });
    state.shots.push({
      id: state.nextEntityId++,
      ownerId: ship.id,
      team: ship.team,
      kind: "torpedo",
      position: copyVec(origin),
    });
  }
  ship.torpedoReloadRemaining = TORPEDO.reloadSeconds;
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

function compartmentAt(longitudinal: number): CompartmentId {
  if (longitudinal > SHIP.length * 0.27) return "bow";
  if (longitudinal > SHIP.length * 0.06) return "bridge";
  if (longitudinal > -SHIP.length * 0.14) return "engineRoom";
  if (longitudinal > -SHIP.length * 0.31) return "magazine";
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
  ship: Pick<ShipState, "position" | "heading">,
): ProjectileHitContact | null {
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
      minimum: -SHIP.length / 2,
      maximum: SHIP.length / 2,
      normal: forward,
      armorZone: "end",
    },
    {
      start: localStart.lateral,
      delta: localEnd.lateral - localStart.lateral,
      minimum: -SHIP.beam / 2 - 2,
      maximum: SHIP.beam / 2 + 2,
      normal: right,
      armorZone: "side",
    },
    {
      start: startHeight,
      delta: endHeight - startHeight,
      minimum: 0,
      maximum: SHIP.deckHeight + 5,
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
  return {
    point,
    localPoint: {
      longitudinal: localPoint.longitudinal,
      lateral: localPoint.lateral,
      height: point.y - ship.position.y,
    },
    surfaceNormal: {
      x: entryAxis.normal.x * entryNormalSign,
      y: entryAxis.normal.y * entryNormalSign,
      z: entryAxis.normal.z * entryNormalSign,
    },
    armorZone: entryAxis.armorZone,
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
): number {
  if (armorZone === "deck") return 10;
  if (armorZone === "end") return 12;
  return ARMOR_THICKNESS_MM[compartment];
}

export function resolveArmorInteraction(
  ammoType: AmmoType,
  armorThicknessMm: number,
  impactAngleDegrees: number,
  flightSeconds: number,
): ArmorResolution {
  const safeArmor = Math.max(0.1, armorThicknessMm);
  const safeAngle = clamp(impactAngleDegrees, 0, 89.9);
  const cosine = Math.max(0.08, Math.cos(safeAngle * Math.PI / 180));
  const effectiveArmorMm = safeArmor / cosine;

  if (ammoType === "he") {
    const penetrationMm = AMMUNITION.he.penetrationMm;
    const penetrated = penetrationMm >= safeArmor;
    return {
      result: penetrated ? "penetration" : "shatter",
      penetrationMm,
      effectiveArmorMm: safeArmor,
      damageMultiplier: penetrated
        ? AMMUNITION.he.penetrationDamageMultiplier
        : AMMUNITION.he.shatterDamageMultiplier,
      moduleDamageMultiplier: penetrated ? AMMUNITION.he.moduleDamageMultiplier : 0.3,
      fireChanceMultiplier: penetrated ? 1 : 0.35,
      floodingChanceMultiplier: penetrated ? 0.7 : 0.1,
    };
  }

  const penetrationMm = Math.max(
    AMMUNITION.ap.minimumPenetrationMm,
    AMMUNITION.ap.muzzlePenetrationMm
      - Math.max(0, flightSeconds) * AMMUNITION.ap.penetrationLossMmPerSecond,
  );
  if (safeAngle >= AMMUNITION.ap.ricochetDegrees) {
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
  const overpenetrated = penetrationMm / effectiveArmorMm
    >= AMMUNITION.ap.overpenetrationRatio;
  return {
    result: overpenetrated ? "overpenetration" : "penetration",
    penetrationMm,
    effectiveArmorMm,
    damageMultiplier: overpenetrated
      ? AMMUNITION.ap.overpenetrationDamageMultiplier
      : AMMUNITION.ap.penetrationDamageMultiplier,
    moduleDamageMultiplier: overpenetrated ? 0.16 : AMMUNITION.ap.moduleDamageMultiplier,
    fireChanceMultiplier: overpenetrated ? 0.02 : 0.12,
    floodingChanceMultiplier: overpenetrated ? 0.08 : 0.55,
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
    engineRoom: ["engine", "engine", "crew"],
    magazine: ["magazine", "magazine", "engine", "crew"],
    stern: ["steering", "engine", "crew"],
  };
  const list = candidates[compartment];
  const moduleId = preferredModule
    ?? list[Math.floor(random(state) * list.length)]
    ?? "crew";
  const module = ship.modules[moduleId];
  const riskMultiplier = moduleId === "magazine" ? ship.performance.magazineRiskMultiplier : 1;
  const moduleDamage = baseDamage * (0.42 + random(state) * 0.28) * riskMultiplier;
  module.health = Math.max(0, module.health - moduleDamage);

  if (moduleId === "magazine") {
    applyHullDamage(ship, baseDamage * 0.35, 0.72);
  }
  return { moduleId, moduleDamage };
}

export function moduleForProjectileHit(
  compartment: CompartmentId,
  height: number,
): ModuleId {
  if (compartment === "bow") return height >= SHIP.deckHeight * 0.55 ? "gun" : "crew";
  if (compartment === "bridge") return "crew";
  if (compartment === "engineRoom") return "engine";
  if (compartment === "magazine") return "magazine";
  return "steering";
}

function applyHit(
  state: BattleState,
  projectile: ProjectileState,
  ship: ShipState,
  contact: ProjectileHitContact,
): void {
  const compartment = compartmentAt(contact.localPoint.longitudinal);
  const armorThicknessMm = armorThicknessFor(compartment, contact.armorZone);
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
      floodingChanceMultiplier: 2,
    }
    : resolveArmorInteraction(
      projectile.ammoType ?? "he",
      armorThicknessMm,
      impactAngleDegrees,
      projectile.age,
    );
  const compartmentHealth = ship.compartments[compartment];
  const damage = Math.min(
    projectile.damage * armor.damageMultiplier,
    compartmentHealth + 30,
  );
  ship.compartments[compartment] = Math.max(0, compartmentHealth - damage * 0.72);
  applyHullDamage(ship, damage, 0.38);
  const moduleHit = damage > 0.01 && armor.moduleDamageMultiplier > 0
    ? damageModule(
      state,
      ship,
      compartment,
      damage * armor.moduleDamageMultiplier,
      moduleForProjectileHit(compartment, contact.localPoint.height),
    )
    : undefined;
  const fireChance = compartment === "magazine" ? 0.48
    : compartment === "engineRoom" || compartment === "bridge" ? 0.34 : 0.2;
  const floodChance = projectile.kind === "torpedo"
    ? 0.92
    : compartment === "bow" || compartment === "stern" ? 0.24 : 0.11;
  const startedFire = damage > 0 && random(state) < fireChance * armor.fireChanceMultiplier;
  const startedFlooding = damage > 0
    && random(state) < floodChance * armor.floodingChanceMultiplier;
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
    effectiveArmorMm: armor.effectiveArmorMm,
    impactAngleDegrees,
    armorZone: contact.armorZone,
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
  const forwardDot = Math.abs(axes.forward.x * axis.x + axes.forward.z * axis.z);
  const rightDot = Math.abs(axes.right.x * axis.x + axes.right.z * axis.z);
  return SHIP.length * 0.48 * forwardDot + SHIP.beam * 0.55 * rightDot;
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
  return compartmentAt(clamp(local.longitudinal, -SHIP.length / 2, SHIP.length / 2));
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
      const leftShare = right.isTestTarget ? 1 : left.isTestTarget ? 0 : 0.5;
      const rightShare = left.isTestTarget ? 1 : right.isTestTarget ? 0 : 0.5;
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
          y: SHIP.deckHeight * 0.45,
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

    let consumed = false;
    for (const ship of state.ships) {
      if (ship.team === projectile.team || ship.hull <= 0) continue;
      const contact = projectileHitContact(projectile, ship);
      if (contact) {
        applyHit(state, projectile, ship, contact);
        consumed = true;
        break;
      }
    }

    if (!consumed && projectile.kind === "shell" && projectile.position.y <= 0 && projectile.age > 0.1) {
      state.impacts.push({
        id: state.nextEntityId++,
        kind: "splash",
        position: { x: projectile.position.x, y: 0, z: projectile.position.z },
      });
      consumed = true;
    }
    const lifetime = projectile.kind === "torpedo" ? TORPEDO.lifetimeSeconds : 18;
    if (!consumed && projectile.age < lifetime) active.push(projectile);
  }
  state.projectiles = active;
}

const moduleRepairUrgency: Record<ModuleId, number> = {
  steering: 1.3,
  engine: 1.25,
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
  module.health = Math.min(
    module.maxHealth,
    module.health
      + BASE_REPAIR_PER_SECOND[moduleId]
      * crewFactor
      * treatmentMultiplier(allocation)
      * dt,
  );
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

export function observe(state: BattleState, shipId: string) {
  const self = state.ships.find((ship) => ship.id === shipId);
  if (!self) throw new Error(`Unknown ship: ${shipId}`);
  return {
    self,
    enemies: state.ships.filter((ship) => ship.team !== self.team && ship.hull > 0),
    objective: state.objective,
    time: state.time,
  };
}

export function stepSimulation(
  state: BattleState,
  commands: ReadonlyMap<string, ControlCommand>,
  dt = FIXED_STEP,
): void {
  if (state.status !== "running") return;
  state.shots = [];
  state.impacts = [];
  state.time += dt;
  for (const ship of state.ships) {
    if (ship.hull <= 0) continue;
    const command = commands.get(ship.id) ?? { ...zeroCommand, aimPoint: ship.aimPoint };
    ship.damageControlPriority = command.damageControlPriority ?? ship.damageControlPriority;
    const damageControlAllocation = damageControlAllocationFor(
      ship,
      Boolean(command.repairHull),
    );
    ship.damageControlAllocation = damageControlAllocation;
    ship.hullRepairActive = damageControlAllocation.hull > 0;
    moveShip(ship, command, dt);
    repairModule(ship, damageControlAllocation.module, dt);
    updateDamageControl(ship, damageControlAllocation, dt);
    repairHull(ship, damageControlAllocation.hull, dt);
    if (command.fire) {
      if ((command.weaponSlot ?? "mainGun") === "mainGun") fireGun(state, ship);
      else if (command.weaponSlot === "torpedo") fireTorpedoes(state, ship);
    }
  }
  resolveShipCollisions(state);
  advanceProjectiles(state, dt);
  updateObjective(state, dt);
  updateStatus(state);
}
