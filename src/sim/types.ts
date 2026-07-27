import type { MainGunId } from "../ships/components";
import type { HullId } from "../ships/hulls";
import type { ShipClassId } from "../ships/classes";
import type { TorpedoId } from "../ships/torpedoes";
import type { SecondaryGunId } from "../ships/secondaryGuns";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Team = "player" | "enemy";
export type GameMode = "battle" | "sea-trials";
export type CompartmentId = "bow" | "bridge" | "engineRoom" | "magazine" | "stern";
export type ModuleId = "gun" | "torpedoTubes" | "engine" | "steering" | "magazine" | "crew";
export type BattleStatus = "running" | "player-won" | "enemy-won" | "draw";
export type BattleEndReason = "destroyed" | "score" | "time";
export type WeaponSlot = "mainGun" | "torpedo" | "aircraft";
export type TorpedoSpreadMode = "narrow" | "wide";
export type TorpedoFireRejectReason =
  | "destroyed" | "reloading" | "empty" | "sector" | "aligning";
export type DepthChargeFireRejectReason =
  | "wrong-hull" | "not-installed" | "reloading" | "empty" | "no-target";
export type ProjectileKind = "shell" | "torpedo";
export type AmmoType = "he" | "ap";
export type PenetrationResult = "penetration" | "overpenetration" | "ricochet" | "shatter";
export type ArmorZoneId = "side" | "end" | "deck" | "superstructure";
export type DamageControlPriority = "balanced" | "fire" | "flood" | "module";
export type PerceptionMode = "unaware" | "acquiring" | "tracking" | "lost" | "searching";
export type SecondaryBatteryStatus =
  | "unavailable" | "disabled" | "searching" | "acquiring"
  | "out-of-range" | "sector" | "traversing" | "reloading" | "firing";

export interface ShellPenetrationProfile {
  caliberMm: number;
  hePenetrationMm: number;
  apMuzzlePenetrationMm: number;
  apMinimumPenetrationMm: number;
  apPenetrationLossMmPerSecond: number;
  apOvermatchArmorMm: number;
  apFuseArmingArmorMm: number;
  apFuseTravelMeters: number;
  apNormalizationDegrees: number;
}

export interface DamageControlAllocation {
  fire: number;
  flood: number;
  module: number;
  hull: number;
}

export interface ObjectiveState {
  center: Vec3;
  radius: number;
  captureProgress: number;
  owner?: Team;
  capturingTeam?: Team;
  contested: boolean;
  occupants: Record<Team, number>;
  scores: Record<Team, number>;
}

export type ObjectiveObservation = Omit<ObjectiveState, "occupants">;

export interface SensorContact {
  id: string;
  team: Team;
  observedAt: number;
  position: Vec3;
  heading: number;
  speedKnots: number;
  rangeMeters: number;
  confidence: number;
  estimatedHullRatio: number;
}

export interface SensorSnapshot {
  sampleIndex: number;
  hydroActive: boolean;
  gunBloomSignature: string;
  contacts: SensorContact[];
}

export interface PerceptionTelemetry {
  mode: PerceptionMode;
  confidence: number;
  lastObservedAt?: number;
  estimatedPosition?: Vec3;
}

export interface PlayerTargetView {
  id: string;
  team: Team;
  mode: PerceptionMode;
  live: boolean;
  confidence: number;
  lastObservedAt: number;
  position: Vec3;
  heading: number;
  speedKnots: number;
  rangeMeters: number;
  estimatedHullRatio: number;
}

export interface ModuleState {
  health: number;
  maxHealth: number;
}

export interface ShipPerformanceModifiers {
  maxSpeedMultiplier: number;
  accelerationMultiplier: number;
  turnMultiplier: number;
  reloadMultiplier: number;
  magazineRiskMultiplier: number;
}

export interface SecondaryMountState {
  definitionId: SecondaryGunId;
  side: -1 | 1;
  longitudinalOffset: number;
  heading: number;
  reloadRemaining: number;
}

export interface MainBatteryMountState {
  /** Index into the effective main-battery mount layout. */
  mountIndex: number;
  /** Absolute world heading of this turret. */
  heading: number;
  /** Bow-relative neutral heading, cached to keep the simulation hot path allocation-free. */
  restHeadingOffset: number;
  reloadRemaining: number;
  health: number;
  maxHealth: number;
  lastFiredAt?: number;
}

