import type { SavedShipBuild } from "../profile/localProfile";
import type { LocalProfile } from "../profile/localProfile";
import { savedBuildReadiness } from "../profile/savedBuilds";
import type { MultiplayerActionResult, MultiplayerMenuCallbacks, MultiplayerSearchResult } from "../ui/multiplayerMenu";
import type { BattleshipLanApi, LanBridgeEvent, LanSendTarget } from "./lanBridge";
import { ClientBattleSession } from "./clientBattleSession";
import { HostBattleSession } from "./hostBattleSession";
import { HostLobby, type LobbySnapshot } from "./lobbyState";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "./networkFingerprint";
import {
  LAN_DISCOVERY_PORT,
  LAN_GAME_PORTS,
  LAN_PROTOCOL_VERSION,
  encodeLanMessage,
  parseLanMessage,
  type LanBuildDescriptor,
  type LanGamePort,
  type LanJoinRejectedReason,
  type LanMessage,
  type LobbySnapshotPayload,
} from "./protocol";
import { replicationViewFor } from "./replicationView";
import { RoomDirectory } from "./roomDirectory";

const JOIN_TIMEOUT_MS = 4_000;
const SEARCH_WINDOW_MS = 350;
const DEFAULT_TEAM_SIZE = 3;

type LanRole = "none" | "host" | "client";

type PendingJoinResolution = MultiplayerActionResult;
type LanMessageOf<T extends LanMessage["type"]> = Extract<LanMessage, { type: T }>;

interface PendingJoin {
  resolve: (result: PendingJoinResolution) => void;
  timeout: number;
}

export interface LanMultiplayerRuntimeHooks {
  onHostMatchStarted: (session: HostBattleSession) => void;
  onClientMatchStarted: (session: ClientBattleSession) => void;
  onReturnToMenu: (notice: string) => void;
  onNotice: (notice: string) => void;
  now?: () => number;
}

function cloneLobby(snapshot: ReturnType<HostLobby["snapshot"]> | LobbySnapshotPayload): LobbySnapshot {
  const cloned = structuredClone(snapshot) as LobbySnapshotPayload;
  return {
    phase: cloned.phase === "in-match" ? "in-match" : cloned.phase === "closing" ? "closing" : "lobby",
    roomName: cloned.roomName,
    hostPeerId: cloned.hostPeerId,
    players: cloned.players.map((player) => ({ ...player })),
  };
}

function lobbyPayload(snapshot: LobbySnapshot): LobbySnapshotPayload {
  return {
    phase: snapshot.phase,
    roomName: snapshot.roomName,
    hostPeerId: snapshot.hostPeerId,
    players: snapshot.players.map((player) => ({ ...player })),
  };
}

function savedBuildToLan(build: SavedShipBuild): LanBuildDescriptor {
  return {
    buildId: build.id,
    buildName: build.name,
    shipClassId: build.shipClassId,
    slots: structuredClone(build.slots),
  };
}

function joinRejectedSource(reason: LanJoinRejectedReason, detail?: string): string {
  switch (reason) {
    case "room-full":
      return "房间已满。";
    case "version-mismatch":
      return "游戏版本不一致，无法加入。";
    case "content-mismatch":
      return "内容哈希不一致，无法加入。";
    case "invalid-build":
      return "当前方案未通过联机校验。";
    case "already-joined":
      return "该联机实例已在房间中。";
    case "invalid-request":
    default:
      return detail ? `加入请求被拒绝：${detail}` : "加入请求被拒绝。";
  }
}

