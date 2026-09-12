import { RuleBasedAi } from "../controllers/ruleBasedAi";
import { DEFAULT_MAIN_GUN_ID } from "../ships/components";
import type { MainGunId } from "../ships/components";
import {
  DEFAULT_SHIP_CLASS_ID,
  getShipClass,
} from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import { DEFAULT_TORPEDO_ID } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import type { SecondaryGunId } from "../ships/secondaryGuns";
import { BATTLE_DURATION_SECONDS, BATTLE_SPAWN, FIXED_STEP } from "./config";
import {
  createDeveloperShipState,
  createInitialState,
  observe,
  stepSimulation,
} from "./simulation";
import type {
  BattleEndReason,
  BattleState,
  BattleStatus,
  PerceptionMode,
  ShipPerformanceModifiers,
  Team,
} from "./types";

export type BalanceLoadoutPreset = "baseline" | "standard";
export type BalanceSpawnSide = "default" | "mirrored";

/**
 * A render-free ship setup for deterministic balance experiments.
 *
 * `baseline` keeps the original laboratory's one-main-mount assumption while
 * `standard` fills every historical starter mount declared by the ship class.
 * Explicit mount counts make focused weapon-isolation experiments possible.
 */
export interface BalanceShipConfiguration {
  shipClassId: ShipClassId;
  loadoutPreset?: BalanceLoadoutPreset;
  mainGunId?: MainGunId;
  torpedoId?: TorpedoId;
  mainGunMounts?: number;
  torpedoLauncherMounts?: number;
  depthChargeMounts?: number;
  antiAirMounts?: number;
  secondaryGunIds?: readonly SecondaryGunId[];
  performance?: Partial<ShipPerformanceModifiers>;
}

export interface BalanceScenario {
  player?: BalanceShipConfiguration;
  enemy?: BalanceShipConfiguration;
  spawnSide?: BalanceSpawnSide;
}

export interface BalanceBatchOptions extends BalanceScenario {
  runs: number;
  firstSeed?: number;
  maximumSeconds?: number;
}

export interface BalanceMatrixMatchup {
  id?: string;
  player: BalanceShipConfiguration;
  enemy: BalanceShipConfiguration;
}

export interface BalanceMatrixOptions {
  matchups: readonly BalanceMatrixMatchup[];
  runsPerSpawn?: number;
  firstSeed?: number;
  maximumSeconds?: number;
  includeMirroredSpawns?: boolean;
}

export interface BalanceMatrixEntry {
  id: string;
  player: BalanceShipConfiguration;
  enemy: BalanceShipConfiguration;
  defaultSpawn: BalanceReport;
  mirroredSpawn?: BalanceReport;
  combined: BalanceReport;
  /** Positive means the default player-side spawn helped the configured player ship. */
  spawnPlayerWinRateDelta?: number;
}

export interface BalanceMatrixReport {
  runs: number;
  entries: BalanceMatrixEntry[];
}

export interface TeamCombatMetrics {
  shots: number;
  salvos: number;
  hits: number;
  effectiveHits: number;
  citadels: number;
  penetrations: number;
  overpenetrations: number;
  ricochets: number;
  shatters: number;
  damage: number;
  firesStarted: number;
  floodsStarted: number;
  moduleHits: number;
  torpedoesLaunched: number;
  torpedoHits: number;
  torpedoDamage: number;
  shellsFired: number;
  shellHits: number;
  perceptionSeconds: Record<PerceptionMode, number>;
  shotsWhileUntracked: number;
}

export interface BattleTelemetry {
  seed: number;
  status: BattleStatus;
  endReason?: BattleEndReason;
  durationSeconds: number;
  firstHitSeconds?: number;
  firstTrackingSeconds: Partial<Record<Team, number>>;
  player: TeamCombatMetrics;
  enemy: TeamCombatMetrics;
  collisions: number;
  firstCaptureSeconds?: number;
  contestedSeconds: number;
  playerControlSeconds: number;
  enemyControlSeconds: number;
  finalScores: Record<Team, number>;
  finalStateFingerprint: string;
}

export interface PercentileSummary {
  p25: number;
  p50: number;
  p75: number;
}

