import { createDeveloperShipState, createInitialState } from "../sim/simulation";
import type { BattleState, ControlCommand, PlayerTargetView, ShipState, Vec3 } from "../sim/types";
import { LAN_PROTOCOL_VERSION, validateRemoteCommand, type InputFrame, type LanPeerDisconnectedReason, type PlayerSnapshotPayload } from "./protocol";
import { SnapshotBuffer } from "./snapshotBuffer";
import {
  distanceMeters,
  headingErrorDegrees,
  lerpAngle,
  lerpNumber,
  lerpVec3,
  reconciliationMode,
  wrapAngle,
} from "./reconciliation";

const INTERPOLATION_DELAY_MS = 120;
const FREEZE_AFTER_MS = 500;
const PREDICTION_STEP_MS = 1000 / 30;
const PREDICTED_MAX_SPEED_KNOTS = 220;
const PREDICTED_TURN_RATE_RAD_PER_SECOND = Math.PI / 4;
const KNOTS_TO_METERS_PER_SECOND = 0.514444;

type SnapshotAcceptanceReason = "accepted" | "stale-tick" | "stale-time" | "invalid-time";

export interface SnapshotAcceptance {
  accepted: boolean;
  reason: SnapshotAcceptanceReason;
}

export interface ReplicatedBattleView {
  state: BattleState;
  contacts: readonly PlayerTargetView[];
  connected: boolean;
  disconnectReason?: LanPeerDisconnectedReason;
  controlledShipId?: string;
  serverTick: number;
}

export interface ClientBattleSessionConfig {
  roomId: string;
  peerId: string;
  gameVersion: string;
  contentHash: string;
}

interface PendingInput {
  readonly inputSequence: number;
  readonly command: ControlCommand;
  readonly submittedAt: number;
}

interface InterpolatedFriendly {
  readonly id: string;
  readonly shipClassId: string;
  readonly position: Vec3;
  readonly heading: number;
  readonly speedKnots: number;
  readonly hullRatio: number;
}

interface InterpolatedSelf {
  readonly id: string;
  readonly team: string;
  readonly shipClassId: string;
  readonly position: Vec3;
  readonly heading: number;
  readonly speedKnots: number;
  readonly throttle: number;
  readonly hull: number;
  readonly maxHull: number;
  readonly reloadRemaining: number;
  readonly torpedoReloadRemaining: number;
  readonly smokeCharges: number;
  readonly hydroCharges: number;
}

interface InterpolatedSnapshot {
  readonly controlledShipId: string;
  readonly serverTick: number;
  readonly time: number;
  readonly self: InterpolatedSelf;
  readonly friendlies: readonly InterpolatedFriendly[];
  readonly contacts: readonly PlayerTargetView[];
  readonly objective: BattleState["objective"];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asVec3(value: unknown): Vec3 | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const x = asNumber(record.x);
  const y = asNumber(record.y);
  const z = asNumber(record.z);
  return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
}

function buildTargetView(contact: Record<string, unknown>): PlayerTargetView | undefined {
  const id = asString(contact.id);
  const position = asVec3(contact.position);
  const heading = asNumber(contact.heading);
  const speedKnots = asNumber(contact.speedKnots);
  const rangeMeters = asNumber(contact.rangeMeters);
  const confidence = asNumber(contact.confidence);
  const estimatedHullRatio = asNumber(contact.estimatedHullRatio);
  const lastObservedAt = asNumber(contact.observedAt);
  if (!id || !position || heading === undefined || speedKnots === undefined || rangeMeters === undefined || confidence === undefined || estimatedHullRatio === undefined || lastObservedAt === undefined) {
    return undefined;
  }
  return {
    id,
    team: contact.team === "player" ? "player" : "enemy",
    mode: "tracking",
    live: true,
    confidence,
    lastObservedAt,
    position,
    heading,
    speedKnots,
    rangeMeters,
    estimatedHullRatio,
  };
}

