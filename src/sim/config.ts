export const SIMULATION_HZ = 60;
export const FIXED_STEP = 1 / SIMULATION_HZ;
export const DEPTH_CHARGE = {
  salvos: 4,
  reloadSeconds: 10,
  sinkSpeedMetersPerSecond: 3.2,
  horizontalDragPerSecond: 2.1,
  detonationDepthMeters: 18,
  blastRadiusMeters: 42,
  fullDamageRadiusMeters: 14,
  damage: 160,
  maximumLifetimeSeconds: 8,
  chargesPerPattern: 4,
} as const;
export const GRAVITY = 9.81;
export const KNOT_TO_MPS = 0.514444;
export const BATTLE_DURATION_SECONDS = 20 * 60;

export const OBJECTIVE = {
  centerX: 90,
  centerZ: 175,
  radiusMeters: 450,
  captureSeconds: 25,
  contestedCaptureMultiplier: 0.35,
  contestedScoreMultiplier: 0.35,
  dominanceHullDifference: 0.08,
  scorePerSecond: 2.5,
  // 25 s to capture plus roughly 150 s of uncontested scoring.
  scoreToWin: 375,
  destroyScore: 100,
} as const;

/** Symmetric battle-only deployment around the central objective. */
export const BATTLE_SPAWN = {
  player: { x: 0, z: -2_400 },
  enemy: { x: 180, z: 2_750 },
  minimumSeparationMeters: 5_000,
} as const;

/**
 * Compresses otherwise lengthy naval transit while keeping the HUD's historical knot values.
 * Turning shares the travel scale so a ship's gameplay turning radius remains coherent.
 */
export const NAVIGATION_PACE = {
  travelTimeScale: 1.5,
  propulsionResponseScale: 2,
} as const;

export const SENSOR = {
  observationIntervalSeconds: 2.5,
  acquisitionSamples: 3,
  reacquisitionSamples: 2,
  aiAcquisitionSamples: 4,
  guaranteedDetectionMeters: 1_700,
  maximumDetectionMeters: 2_600,
  gunBloomDetectionMeters: 5_000,
  gunBloomSeconds: 12,
  burningDetectionBonusMeters: 650,
  highSpeedDetectionBonusMeters: 220,
  nearBearingErrorRadians: 0.45 * Math.PI / 180,
  farBearingErrorRadians: 2.4 * Math.PI / 180,
  nearRangeErrorFraction: 0.012,
  farRangeErrorFraction: 0.075,
  headingErrorRadians: 8 * Math.PI / 180,
  speedErrorKnots: 2.8,
  fireFromMemorySeconds: 6,
  memorySeconds: 24,
} as const;

export const SHIP = {
  length: 112,
  beam: 11,
  deckHeight: 8,
  maxSpeedKnots: 35.5,
  accelerationKnotsPerSecond: 0.38,
  brakingKnotsPerSecond: 0.56,
  rudderShiftPerSecond: 0.32,
  maximumTurningSpeedLoss: 0.12,
  maxTurnRateRadians: 2.9 * Math.PI / 180,
  maxHull: 1_000,
} as const;

export function shipSpeedMetersPerSecond(speedKnots: number): number {
  return speedKnots * KNOT_TO_MPS * NAVIGATION_PACE.travelTimeScale;
}

export const SMOKE = {
  charges: 2,
  deploymentSeconds: 18,
  puffIntervalSeconds: 2,
  puffLifetimeSeconds: 65,
  puffRadiusMeters: 110,
  cooldownSeconds: 120,
  guaranteedDetectionMeters: 650,
  firingDetectionMeters: 2_300,
  maximumClouds: 40,
} as const;

export const HYDRO = {
  charges: 2,
  activeSeconds: 70,
  cooldownSeconds: 130,
  shipDetectionMeters: 2_000,
  torpedoDetectionMeters: 900,
} as const;

export const COMPARTMENT_MAX_HEALTH = {
  bow: 190,
  bridge: 150,
  engineRoom: 250,
  magazine: 180,
  stern: 230,
} as const;

