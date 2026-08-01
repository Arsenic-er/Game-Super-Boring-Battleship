import type {
  AircraftRole,
  AirMissionArea,
  AirCombatEventKind,
  AirContactSnapshot,
  AirDamageCause,
  AirMissionCommand,
  AirMissionOrder,
  AirMissionRejectReason,
  AirRecoverySource,
  AirSquadronPhase,
  AirSquadronState,
  Team,
  AirWeaponKind,
  BattleState,
  Vec3,
} from "./types";
import type { HullId } from "../ships/hulls";
import { getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import { GUN, KNOT_TO_MPS } from "./config";

export const AIR_OPERATION_TIMING = {
  launchSeconds: 8,
  searchSeconds: 12,
  attackRunSeconds: 6,
  landingSeconds: 8,
  /** Reserve includes the final approach; depletion before recovery means ditching. */
  returnReserveSeconds: 35,
  rearmSeconds: {
    fighter: 32,
    torpedoBomber: 48,
    diveBomber: 42,
  },
  enduranceSeconds: {
    fighter: 210,
    torpedoBomber: 240,
    diveBomber: 230,
  },
} as const satisfies {
  launchSeconds: number;
  searchSeconds: number;
  attackRunSeconds: number;
  landingSeconds: number;
  returnReserveSeconds: number;
  rearmSeconds: Record<AircraftRole, number>;
  enduranceSeconds: Record<AircraftRole, number>;
};

export const AIR_NAVIGATION = {
  mapHalfExtentMeters: 6_000,
  patrolRadiusMinMeters: 250,
  patrolRadiusMaxMeters: 2_000,
  arrivalRadiusMeters: 90,
  detectionRangeMeters: 2_800,
  surfaceDetectionRangeMeters: {
    fighter: 1_600,
    torpedoBomber: 2_400,
    diveBomber: 2_500,
  },
  surfaceObservationIntervalSeconds: 0.5,
  speedMetersPerSecond: { fighter: 105, torpedoBomber: 82, diveBomber: 90 },
} as const;

export const AIR_SQUADRON_LOADOUT = {
  airframeHealthPerAircraft: 100,
  ammo: { fighter: 6, torpedoBomber: 0, diveBomber: 0 },
  ordnance: { fighter: 0, torpedoBomber: 1, diveBomber: 1 },
} as const satisfies {
  airframeHealthPerAircraft: number;
  ammo: Record<AircraftRole, number>;
  ordnance: Record<AircraftRole, number>;
};

export const AIR_COMBAT = {
  airDetectionRangeMeters: 2_400,
  guardRadiusMeters: 1_800,
  interceptApproachMeters: 420,
  interceptReleaseSeconds: 1.2,
  approachMeters: {
    machineGun: 320,
    heBomb: 180,
    aerialTorpedo: 900,
  },
  releaseSeconds: {
    machineGun: 0.7,
    heBomb: 0.9,
    aerialTorpedo: 1.5,
  },
  bomb: { damage: 58, dispersionMeters: 34 },
  torpedo: {
    speedMetersPerSecond: 43,
    damage: 78,
    armingDistanceMeters: 125,
    maximumRangeMeters: 3_200,
    detectionRangeMeters: 720,
    spreadRadians: 0.025,
  },
  machineGun: { muzzleVelocity: 420, damage: 5 },
  fighterBurstDamagePerAircraft: 19,
  fighterDefensiveFireMultiplier: 0.55,
  aa: {
    baseRangeMeters: 620,
    rangePerSlotMeters: 135,
    continuousDpsPerSlot: 7.5,
    flakBurstsPerSecondPerSlot: 0.035,
    flakDamage: 92,
  },
} as const;

export interface ShipAntiAirProfile {
  rangeMeters: number;
  continuousDps: number;
  flakBurstsPerSecond: number;
  flakDamage: number;
}

export interface CreateAirSquadronOptions {
  id: string;
  controllerId: string;
  team: Team;
  role: AircraftRole;
  recoverySource: AirRecoverySource;
  position: Vec3;
  heading?: number;
  aircraftCapacity?: number;
  contactsByTeam?: Partial<Record<Team, AirContactSnapshot>>;
  now?: number;
}

export interface AirMissionIssueResult {
  accepted: boolean;
  changed?: boolean;
  squadron?: AirSquadronState;
  reason?: AirMissionRejectReason;
}

export interface AirMissionTrustedData {
  targetIds?: readonly string[];
  lastKnownPositions?: Readonly<Record<string, Readonly<Vec3>>>;
  lastKnownHeadings?: Readonly<Record<string, number>>;
  lastKnownSpeedsKnots?: Readonly<Record<string, number>>;
  area?: Readonly<AirMissionArea>;
  selectedWeapon?: AirWeaponKind;
}

export interface AirPhaseSignals {
  reachedMissionArea?: boolean;
  contactValid?: boolean;
  attackCompleted?: boolean;
  engagementComplete?: boolean;
  reachedRecoveryPoint?: boolean;
}

const copyPoint = (point: Readonly<Vec3>): Vec3 => ({ ...point });

const copyArea = (area: Readonly<AirMissionArea>): AirMissionArea => ({
  center: copyPoint(area.center),
  radius: area.radius,
});

export function airMissionTargetIds(command: Readonly<AirMissionCommand>): string[] {
  return [...new Set([
    ...(command.targetIds ?? []),
    ...(command.targetId ? [command.targetId] : []),
  ])].slice(0, 16);
}

const copyContact = (
  contact: Readonly<AirContactSnapshot>,
): AirContactSnapshot => ({
  ...contact,
  lastKnownPosition: copyPoint(contact.lastKnownPosition),
});

export function createAirSquadronState(
  options: CreateAirSquadronOptions,
): AirSquadronState {
  const now = options.now ?? 0;
  const aircraftCapacity = Math.max(1, Math.floor(options.aircraftCapacity ?? 6));
  const maxAirframeHealth = aircraftCapacity
    * AIR_SQUADRON_LOADOUT.airframeHealthPerAircraft;
  return {
    id: options.id,
    controllerId: options.controllerId,
    team: options.team,
    role: options.role,
    recoverySource: options.recoverySource.kind === "mapEdge"
      ? { kind: "mapEdge", position: copyPoint(options.recoverySource.position) }
      : { ...options.recoverySource },
    contactsByTeam: {
      ...Object.fromEntries(
        Object.entries(options.contactsByTeam ?? {}).map(([team, contact]) =>
          [team, copyContact(contact)]),
      ),
      [options.team]: copyContact(options.contactsByTeam?.[options.team] ?? {
        observedAt: now,
        lastKnownPosition: options.position,
        confidence: 1,
        observedRole: options.role,
        observedHeading: options.heading ?? 0,
        estimatedAircraft: aircraftCapacity,
      }),
    },
    phase: "ready",
    position: copyPoint(options.position),
    previousPosition: copyPoint(options.position),
    heading: options.heading ?? 0,
    aircraftCapacity,
    aircraftOperational: aircraftCapacity,
    airframeHealth: maxAirframeHealth,
    maxAirframeHealth,
    ammoRemaining: AIR_SQUADRON_LOADOUT.ammo[options.role],
    ordnanceRemaining: AIR_SQUADRON_LOADOUT.ordnance[options.role],
    cohesion: 1,
    fuelRemainingSeconds: AIR_OPERATION_TIMING.enduranceSeconds[options.role],
    phaseStartedAt: now,
    lastUpdatedAt: now,
    attackRunReleased: false,
  };
}

export function airWeaponAvailable(
  squadron: Pick<AirSquadronState, "ammoRemaining" | "ordnanceRemaining">,
  weapon: AirWeaponKind | undefined,
): boolean {
  if (!weapon) return false;
  return weapon === "machineGun"
    ? squadron.ammoRemaining > 0
    : squadron.ordnanceRemaining > 0;
}

export function airMissionApproachRadius(
  squadron: Pick<AirSquadronState, "order">,
): number {
  if (squadron.order?.kind === "interceptSquadron") {
    return AIR_COMBAT.interceptApproachMeters;
  }
  const weapon = squadron.order?.selectedWeapon;
  return weapon ? AIR_COMBAT.approachMeters[weapon] : AIR_NAVIGATION.arrivalRadiusMeters;
}

export function airWeaponReleaseDelay(weapon: AirWeaponKind | undefined): number {
  return weapon ? AIR_COMBAT.releaseSeconds[weapon] : 0;
}

export function predictAirStrikeAimPoint(
  origin: Readonly<Vec3>,
  target: Readonly<Vec3>,
  heading: number,
  speedKnots: number,
  weapon: AirWeaponKind,
): Vec3 {
  const targetSpeed = Math.max(0, speedKnots) * KNOT_TO_MPS;
  const velocityX = Math.sin(heading) * targetSpeed;
  const velocityZ = Math.cos(heading) * targetSpeed;
  const relativeX = target.x - origin.x;
  const relativeZ = target.z - origin.z;
  let flightSeconds: number;
  if (weapon === "heBomb") {
    flightSeconds = Math.sqrt(2 * Math.max(1, origin.y) / GUN.gravity);
  } else {
    const weaponSpeed = weapon === "aerialTorpedo"
      ? AIR_COMBAT.torpedo.speedMetersPerSecond
      : AIR_COMBAT.machineGun.muzzleVelocity;
    const a = velocityX ** 2 + velocityZ ** 2 - weaponSpeed ** 2;
    const b = 2 * (relativeX * velocityX + relativeZ * velocityZ);
    const c = relativeX ** 2 + relativeZ ** 2;
    const discriminant = b ** 2 - 4 * a * c;
    if (Math.abs(a) < 0.0001) {
      flightSeconds = Math.abs(b) < 0.0001 ? Math.sqrt(c) / weaponSpeed : -c / b;
    } else if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
        .filter((value) => value > 0);
      flightSeconds = candidates.length > 0
        ? Math.min(...candidates)
        : Math.sqrt(c) / weaponSpeed;
    } else {
      flightSeconds = Math.sqrt(c) / weaponSpeed;
    }
  }
  const predictionSeconds = Math.min(30, Math.max(0, flightSeconds));
  return {
    x: target.x + velocityX * predictionSeconds,
    y: target.y,
    z: target.z + velocityZ * predictionSeconds,
  };
}

