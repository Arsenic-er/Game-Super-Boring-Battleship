import type { MainGunId } from "../ships/components";
import type { TorpedoId } from "../ships/torpedoes";

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
export type ProjectileKind = "shell" | "torpedo";
export type AmmoType = "he" | "ap";
export type PenetrationResult = "penetration" | "overpenetration" | "ricochet" | "shatter";
export type ArmorZoneId = "side" | "end" | "deck";
export type DamageControlPriority = "balanced" | "fire" | "flood" | "module";
export type PerceptionMode = "unaware" | "acquiring" | "tracking" | "lost" | "searching";

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

export interface ShipState {
  id: string;
  team: Team;
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
  aimPoint: Vec3;
  ammoType: AmmoType;
  fireIntensity: number;
  flooding: number;
  smokeCharges: number;
  smokeCooldownRemaining: number;
  smokeDeploymentRemaining: number;
  smokeNextPuffAt: number;
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

export interface ShotEvent {
  id: number;
  ownerId: string;
  team: Team;
  kind: ProjectileKind;
  ammoType?: AmmoType;
  position: Vec3;
}

export interface ImpactEvent {
  id: number;
  kind: "hit" | "splash" | "collision";
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
  effectiveArmorMm?: number;
  impactAngleDegrees?: number;
  armorZone?: ArmorZoneId;
  projectileKind?: ProjectileKind;
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
