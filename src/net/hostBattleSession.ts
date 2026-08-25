import { FIXED_STEP } from "../sim/config";
import { createDeveloperShipState, createInitialState } from "../sim/simulation";
import { buildAtollBattleScenario, type ScenarioHumanPlayerDescriptor } from "../sim/scenarios";
import type { BattleState, ControlCommand, InstalledEquipmentIds, ShipState } from "../sim/types";
import { type AuthoritativeBattleSession, type BattleStepOptions, type BattleStepOutput } from "../session/battleSession";
import { LocalBattleSession } from "../session/localBattleSession";
import type { FleetSize } from "../sim/battleSetup";
import { getShipClass } from "../ships/classes";
import { battleLoadoutFromSlots } from "../profile/localProfile";
import { normalizeLanBuildDescriptor } from "./lobbyState";
import type { InputFramePayload, LanBuildDescriptor, PlayerSnapshotPayload } from "./protocol";
import { validateRemoteCommand } from "./protocol";
import { replicationViewFor } from "./replicationView";

const SNAPSHOT_INTERVAL_TICKS = 6;
const DEFAULT_REASON = "accepted" as const;
const PEER_ID_MAX_LENGTH = 64;

type InputRejectionReason =
  | "unknown-peer"
  | "duplicate-input"
  | "stale-input"
  | "invalid-sequence"
  | "invalid-command"
  | "rate-limited"
  | "invalid-received-at"
  | "non-monotonic-received-at";

export interface InputAcceptance {
  accepted: boolean;
  reason?: typeof DEFAULT_REASON | InputRejectionReason;
}

export interface HostStepOutput extends BattleStepOutput {
  serverTick: number;
  snapshots: ReadonlyMap<string, PlayerSnapshotPayload>;
}

export interface HostBattleSessionConfig {
  hostPeerId: string;
  guestPeerId: string;
  seed: number;
  teamSize: FleetSize;
  hostBuild: LanBuildDescriptor;
  guestBuild: LanBuildDescriptor;
  includeDeveloperAi?: boolean;
}

interface CachedGuestInput {
  inputSequence: number;
  command: ControlCommand;
}

interface NormalizedHostConfig {
  hostPeerId: string;
  guestPeerId: string;
  seed: number;
  teamSize: FleetSize;
  hostBuild: LanBuildDescriptor;
  guestBuild: LanBuildDescriptor;
  includeDeveloperAi: boolean;
}

function cloneInstalledEquipment(build: LanBuildDescriptor): InstalledEquipmentIds {
  return {
    mainGun: [...build.slots.mainGun],
    torpedo: [...build.slots.torpedo],
    antiAir: [...build.slots.antiAir],
    sideGun: [...build.slots.sideGun],
    depthCharge: [...build.slots.depthCharge],
    magazine: [...build.slots.magazine],
    engine: [...build.slots.engine],
    steering: [...build.slots.steering],
  };
}

function idleCommandFor(ship: Readonly<ShipState>): ControlCommand {
  return {
    throttle: 0,
    rudder: 0,
    aimPoint: { ...ship.aimPoint },
    fire: false,
  };
}

function descriptorFromBuild(peerId: string, build: LanBuildDescriptor): ScenarioHumanPlayerDescriptor {
  return {
    peerId,
    shipClassId: build.shipClassId,
    installedEquipment: cloneInstalledEquipment(build),
  };
}

function validatePeerId(peerId: string): string {
  const normalized = peerId.trim();
  if (!normalized || normalized.length > PEER_ID_MAX_LENGTH) throw new Error("invalid-peer-id");
  return normalized;
}

function normalizeConfig(config: HostBattleSessionConfig): NormalizedHostConfig {
  const hostPeerId = validatePeerId(config.hostPeerId);
  const guestPeerId = validatePeerId(config.guestPeerId);
  if (hostPeerId === guestPeerId) throw new Error("duplicate-peer-id");
  const hostBuild = normalizeLanBuildDescriptor(config.hostBuild);
  const guestBuild = normalizeLanBuildDescriptor(config.guestBuild);
  if (!hostBuild || !guestBuild) throw new Error("invalid-build");
  return {
    hostPeerId,
    guestPeerId,
    seed: config.seed,
    teamSize: config.teamSize,
    hostBuild,
    guestBuild,
    includeDeveloperAi: config.includeDeveloperAi ?? false,
  };
}

