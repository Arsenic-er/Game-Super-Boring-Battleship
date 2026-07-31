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
      }
      : undefined,
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
  });

  if (next.aircraftOperational <= 0 || next.airframeHealth <= 0) {
    return transition("destroyed", true);
  }
  if (consumesFlightFuel(next.phase) && next.fuelRemainingSeconds <= 0) {
    return transition("destroyed", true);
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