export function shipAntiAirProfile(
  shipClassId: ShipClassId,
  fittedMounts?: number,
  efficiencyMultiplier = 1,
): ShipAntiAirProfile {
  const definition = getShipClass(shipClassId);
  const slots = Math.max(0, fittedMounts ?? definition.starterSlots.antiAir);
  if (slots <= 0) {
    return { rangeMeters: 0, continuousDps: 0, flakBurstsPerSecond: 0, flakDamage: 0 };
  }
  const hullMultiplier = definition.hullId === "battleship"
    ? 1.3
    : definition.hullId === "lightCruiser" ? 1.15 : 1;
  const effectiveMultiplier = hullMultiplier * Math.max(0, efficiencyMultiplier);
  return {
    rangeMeters: AIR_COMBAT.aa.baseRangeMeters
      + slots * AIR_COMBAT.aa.rangePerSlotMeters * effectiveMultiplier,
    continuousDps: slots * AIR_COMBAT.aa.continuousDpsPerSlot * effectiveMultiplier,
    flakBurstsPerSecond: slots
      * AIR_COMBAT.aa.flakBurstsPerSecondPerSlot * effectiveMultiplier,
    flakDamage: AIR_COMBAT.aa.flakDamage * effectiveMultiplier,
  };
}

export function isAirSquadronAirborne(phase: AirSquadronPhase): boolean {
  return phase !== "ready" && phase !== "rearming" && phase !== "destroyed";
}

