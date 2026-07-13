import type { MainGunId } from "../ships/components";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Team = "player" | "enemy";
export type GameMode = "battle" | "sea-trials";
export type CompartmentId = "bow" | "bridge" | "engineRoom" | "magazine" | "stern";
export type ModuleId = "gun" | "engine" | "steering" | "magazine" | "crew";
export type BattleStatus = "running" | "player-won" | "enemy-won" | "draw";
export type BattleEndReason = "destroyed" | "time";
export type WeaponSlot = "mainGun" | "torpedo" | "aircraft";
export type ProjectileKind = "shell" | "torpedo";

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
  rudder: number;
  hull: number;
  maxHull: number;
  recoverableHull: number;
  compartments: Record<CompartmentId, number>;
  modules: Record<ModuleId, ModuleState>;
  mainGunId: MainGunId;
  performance: ShipPerformanceModifiers;
  gunTraverseBlocked: boolean;
  reloadRemaining: number;
  torpedoReloadRemaining: number;
  aimPoint: Vec3;
  fireIntensity: number;
  flooding: number;
  distanceTravelled: number;
  turnRateRadians: number;
  isTestTarget?: boolean;
}

export interface ProjectileState {
  id: number;
  ownerId: string;
  team: Team;
  kind: ProjectileKind;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  damage: number;
  age: number;
}

export interface ShotEvent {
  id: number;
  ownerId: string;
  team: Team;
  kind: ProjectileKind;
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
}

export interface BattleState {
  mode: GameMode;
  time: number;
  status: BattleStatus;
  endReason?: BattleEndReason;
  ships: ShipState[];
  projectiles: ProjectileState[];
  shots: ShotEvent[];
  impacts: ImpactEvent[];
  nextEntityId: number;
  randomSeed: number;
  collisionCooldowns: Record<string, number>;
}

export interface ControlCommand {
  throttle: number;
  rudder: number;
  aimPoint: Vec3;
  fire: boolean;
  weaponSlot?: WeaponSlot;
  repairHull?: boolean;
}

export interface Observation {
  self: Readonly<ShipState>;
  enemies: readonly Readonly<ShipState>[];
  time: number;
}

export interface Controller {
  command(observation: Observation): ControlCommand;
}