export interface BalanceReport {
  runs: number;
  playerWins: number;
  enemyWins: number;
  draws: number;
  destroyedBattles: number;
  scoreBattles: number;
  timedBattles: number;
  noCaptureBattles: number;
  playerWinRate: number;
  durationSeconds: PercentileSummary;
  firstHitSeconds: PercentileSummary;
  playerHitRate: number;
  enemyHitRate: number;
  playerEffectiveHitRate: number;
  enemyEffectiveHitRate: number;
  averagePlayerShots: number;
  averageEnemyShots: number;
  averagePlayerSalvos: number;
  averageEnemySalvos: number;
  averagePlayerDamage: number;
  averageEnemyDamage: number;
  penetrationResults: {
    citadels: number;
    penetrations: number;
    overpenetrations: number;
    ricochets: number;
    shatters: number;
  };
  firesPerBattle: number;
  floodsPerBattle: number;
  collisionsPerBattle: number;
  averageContestedSeconds: number;
  averagePlayerControlSeconds: number;
  averageEnemyControlSeconds: number;
  averagePlayerScore: number;
  averageEnemyScore: number;
  firstTrackingSeconds: {
    player: PercentileSummary;
    enemy: PercentileSummary;
  };
  averageTrackingFraction: Record<Team, number>;
  shotsWhileUntracked: number;
  torpedoHitRate: number;
  averageTorpedoSalvosPerTeam: number;
  torpedoDamageShare: number;
  playerGunHitRate: number;
  enemyGunHitRate: number;
}

const emptyTeamMetrics = (): TeamCombatMetrics => ({
  shots: 0,
  salvos: 0,
  hits: 0,
  effectiveHits: 0,
  citadels: 0,
  penetrations: 0,
  overpenetrations: 0,
  ricochets: 0,
  shatters: 0,
  damage: 0,
  firesStarted: 0,
  floodsStarted: 0,
  moduleHits: 0,
  torpedoesLaunched: 0,
  torpedoHits: 0,
  torpedoDamage: 0,
  shellsFired: 0,
  shellHits: 0,
  perceptionSeconds: {
    unaware: 0,
    acquiring: 0,
    tracking: 0,
    lost: 0,
    searching: 0,
  },
  shotsWhileUntracked: 0,
});

const round = (value: number, digits = 4): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/**
 * Produces a compact deterministic representation suitable for regression
 * hashes without coupling tests to render-only state.
 */