function assignPeersToState(
  state: BattleState,
  hostPeerId: string,
  guestPeerId: string,
): Map<string, string> {
  const alliedShips = state.ships.filter((ship) => ship.team === "player");
  if (alliedShips.length < 2) throw new Error("insufficient-allied-ships");
  const [hostShip, guestShip, ...remaining] = alliedShips;
  hostShip!.aiControlled = false;
  guestShip!.aiControlled = false;
  for (const ship of remaining) ship.aiControlled = true;
  return new Map<string, string>([
    [hostPeerId, hostShip!.id],
    [guestPeerId, guestShip!.id],
  ]);
}

function buildState(config: NormalizedHostConfig): {
  state: BattleState;
  assignments: Map<string, string>;
} {
  const scenario = buildAtollBattleScenario({
    playerShipClassId: config.hostBuild.shipClassId,
    teamSize: config.teamSize,
    seed: config.seed,
    humanPlayers: [
      descriptorFromBuild(config.hostPeerId, config.hostBuild),
      descriptorFromBuild(config.guestPeerId, config.guestBuild),
    ],
  });
  const alliedCount = scenario.ships.filter((ship) => ship.team === "player").length as FleetSize;
  const state = createInitialState(
    config.seed,
    "battle",
    undefined,
    undefined,
    undefined,
    config.hostBuild.shipClassId,
    { teamSize: alliedCount },
  );
  const humanBuilds = new Map<string, LanBuildDescriptor>([
    [config.hostPeerId, config.hostBuild],
    [config.guestPeerId, config.guestBuild],
  ]);

  state.mapId = scenario.mapId;
  state.airSupport = scenario.airSupport;
  state.ships = scenario.ships.map((slot) => {
    const build = slot.humanPeerId ? humanBuilds.get(slot.humanPeerId) : undefined;
    const definition = getShipClass(slot.shipClassId);
    const loadout = build ? battleLoadoutFromSlots(build.shipClassId, build.slots) : undefined;
    return createDeveloperShipState({
      id: slot.id,
      team: slot.team,
      shipClassId: slot.shipClassId,
      position: slot.position,
      heading: slot.heading,
      mainGunId: loadout?.mainGunId,
      torpedoId: loadout?.torpedoId,
      mainGunMounts: loadout ? Math.max(1, loadout.mainGunMounts) : definition.starterSlots.mainGun,
      torpedoLauncherMounts: loadout?.torpedoLauncherMounts ?? definition.starterSlots.torpedo,
      depthChargeMounts: loadout?.depthChargeMounts ?? definition.starterSlots.depthCharge,
      antiAirMounts: loadout?.antiAirMounts ?? definition.starterSlots.antiAir,
      antiAirEfficiencyMultiplier: loadout?.antiAirEfficiencyMultiplier,
      secondaryGunIds: loadout?.secondaryGunIds
        ?? Array.from({ length: definition.starterSlots.sideGun }, () => "sideGun-common"),
      installedEquipment: loadout?.installedEquipment ?? slot.installedEquipment,
      performance: loadout ? {
        maxSpeedMultiplier: loadout.maxSpeedMultiplier,
        accelerationMultiplier: loadout.accelerationMultiplier,
        turnMultiplier: loadout.turnMultiplier,
        reloadMultiplier: loadout.reloadMultiplier,
        magazineRiskMultiplier: loadout.magazineRiskMultiplier,
      } : undefined,
      aiControlled: slot.aiControlled,
      countsForVictory: slot.countsForVictory,
    });
  });
  return { state, assignments: assignPeersToState(state, config.hostPeerId, config.guestPeerId) };
}

export class HostBattleSession implements AuthoritativeBattleSession {
  readonly role = "host" as const;

  private readonly localSession: LocalBattleSession;
  private readonly config: NormalizedHostConfig;
  private readonly activeAssignments: Map<string, string>;
  private guestInput?: CachedGuestInput;
  private guestCommand?: ControlCommand;
  private serverTickValue = 0;
  private fractionalTickCarry = 0;
  private readonly lastProcessedByPeer = new Map<string, number>();
  private readonly acceptedTimestampsByPeer = new Map<string, number[]>();
  private readonly lastReceivedAtByPeer = new Map<string, number>();
  private readonly pendingVisualEventsByPeer = new Map<string, Record<string, unknown>[]>();

  constructor(config: HostBattleSessionConfig) {
    this.config = normalizeConfig(config);
    const built = buildState(this.config);
    this.localSession = new LocalBattleSession(built.state, {
      includeDeveloperAi: this.config.includeDeveloperAi,
    });
    this.activeAssignments = built.assignments;
    this.lastProcessedByPeer.set(this.config.hostPeerId, 0);
    this.lastProcessedByPeer.set(this.config.guestPeerId, 0);
  }