export const DAMAGE_CONTROL = {
  fireMaxHullFractionPerSecondAtFullIntensity: 0.003,
  floodingMaxHullFractionPerSecondAtFullIntensity: 0.0025,
  baseFireReductionPerSecond: 0.55,
  baseFloodReductionPerSecond: 0.32,
  passiveTreatmentMultiplier: 0.12,
  allocatedTreatmentMultiplier: 1.8,
  focusedTaskWeight: 4,
  secondaryTaskWeight: 0.65,
  hullRepairWeight: 4,
} as const;

export const HULL_REPAIR = {
  maxHullFractionPerSecond: 0.0042,
  minimumCrewFactor: 0.12,
} as const;

export const DAMAGE_RECOVERY = {
  damageOverTime: 1,
  overpenetration: 1,
  penetration: 0.5,
  citadel: 0.1,
  torpedo: 0.5,
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

export const TORPEDO = {
  speedMetersPerSecond: 26,
  reloadSeconds: 42,
  damage: 145,
  armingDistanceMeters: 120,
  maximumRangeMeters: 3_500,
  detectionRangeMeters: 500,
  minimumLaunchAngleRadians: 38 * Math.PI / 180,
  maximumLaunchAngleRadians: 142 * Math.PI / 180,
  narrowSpreadRadians: 1.6 * Math.PI / 180,
  wideSpreadRadians: 6 * Math.PI / 180,
  tubeLongitudinalOffset: -8,
  tubeBarrelSpacing: 1.2,
  launcherTraverseRadiansPerSecond: 24 * Math.PI / 180,
  launcherFireToleranceRadians: 4 * Math.PI / 180,
  threatClosestApproachMeters: 170,
  threatLookaheadSeconds: 65,
} as const;

/**
 * Tactical limits used by the rule controller. They model a fallible human
 * destroyer captain rather than granting the AI extra torpedo information.
 */
export const AI_TORPEDO = {
  minimumAttackRangeMeters: 900,
  maximumAttackRangeMeters: 1_450,
  maximumInterceptSeconds: 55,
  minimumTrackConfidence: 0.55,
  maximumHeadingChangeRadians: 8 * Math.PI / 180,
  maximumSpeedChangeKnots: 3,
  maximumTrackSampleGapSeconds: SENSOR.observationIntervalSeconds * 1.5,
  evasionReactionMinSeconds: 8,
  evasionReactionMaxSeconds: 14,
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
    penetrationMm: 21,
    penetrationDamageMultiplier: 0.33,
    shatterDamageMultiplier: 0,
    moduleDamageMultiplier: 1,
    shatterModuleDamageMultiplier: 0.22,
    baseFireChanceMultiplier: 0.22,
  },
  ap: {
    muzzlePenetrationMm: 72,
    minimumPenetrationMm: 42,
    penetrationLossMmPerSecond: 5,
    ricochetStartDegrees: 45,
    ricochetGuaranteedDegrees: 60,
    normalizationDegrees: 10,
    overmatchArmorMm: 8.9,
    fuseArmingArmorMm: 8,
    fuseTravelMeters: 8.5,
    penetrationDamageMultiplier: 0.33,
    overpenetrationDamageMultiplier: 0.1,
    moduleDamageMultiplier: 0.58,
  },
} as const;

export const TURRET = {
  traverseRadiansPerSecond: 12 * Math.PI / 180,
  fireToleranceRadians: 2.5 * Math.PI / 180,
} as const;

export const MODULE_MAX_HEALTH = {
  gun: 180,
  torpedoTubes: 150,
  engine: 220,
  steering: 160,
  magazine: 150,
  crew: 240,
} as const;

export const BASE_REPAIR_PER_SECOND = {
  gun: 1.15,
  torpedoTubes: 1.05,
  engine: 1.0,
  steering: 1.25,
  magazine: 0.55,
  crew: 0.18,
} as const;