export function battleStateFingerprint(state: BattleState): string {
  return JSON.stringify({
    mode: state.mode,
    time: round(state.time, 6),
    status: state.status,
    endReason: state.endReason ?? null,
    randomSeed: state.randomSeed,
    objective: {
      captureProgress: round(state.objective.captureProgress),
      owner: state.objective.owner ?? null,
      capturingTeam: state.objective.capturingTeam ?? null,
      contested: state.objective.contested,
      occupants: state.objective.occupants,
      scores: {
        player: round(state.objective.scores.player),
        enemy: round(state.objective.scores.enemy),
      },
    },
    ships: [...state.ships]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((ship) => ({
        id: ship.id,
        hullId: ship.hullId,
        position: {
          x: round(ship.position.x),
          y: round(ship.position.y),
          z: round(ship.position.z),
        },
        heading: round(ship.heading, 6),
        turretHeading: round(ship.turretHeading, 6),
        speedKnots: round(ship.speedKnots),
        hull: round(ship.hull),
        ammoType: ship.ammoType,
        pendingAmmoType: ship.pendingAmmoType ?? null,
        torpedoId: ship.torpedoId,
        recoverableHull: round(ship.recoverableHull),
        compartments: Object.fromEntries(
          Object.entries(ship.compartments).map(([id, health]) => [id, round(health)]),
        ),
        modules: Object.fromEntries(
          Object.entries(ship.modules).map(([id, module]) => [id, round(module.health)]),
        ),
        reloadRemaining: round(ship.reloadRemaining),
        torpedoReloadRemaining: round(ship.torpedoReloadRemaining),
        torpedoReloadDuration: round(ship.torpedoReloadDuration),
        torpedoLauncherHeading: round(ship.torpedoLauncherHeading, 6),
        torpedoesLoaded: ship.torpedoesLoaded,
        torpedoReserveSalvos: ship.torpedoReserveSalvos,
        fireIntensity: round(ship.fireIntensity),
        flooding: round(ship.flooding),
        smokeCharges: ship.smokeCharges,
        smokeCooldownRemaining: round(ship.smokeCooldownRemaining),
        smokeDeploymentRemaining: round(ship.smokeDeploymentRemaining),
        hydroCharges: ship.hydroCharges,
        hydroCooldownRemaining: round(ship.hydroCooldownRemaining),
        hydroActiveRemaining: round(ship.hydroActiveRemaining),
        secondaryBatteryStatus: ship.secondaryBatteryStatus,
        secondaryTargetId: ship.secondaryTargetId ?? null,
        secondaryAcquisitionSamples: ship.secondaryAcquisitionSamples,
        secondaryMounts: ship.secondaryMounts.map((mount) => ({
          definitionId: mount.definitionId,
          side: mount.side,
          longitudinalOffset: round(mount.longitudinalOffset),
          heading: round(mount.heading, 6),
          reloadRemaining: round(mount.reloadRemaining),
        })),
      })),
    airSquadrons: [...state.airSquadrons]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((squadron) => ({
        id: squadron.id,
        controllerId: squadron.controllerId,
        role: squadron.role,
        recoverySource: squadron.recoverySource.kind === "mapEdge"
          ? {
            kind: squadron.recoverySource.kind,
            position: {
              x: round(squadron.recoverySource.position.x),
              y: round(squadron.recoverySource.position.y),
              z: round(squadron.recoverySource.position.z),
            },
          } : { ...squadron.recoverySource },
        contactsByTeam: Object.fromEntries(
          Object.entries(squadron.contactsByTeam)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([team, contact]) => [team, {
              observedAt: round(contact.observedAt),
              lastKnownPosition: {
                x: round(contact.lastKnownPosition.x),
                y: round(contact.lastKnownPosition.y),
                z: round(contact.lastKnownPosition.z),
              },
              confidence: round(contact.confidence),
            }]),
        ),
        phase: squadron.phase,
        position: {
          x: round(squadron.position.x),
          y: round(squadron.position.y),
          z: round(squadron.position.z),
        },
        previousPosition: {
          x: round(squadron.previousPosition.x),
          y: round(squadron.previousPosition.y),
          z: round(squadron.previousPosition.z),
        },
        heading: round(squadron.heading, 6),
        flight: squadron.flight ? {
          speedMetersPerSecond: round(squadron.flight.speedMetersPerSecond, 6),
          pitch: round(squadron.flight.pitch, 6),
          bank: round(squadron.flight.bank, 6),
        } : undefined,
        aircraftOperational: squadron.aircraftOperational,
        airframeHealth: round(squadron.airframeHealth),
        maxAirframeHealth: round(squadron.maxAirframeHealth),
        ammoRemaining: squadron.ammoRemaining,
        ordnanceRemaining: squadron.ordnanceRemaining,
        cohesion: round(squadron.cohesion),
        fuelRemainingSeconds: round(squadron.fuelRemainingSeconds),
        phaseStartedAt: round(squadron.phaseStartedAt),
        lastUpdatedAt: round(squadron.lastUpdatedAt),
        order: squadron.order ? {
          kind: squadron.order.kind,
          targetId: squadron.order.targetId ?? null,
          candidateTargetIds: squadron.order.candidateTargetIds ?? null,
          activeTargetId: squadron.order.activeTargetId ?? null,
          area: squadron.order.area ? {
            center: {
              x: round(squadron.order.area.center.x),
              y: round(squadron.order.area.center.y),
              z: round(squadron.order.area.center.z),
            },
            radius: round(squadron.order.area.radius),
          } : null,
          selectedWeapon: squadron.order.selectedWeapon ?? null,
          lastKnownPosition: squadron.order.lastKnownPosition ? {
            x: round(squadron.order.lastKnownPosition.x),
            y: round(squadron.order.lastKnownPosition.y),
            z: round(squadron.order.lastKnownPosition.z),
          } : null,
          lastKnownPositions: Object.fromEntries(
            Object.entries(squadron.order.lastKnownPositions ?? {})
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([id, position]) => [id, {
                x: round(position.x), y: round(position.y), z: round(position.z),
              }]),
          ),
          issuedAt: round(squadron.order.issuedAt),
        } : null,
      })),
    smokeClouds: [...state.smokeClouds]
      .sort((left, right) => left.id - right.id)
      .map((cloud) => ({
        id: cloud.id,
        ownerId: cloud.ownerId,
        position: {
          x: round(cloud.position.x),
          z: round(cloud.position.z),
        },
        expiresAt: round(cloud.expiresAt),
      })),
    projectiles: [...state.projectiles]
      .sort((left, right) => left.id - right.id)
      .map((projectile) => ({
        id: projectile.id,
        ownerId: projectile.ownerId,
        kind: projectile.kind,
        ammoType: projectile.ammoType ?? null,
        weaponSource: projectile.weaponSource ?? null,
        position: {
          x: round(projectile.position.x),
          y: round(projectile.position.y),
          z: round(projectile.position.z),
        },
        velocity: {
          x: round(projectile.velocity.x),
          y: round(projectile.velocity.y),
          z: round(projectile.velocity.z),
        },
        detectionRange: round(projectile.detectionRange ?? 0),
      })),
    depthCharges: [...state.depthCharges]
      .sort((left, right) => left.id - right.id)
      .map((charge) => ({
        id: charge.id,
        ownerId: charge.ownerId,
        position: {
          x: round(charge.position.x),
          y: round(charge.position.y),
          z: round(charge.position.z),
        },
        age: round(charge.age),
      })),
    underwaterTargets: state.underwaterTargets.map((target) => ({
      id: target.id,
      hull: round(target.hull),
      position: {
        x: round(target.position.x),
        y: round(target.position.y),
        z: round(target.position.z),
      },
    })),
  });
}