function consumesFlightFuel(phase: AirSquadronPhase): boolean {
  return isAirSquadronAirborne(phase) && phase !== "landing";
}

export function airMissionRequiresTarget(kind: AirMissionCommand["kind"]): boolean {
  return kind === "strikeShip" || kind === "interceptSquadron";
}

export function airMissionRequiresArea(kind: AirMissionCommand["kind"]): boolean {
  return kind === "moveTo" || kind === "patrolArea";
}

export function chooseAirStrikeWeapon(
  role: AircraftRole,
  targetHull: HullId,
): AirWeaponKind | undefined {
  if (role === "fighter") {
    return targetHull === "destroyer" ? "machineGun" : undefined;
  }
  if (role === "torpedoBomber") return "aerialTorpedo";
  return "heBomb";
}

export function airStrikeTargetScore(role: AircraftRole, targetHull: HullId): number {
  if (role === "fighter") return targetHull === "destroyer" ? 35 : -1;
  if (role === "torpedoBomber") {
    if (targetHull === "battleship") return 100;
    if (targetHull === "lightCruiser") return 62;
    return 24;
  }
  if (targetHull === "destroyer") return 100;
  if (targetHull === "lightCruiser") return 82;
  return 58;
}

function sameArea(
  left: Readonly<AirMissionArea> | undefined,
  right: Readonly<AirMissionArea> | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.center.x === right.center.x
    && left.center.z === right.center.z
    && left.radius === right.radius;
}