function interpolateTargets(previous: readonly Record<string, unknown>[], next: readonly Record<string, unknown>[], alpha: number): PlayerTargetView[] {
  const previousById = new Map(previous.map((entry) => [asString(entry.id), entry]));
  const interpolated: PlayerTargetView[] = [];
  for (const nextEntry of next) {
    const id = asString(nextEntry.id);
    if (!id) continue;
    const previousEntry = previousById.get(id);
    const nextView = buildTargetView(nextEntry);
    if (!nextView) continue;
    const previousView = previousEntry ? buildTargetView(previousEntry) : undefined;
    if (!previousView) {
      interpolated.push(nextView);
      continue;
    }
    interpolated.push({
      ...nextView,
      position: lerpVec3(previousView.position, nextView.position, alpha),
      heading: lerpAngle(previousView.heading, nextView.heading, alpha),
      speedKnots: lerpNumber(previousView.speedKnots, nextView.speedKnots, alpha),
      rangeMeters: lerpNumber(previousView.rangeMeters, nextView.rangeMeters, alpha),
      confidence: lerpNumber(previousView.confidence, nextView.confidence, alpha),
      estimatedHullRatio: lerpNumber(previousView.estimatedHullRatio, nextView.estimatedHullRatio, alpha),
      lastObservedAt: lerpNumber(previousView.lastObservedAt, nextView.lastObservedAt, alpha),
    });
  }
  return interpolated;
}

function snapshotTimeSeconds(snapshot: PlayerSnapshotPayload): number {
  return snapshot.time;
}

function makeFriendly(ship: InterpolatedFriendly): ShipState {
  const state = createDeveloperShipState({
    id: ship.id,
    team: "player",
    shipClassId: ship.shipClassId as ShipState["shipClassId"],
    position: ship.position,
    heading: ship.heading,
    aiControlled: false,
  });
  state.previousPosition = { ...ship.position };
  state.speedKnots = ship.speedKnots;
  state.throttle = Math.max(-1, Math.min(1, ship.speedKnots / PREDICTED_MAX_SPEED_KNOTS));
  state.hull = Math.max(1, ship.hullRatio * 100);
  state.maxHull = 100;
  state.recoverableHull = state.hull;
  return state;
}


function sanitizeLocalCommandInput(command: ControlCommand): ControlCommand {
  const sanitized: ControlCommand = {
    throttle: command.throttle,
    rudder: command.rudder,
    aimPoint: command.aimPoint,
    fire: command.fire,
  };
  if (command.weaponSlot !== undefined) sanitized.weaponSlot = command.weaponSlot;
  if (command.repairHull !== undefined) sanitized.repairHull = command.repairHull;
  if (command.damageControlPriority !== undefined) sanitized.damageControlPriority = command.damageControlPriority;
  if (command.ammoType !== undefined) sanitized.ammoType = command.ammoType;
  if (command.torpedoSpread !== undefined) sanitized.torpedoSpread = command.torpedoSpread;
  if (command.activateSmoke !== undefined) sanitized.activateSmoke = command.activateSmoke;
  if (command.activateHydro !== undefined) sanitized.activateHydro = command.activateHydro;
  if (command.deployDepthCharge !== undefined) sanitized.deployDepthCharge = command.deployDepthCharge;
  if (command.airMission !== undefined) sanitized.airMission = command.airMission;
  if (command.airMissions !== undefined) sanitized.airMissions = command.airMissions;
  return sanitized;
}