const DEFAULT_PERFORMANCE: ShipPerformanceModifiers = {
  maxSpeedMultiplier: 1,
  accelerationMultiplier: 1,
  turnMultiplier: 1,
  reloadMultiplier: 1,
  magazineRiskMultiplier: 1,
};

function clampMountCount(value: number, minimum = 0): number {
  return Math.max(minimum, Math.floor(value));
}

function configuredShip(
  id: string,
  team: Team,
  configuration: BalanceShipConfiguration,
  position: { x: number; z: number },
  heading: number,
) {
  const definition = getShipClass(configuration.shipClassId);
  const preset = configuration.loadoutPreset ?? "standard";
  const standard = preset === "standard";
  const mainGunMounts = clampMountCount(
    configuration.mainGunMounts ?? (standard ? definition.starterSlots.mainGun : 1),
    1,
  );
  const torpedoLauncherMounts = clampMountCount(
    configuration.torpedoLauncherMounts ?? (standard
      ? definition.starterSlots.torpedo
      : Math.min(1, definition.slotCounts.torpedo)),
  );
  const depthChargeMounts = clampMountCount(
    configuration.depthChargeMounts ?? (standard
      ? definition.starterSlots.depthCharge
      : Math.min(1, definition.slotCounts.depthCharge)),
  );
  const antiAirMounts = clampMountCount(
    configuration.antiAirMounts ?? definition.starterSlots.antiAir,
  );
  const secondaryGunIds = configuration.secondaryGunIds
    ? [...configuration.secondaryGunIds]
    : Array.from(
      { length: definition.starterSlots.sideGun },
      () => "sideGun-common" as const,
    );

  return createDeveloperShipState({
    id,
    team,
    shipClassId: configuration.shipClassId,
    position: { x: position.x, y: 0, z: position.z },
    heading,
    mainGunId: configuration.mainGunId ?? DEFAULT_MAIN_GUN_ID,
    torpedoId: configuration.torpedoId ?? DEFAULT_TORPEDO_ID,
    mainGunMounts,
    torpedoLauncherMounts,
    depthChargeMounts,
    antiAirMounts,
    secondaryGunIds,
    performance: { ...DEFAULT_PERFORMANCE, ...configuration.performance },
    aiControlled: true,
    countsForVictory: true,
  });
}

