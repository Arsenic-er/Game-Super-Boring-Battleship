import {
  EQUIPMENT_BY_ID,
  SHIP_CLASS_SLOT_COUNTS,
  isEquipmentCompatible,
  type EquipmentCategory,
} from "../profile/equipmentCatalog";
import type {
  JoinRequestPayload,
  LanBuildDescriptor,
  LanJoinRejectedReason,
  LanRoomPhase,
} from "./protocol";
import { minimumSeaReadySlotCounts } from "../profile/loadoutPolicy";

const BUILD_CATEGORIES: EquipmentCategory[] = [
  "mainGun",
  "torpedo",
  "antiAir",
  "sideGun",
  "depthCharge",
  "magazine",
  "engine",
  "steering",
];

type LobbyPhase = Extract<LanRoomPhase, "lobby" | "in-match" | "post-match" | "closing">;

type LobbyFailureReason = "unknown-peer" | "invalid-build" | "cannot-start" | "invalid-phase";

export interface LobbyPlayer {
  peerId: string;
  commanderName: string;
  role: "host" | "guest";
  build?: LanBuildDescriptor;
  ready: boolean;
  connected: boolean;
}

export interface LobbySnapshot {
  phase: LobbyPhase;
  roomName: string;
  hostPeerId: string;
  players: readonly LobbyPlayer[];
}

export interface HostLobbyConfig {
  roomName: string;
  hostPeerId: string;
  hostCommanderName: string;
  gameVersion: string;
  contentHash: string;
  hostBuild?: LanBuildDescriptor;
}

export interface JoinResult {
  accepted: boolean;
  reason?: LanJoinRejectedReason;
  detail?: string;
  lobby: LobbySnapshot;
}

export interface LobbyResult {
  ok: boolean;
  reason?: LobbyFailureReason;
  detail?: string;
  lobby: LobbySnapshot;
}

function cloneBuild(build: LanBuildDescriptor): LanBuildDescriptor {
  return {
    buildId: build.buildId,
    buildName: build.buildName,
    shipClassId: build.shipClassId,
    slots: structuredClone(build.slots),
  };
}

function freezeBuild(build: LanBuildDescriptor): LanBuildDescriptor {
  const cloned = cloneBuild(build);
  const slots = Object.freeze({
    mainGun: Object.freeze([...cloned.slots.mainGun]),
    torpedo: Object.freeze([...cloned.slots.torpedo]),
    antiAir: Object.freeze([...cloned.slots.antiAir]),
    sideGun: Object.freeze([...cloned.slots.sideGun]),
    depthCharge: Object.freeze([...cloned.slots.depthCharge]),
    magazine: Object.freeze([...cloned.slots.magazine]),
    engine: Object.freeze([...cloned.slots.engine]),
    steering: Object.freeze([...cloned.slots.steering]),
  });
  return Object.freeze({
    buildId: cloned.buildId,
    buildName: cloned.buildName,
    shipClassId: cloned.shipClassId,
    slots,
  }) as LanBuildDescriptor;
}

function clonePlayer(player: LobbyPlayer): LobbyPlayer {
  return {
    peerId: player.peerId,
    commanderName: player.commanderName,
    role: player.role,
    build: player.build ? cloneBuild(player.build) : undefined,
    ready: player.ready,
    connected: player.connected,
  };
}

function freezePlayer(player: LobbyPlayer): LobbyPlayer {
  return Object.freeze({
    peerId: player.peerId,
    commanderName: player.commanderName,
    role: player.role,
    build: player.build ? freezeBuild(player.build) : undefined,
    ready: player.ready,
    connected: player.connected,
  });
}

function freezeSnapshot(snapshot: LobbySnapshot): LobbySnapshot {
  const players = snapshot.players.map((player) => freezePlayer(player));
  return Object.freeze({
    phase: snapshot.phase,
    roomName: snapshot.roomName,
    hostPeerId: snapshot.hostPeerId,
    players: Object.freeze(players),
  });
}

export function normalizeLanBuildDescriptor(build: LanBuildDescriptor): LanBuildDescriptor | undefined {
  const slotCounts = SHIP_CLASS_SLOT_COUNTS[build.shipClassId];
  if (!slotCounts) return undefined;
  const slots = {} as LanBuildDescriptor["slots"];

  for (const category of BUILD_CATEGORIES) {
    const source = build.slots[category];
    const expectedCount = slotCounts[category];
    if (!Array.isArray(source) || source.length !== expectedCount) return undefined;
    let invalid = false;
    slots[category] = source.map((itemId) => {
      if (itemId === null) return null;
      const item = EQUIPMENT_BY_ID[itemId];
      if (!item || item.category !== category || !isEquipmentCompatible(item, build.shipClassId)) {
        invalid = true;
        return null;
      }
      return item.id;
    });
    if (invalid) return undefined;
  }

  return {
    buildId: build.buildId,
    buildName: build.buildName,
    shipClassId: build.shipClassId,
    slots,
  };
}

export function isLanBuildSeaReady(build: LanBuildDescriptor): boolean {
  const normalized = normalizeLanBuildDescriptor(build);
  if (!normalized) return false;
  const minimumCounts = minimumSeaReadySlotCounts(normalized.shipClassId);
  return BUILD_CATEGORIES.every((category) => (
    normalized.slots[category].filter((itemId) => itemId !== null).length >= minimumCounts[category]
  ));
}