function cloneObjective(source: Record<string, unknown>, fallback: BattleState["objective"]): BattleState["objective"] {
  const center = asVec3(source.center) ?? fallback.center;
  const radius = asNumber(source.radius) ?? fallback.radius;
  const captureProgress = asNumber(source.captureProgress) ?? fallback.captureProgress;
  const owner = source.owner === "player" || source.owner === "enemy" ? source.owner : undefined;
  const capturingTeam = source.capturingTeam === "player" || source.capturingTeam === "enemy" ? source.capturingTeam : undefined;
  const contested = typeof source.contested === "boolean" ? source.contested : fallback.contested;
  const scoresSource = (source.scores && typeof source.scores === "object") ? source.scores as Record<string, unknown> : {};
  return {
    center,
    radius,
    captureProgress,
    owner,
    capturingTeam,
    contested,
    occupants: { ...fallback.occupants },
    scores: {
      player: asNumber(scoresSource.player) ?? fallback.scores.player,
      enemy: asNumber(scoresSource.enemy) ?? fallback.scores.enemy,
    },
  };
}

export class ClientBattleSession {
  readonly role = "client" as const;

  private readonly snapshots = new SnapshotBuffer<PlayerSnapshotPayload>();
  private readonly templateState = createInitialState(1, "battle");
  private readonly pendingInputs: PendingInput[] = [];
  private lastInputSequence = 0;
  private lastSubmittedAt = -Infinity;
  private disconnectState: { connected: boolean; reason?: LanPeerDisconnectedReason } = { connected: true };

  constructor(private readonly config: ClientBattleSessionConfig) {}

  submitLocalCommand(command: ControlCommand, now: number): InputFrame {
    if (!Number.isFinite(now) || now < 0) throw new Error("invalid-now");
    if (now <= this.lastSubmittedAt) throw new Error("non-monotonic-now");
    const sanitized = validateRemoteCommand(sanitizeLocalCommandInput(command));
    if (!sanitized) throw new Error("invalid-command");
    this.lastSubmittedAt = now;
    this.lastInputSequence += 1;
    this.pendingInputs.push({
      inputSequence: this.lastInputSequence,
      command: sanitized,
      submittedAt: now,
    });
    return {
      protocolVersion: LAN_PROTOCOL_VERSION,
      gameVersion: this.config.gameVersion,
      contentHash: this.config.contentHash,
      roomId: this.config.roomId,
      sequence: this.lastInputSequence,
      sentAt: Math.round(now),
      type: "input-frame",
      payload: {
        peerId: this.config.peerId,
        inputSequence: this.lastInputSequence,
        command: sanitized,
      },
    };
  }

  receiveSnapshot(snapshot: PlayerSnapshotPayload, receivedAt: number): SnapshotAcceptance {
    if (!Number.isFinite(snapshot.time) || snapshot.time < 0) {
      return { accepted: false, reason: "invalid-time" };
    }
    const latest = this.snapshots.latest();
    if (latest && snapshot.serverTick <= latest.snapshot.serverTick) {
      return { accepted: false, reason: "stale-tick" };
    }
    if (latest && snapshot.time <= latest.snapshot.time) {
      return { accepted: false, reason: "stale-time" };
    }
    this.snapshots.push(structuredClone(snapshot), receivedAt);
    while (this.pendingInputs.length > 0 && this.pendingInputs[0]!.inputSequence <= snapshot.lastProcessedInputSequence) {
      this.pendingInputs.shift();
    }
    return { accepted: true, reason: "accepted" };
  }

  renderState(now: number): ReplicatedBattleView {
    const sampled = this.sampleSnapshot(now);
    if (!sampled) {
      return {
        state: structuredClone(this.templateState),
        contacts: [],
        connected: this.disconnectState.connected,
        disconnectReason: this.disconnectState.reason,
        serverTick: 0,
      };
    }

    const predictedSelf = this.predictSelf(sampled.self, now);
    const state = structuredClone(this.templateState);
    state.time = sampled.time;
    state.ships = [predictedSelf, ...sampled.friendlies.map(makeFriendly)];
    state.objective = sampled.objective;
    state.projectiles = [];
    state.airSquadrons = [];
    state.airEvents = [];
    state.shots = [];
    state.impacts = [];
    state.smokeClouds = [];
    state.depthCharges = [];
    state.underwaterTargets = [];
    return {
      state,
      contacts: sampled.contacts,
      connected: this.disconnectState.connected,
      disconnectReason: this.disconnectState.reason,
      controlledShipId: sampled.controlledShipId,
      serverTick: sampled.serverTick,
    };
  }