/**
 * Builds a configurable battle state while leaving the legacy no-argument
 * setup byte-for-byte compatible with `createInitialState`.
 */
export function createBalanceInitialState(
  seed: number,
  scenario?: BalanceScenario,
): BattleState {
  const state = createInitialState(seed, "battle");
  if (!scenario) return state;

  const playerConfiguration: BalanceShipConfiguration = scenario.player ?? {
    shipClassId: DEFAULT_SHIP_CLASS_ID,
    loadoutPreset: "standard",
  };
  const enemyConfiguration: BalanceShipConfiguration = scenario.enemy ?? {
    ...playerConfiguration,
    performance: playerConfiguration.performance
      ? { ...playerConfiguration.performance }
      : undefined,
    secondaryGunIds: playerConfiguration.secondaryGunIds
      ? [...playerConfiguration.secondaryGunIds]
      : undefined,
  };
  const mirrored = scenario.spawnSide === "mirrored";
  const playerSpawn = mirrored ? BATTLE_SPAWN.enemy : BATTLE_SPAWN.player;
  const enemySpawn = mirrored ? BATTLE_SPAWN.player : BATTLE_SPAWN.enemy;
  state.ships = [
    configuredShip(
      "player",
      "player",
      playerConfiguration,
      playerSpawn,
      mirrored ? Math.PI : 0,
    ),
    configuredShip(
      "enemy",
      "enemy",
      enemyConfiguration,
      enemySpawn,
      mirrored ? 0 : Math.PI,
    ),
  ];
  return state;
}