export class HostLobby {
  private phase: LobbyPhase = "lobby";

  private readonly host: LobbyPlayer;

  private guest?: LobbyPlayer;

  private readonly roomName: string;

  private readonly hostPeerId: string;

  private readonly gameVersion: string;

  private readonly contentHash: string;

  constructor(config: HostLobbyConfig) {
    this.roomName = config.roomName;
    this.hostPeerId = config.hostPeerId;
    this.gameVersion = config.gameVersion;
    this.contentHash = config.contentHash;
    const hostBuild = config.hostBuild ? normalizeLanBuildDescriptor(config.hostBuild) : undefined;
    if (config.hostBuild && (!hostBuild || !isLanBuildSeaReady(hostBuild))) throw new Error("invalid-host-build");
    this.host = {
      peerId: config.hostPeerId,
      commanderName: config.hostCommanderName,
      role: "host",
      build: hostBuild,
      ready: false,
      connected: true,
    };
  }

  join(request: JoinRequestPayload): JoinResult {
    if (this.phase !== "lobby") return this.reject("invalid-request", "phase-closed");
    if (request.expectedGameVersion !== this.gameVersion) return this.reject("version-mismatch");
    if (request.expectedContentHash !== this.contentHash) return this.reject("content-mismatch");
    if (request.peerId === this.host.peerId || this.guest?.peerId === request.peerId) {
      return this.reject("already-joined");
    }
    if (this.guest) return this.reject("room-full");
    const build = request.build ? normalizeLanBuildDescriptor(request.build) : undefined;
    if (request.build && (!build || !isLanBuildSeaReady(build))) return this.reject("invalid-build");
    this.guest = {
      peerId: request.peerId,
      commanderName: request.commanderName,
      role: "guest",
      build,
      ready: false,
      connected: true,
    };
    return { accepted: true, lobby: this.snapshot() };
  }

  leave(peerId: string): void {
    if (peerId === this.host.peerId) {
      this.host.connected = false;
      this.host.ready = false;
      this.phase = "closing";
      return;
    }
    if (this.guest?.peerId === peerId) {
      if (this.phase === "in-match") {
        this.phase = "closing";
        this.guest.connected = false;
        this.guest.ready = false;
        return;
      }
      this.guest = undefined;
      this.phase = "lobby";
    }
  }

  setBuild(peerId: string, build: LanBuildDescriptor): LobbyResult {
    if (this.phase !== "lobby") return this.failure("invalid-phase");
    const player = this.findPlayer(peerId);
    if (!player) return this.failure("unknown-peer");
    const normalized = normalizeLanBuildDescriptor(build);
    if (!normalized || !isLanBuildSeaReady(normalized)) return this.failure("invalid-build");
    const changed = JSON.stringify(player.build) !== JSON.stringify(normalized);
    player.build = normalized;
    if (changed) player.ready = false;
    return this.success();
  }

  setReady(peerId: string, ready: boolean): LobbyResult {
    if (this.phase !== "lobby") return this.failure("invalid-phase");
    const player = this.findPlayer(peerId);
    if (!player) return this.failure("unknown-peer");
    if (ready && (!player.connected || !player.build || !isLanBuildSeaReady(player.build))) {
      return this.failure("invalid-build");
    }
    player.ready = ready;
    return this.success();
  }

  canStart(): boolean {
    const guest = this.guest;
    return this.phase === "lobby"
      && this.host.connected
      && this.host.ready
      && !!this.host.build
      && isLanBuildSeaReady(this.host.build)
      && !!guest
      && guest.connected
      && guest.ready
      && !!guest.build
      && isLanBuildSeaReady(guest.build);
  }

  start(): LobbyResult {
    if (!this.canStart()) return this.failure("cannot-start");
    this.phase = "in-match";
    return this.success();
  }

  finishMatch(): LobbyResult {
    if (this.phase !== "in-match") return this.failure("invalid-phase");
    this.phase = "post-match";
    for (const player of this.players()) player.ready = false;
    return this.success();
  }

  returnToLobby(): LobbyResult {
    if (this.phase !== "post-match") return this.failure("invalid-phase");
    this.phase = "lobby";
    for (const player of this.players()) player.ready = false;
    return this.success();
  }

  snapshot(): LobbySnapshot {
    return freezeSnapshot({
      phase: this.phase,
      roomName: this.roomName,
      hostPeerId: this.hostPeerId,
      players: this.players().map((player) => clonePlayer(player)),
    });
  }

  private players(): LobbyPlayer[] {
    return this.guest ? [this.host, this.guest] : [this.host];
  }

  private findPlayer(peerId: string): LobbyPlayer | undefined {
    return this.players().find((player) => player.peerId === peerId);
  }

  private reject(reason: LanJoinRejectedReason, detail?: string): JoinResult {
    return { accepted: false, reason, detail, lobby: this.snapshot() };
  }

  private success(): LobbyResult {
    return { ok: true, lobby: this.snapshot() };
  }

  private failure(reason: LobbyFailureReason, detail?: string): LobbyResult {
    return { ok: false, reason, detail, lobby: this.snapshot() };
  }
}