  get state(): BattleState {
    return this.localSession.state;
  }

  get assignments(): ReadonlyMap<string, string> {
    return this.activeAssignments;
  }

  acceptInput(peerId: string, frame: InputFramePayload, receivedAt: number): InputAcceptance {
    if (peerId !== this.config.guestPeerId || !this.activeAssignments.has(peerId)) {
      return { accepted: false, reason: "unknown-peer" };
    }
    if (!Number.isSafeInteger(frame.inputSequence) || frame.inputSequence < 0) {
      return { accepted: false, reason: "invalid-sequence" };
    }
    if (!Number.isFinite(receivedAt) || receivedAt < 0) {
      return { accepted: false, reason: "invalid-received-at" };
    }
    const lastReceivedAt = this.lastReceivedAtByPeer.get(peerId);
    if (lastReceivedAt !== undefined && receivedAt < lastReceivedAt) {
      return { accepted: false, reason: "non-monotonic-received-at" };
    }
    this.lastReceivedAtByPeer.set(peerId, receivedAt);

    const sanitized = validateRemoteCommand(frame.command);
    if (!sanitized) {
      return { accepted: false, reason: "invalid-command" };
    }

    const recent = (this.acceptedTimestampsByPeer.get(peerId) ?? [])
      .filter((timestamp) => receivedAt - timestamp < 1_000);
    if (recent.length >= 30) {
      this.acceptedTimestampsByPeer.set(peerId, recent);
      return { accepted: false, reason: "rate-limited" };
    }

    const lastProcessed = this.lastProcessedByPeer.get(peerId) ?? 0;
    if (frame.inputSequence <= lastProcessed) {
      return { accepted: false, reason: "stale-input" };
    }
    if (this.guestInput?.inputSequence === frame.inputSequence) {
      return { accepted: false, reason: "duplicate-input" };
    }
    if (this.guestInput && frame.inputSequence < this.guestInput.inputSequence) {
      return { accepted: false, reason: "stale-input" };
    }

    recent.push(receivedAt);
    this.acceptedTimestampsByPeer.set(peerId, recent);
    this.guestInput = { inputSequence: frame.inputSequence, command: sanitized };
    return { accepted: true, reason: DEFAULT_REASON };
  }

  step(hostCommand: ControlCommand, dt?: number): HostStepOutput;
  step(
    humanCommands: ReadonlyMap<string, ControlCommand>,
    dt?: number,
    options?: Readonly<BattleStepOptions>,
  ): HostStepOutput;
  step(
    hostCommandOrCommands: ControlCommand | ReadonlyMap<string, ControlCommand>,
    dt = FIXED_STEP,
    options?: Readonly<BattleStepOptions>,
  ): HostStepOutput {
    const commands = hostCommandOrCommands instanceof Map
      ? this.commandsFromAuthoritativeMap(hostCommandOrCommands)
      : this.commandsForStep(hostCommandOrCommands as ControlCommand);
    const previousTick = this.serverTickValue;
    const consumedGuestInput = this.guestInput;
    const output = this.localSession.step(commands, dt, options);
    const completedTicks = this.consumeTicks(dt);
    this.accumulateVisualEvents();
    const crossedSnapshotBoundary = Math.floor(previousTick / SNAPSHOT_INTERVAL_TICKS)
      < Math.floor(this.serverTickValue / SNAPSHOT_INTERVAL_TICKS);
    if (consumedGuestInput && this.activeAssignments.has(this.config.guestPeerId)) {
      this.lastProcessedByPeer.set(this.config.guestPeerId, consumedGuestInput.inputSequence);
      this.guestCommand = consumedGuestInput.command;
      this.guestInput = undefined;
    }
    return {
      ...output,
      serverTick: this.serverTickValue,
      snapshots: completedTicks > 0 && crossedSnapshotBoundary ? this.publishSnapshots() : new Map(),
    };
  }

  disconnectGuest(_now: number): void {
    const guestShipId = this.activeAssignments.get(this.config.guestPeerId);
    if (guestShipId) {
      const guestShip = this.state.ships.find((ship) => ship.id === guestShipId);
      if (guestShip) guestShip.aiControlled = true;
      this.activeAssignments.delete(this.config.guestPeerId);
    }
    this.guestInput = undefined;
    this.guestCommand = undefined;
    this.acceptedTimestampsByPeer.delete(this.config.guestPeerId);
    this.pendingVisualEventsByPeer.delete(this.config.guestPeerId);
  }