const reject = (reason: AirMissionRejectReason): AirMissionIssueResult => ({
  accepted: false,
  reason,
});

/**
 * Validates and applies only command intent. Piloting, approach selection and
 * weapon release remain exclusively owned by the squadron AI.
 */
export function issueAirMissionOrder(
  squadron: Readonly<AirSquadronState> | undefined,
  command: Readonly<AirMissionCommand>,
  now: number,
  trusted: Readonly<AirMissionTrustedData> = {},
): AirMissionIssueResult {
  if (!squadron || squadron.id !== command.squadronId) {
    return reject("unknown-squadron");
  }
  if (squadron.phase === "destroyed" || squadron.aircraftOperational <= 0) {
    return reject("unavailable");
  }
  if (squadron.phase === "attackRun" || squadron.phase === "landing") {
    return reject("committed");
  }
  const targetIds = [...new Set(trusted.targetIds ?? airMissionTargetIds(command))];
  const area = trusted.area ?? command.area;
  if (airMissionRequiresTarget(command.kind) && targetIds.length === 0) {
    return reject("target-required");
  }
  if (airMissionRequiresArea(command.kind) && !area) return reject("target-required");
  if (
    (command.kind === "interceptSquadron" || command.kind === "defendShip")
    && squadron.role !== "fighter"
  ) {
    return reject("wrong-role");
  }
  if (command.kind === "strikeShip" && trusted.selectedWeapon === undefined
    && squadron.role === "fighter") {
    return reject("wrong-role");
  }
  if (command.kind === "recall" && !isAirSquadronAirborne(squadron.phase)) {
    return reject("grounded");
  }
  if (command.kind !== "recall" && squadron.phase === "rearming") {
    return reject("unavailable");
  }

  if (
    squadron.order?.kind === command.kind
    && (squadron.order.candidateTargetIds ?? []).join("|") === targetIds.join("|")
    && sameArea(squadron.order.area, area)
  ) {
    const positions = trusted.lastKnownPositions
      ? Object.fromEntries(
        Object.entries(trusted.lastKnownPositions)
          .map(([id, position]) => [id, copyPoint(position)]),
      )
      : Object.fromEntries(
        Object.entries(squadron.order.lastKnownPositions ?? {})
          .map(([id, position]) => [id, copyPoint(position)]),
      );
    const headings = trusted.lastKnownHeadings
      ? { ...trusted.lastKnownHeadings }
      : { ...squadron.order.lastKnownHeadings };
    const speeds = trusted.lastKnownSpeedsKnots
      ? { ...trusted.lastKnownSpeedsKnots }
      : { ...squadron.order.lastKnownSpeedsKnots };
    const activeTargetId = targetIds[0] ?? squadron.order.activeTargetId;
    return {
      accepted: true,
      changed: false,
      squadron: {
        ...squadron,
        order: {
          ...squadron.order,
          activeTargetId,
          lastKnownPosition: activeTargetId && positions[activeTargetId]
            ? copyPoint(positions[activeTargetId])
            : squadron.order.lastKnownPosition
              ? copyPoint(squadron.order.lastKnownPosition)
              : undefined,
          lastKnownPositions: positions,
          lastKnownHeadings: headings,
          lastKnownSpeedsKnots: speeds,
        },
      },
    };
  }

  const activeTargetId = targetIds[0];
  const positions = trusted.lastKnownPositions ?? {};
  const order: AirMissionOrder = {
    squadronId: command.squadronId,
    kind: command.kind,
    targetId: activeTargetId,
    targetIds: targetIds.length > 0 ? [...targetIds] : undefined,
    candidateTargetIds: targetIds.length > 0 ? [...targetIds] : undefined,
    activeTargetId,
    area: area ? copyArea(area) : undefined,
    lastKnownPosition: activeTargetId && positions[activeTargetId]
      ? copyPoint(positions[activeTargetId])
      : undefined,
    lastKnownPositions: Object.fromEntries(
      Object.entries(positions).map(([id, position]) => [id, copyPoint(position)]),
    ),
    lastKnownHeadings: trusted.lastKnownHeadings ? { ...trusted.lastKnownHeadings } : undefined,
    lastKnownSpeedsKnots: trusted.lastKnownSpeedsKnots ? { ...trusted.lastKnownSpeedsKnots } : undefined,
    selectedWeapon: trusted.selectedWeapon
      ?? (command.kind === "interceptSquadron" || command.kind === "defendShip"
        ? "machineGun"
        : undefined),
    issuedAt: now,
  };
  return {
    accepted: true,
    changed: true,
    squadron: {
      ...squadron,
      order,
      phase: command.kind === "recall"
        ? "returning"
        : squadron.phase === "ready" ? "launching"
          : squadron.phase === "launching" ? "launching"
            : "outbound",
      phaseStartedAt: squadron.phase === "launching" && command.kind !== "recall"
        ? squadron.phaseStartedAt
        : now,
      attackRunReleased: false,
      resumeOrder: undefined,
      lastUpdatedAt: now,
    },
  };
}