  disconnect(reason: LanPeerDisconnectedReason): void {
    this.disconnectState = { connected: false, reason };
  }

  private sampleSnapshot(now: number): InterpolatedSnapshot | undefined {
    const latest = this.snapshots.latest();
    if (!latest) return undefined;
    const targetReceivedAt = now - INTERPOLATION_DELAY_MS;
    const stale = latest.receivedAt + FREEZE_AFTER_MS < targetReceivedAt;
    const sampled = stale
      ? { previous: latest, next: latest, alpha: 0 }
      : this.snapshots.sample(targetReceivedAt) ?? { previous: latest, next: latest, alpha: 0 };
    return this.interpolate(sampled.previous.snapshot, sampled.next.snapshot, sampled.alpha);
  }

  private interpolate(previous: PlayerSnapshotPayload, next: PlayerSnapshotPayload, alpha: number): InterpolatedSnapshot {
    const previousSelf = previous.self as Record<string, unknown>;
    const nextSelf = next.self as Record<string, unknown>;
    const previousPosition = asVec3(previousSelf.position) ?? { x: 0, y: 0, z: 0 };
    const nextPosition = asVec3(nextSelf.position) ?? previousPosition;
    const previousHeading = asNumber(previousSelf.heading) ?? 0;
    const nextHeading = asNumber(nextSelf.heading) ?? previousHeading;
    const previousSpeed = asNumber(previousSelf.speedKnots) ?? 0;
    const nextSpeed = asNumber(nextSelf.speedKnots) ?? previousSpeed;
    const previousThrottle = asNumber(previousSelf.throttle) ?? 0;
    const nextThrottle = asNumber(nextSelf.throttle) ?? previousThrottle;
    const newerSelf = alpha >= 0.5 ? nextSelf : previousSelf;
    const friendlies = next.friendlies.map((entry, index) => {
      const nextFriendly = entry as Record<string, unknown>;
      const previousFriendly = (previous.friendlies[index] ?? entry) as Record<string, unknown>;
      return {
        id: asString(nextFriendly.id) ?? `friendly-${index}`,
        shipClassId: asString(nextFriendly.shipClassId) ?? "fletcher",
        position: lerpVec3(asVec3(previousFriendly.position) ?? { x: 0, y: 0, z: 0 }, asVec3(nextFriendly.position) ?? { x: 0, y: 0, z: 0 }, alpha),
        heading: lerpAngle(asNumber(previousFriendly.heading) ?? 0, asNumber(nextFriendly.heading) ?? 0, alpha),
        speedKnots: lerpNumber(asNumber(previousFriendly.speedKnots) ?? 0, asNumber(nextFriendly.speedKnots) ?? 0, alpha),
        hullRatio: lerpNumber(asNumber(previousFriendly.hullRatio) ?? 1, asNumber(nextFriendly.hullRatio) ?? 1, alpha),
      };
    });
    return {
      controlledShipId: next.controlledShipId,
      serverTick: next.serverTick,
      time: lerpNumber(snapshotTimeSeconds(previous), snapshotTimeSeconds(next), alpha),
      self: {
        id: asString(newerSelf.id) ?? next.controlledShipId,
        team: asString(newerSelf.team) ?? "player",
        shipClassId: asString(newerSelf.shipClassId) ?? "fletcher",
        position: lerpVec3(previousPosition, nextPosition, alpha),
        heading: lerpAngle(previousHeading, nextHeading, alpha),
        speedKnots: lerpNumber(previousSpeed, nextSpeed, alpha),
        throttle: lerpNumber(previousThrottle, nextThrottle, alpha),
        hull: asNumber(newerSelf.hull) ?? 1,
        maxHull: asNumber(newerSelf.maxHull) ?? 1,
        reloadRemaining: asNumber(newerSelf.reloadRemaining) ?? 0,
        torpedoReloadRemaining: asNumber(newerSelf.torpedoReloadRemaining) ?? 0,
        smokeCharges: asNumber(newerSelf.smokeCharges) ?? 0,
        hydroCharges: asNumber(newerSelf.hydroCharges) ?? 0,
      },
      friendlies,
      contacts: interpolateTargets(previous.contacts, next.contacts, alpha),
      objective: cloneObjective(next.objective, this.templateState.objective),
    };
  }

