import { FIXED_STEP } from "../sim/config";
import {
  createDeveloperShipState,
  createInitialState,
} from "../sim/simulation";
import {
  buildAtollBattleScenario,
  type ScenarioHumanPlayerDescriptor,
} from "../sim/scenarios";
import type {
  BattleState,
  ControlCommand,
  InstalledEquipmentIds,
  ShipState,
} from "../sim/types";
import { validateRemoteCommand } from "./protocol";
import type {
  InputFramePayload,
  LanBuildDescriptor,
  PlayerSnapshotPayload,
} from "./protocol";
import { replicationViewFor } from "./replicationView";
import {
  type AuthoritativeBattleSession,
  type BattleStepOptions,
  type BattleStepOutput,
} from "../session/battleSession";
import { LocalBattleSession } from "../session/localBattleSession";
import type { FleetSize } from "../sim/battleSetup";
import { getShipClass } from "../ships/classes";
import type { SecondaryGunId } from "../ships/secondaryGuns";

const SNAPSHOT_INTERVAL_TICKS = 6;
const DEFAULT_REASON = "accepted" as const;

type InputRejectionReason =
  | "unknown-peer"
  | "duplicate-input"
  | "stale-input"
  | "invalid-sequence"
  | "invalid-command"
  | "rate-limited";

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