const missionPhase = (squadron: Readonly<AirSquadronState>): AirSquadronPhase => {
  switch (squadron.order?.kind) {
    case "strikeShip": return "attackRun";
    case "interceptSquadron": return "intercepting";
    case "defendShip": return "patrolling";
    case "moveTo":
    case "patrolArea": return "patrolling";
    default: return "returning";
  }
};

/**
 * Advances the deterministic mission state machine. Movement and combat feed
 * it explicit signals, keeping rendering and player input out of flight logic.
 */
export function advanceAirSquadronPhase(
  squadron: Readonly<AirSquadronState>,
  now: number,
  signals: Readonly<AirPhaseSignals> = {},
): AirSquadronState {
  const elapsed = Math.max(0, now - squadron.lastUpdatedAt);
  let next: AirSquadronState = {
    ...squadron,
    order: squadron.order
      ? {
        ...squadron.order,
        lastKnownPosition: squadron.order.lastKnownPosition
          ? copyPoint(squadron.order.lastKnownPosition)
          : undefined,
        targetIds: squadron.order.targetIds ? [...squadron.order.targetIds] : undefined,
        candidateTargetIds: squadron.order.candidateTargetIds
          ? [...squadron.order.candidateTargetIds]
          : undefined,
        area: squadron.order.area ? copyArea(squadron.order.area) : undefined,
        lastKnownPositions: squadron.order.lastKnownPositions
          ? Object.fromEntries(
            Object.entries(squadron.order.lastKnownPositions).map(([id, position]) =>
              [id, copyPoint(position)]),
          )
          : undefined,
        lastKnownHeadings: squadron.order.lastKnownHeadings
          ? { ...squadron.order.lastKnownHeadings } : undefined,
        lastKnownSpeedsKnots: squadron.order.lastKnownSpeedsKnots
          ? { ...squadron.order.lastKnownSpeedsKnots } : undefined,
      }
      : undefined,
    resumeOrder: squadron.resumeOrder ? { ...squadron.resumeOrder } : undefined,
    fuelRemainingSeconds: consumesFlightFuel(squadron.phase)
      ? Math.max(0, squadron.fuelRemainingSeconds - elapsed)
      : squadron.fuelRemainingSeconds,
    lastUpdatedAt: now,
  };
  const transition = (
    phase: AirSquadronPhase,
    clearOrder = false,
  ): AirSquadronState => ({
    ...next,
    phase,
    phaseStartedAt: now,
    order: clearOrder ? undefined : next.order,
    resumeOrder: clearOrder ? undefined : next.resumeOrder,
  });

  if (next.aircraftOperational <= 0 || next.airframeHealth <= 0) {
    return transition("destroyed", true);
  }
  if (consumesFlightFuel(next.phase) && next.fuelRemainingSeconds <= 0) {
    return {
      ...transition("destroyed", true),
      aircraftOperational: 0,
      airframeHealth: 0,
      cohesion: 0,
    };
  }
  if (
    next.fuelRemainingSeconds <= AIR_OPERATION_TIMING.returnReserveSeconds
    && !["ready", "rearming", "returning", "landing", "destroyed"].includes(next.phase)
  ) {
    return transition("returning");
  }

  switch (next.phase) {
    case "ready":
    case "destroyed":
      return next;
    case "launching":
      return now - next.phaseStartedAt >= AIR_OPERATION_TIMING.launchSeconds
        ? transition("outbound")
        : next;
    case "outbound":
      if (airMissionRequiresTarget(next.order?.kind ?? "recall") && signals.contactValid === false) {
        return transition("searching");
      }
      return signals.reachedMissionArea ? transition(missionPhase(next)) : next;
    case "searching":
      if (signals.contactValid) return transition("outbound");
      return now - next.phaseStartedAt >= AIR_OPERATION_TIMING.searchSeconds
        ? transition("returning")
        : next;
    case "attackRun":
      return signals.attackCompleted
        || now - next.phaseStartedAt >= AIR_OPERATION_TIMING.attackRunSeconds
        ? transition("returning")
        : next;
    case "intercepting":
      return signals.engagementComplete ? transition("returning") : next;
    case "patrolling":
      return next;
    case "returning":
      return signals.reachedRecoveryPoint ? transition("landing") : next;
    case "landing":
      return now - next.phaseStartedAt >= AIR_OPERATION_TIMING.landingSeconds
        ? transition("rearming", true)
        : next;
    case "rearming":
      if (now - next.phaseStartedAt < AIR_OPERATION_TIMING.rearmSeconds[next.role]) {
        return next;
      }
      next = transition("ready", true);
      return {
        ...next,
        cohesion: 1,
        airframeHealth: next.aircraftOperational
          * AIR_SQUADRON_LOADOUT.airframeHealthPerAircraft,
        ammoRemaining: AIR_SQUADRON_LOADOUT.ammo[next.role],
        ordnanceRemaining: AIR_SQUADRON_LOADOUT.ordnance[next.role],
        fuelRemainingSeconds: AIR_OPERATION_TIMING.enduranceSeconds[next.role],
        attackRunReleased: false,
      };
  }
}