export function runHeadlessBattle(
  seed: number,
  maximumSeconds = BATTLE_DURATION_SECONDS,
  scenario?: BalanceScenario,
): BattleTelemetry {
  const state = createBalanceInitialState(seed, scenario);
  const firstControllerSeed = (seed ^ 0x51f15e) >>> 0;
  const secondControllerSeed = (seed ^ 0xa11ce) >>> 0;
  // Alternate controller seeds between map spawns so a persistent personality
  // advantage is not misreported as a hull, ammo or objective imbalance.
  const swapControllerSeeds = (seed & 1) === 0;
  const controllers = {
    player: new RuleBasedAi(
      swapControllerSeeds ? secondControllerSeed : firstControllerSeed,
    ),
    enemy: new RuleBasedAi(
      swapControllerSeeds ? firstControllerSeed : secondControllerSeed,
    ),
  };
  const metrics: Record<Team, TeamCombatMetrics> = {
    player: emptyTeamMetrics(),
    enemy: emptyTeamMetrics(),
  };
  let firstHitSeconds: number | undefined;
  const firstTrackingSeconds: Partial<Record<Team, number>> = {};
  let firstCaptureSeconds: number | undefined;
  let collisions = 0;
  let contestedSeconds = 0;
  let playerControlSeconds = 0;
  let enemyControlSeconds = 0;
  // One guard tick avoids floating-point drift at the configured boundary
  // leaving a nominally complete battle in the "running" state.
  const maximumSteps = Math.ceil(maximumSeconds / FIXED_STEP) + 1;

  for (let step = 0; step < maximumSteps && state.status === "running"; step += 1) {
    const commands = new Map([
      ["player", controllers.player.command(observe(state, "player"))],
      ["enemy", controllers.enemy.command(observe(state, "enemy"))],
    ]);
    for (const [shipId, command] of commands) {
      const team = state.ships.find((ship) => ship.id === shipId)?.team;
      const mode = command.perception?.mode;
      if (!team || !mode) continue;
      metrics[team].perceptionSeconds[mode] += FIXED_STEP;
      if (mode === "tracking") firstTrackingSeconds[team] ??= state.time;
    }
    stepSimulation(state, commands, FIXED_STEP);
    if (state.objective.owner) firstCaptureSeconds ??= state.time;
    if (state.objective.contested) contestedSeconds += FIXED_STEP;
    if (state.objective.owner === "player") playerControlSeconds += FIXED_STEP;
    if (state.objective.owner === "enemy") enemyControlSeconds += FIXED_STEP;

    const teamsFiring = new Set<Team>();
    for (const shot of state.shots) {
      metrics[shot.team].shots += 1;
      if (shot.kind === "torpedo") metrics[shot.team].torpedoesLaunched += 1;
      else metrics[shot.team].shellsFired += 1;
      if (shot.weaponSource !== "secondary"
        && commands.get(shot.ownerId)?.perception?.mode !== "tracking") {
        metrics[shot.team].shotsWhileUntracked += 1;
      }
      teamsFiring.add(shot.team);
    }
    for (const team of teamsFiring) metrics[team].salvos += 1;

    for (const impact of state.impacts) {
      if (impact.kind === "collision") {
        collisions += 1;
        continue;
      }
      if (impact.kind !== "hit" || !impact.targetId) continue;
      const target = state.ships.find((ship) => ship.id === impact.targetId);
      if (!target) continue;
      const attacker: Team = target.team === "player" ? "enemy" : "player";
      metrics[attacker].hits += 1;
      metrics[attacker].damage += impact.damage ?? 0;
      if (impact.projectileKind === "torpedo") {
        metrics[attacker].torpedoHits += 1;
        metrics[attacker].torpedoDamage += impact.damage ?? 0;
      } else if (impact.projectileKind === "shell") {
        metrics[attacker].shellHits += 1;
      }
      if ((impact.damage ?? 0) > 0) metrics[attacker].effectiveHits += 1;
      if (impact.citadel) metrics[attacker].citadels += 1;
      else if (impact.penetrationResult === "penetration") metrics[attacker].penetrations += 1;
      if (impact.penetrationResult === "overpenetration") {
        metrics[attacker].overpenetrations += 1;
      }
      if (impact.penetrationResult === "ricochet") metrics[attacker].ricochets += 1;
      if (impact.penetrationResult === "shatter") metrics[attacker].shatters += 1;
      if (impact.startedFire) metrics[attacker].firesStarted += 1;
      if (impact.startedFlooding) metrics[attacker].floodsStarted += 1;
      if (impact.module) metrics[attacker].moduleHits += 1;
      firstHitSeconds ??= state.time;
    }
  }

  return {
    seed: seed >>> 0,
    status: state.status,
    endReason: state.endReason,
    durationSeconds: state.time,
    firstHitSeconds,
    firstTrackingSeconds,
    player: metrics.player,
    enemy: metrics.enemy,
    collisions,
    firstCaptureSeconds,
    contestedSeconds,
    playerControlSeconds,
    enemyControlSeconds,
    finalScores: { ...state.objective.scores },
    finalStateFingerprint: battleStateFingerprint(state),
  };
}

const percentile = (values: readonly number[], fraction: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return round(sorted[index] ?? 0, 2);
};

const percentiles = (values: readonly number[]): PercentileSummary => ({
  p25: percentile(values, 0.25),
  p50: percentile(values, 0.5),
  p75: percentile(values, 0.75),
});

const safeRate = (numerator: number, denominator: number): number =>
  denominator <= 0 ? 0 : numerator / denominator;

