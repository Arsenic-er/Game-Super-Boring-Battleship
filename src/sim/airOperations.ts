import type {
  AircraftRole,
  AirCombatEventKind,
  AirContactSnapshot,
  AirDamageCause,
  AirMissionCommand,
  AirMissionRejectReason,
  AirRecoverySource,
  AirSquadronPhase,
  AirSquadronState,
  Team,
  Vec3,
} from "./types";

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

export interface AirPhaseSignals {
  reachedMissionArea?: boolean;
  contactValid?: boolean;
  attackCompleted?: boolean;
  engagementComplete?: boolean;
  reachedRecoveryPoint?: boolean;
}

const copyPoint = (point: Readonly<Vec3>): Vec3 => ({ ...point });

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
  lastKnownPosition?: Readonly<Vec3>,
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
  if (airMissionRequiresTarget(command.kind) && !command.targetId) {
    return reject("target-required");
  }
  if (
    (command.kind === "strikeShip" && squadron.role === "fighter")
    || (
      (command.kind === "interceptSquadron" || command.kind === "defendShip")
      && squadron.role !== "fighter"
    )
  ) {
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
    && squadron.order.targetId === command.targetId
  ) {
    return {
      accepted: true,
      changed: false,
      squadron: {
        ...squadron,
        order: {
          ...squadron.order,
          lastKnownPosition: lastKnownPosition
            ? copyPoint(lastKnownPosition)
            : squadron.order.lastKnownPosition
              ? copyPoint(squadron.order.lastKnownPosition)
              : undefined,
        },
      },
    };
  }

  const order = {
    ...command,
    lastKnownPosition: lastKnownPosition
      ? copyPoint(lastKnownPosition)
      : undefined,
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