  private predictSelf(authoritative: InterpolatedSelf, now: number): ShipState {
    const ship = createDeveloperShipState({
      id: authoritative.id,
      team: authoritative.team === "enemy" ? "enemy" : "player",
      shipClassId: authoritative.shipClassId as ShipState["shipClassId"],
      position: authoritative.position,
      heading: authoritative.heading,
      aiControlled: false,
    });
    ship.previousPosition = { ...authoritative.position };
    ship.speedKnots = authoritative.speedKnots;
    ship.throttle = authoritative.throttle;
    ship.hull = authoritative.hull;
    ship.maxHull = authoritative.maxHull;
    ship.recoverableHull = authoritative.hull;
    ship.reloadRemaining = authoritative.reloadRemaining;
    ship.torpedoReloadRemaining = authoritative.torpedoReloadRemaining;
    ship.smokeCharges = authoritative.smokeCharges;
    ship.hydroCharges = authoritative.hydroCharges;

    if (this.pendingInputs.length === 0) return ship;

    for (let index = 0; index < this.pendingInputs.length; index += 1) {
      const pending = this.pendingInputs[index]!;
      const nextAt = index + 1 < this.pendingInputs.length
        ? this.pendingInputs[index + 1]!.submittedAt
        : now;
      const dtMs = Math.max(0, Math.min(PREDICTION_STEP_MS, nextAt - pending.submittedAt));
      const dt = dtMs / 1000;
      ship.heading = wrapAngle(ship.heading + pending.command.rudder * PREDICTED_TURN_RATE_RAD_PER_SECOND * dt);
      ship.throttle = pending.command.throttle;
      ship.speedKnots = Math.max(0, Math.min(PREDICTED_MAX_SPEED_KNOTS, Math.abs(pending.command.throttle) * PREDICTED_MAX_SPEED_KNOTS));
      ship.position = {
        x: ship.position.x + Math.sin(ship.heading) * ship.speedKnots * KNOTS_TO_METERS_PER_SECOND * dt,
        y: ship.position.y,
        z: ship.position.z + Math.cos(ship.heading) * ship.speedKnots * KNOTS_TO_METERS_PER_SECOND * dt,
      };
      ship.previousPosition = { ...ship.position };
    }

    if (this.pendingInputs.length > 0) return ship;

    const positionError = distanceMeters(ship.position, authoritative.position);
    const headingError = headingErrorDegrees(ship.heading, authoritative.heading);
    const mode = reconciliationMode(positionError, headingError);
    if (mode === "snap") {
      ship.position = { ...authoritative.position };
      ship.previousPosition = { ...authoritative.position };
      ship.heading = authoritative.heading;
      ship.speedKnots = authoritative.speedKnots;
      ship.throttle = authoritative.throttle;
      return ship;
    }
    const alpha = mode === "blend" ? 0.35 : 0.65;
    ship.position = lerpVec3(ship.position, authoritative.position, alpha);
    ship.previousPosition = { ...ship.position };
    ship.heading = lerpAngle(ship.heading, authoritative.heading, alpha);
    ship.speedKnots = lerpNumber(ship.speedKnots, authoritative.speedKnots, alpha);
    ship.throttle = lerpNumber(ship.throttle, authoritative.throttle, alpha);
    return ship;
  }
}