export interface ShipState {
  id: string;
  team: Team;
  hullId: HullId;
  shipClassId: ShipClassId;
  position: Vec3;
  previousPosition: Vec3;
  heading: number;
  turretHeading: number;
  speedKnots: number;
  throttle: number;
  rudderCommand: number;
  rudder: number;
  hull: number;
  maxHull: number;
  recoverableHull: number;
  compartments: Record<CompartmentId, number>;
  modules: Record<ModuleId, ModuleState>;
  mainGunId: MainGunId;
  torpedoId: TorpedoId;
  mainGunMounts: number;
  mainBatteryMounts: MainBatteryMountState[];
  torpedoLauncherMounts: number;
  depthChargeMounts: number;
  secondaryMounts: SecondaryMountState[];
  secondaryBatteryStatus: SecondaryBatteryStatus;
  secondaryTargetId?: string;
  secondaryAcquisitionSamples: number;
  secondaryLastObservationAt?: number;
  lastSecondaryFiredAt?: number;
  performance: ShipPerformanceModifiers;
  gunTraverseBlocked: boolean;
  reloadRemaining: number;
  torpedoReloadRemaining: number;
  torpedoReloadDuration: number;
  torpedoLauncherHeading: number;
  torpedoesLoaded: number;
  torpedoReserveSalvos: number;
  torpedoFireRejectReason?: TorpedoFireRejectReason;
  torpedoFireRejectedAt?: number;
  torpedoSpreadMode: TorpedoSpreadMode;
  depthChargeReloadRemaining: number;
  depthChargeSalvos: number;
  depthChargeFireRejectReason?: DepthChargeFireRejectReason;
  depthChargeFireRejectedAt?: number;
  aimPoint: Vec3;
  /** Shell currently inside the gun breech and used by the next salvo. */
  ammoType: AmmoType;
  /** Player/AI selection waiting for the current reload cycle to finish. */
  pendingAmmoType?: AmmoType;
  fireIntensity: number;
  flooding: number;
  smokeCharges: number;
  smokeCooldownRemaining: number;
  smokeDeploymentRemaining: number;
  smokeNextPuffAt: number;
  hydroCharges: number;
  hydroCooldownRemaining: number;
  hydroActiveRemaining: number;
  lastMainGunFiredAt?: number;
  damageControlPriority: DamageControlPriority;
  damageControlAllocation: DamageControlAllocation;
  damageControlModule?: ModuleId;
  hullRepairActive: boolean;
  perception?: PerceptionTelemetry;
  distanceTravelled: number;
  turnRateRadians: number;
  isTestTarget?: boolean;
}

export interface SmokeCloudState {
  id: number;
  ownerId: string;
  ownerTeam: Team;
  position: Vec3;
  radius: number;
  spawnedAt: number;
  expiresAt: number;
}

export interface ProjectileState {
  id: number;
  ownerId: string;
  team: Team;
  kind: ProjectileKind;
  ammoType?: AmmoType;
  weaponSource?: "mainGun" | "secondary";
  shellProfile?: ShellPenetrationProfile;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  damage: number;
  age: number;
  distanceTravelled?: number;
  armingDistance?: number;
  maximumRange?: number;
  detectionRange?: number;
}

export interface DepthChargeState {
  id: number;
  ownerId: string;
  team: Team;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  age: number;
  detonationDepth: number;
  blastRadius: number;
  damage: number;
}

export interface UnderwaterTargetState {
  id: string;
  position: Vec3;
  previousPosition: Vec3;
  hull: number;
  maxHull: number;
  radius: number;
  length: number;
  isTrainingTarget?: boolean;
}

export interface ShotEvent {
  id: number;
  ownerId: string;
  team: Team;
  kind: ProjectileKind | "depthCharge";
  ammoType?: AmmoType;
  weaponSource?: "mainGun" | "secondary";
  position: Vec3;
}

export interface ImpactEvent {
  id: number;
  kind: "hit" | "splash" | "collision" | "underwater-explosion";
  position: Vec3;
  targetId?: string;
  damage?: number;
  compartment?: CompartmentId;
  module?: ModuleId;
  moduleDamage?: number;
  startedFire?: boolean;
  startedFlooding?: boolean;
  otherShipId?: string;
  ammoType?: AmmoType;
  penetrationResult?: PenetrationResult;
  armorThicknessMm?: number;
  penetrationMm?: number;
  effectiveArmorMm?: number;
  impactAngleDegrees?: number;
  armorZone?: ArmorZoneId;
  projectileKind?: ProjectileKind | "depthCharge";
  weaponSource?: "mainGun" | "secondary";
}

export interface TorpedoThreat {
  id: number;
  position: Vec3;
  velocity: Vec3;
  distanceMeters: number;
  armed: boolean;
  side: "port" | "starboard";
  closingSpeedMetersPerSecond: number;
  closestApproachMeters: number;
  timeToClosestApproach: number;
}

export interface TorpedoLaunchSolution {
  allowed: boolean;
  bearing: number;
  relativeBearing: number;
  side: "port" | "starboard";
  directions: number[];
}

export interface BattleState {
  mode: GameMode;
  time: number;
  status: BattleStatus;
  endReason?: BattleEndReason;
  objective: ObjectiveState;
  ships: ShipState[];
  projectiles: ProjectileState[];
  depthCharges: DepthChargeState[];
  underwaterTargets: UnderwaterTargetState[];
  shots: ShotEvent[];
  impacts: ImpactEvent[];
  smokeClouds: SmokeCloudState[];
  nextEntityId: number;
  randomSeed: number;
  collisionCooldowns: Record<string, number>;
  sensorSnapshots: Record<string, SensorSnapshot>;
}

export interface ControlCommand {
  throttle: number;
  rudder: number;
  aimPoint: Vec3;
  fire: boolean;
  weaponSlot?: WeaponSlot;
  repairHull?: boolean;
  damageControlPriority?: DamageControlPriority;
  ammoType?: AmmoType;
  torpedoSpread?: TorpedoSpreadMode;
  activateSmoke?: boolean;
  activateHydro?: boolean;
  deployDepthCharge?: boolean;
  perception?: PerceptionTelemetry;
}

export interface Observation {
  self: Readonly<ShipState>;
  contacts: readonly Readonly<SensorContact>[];
  objective: Readonly<ObjectiveObservation>;
  incomingTorpedoes: readonly Readonly<TorpedoThreat>[];
  time: number;
}

export interface Controller {
  command(observation: Observation): ControlCommand;
}
