export const SIMULATION_HZ = 60;
export const FIXED_STEP = 1 / SIMULATION_HZ;
export const GRAVITY = 9.81;
export const KNOT_TO_MPS = 0.514444;
export const BATTLE_DURATION_SECONDS = 10 * 60;

export const SHIP = {
  length: 112,
  beam: 11,
  deckHeight: 8,
  maxSpeedKnots: 35.5,
  accelerationKnotsPerSecond: 0.38,
  brakingKnotsPerSecond: 0.56,
  maxTurnRateRadians: 2.9 * Math.PI / 180,
  maxHull: 1_000,
} as const;

export const COMPARTMENT_MAX_HEALTH = {
  bow: 190,
  bridge: 150,
  engineRoom: 250,
  magazine: 180,
  stern: 230,
} as const;

export const DAMAGE_CONTROL = {
  fireHullDamagePerPointSecond: 0.007,
  floodingHullDamagePerPointSecond: 0.004,
  baseFireReductionPerSecond: 0.55,
  baseFloodReductionPerSecond: 0.32,
} as const;

export const HULL_REPAIR = {
  pointsPerSecond: 4.2,
  minimumCrewFactor: 0.12,
} as const;

export const COLLISION = {
  minimumRelativeSpeedMps: 1.2,
  damagePerRelativeMps: 6.8,
  maximumBaseDamage: 155,
  cooldownSeconds: 1.15,
  separationMeters: 4.5,
} as const;

export const COLLISION_DAMAGE_MULTIPLIER = {
  bow: 0.48,
  bridge: 0.82,
  engineRoom: 0.9,
  magazine: 1,
  stern: 0.62,
} as const;

export const GUN = {
  muzzleVelocity: 720,
  gravity: GRAVITY,
  reloadSeconds: 5.5,
  damage: 105,
  muzzleHeight: 10,
  minAimRange: 350,
  maxAimRange: 5_000,
} as const;

export const ARMOR_THICKNESS_MM = {
  bow: 10,
  bridge: 6,
  engineRoom: 16,
  magazine: 20,
  stern: 10,
} as const;

export const AMMUNITION = {
  he: {
    penetrationMm: 22,
    penetrationDamageMultiplier: 0.82,
    shatterDamageMultiplier: 0.08,
    moduleDamageMultiplier: 1,
  },
  ap: {
    muzzlePenetrationMm: 72,
    minimumPenetrationMm: 42,
    penetrationLossMmPerSecond: 5,
    ricochetDegrees: 68,
    overpenetrationRatio: 3.6,
    penetrationDamageMultiplier: 0.92,
    overpenetrationDamageMultiplier: 0.22,
    moduleDamageMultiplier: 0.58,
  },
} as const;

export const TURRET = {
  traverseRadiansPerSecond: 12 * Math.PI / 180,
  fireToleranceRadians: 2.5 * Math.PI / 180,
} as const;

export const MODULE_MAX_HEALTH = {
  gun: 180,
  engine: 220,
  steering: 160,
  magazine: 150,
  crew: 240,
} as const;

export const BASE_REPAIR_PER_SECOND = {
  gun: 1.15,
  engine: 1.0,
  steering: 1.25,
  magazine: 0.55,
  crew: 0.18,
} as const;