export function summarizeBattles(battles: readonly BattleTelemetry[]): BalanceReport {
  const runs = battles.length;
  const total = (select: (battle: BattleTelemetry) => number): number =>
    battles.reduce((sum, battle) => sum + select(battle), 0);
  const playerShots = total((battle) => battle.player.shots);
  const enemyShots = total((battle) => battle.enemy.shots);
  const fires = total((battle) => battle.player.firesStarted + battle.enemy.firesStarted);
  const floods = total((battle) => battle.player.floodsStarted + battle.enemy.floodsStarted);
  const torpedoesLaunched = total(
    (battle) => battle.player.torpedoesLaunched + battle.enemy.torpedoesLaunched,
  );
  const torpedoHits = total(
    (battle) => battle.player.torpedoHits + battle.enemy.torpedoHits,
  );
  const torpedoDamage = total(
    (battle) => battle.player.torpedoDamage + battle.enemy.torpedoDamage,
  );
  const allDamage = total((battle) => battle.player.damage + battle.enemy.damage);

  return {
    runs,
    playerWins: battles.filter((battle) => battle.status === "player-won").length,
    enemyWins: battles.filter((battle) => battle.status === "enemy-won").length,
    draws: battles.filter((battle) => battle.status === "draw").length,
    destroyedBattles: battles.filter((battle) => battle.endReason === "destroyed").length,
    scoreBattles: battles.filter((battle) => battle.endReason === "score").length,
    timedBattles: battles.filter((battle) => battle.endReason === "time").length,
    noCaptureBattles: battles.filter((battle) => battle.firstCaptureSeconds === undefined).length,
    playerWinRate: round(safeRate(
      battles.filter((battle) => battle.status === "player-won").length,
      runs,
    ), 4),
    durationSeconds: percentiles(battles.map((battle) => battle.durationSeconds)),
    firstHitSeconds: percentiles(
      battles.flatMap((battle) =>
        battle.firstHitSeconds === undefined ? [] : [battle.firstHitSeconds]),
    ),
    playerHitRate: round(safeRate(total((battle) => battle.player.hits), playerShots), 4),
    enemyHitRate: round(safeRate(total((battle) => battle.enemy.hits), enemyShots), 4),
    playerEffectiveHitRate: round(
      safeRate(total((battle) => battle.player.effectiveHits), playerShots),
      4,
    ),
    enemyEffectiveHitRate: round(
      safeRate(total((battle) => battle.enemy.effectiveHits), enemyShots),
      4,
    ),
    averagePlayerShots: round(safeRate(playerShots, runs), 2),
    averageEnemyShots: round(safeRate(enemyShots, runs), 2),
    averagePlayerSalvos: round(safeRate(total((battle) => battle.player.salvos), runs), 2),
    averageEnemySalvos: round(safeRate(total((battle) => battle.enemy.salvos), runs), 2),
    averagePlayerDamage: round(safeRate(total((battle) => battle.player.damage), runs), 2),
    averageEnemyDamage: round(safeRate(total((battle) => battle.enemy.damage), runs), 2),
    penetrationResults: {
      citadels: total(
        (battle) => battle.player.citadels + battle.enemy.citadels,
      ),
      penetrations: total(
        (battle) => battle.player.penetrations + battle.enemy.penetrations,
      ),
      overpenetrations: total(
        (battle) => battle.player.overpenetrations + battle.enemy.overpenetrations,
      ),
      ricochets: total((battle) => battle.player.ricochets + battle.enemy.ricochets),
      shatters: total((battle) => battle.player.shatters + battle.enemy.shatters),
    },
    firesPerBattle: round(safeRate(fires, runs), 3),
    floodsPerBattle: round(safeRate(floods, runs), 3),
    collisionsPerBattle: round(safeRate(total((battle) => battle.collisions), runs), 3),
    averageContestedSeconds: round(
      safeRate(total((battle) => battle.contestedSeconds), runs),
      2,
    ),
    averagePlayerControlSeconds: round(
      safeRate(total((battle) => battle.playerControlSeconds), runs),
      2,
    ),
    averageEnemyControlSeconds: round(
      safeRate(total((battle) => battle.enemyControlSeconds), runs),
      2,
    ),
    averagePlayerScore: round(
      safeRate(total((battle) => battle.finalScores.player), runs),
      2,
    ),
    averageEnemyScore: round(
      safeRate(total((battle) => battle.finalScores.enemy), runs),
      2,
    ),
    firstTrackingSeconds: {
      player: percentiles(battles.flatMap((battle) =>
        battle.firstTrackingSeconds.player === undefined
          ? [] : [battle.firstTrackingSeconds.player])),
      enemy: percentiles(battles.flatMap((battle) =>
        battle.firstTrackingSeconds.enemy === undefined
          ? [] : [battle.firstTrackingSeconds.enemy])),
    },
    averageTrackingFraction: {
      player: round(safeRate(
        total((battle) => battle.player.perceptionSeconds.tracking),
        total((battle) => battle.durationSeconds),
      ), 4),
      enemy: round(safeRate(
        total((battle) => battle.enemy.perceptionSeconds.tracking),
        total((battle) => battle.durationSeconds),
      ), 4),
    },
    shotsWhileUntracked: total(
      (battle) => battle.player.shotsWhileUntracked + battle.enemy.shotsWhileUntracked,
    ),
    torpedoHitRate: round(safeRate(torpedoHits, torpedoesLaunched), 4),
    averageTorpedoSalvosPerTeam: round(safeRate(torpedoesLaunched, runs * 2 * 2), 3),
    torpedoDamageShare: round(safeRate(torpedoDamage, allDamage), 4),
    playerGunHitRate: round(safeRate(
      total((battle) => battle.player.shellHits),
      total((battle) => battle.player.shellsFired),
    ), 4),
    enemyGunHitRate: round(safeRate(
      total((battle) => battle.enemy.shellHits),
      total((battle) => battle.enemy.shellsFired),
    ), 4),
  };
}