function countInstalled(entries: readonly (string | null)[]): number {
  return entries.filter((entry): entry is string => entry !== null).length;
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

function buildState(config: HostBattleSessionConfig): {
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
  const assignments = new Map<string, string>();
  const humanBuilds = new Map<string, LanBuildDescriptor>([
    [config.hostPeerId, config.hostBuild],
    [config.guestPeerId, config.guestBuild],
  ]);

  state.mapId = scenario.mapId;
  state.airSupport = scenario.airSupport;
  state.ships = scenario.ships.map((slot) => {
    const build = slot.humanPeerId ? humanBuilds.get(slot.humanPeerId) : undefined;
    const definition = getShipClass(slot.shipClassId);
    const ship = createDeveloperShipState({
      id: slot.id,
      team: slot.team,
      shipClassId: slot.shipClassId,
      position: slot.position,
      heading: slot.heading,
      mainGunMounts: build ? Math.max(1, countInstalled(build.slots.mainGun)) : definition.starterSlots.mainGun,
      torpedoLauncherMounts: build ? countInstalled(build.slots.torpedo) : definition.starterSlots.torpedo,
      depthChargeMounts: build ? countInstalled(build.slots.depthCharge) : definition.starterSlots.depthCharge,
      antiAirMounts: build ? countInstalled(build.slots.antiAir) : definition.starterSlots.antiAir,
      secondaryGunIds: build
        ? build.slots.sideGun.filter((entry): entry is string => entry !== null) as SecondaryGunId[]
        : Array.from({ length: definition.starterSlots.sideGun }, () => "sideGun-common"),
      installedEquipment: build ? cloneInstalledEquipment(build) : slot.installedEquipment,
      aiControlled: slot.aiControlled,
      countsForVictory: slot.countsForVictory,
    });
    if (slot.humanPeerId) assignments.set(slot.humanPeerId, slot.id);
    return ship;
  });
  return { state, assignments };
}

export class HostBattleSession implements AuthoritativeBattleSession {
  readonly role = "host" as const;

  private readonly localSession: LocalBattleSession;

  private readonly activeAssignments: Map<string, string>;

  private readonly hostPeerId: string;

  private readonly guestPeerId: string;

  private guestInput?: CachedGuestInput;

  private guestCommand?: ControlCommand;

  private serverTickValue = 0;

  private readonly lastProcessedByPeer = new Map<string, number>();

  private readonly acceptedTimestampsByPeer = new Map<string, number[]>();

  constructor(config: HostBattleSessionConfig) {
    const built = buildState(config);
    this.localSession = new LocalBattleSession(built.state, {
      includeDeveloperAi: config.includeDeveloperAi ?? false,
    });
    this.activeAssignments = built.assignments;
    this.hostPeerId = config.hostPeerId;
    this.guestPeerId = config.guestPeerId;
    this.lastProcessedByPeer.set(config.hostPeerId, 0);
    this.lastProcessedByPeer.set(config.guestPeerId, 0);
  }

  get state(): BattleState {
    return this.localSession.state;
  }

  get assignments(): ReadonlyMap<string, string> {
    return this.activeAssignments;
  }

  acceptInput(peerId: string, frame: InputFramePayload, receivedAt: number): InputAcceptance {
    if (peerId !== this.guestPeerId || !this.activeAssignments.has(peerId)) {
      return { accepted: false, reason: "unknown-peer" };
    }
    if (frame.peerId !== peerId) {
      return { accepted: false, reason: "unknown-peer" };
    }
    if (!Number.isInteger(frame.inputSequence) || frame.inputSequence < 0) {
      return { accepted: false, reason: "invalid-sequence" };
    }
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
    this.guestInput = {
      inputSequence: frame.inputSequence,
      command: sanitized,
    };
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
      ? new Map(hostCommandOrCommands)
      : this.commandsForStep(hostCommandOrCommands as ControlCommand);
    const output = this.localSession.step(commands, dt, options);
    this.serverTickValue += 1;
    if (!(hostCommandOrCommands instanceof Map) && this.guestInput && this.activeAssignments.has(this.guestPeerId)) {
      this.lastProcessedByPeer.set(this.guestPeerId, this.guestInput.inputSequence);
      this.guestCommand = this.guestInput.command;
      this.guestInput = undefined;
    }
    return {
      ...output,
      serverTick: this.serverTickValue,
      snapshots: this.serverTickValue % SNAPSHOT_INTERVAL_TICKS === 0
        ? this.publishSnapshots()
        : new Map(),
    };
  }

  disconnectGuest(_now: number): void {
    const guestShipId = this.activeAssignments.get(this.guestPeerId);
    if (guestShipId) {
      const guestShip = this.state.ships.find((ship) => ship.id === guestShipId);
      if (guestShip) guestShip.aiControlled = true;
      this.activeAssignments.delete(this.guestPeerId);
    }
    this.guestInput = undefined;
    this.guestCommand = undefined;
    this.acceptedTimestampsByPeer.delete(this.guestPeerId);
  }

  reset(state: BattleState): void {
    this.localSession.reset(state);
    this.serverTickValue = 0;
    this.guestInput = undefined;
    this.guestCommand = undefined;
    this.acceptedTimestampsByPeer.clear();
    this.lastProcessedByPeer.set(this.hostPeerId, 0);
    this.lastProcessedByPeer.set(this.guestPeerId, 0);
  }

  private commandsForStep(hostCommand: ControlCommand): Map<string, ControlCommand> {
    const commands = new Map<string, ControlCommand>();
    const hostShipId = this.activeAssignments.get(this.hostPeerId);
    if (hostShipId) commands.set(hostShipId, hostCommand);
    const guestShipId = this.activeAssignments.get(this.guestPeerId);
    if (guestShipId) {
      const guestShip = this.state.ships.find((ship) => ship.id === guestShipId);
      const command = this.guestInput?.command ?? this.guestCommand ?? (guestShip ? idleCommandFor(guestShip) : undefined);
      if (command) commands.set(guestShipId, command);
    }
    return commands;
  }

  private publishSnapshots(): ReadonlyMap<string, PlayerSnapshotPayload> {
    const snapshots = new Map<string, PlayerSnapshotPayload>();
    for (const [peerId, shipId] of this.activeAssignments.entries()) {
      snapshots.set(
        peerId,
        replicationViewFor(
          this.state,
          shipId,
          this.serverTickValue,
          this.lastProcessedByPeer.get(peerId) ?? 0,
        ),
      );
    }
    return snapshots;
  }
}