export interface AirDamageResult {
  squadron: AirSquadronState;
  damageApplied: number;
  aircraftLost: number;
  cause: AirDamageCause;
}

/** Sole mutation path for AA/air-combat damage, keeping health and plane count aligned. */
export function applyAirDamage(
  squadron: Readonly<AirSquadronState>,
  requestedDamage: number,
  cause: AirDamageCause,
): AirDamageResult {
  const damageApplied = Math.min(
    squadron.airframeHealth,
    Math.max(0, requestedDamage),
  );
  const airframeHealth = Math.max(0, squadron.airframeHealth - damageApplied);
  const aircraftOperational = airframeHealth <= 0
    ? 0
    : Math.min(
      squadron.aircraftOperational,
      Math.ceil(airframeHealth / AIR_SQUADRON_LOADOUT.airframeHealthPerAircraft),
    );
  const aircraftLost = squadron.aircraftOperational - aircraftOperational;
  return {
    squadron: {
      ...squadron,
      airframeHealth,
      aircraftOperational,
      cohesion: Math.max(0, Math.min(
        squadron.cohesion,
        squadron.maxAirframeHealth <= 0 ? 0 : airframeHealth / squadron.maxAirframeHealth,
      )),
    },
    damageApplied,
    aircraftLost,
    cause,
  };
}

export function deployFleetAirSupport(state: BattleState): void {
  if (state.airSquadrons.length > 0) return;
  const teams: Team[] = state.mode === "battle" ? ["player", "enemy"] : ["player"];
  const roles: AircraftRole[] = ["fighter", "diveBomber", "torpedoBomber"];
  for (const team of teams) {
    const controllerId = team === "player" ? "player" : "enemy";
    const side = team === "player" ? -1 : 1;
    roles.forEach((role, index) => {
      const position = { x: (index - 1) * 340, y: 180, z: side * 5_200 };
      const squadron = createAirSquadronState({
        id: `${team}-${role}-1`,
        controllerId,
        team,
        role,
        recoverySource: { kind: "mapEdge", position },
        position,
        aircraftCapacity: role === "fighter" ? 6 : 5,
        now: state.time,
      });
      state.airSquadrons.push(squadron);
    });
  }
}

export function airTransitionEventKind(
  previous: AirSquadronPhase,
  next: AirSquadronPhase,
): AirCombatEventKind | undefined {
  if (previous === next) return undefined;
  if (next === "destroyed") return "aircraftLost";
  if (previous === "launching" && next === "outbound") return "launched";
  if (next === "attackRun" || next === "intercepting") return "attackStarted";
  if (next === "returning") return "returning";
  if (previous === "landing" && next === "rearming") return "landed";
  return undefined;
}