function runScenarioBattles(
  runs: number,
  firstSeed: number,
  maximumSeconds: number,
  scenario?: BalanceScenario,
): BattleTelemetry[] {
  return Array.from(
    { length: Math.max(0, Math.floor(runs)) },
    (_, index) => runHeadlessBattle(
      (firstSeed + index) >>> 0,
      maximumSeconds,
      scenario,
    ),
  );
}

export function runBalanceBatch(runs: number, firstSeed = 1): BalanceReport {
  return summarizeBattles(runScenarioBattles(runs, firstSeed, BATTLE_DURATION_SECONDS));
}

export function runConfiguredBalanceBatch(options: BalanceBatchOptions): BalanceReport {
  return summarizeBattles(runScenarioBattles(
    options.runs,
    options.firstSeed ?? 1,
    options.maximumSeconds ?? BATTLE_DURATION_SECONDS,
    {
      player: options.player,
      enemy: options.enemy,
      spawnSide: options.spawnSide,
    },
  ));
}

/**
 * Runs paired spawn experiments for arbitrary class/loadout matchups. The same
 * seed range is reused for each default/mirrored pair, isolating map-side bias
 * from random dispersion and controller personality variance.
 */
export function runBalanceMatrix(options: BalanceMatrixOptions): BalanceMatrixReport {
  const runsPerSpawn = Math.max(0, Math.floor(options.runsPerSpawn ?? 1));
  const maximumSeconds = options.maximumSeconds ?? BATTLE_DURATION_SECONDS;
  const includeMirroredSpawns = options.includeMirroredSpawns ?? true;
  let nextSeed = options.firstSeed ?? 1;
  let totalRuns = 0;
  const entries = options.matchups.map((matchup): BalanceMatrixEntry => {
    const defaultBattles = runScenarioBattles(
      runsPerSpawn,
      nextSeed,
      maximumSeconds,
      { player: matchup.player, enemy: matchup.enemy, spawnSide: "default" },
    );
    const mirroredBattles = includeMirroredSpawns
      ? runScenarioBattles(
        runsPerSpawn,
        nextSeed,
        maximumSeconds,
        { player: matchup.player, enemy: matchup.enemy, spawnSide: "mirrored" },
      )
      : [];
    nextSeed = (nextSeed + runsPerSpawn) >>> 0;
    totalRuns += defaultBattles.length + mirroredBattles.length;
    const defaultSpawn = summarizeBattles(defaultBattles);
    const mirroredSpawn = includeMirroredSpawns
      ? summarizeBattles(mirroredBattles)
      : undefined;
    const playerPreset = matchup.player.loadoutPreset ?? "standard";
    const enemyPreset = matchup.enemy.loadoutPreset ?? "standard";
    return {
      id: matchup.id ?? `${matchup.player.shipClassId}-${playerPreset}-vs-${matchup.enemy.shipClassId}-${enemyPreset}`,
      player: matchup.player,
      enemy: matchup.enemy,
      defaultSpawn,
      mirroredSpawn,
      combined: summarizeBattles([...defaultBattles, ...mirroredBattles]),
      spawnPlayerWinRateDelta: mirroredSpawn
        ? round(defaultSpawn.playerWinRate - mirroredSpawn.playerWinRate, 4)
        : undefined,
    };
  });
  return { runs: totalRuns, entries };
}