function bridgeErrorSource(code: string, message: string): string {
  if (code === "message-too-large") return "联机消息超出允许大小。";
  if (code === "socket-error") return message || "联机连接已断开。";
  return message || `联机错误：${code}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class LanMultiplayerRuntime {
  readonly callbacks: MultiplayerMenuCallbacks;

  private profile: LocalProfile;
  private readonly peerId = globalThis.crypto?.randomUUID?.() ?? `peer-${Date.now()}`;
  private readonly discoveredRooms = new RoomDirectory();
  private readonly unsubscribeBridge: () => void;
  private readonly now: () => number;
  private roleValue: LanRole = "none";
  private roomId?: string;
  private roomPort?: LanGamePort;
  private sequence = 0;
  private hostLobby?: HostLobby;
  private lobby?: LobbySnapshot;
  private hostSessionValue?: HostBattleSession;
  private clientSessionValue?: ClientBattleSession;
  private pendingJoin?: PendingJoin;
  private guestConnectionId?: string;

  constructor(
    private readonly bridge: BattleshipLanApi,
    profile: LocalProfile,
    private readonly hooks: LanMultiplayerRuntimeHooks,
  ) {
    this.profile = profile;
    this.now = hooks.now ?? (() => performance.now());
    this.unsubscribeBridge = bridge.subscribe((event) => {
      void this.handleBridgeEvent(event);
    });
    this.callbacks = {
      capabilities: async () => await this.bridge.capabilities(),
      createRoom: async ({ roomName, buildId }) => await this.createRoom(roomName, buildId),
      searchRooms: async () => await this.searchRooms(),
      manualJoin: async ({ address, port }) => await this.manualJoin(address, port),
      leaveRoom: async () => await this.leaveRoom(),
      readyLobby: async ({ ready, buildId }) => await this.readyLobby(ready, buildId),
      startLobby: async () => await this.startLobby(),
    };
  }

  get role(): LanRole {
    return this.roleValue;
  }

  get localPeerId(): string {
    return this.peerId;
  }

  get hostSession(): HostBattleSession | undefined {
    return this.hostSessionValue;
  }

  get clientSession(): ClientBattleSession | undefined {
    return this.clientSessionValue;
  }

  setProfile(profile: LocalProfile): void {
    this.profile = profile;
  }

  async dispose(): Promise<void> {
    this.resolvePendingJoin({ ok: false, errorSource: "联机已关闭。" });
    this.unsubscribeBridge();
    await this.cleanupTransport();
  }

  async send(message: LanMessage, target?: LanSendTarget): Promise<void> {
    await this.bridge.send(encodeLanMessage(message), target);
  }

  createEnvelope<T extends LanMessage["type"]>(
    type: T,
    payload: LanMessageOf<T>["payload"],
  ): LanMessageOf<T> {
    return this.nextEnvelope(type, payload as never) as LanMessageOf<T>;
  }

  currentGuestPeerId(): string | undefined {
    return this.lobby?.players.find((player) => player.role === "guest")?.peerId;
  }

  currentGuestConnectionId(): string | undefined {
    return this.guestConnectionId;
  }

  private readyBuild(buildId: string | null): SavedShipBuild | undefined {
    if (!buildId) return undefined;
    const build = this.profile.savedShipBuilds.find((entry) => entry.id === buildId);
    return build && savedBuildReadiness(this.profile, build).ready ? build : undefined;
  }

  private nextEnvelope<T extends LanMessage["type"]>(
    type: T,
    payload: LanMessageOf<T>["payload"],
    roomId: string = this.roomId ?? "lan-pending-room",
  ): LanMessageOf<T> {
    this.sequence += 1;
    return {
      protocolVersion: LAN_PROTOCOL_VERSION,
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
      roomId,
      sequence: this.sequence,
      sentAt: Math.round(this.now()),
      type,
      payload,
    } as LanMessageOf<T>;
  }

  private announcementMessage(): Extract<LanMessage, { type: "room-announcement" }> {
    const snapshot = this.lobby;
    if (!this.roomId || !this.roomPort || !snapshot) throw new Error("room-not-ready");
    return this.nextEnvelope("room-announcement", {
      roomName: snapshot.roomName,
      hostName: snapshot.players.find((player) => player.role === "host")?.commanderName ?? this.profile.commanderName,
      discoveryPort: LAN_DISCOVERY_PORT,
      port: this.roomPort,
      playerCount: snapshot.players.length === 2 ? 2 : 1,
      capacity: 2,
      phase: this.hostSessionValue ? "in-match" : snapshot.phase,
    }, this.roomId);
  }

  private async refreshAnnouncement(): Promise<void> {
    if (!this.roomPort || !this.lobby) return;
    await this.bridge.updateAnnouncement(encodeLanMessage(this.announcementMessage(), 1_024));
  }

  private async broadcastLobbyUpdate(): Promise<void> {
    if (!this.lobby || !this.currentGuestPeerId()) return;
    try {
      await this.send(
        this.nextEnvelope("lobby-update", { lobby: lobbyPayload(this.lobby) }),
        this.guestConnectionId ? { connectionId: this.guestConnectionId } : undefined,
      );
    } catch {
      // Disconnected guests are handled by bridge events; do not block the host UI.
    }
  }

  private roomIdForTarget(address: string, port: LanGamePort): string {
    const known = this.discoveredRooms.list().find((room) => room.address === address && room.port === port);
    return known?.roomId ?? `manual-${address.replace(/\./g, "-")}-${port}`;
  }

  private resolvePendingJoin(result: PendingJoinResolution): void {
    if (!this.pendingJoin) return;
    window.clearTimeout(this.pendingJoin.timeout);
    const resolve = this.pendingJoin.resolve;
    this.pendingJoin = undefined;
    resolve(result);
  }

  private async cleanupTransport(): Promise<void> {
    await Promise.allSettled([
      this.bridge.stopDiscovery(),
      this.bridge.disconnect(),
      this.bridge.closeRoom(),
    ]);
    this.roomId = undefined;
    this.roomPort = undefined;
    this.sequence = 0;
    this.hostLobby = undefined;
    this.lobby = undefined;
    this.hostSessionValue = undefined;
    this.clientSessionValue = undefined;
    this.guestConnectionId = undefined;
    this.roleValue = "none";
  }

  private async createRoom(roomName: string, buildId: string | null): Promise<MultiplayerActionResult> {
    const build = this.readyBuild(buildId);
    if (!build) return { ok: false, errorSource: "请先选择一套可出海的本地方案。" };
    await this.bridge.stopDiscovery();
    this.roomId = globalThis.crypto?.randomUUID?.() ?? `room-${Date.now()}`;
    this.sequence = 0;
    this.hostLobby = new HostLobby({
      roomName,
      hostPeerId: this.peerId,
      hostCommanderName: this.profile.commanderName,
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
      hostBuild: savedBuildToLan(build),
    });
    this.lobby = cloneLobby(this.hostLobby.snapshot());
    const provisionalPort = LAN_GAME_PORTS[0]!;
    const announcement = this.nextEnvelope("room-announcement", {
      roomName,
      hostName: this.profile.commanderName,
      discoveryPort: LAN_DISCOVERY_PORT,
      port: provisionalPort,
      playerCount: 1,
      capacity: 2,
      phase: this.lobby.phase,
    }, this.roomId);
    try {
      const created = await this.bridge.createRoom({ announcementJson: encodeLanMessage(announcement, 1_024) });
      this.roomPort = created.port as LanGamePort;
      await this.refreshAnnouncement();
      return { ok: true, lobby: this.lobby, localPeerId: this.peerId };
    } catch (error) {
      await this.cleanupTransport();
      return { ok: false, errorSource: error instanceof Error ? error.message : String(error) };
    }
  }

  private async searchRooms(): Promise<MultiplayerSearchResult> {
    try {
      await this.bridge.startDiscovery();
      await wait(SEARCH_WINDOW_MS);
      this.discoveredRooms.expire(this.now());
      return { ok: true, rooms: this.discoveredRooms.list() };
    } catch (error) {
      return { ok: false, errorSource: error instanceof Error ? error.message : String(error), rooms: this.discoveredRooms.list() };
    }
  }

  private async manualJoin(address: string, port: LanGamePort): Promise<MultiplayerActionResult> {
    const build = this.readyBuild(this.profile.selectedBattleBuildId);
    if (!build) return { ok: false, errorSource: "请先选择一套可出海的本地方案。" };
    await this.bridge.stopDiscovery();
    const targetRoomId = this.roomIdForTarget(address, port);
    this.roomId = targetRoomId;
    this.sequence = 0;
    try {
      await this.bridge.connect(`ws://${address}:${port}`);
      const result = await new Promise<PendingJoinResolution>((resolve) => {
        this.pendingJoin = {
          resolve,
          timeout: window.setTimeout(() => {
            this.pendingJoin = undefined;
            resolve({ ok: false, errorSource: "加入房间超时。" });
          }, JOIN_TIMEOUT_MS),
        };
        void this.send(this.nextEnvelope("join-request", {
          peerId: this.peerId,
          commanderName: this.profile.commanderName,
          expectedGameVersion: LAN_GAME_VERSION,
          expectedContentHash: LAN_CONTENT_HASH,
          build: savedBuildToLan(build),
        }, targetRoomId)).catch((error) => {
          this.resolvePendingJoin({ ok: false, errorSource: error instanceof Error ? error.message : String(error) });
        });
      });
      if (!result.ok) await this.bridge.disconnect();
      return result;
    } catch (error) {
      this.resolvePendingJoin({ ok: false, errorSource: error instanceof Error ? error.message : String(error) });
      await this.bridge.disconnect();
      return { ok: false, errorSource: error instanceof Error ? error.message : String(error) };
    }
  }

  private async leaveRoom(): Promise<MultiplayerActionResult> {
    const guestPeerId = this.currentGuestPeerId();
    if (this.hostSessionValue && guestPeerId) {
      try {
        await this.send(
          this.nextEnvelope("peer-disconnected", {
            peerId: this.peerId,
            reason: "disconnected",
            fallback: "session-closed",
          }),
          this.guestConnectionId ? { connectionId: this.guestConnectionId } : undefined,
        );
      } catch {
        // The socket may already be gone.
      }
    } else if (this.clientSessionValue || this.lobby) {
      try {
        await this.send(this.nextEnvelope("return-to-lobby", { reason: "guest-request" }));
      } catch {
        // Disconnect still completes local cleanup.
      }
    }
    await this.cleanupTransport();
    return { ok: true };
  }

  private async readyLobby(ready: boolean, buildId: string): Promise<MultiplayerActionResult> {
    const build = this.readyBuild(buildId);
    if (!build) return { ok: false, errorSource: "请先选择一套可出海的本地方案。" };
    if (this.hostLobby) {
      const buildResult = this.hostLobby.setBuild(this.peerId, savedBuildToLan(build));
      if (!buildResult.ok) return { ok: false, errorSource: "当前方案未通过联机校验。" };
      const readyResult = this.hostLobby.setReady(this.peerId, ready);
      if (!readyResult.ok) return { ok: false, errorSource: "当前方案未通过联机校验。" };
      this.lobby = cloneLobby(readyResult.lobby);
      await this.refreshAnnouncement();
      await this.broadcastLobbyUpdate();
      return { ok: true, lobby: this.lobby, localPeerId: this.peerId };
    }
    if (!this.lobby) return { ok: false, errorSource: "尚未加入联机房间。" };
    try {
      await this.send(this.nextEnvelope("ready-request", {
        peerId: this.peerId,
        ready,
        build: savedBuildToLan(build),
      }));
      const player = this.lobby.players.find((entry) => entry.peerId === this.peerId);
      if (player) {
        player.ready = ready;
        player.build = savedBuildToLan(build);
      }
      return { ok: true, lobby: this.lobby, localPeerId: this.peerId };
    } catch (error) {
      return { ok: false, errorSource: error instanceof Error ? error.message : String(error) };
    }
  }

  private async startLobby(): Promise<MultiplayerActionResult> {
    if (!this.hostLobby) return { ok: false, errorSource: "仅房主可启动。" };
    const started = this.hostLobby.start();
    if (!started.ok) return { ok: false, errorSource: "等待客席加入并准备。" };
    this.lobby = cloneLobby(started.lobby);
    const host = this.lobby.players.find((player) => player.role === "host");
    const guest = this.lobby.players.find((player) => player.role === "guest");
    if (!host?.build || !guest?.build) return { ok: false, errorSource: "当前方案未通过联机校验。" };
    const seed = Math.max(1, Math.round(this.now()));
    this.hostSessionValue = new HostBattleSession({
      hostPeerId: host.peerId,
      guestPeerId: guest.peerId,
      seed,
      teamSize: DEFAULT_TEAM_SIZE,
      hostBuild: host.build,
      guestBuild: guest.build,
    });
    this.roleValue = "host";
    this.hooks.onHostMatchStarted(this.hostSessionValue);
    await this.refreshAnnouncement();
    await this.broadcastLobbyUpdate();
    const hostShipId = this.hostSessionValue.assignments.get(host.peerId)!;
    const guestShipId = this.hostSessionValue.assignments.get(guest.peerId)!;
    try {
      const guestTarget = this.guestConnectionId ? { connectionId: this.guestConnectionId } : undefined;
      await this.send(this.nextEnvelope("start-match", {
        seed,
        serverTick: 0,
        hostShipId,
        guestShipId,
      }), guestTarget);
      await this.send(this.nextEnvelope("player-snapshot", replicationViewFor(
        this.hostSessionValue.state,
        guestShipId,
        0,
        0,
      )), guestTarget);
    } catch {
      // If the guest dropped before match start, host still enters the match with AI fallback once disconnected fires.
    }
    return { ok: true, lobby: this.lobby, localPeerId: this.peerId };
  }

  private async handleBridgeEvent(event: LanBridgeEvent): Promise<void> {
    if (event.type === "announcement") {
      const message = parseLanMessage(JSON.parse(event.announcementJson));
      if (message?.type !== "room-announcement") return;
      this.discoveredRooms.ingest({
        roomId: message.roomId,
        roomName: message.payload.roomName,
        hostName: message.payload.hostName,
        address: event.address,
        port: message.payload.port,
        playerCount: message.payload.playerCount,
        capacity: 2,
        phase: message.payload.phase === "lobby" ? "lobby" : "in-match",
        lastSeenAt: this.now(),
        gameVersion: message.gameVersion,
        contentHash: message.contentHash,
      });
      return;
    }

    if (event.type === "message") {
      const parsed = parseLanMessage(JSON.parse(event.messageJson));
      if (!parsed) return;
      await this.handleLanMessage(parsed, event);
      return;
    }

    if (event.type === "error") {
      const source = bridgeErrorSource(event.code, event.message);
      if (this.pendingJoin) this.resolvePendingJoin({ ok: false, errorSource: source });
      else this.hooks.onNotice(source);
      return;
    }

    if (event.type === "disconnected") {
      if (event.role === "host" && event.connectionId && event.connectionId === this.guestConnectionId) {
        const guestPeerId = this.currentGuestPeerId();
        this.guestConnectionId = undefined;
        if (this.hostSessionValue) {
          this.hostSessionValue.disconnectGuest(this.now());
          this.hooks.onNotice("客席已断开 · AI 已接管。");
          return;
        }
        if (this.hostLobby && guestPeerId) {
          this.hostLobby.leave(guestPeerId);
          this.lobby = cloneLobby(this.hostLobby.snapshot());
          await this.refreshAnnouncement();
          await this.broadcastLobbyUpdate();
        }
        return;
      }
      if (event.role === "guest" && (this.clientSessionValue || this.lobby)) {
        this.resolvePendingJoin({ ok: false, errorSource: "房主已断开。" });
        await this.cleanupTransport();
        this.hooks.onReturnToMenu("房主已断开 · 已返回主菜单。") ;
      }
    }
  }

  private async handleLanMessage(message: LanMessage, event: Extract<LanBridgeEvent, { type: "message" }>): Promise<void> {
    if (event.role === "host") {
      await this.handleHostMessage(message, event.connectionId);
      return;
    }
    await this.handleGuestMessage(message);
  }

  private guestIdentityFor(connectionId: string | undefined): string | undefined {
    return connectionId && connectionId === this.guestConnectionId ? this.currentGuestPeerId() : undefined;
  }

  private async handleHostMessage(message: LanMessage, connectionId: string | undefined): Promise<void> {
    if (!this.hostLobby && !this.hostSessionValue) return;
    const guestPeerId = this.guestIdentityFor(connectionId);
    switch (message.type) {
      case "join-request": {
        if (!this.hostLobby || !connectionId) return;
        const result = this.hostLobby.join(message.payload);
        this.lobby = cloneLobby(result.lobby);
        await this.refreshAnnouncement();
        if (result.accepted) {
          this.guestConnectionId = connectionId;
          await this.send(this.nextEnvelope("join-accepted", {
            peerId: message.payload.peerId,
            assignedRole: "guest",
            lobby: lobbyPayload(this.lobby),
          }), { connectionId });
          await this.broadcastLobbyUpdate();
        } else {
          await this.send(this.nextEnvelope("join-rejected", {
            reason: result.reason ?? "invalid-request",
            detail: result.detail,
          }), { connectionId });
        }
        return;
      }
      case "ready-request": {
        if (!this.hostLobby || !guestPeerId) return;
        if (message.payload.build) {
          const buildResult = this.hostLobby.setBuild(guestPeerId, message.payload.build);
          if (!buildResult.ok) return;
        }
        const readyResult = this.hostLobby.setReady(guestPeerId, message.payload.ready);
        this.lobby = cloneLobby(readyResult.lobby);
        await this.refreshAnnouncement();
        await this.broadcastLobbyUpdate();
        return;
      }
      case "input-frame": {
        if (!this.hostSessionValue || !guestPeerId) return;
        this.hostSessionValue.acceptInput(guestPeerId, {
          ...message.payload,
          peerId: guestPeerId,
        }, this.now());
        return;
      }
      case "return-to-lobby": {
        if (!guestPeerId) return;
        this.guestConnectionId = undefined;
        if (this.hostSessionValue) {
          this.hostSessionValue.disconnectGuest(this.now());
          this.hooks.onNotice("客席已离开 · AI 已接管。");
          return;
        }
        this.hostLobby?.leave(guestPeerId);
        this.lobby = this.hostLobby ? cloneLobby(this.hostLobby.snapshot()) : this.lobby;
        await this.refreshAnnouncement();
        await this.broadcastLobbyUpdate();
        return;
      }
      default:
        return;
    }
  }

  private async handleGuestMessage(message: LanMessage): Promise<void> {
    switch (message.type) {
      case "join-accepted": {
        this.lobby = cloneLobby(message.payload.lobby);
        this.resolvePendingJoin({ ok: true, lobby: this.lobby, localPeerId: this.peerId });
        return;
      }
      case "join-rejected": {
        this.resolvePendingJoin({ ok: false, errorSource: joinRejectedSource(message.payload.reason, message.payload.detail) });
        return;
      }
      case "lobby-update": {
        this.lobby = cloneLobby(message.payload.lobby);
        return;
      }
      case "start-match": {
        this.clientSessionValue = new ClientBattleSession({
          roomId: message.roomId,
          peerId: this.peerId,
          gameVersion: LAN_GAME_VERSION,
          contentHash: LAN_CONTENT_HASH,
        });
        this.roleValue = "client";
        this.hooks.onClientMatchStarted(this.clientSessionValue);
        return;
      }
      case "player-snapshot": {
        this.clientSessionValue?.receiveSnapshot(message.payload, this.now());
        return;
      }
      case "peer-disconnected": {
        await this.cleanupTransport();
        this.hooks.onReturnToMenu("房主已断开 · 已返回主菜单。");
        return;
      }
      case "return-to-lobby": {
        this.lobby = message.payload.lobby ? cloneLobby(message.payload.lobby) : this.lobby;
        await this.cleanupTransport();
        this.hooks.onReturnToMenu("房间已关闭 · 已返回主菜单。");
        return;
      }
      default:
        return;
    }
  }
}