  reset(state: BattleState): void {
    const assignments = assignPeersToState(state, this.config.hostPeerId, this.config.guestPeerId);
    this.localSession.reset(state);
    this.activeAssignments.clear();
    for (const [peerId, shipId] of assignments.entries()) this.activeAssignments.set(peerId, shipId);
    this.serverTickValue = 0;
    this.fractionalTickCarry = 0;
    this.guestInput = undefined;
    this.guestCommand = undefined;
    this.acceptedTimestampsByPeer.clear();
    this.lastReceivedAtByPeer.clear();
    this.pendingVisualEventsByPeer.clear();
    this.lastProcessedByPeer.set(this.config.hostPeerId, 0);
    this.lastProcessedByPeer.set(this.config.guestPeerId, 0);
  }

  private commandsFromAuthoritativeMap(
    humanCommands: ReadonlyMap<string, ControlCommand>,
  ): Map<string, ControlCommand> {
    const hostShipId = this.activeAssignments.get(this.config.hostPeerId);
    if (!hostShipId) throw new Error("missing-host-assignment");
    const commands = new Map<string, ControlCommand>();
    const hostShip = this.state.ships.find((ship) => ship.id === hostShipId);
    commands.set(hostShipId, hostShip ? idleCommandFor(hostShip) : idleCommandFor(this.state.ships[0]!));
    for (const [shipId, command] of humanCommands.entries()) {
      if (shipId !== hostShipId) throw new Error("unauthorized-command-target");
      const sanitized = validateRemoteCommand(command);
      if (!sanitized) throw new Error("invalid-command");
      commands.set(shipId, sanitized);
    }
    const guestShipId = this.activeAssignments.get(this.config.guestPeerId);
    if (guestShipId) {
      const guestShip = this.state.ships.find((ship) => ship.id === guestShipId);
      const guestCommand = this.guestInput?.command ?? this.guestCommand ?? (guestShip ? idleCommandFor(guestShip) : undefined);
      if (guestCommand) commands.set(guestShipId, guestCommand);
    }
    return commands;
  }

  private commandsForStep(hostCommand: ControlCommand): Map<string, ControlCommand> {
    const sanitizedHostCommand = validateRemoteCommand(hostCommand);
    if (!sanitizedHostCommand) throw new Error("invalid-command");
    const commands = new Map<string, ControlCommand>();
    const hostShipId = this.activeAssignments.get(this.config.hostPeerId);
    if (hostShipId) commands.set(hostShipId, sanitizedHostCommand);
    const guestShipId = this.activeAssignments.get(this.config.guestPeerId);
    if (guestShipId) {
      const guestShip = this.state.ships.find((ship) => ship.id === guestShipId);
      const command = this.guestInput?.command ?? this.guestCommand ?? (guestShip ? idleCommandFor(guestShip) : undefined);
      if (command) commands.set(guestShipId, command);
    }
    return commands;
  }

  private consumeTicks(dt: number): number {
    this.fractionalTickCarry += dt / FIXED_STEP;
    const completedTicks = Math.max(0, Math.floor(this.fractionalTickCarry + 1e-9));
    if (completedTicks > 0) {
      this.fractionalTickCarry -= completedTicks;
      this.serverTickValue += completedTicks;
    }
    return completedTicks;
  }

  private publishSnapshots(): ReadonlyMap<string, PlayerSnapshotPayload> {
    const snapshots = new Map<string, PlayerSnapshotPayload>();
    for (const [peerId, shipId] of this.activeAssignments.entries()) {
      const snapshot = replicationViewFor(
        this.state,
        shipId,
        this.serverTickValue,
        this.lastProcessedByPeer.get(peerId) ?? 0,
      );
      snapshots.set(peerId, {
        ...snapshot,
        events: structuredClone(this.pendingVisualEventsByPeer.get(peerId) ?? []),
      });
    }
    this.pendingVisualEventsByPeer.clear();
    return snapshots;
  }

  private accumulateVisualEvents(): void {
    for (const [peerId, shipId] of this.activeAssignments.entries()) {
      const events = replicationViewFor(
        this.state,
        shipId,
        this.serverTickValue,
        this.lastProcessedByPeer.get(peerId) ?? 0,
      ).events;
      if (events.length === 0) continue;
      const pending = this.pendingVisualEventsByPeer.get(peerId) ?? [];
      pending.push(...structuredClone(events));
      this.pendingVisualEventsByPeer.set(peerId, pending);
    }
  }
}
