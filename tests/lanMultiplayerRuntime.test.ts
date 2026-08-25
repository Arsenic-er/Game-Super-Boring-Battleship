import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultLocalProfile } from "../src/profile/localProfile";
import type { BattleshipLanApi, LanBridgeEvent, LanSendTarget } from "../src/net/lanBridge";
import { LanMultiplayerRuntime } from "../src/net/lanMultiplayerRuntime";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import {
  LAN_PROTOCOL_VERSION,
  encodeLanMessage,
  parseLanMessage,
  type LanMessage,
  type LobbySnapshotPayload,
} from "../src/net/protocol";

class FakeLanBridge implements BattleshipLanApi {
  private listener?: (event: LanBridgeEvent) => void;
  readonly sent: Array<{ message: LanMessage; target?: LanSendTarget }> = [];
  capabilities = vi.fn(async () => ({ desktop: true as const, canHost: true as const, canDiscover: true as const }));
  createRoom = vi.fn(async () => ({ port: 47778 }));
  updateAnnouncement = vi.fn(async (_announcementJson: string) => {});
  closeRoom = vi.fn(async () => {});
  startDiscovery = vi.fn(async () => {});
  stopDiscovery = vi.fn(async () => {});
  connect = vi.fn(async () => {});
  disconnect = vi.fn(async () => {});
  acceptConnection = vi.fn(async (_connectionId: string) => {});
  closeConnection = vi.fn(async (_connectionId: string, _reason?: string) => {});
  send = vi.fn(async (messageJson: string, target?: LanSendTarget) => {
    const parsed = parseLanMessage(JSON.parse(messageJson));
    if (!parsed) throw new Error("invalid-test-message");
    this.sent.push({ message: parsed, target });
  });
  subscribe(listener: (event: LanBridgeEvent) => void): () => void {
    this.listener = listener;
    return () => { this.listener = undefined; };
  }
  emit(event: LanBridgeEvent): void { this.listener?.(event); }
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function envelope<T extends LanMessage["type"]>(
  type: T,
  payload: Extract<LanMessage, { type: T }>["payload"],
  options: { roomId?: string; sequence?: number; gameVersion?: string; contentHash?: string } = {},
): Extract<LanMessage, { type: T }> {
  return {
    protocolVersion: LAN_PROTOCOL_VERSION,
    gameVersion: options.gameVersion ?? LAN_GAME_VERSION,
    contentHash: options.contentHash ?? LAN_CONTENT_HASH,
    roomId: options.roomId ?? "room-real",
    sequence: options.sequence ?? 1,
    sentAt: 1_000,
    type,
    payload,
  } as Extract<LanMessage, { type: T }>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LanMultiplayerRuntime receive validation", () => {
  it("rolls back an occupied guest seat when the socket disconnects before join acceptance is sent", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const bridge = new FakeLanBridge();
    const lobbyUpdates = vi.fn();
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: lobbyUpdates,
      onReturnToMenu: vi.fn(), onNotice: vi.fn(), now: () => 1_000,
    });
    await runtime.callbacks.createRoom({ roomName: "Transactional room", buildId: build.id });
    const roomId = parseLanMessage(JSON.parse(String(bridge.updateAnnouncement.mock.calls.at(-1)?.[0])))!.roomId;
    const refresh = deferred<void>();
    bridge.updateAnnouncement.mockImplementationOnce(() => refresh.promise);
    bridge.emit({ type: "connected", role: "host", connectionId: "connection-dropped" });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-dropped",
      messageJson: encodeLanMessage(envelope("join-request", {
        peerId: "peer-dropped", commanderName: "Dropped guest",
        expectedGameVersion: LAN_GAME_VERSION, expectedContentHash: LAN_CONTENT_HASH,
        build: { buildId: build.id, buildName: build.name, shipClassId: build.shipClassId, slots: structuredClone(build.slots) },
      }, { roomId, sequence: 1 })),
    });
    await vi.waitFor(() => expect(runtime.currentGuestPeerId()).toBe("peer-dropped"));

    bridge.emit({ type: "disconnected", role: "host", connectionId: "connection-dropped", hadError: true });
    refresh.resolve();

    await vi.waitFor(() => expect(runtime.currentGuestPeerId()).toBeUndefined());
    expect(runtime.currentGuestConnectionId()).toBeUndefined();
    expect(bridge.acceptConnection).not.toHaveBeenCalledWith("connection-dropped");
    expect((lobbyUpdates.mock.calls.at(-1)?.[0] as LobbySnapshotPayload).players).toHaveLength(1);
    await runtime.dispose();
  });

  it("rolls back the guest seat and socket state when bridge acceptance fails", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const bridge = new FakeLanBridge();
    const lobbyUpdates = vi.fn();
    bridge.acceptConnection.mockRejectedValueOnce(new Error("accept-failed"));
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: lobbyUpdates,
      onReturnToMenu: vi.fn(), onNotice: vi.fn(), now: () => 1_000,
    });
    await runtime.callbacks.createRoom({ roomName: "Transactional room", buildId: build.id });
    const roomId = parseLanMessage(JSON.parse(String(bridge.updateAnnouncement.mock.calls.at(-1)?.[0])))!.roomId;
    bridge.emit({ type: "connected", role: "host", connectionId: "connection-rejected" });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-rejected",
      messageJson: encodeLanMessage(envelope("join-request", {
        peerId: "peer-rejected", commanderName: "Rejected guest",
        expectedGameVersion: LAN_GAME_VERSION, expectedContentHash: LAN_CONTENT_HASH,
        build: { buildId: build.id, buildName: build.name, shipClassId: build.shipClassId, slots: structuredClone(build.slots) },
      }, { roomId, sequence: 1 })),
    });

    await vi.waitFor(() => expect(bridge.acceptConnection).toHaveBeenCalledWith("connection-rejected"));
    await vi.waitFor(() => expect(runtime.currentGuestPeerId()).toBeUndefined());
    expect(runtime.currentGuestConnectionId()).toBeUndefined();
    expect(bridge.closeConnection).toHaveBeenCalledWith("connection-rejected", "join-failed");
    expect((lobbyUpdates.mock.calls.at(-1)?.[0] as LobbySnapshotPayload).players).toHaveLength(1);
    await runtime.dispose();
  });

  it.each(["announcement-refresh", "join-accepted-send"] as const)(
    "rolls back the guest seat when %s fails",
    async (failurePoint) => {
      const profile = createDefaultLocalProfile();
      const build = profile.savedShipBuilds[0]!;
      const bridge = new FakeLanBridge();
      const lobbyUpdates = vi.fn();
      const runtime = new LanMultiplayerRuntime(bridge, profile, {
        onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: lobbyUpdates,
        onReturnToMenu: vi.fn(), onNotice: vi.fn(), now: () => 1_000,
      });
      await runtime.callbacks.createRoom({ roomName: "Transactional room", buildId: build.id });
      const roomId = parseLanMessage(JSON.parse(String(bridge.updateAnnouncement.mock.calls.at(-1)?.[0])))!.roomId;
      if (failurePoint === "announcement-refresh") {
        bridge.updateAnnouncement.mockRejectedValueOnce(new Error("refresh-failed"));
      } else {
        bridge.send.mockRejectedValueOnce(new Error("send-failed"));
      }
      bridge.emit({ type: "connected", role: "host", connectionId: `connection-${failurePoint}` });
      bridge.emit({
        type: "message", role: "host", connectionId: `connection-${failurePoint}`,
        messageJson: encodeLanMessage(envelope("join-request", {
          peerId: `peer-${failurePoint}`, commanderName: "Failed guest",
          expectedGameVersion: LAN_GAME_VERSION, expectedContentHash: LAN_CONTENT_HASH,
          build: { buildId: build.id, buildName: build.name, shipClassId: build.shipClassId, slots: structuredClone(build.slots) },
        }, { roomId, sequence: 1 })),
      });

      await vi.waitFor(() => expect(bridge.closeConnection).toHaveBeenCalledWith(
        `connection-${failurePoint}`,
        "join-failed",
      ));
      expect(runtime.currentGuestPeerId()).toBeUndefined();
      expect((lobbyUpdates.mock.calls.at(-1)?.[0] as LobbySnapshotPayload).players).toHaveLength(1);
      await runtime.dispose();
    },
  );

  it("binds the host-side guest identity to one connection and enforces room, sequence, and lobby state", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const buildPayload = {
      buildId: build.id,
      buildName: build.name,
      shipClassId: build.shipClassId,
      slots: structuredClone(build.slots),
    };
    const bridge = new FakeLanBridge();
    const lobbyUpdates = vi.fn();
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(),
      onClientMatchStarted: vi.fn(),
      onLobbyUpdated: lobbyUpdates,
      onReturnToMenu: vi.fn(),
      onNotice: vi.fn(),
      now: () => 1_000,
    });
    await expect(runtime.callbacks.createRoom({ roomName: "Host room", buildId: build.id })).resolves.toMatchObject({ ok: true });
    const announcementJson = bridge.updateAnnouncement.mock.calls.at(-1)?.[0];
    const roomId = parseLanMessage(JSON.parse(String(announcementJson)))!.roomId;
    bridge.emit({ type: "connected", role: "host", connectionId: "connection-bad", url: "ws://127.0.0.1" });

    const requestPayload = {
      peerId: "peer-guest",
      commanderName: "Guest",
      expectedGameVersion: LAN_GAME_VERSION,
      expectedContentHash: LAN_CONTENT_HASH,
      build: buildPayload,
    };
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-bad",
      messageJson: encodeLanMessage(envelope("join-request", requestPayload, { roomId: "wrong-room", sequence: 1 })),
    });
    await flush();
    expect(runtime.currentGuestPeerId()).toBeUndefined();
    expect(bridge.closeConnection).toHaveBeenCalledWith("connection-bad", "protocol-violation");

    bridge.emit({ type: "connected", role: "host", connectionId: "connection-a", url: "ws://127.0.0.1" });

    bridge.emit({
      type: "message", role: "host", connectionId: "connection-a",
      messageJson: encodeLanMessage(envelope("join-request", requestPayload, { roomId, sequence: 2 })),
    });
    await flush();
    expect(runtime.currentGuestPeerId()).toBe("peer-guest");
    await vi.waitFor(() => expect(runtime.currentGuestConnectionId()).toBe("connection-a"));
    expect(bridge.acceptConnection).toHaveBeenCalledWith("connection-a");

    bridge.emit({
      type: "message", role: "host", connectionId: "connection-other",
      messageJson: encodeLanMessage(envelope("ready-request", {
        peerId: "peer-guest", ready: true, build: buildPayload,
      }, { roomId, sequence: 3 })),
    });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-a",
      messageJson: encodeLanMessage(envelope("ready-request", {
        peerId: "spoofed-peer", ready: true, build: buildPayload,
      }, { roomId, sequence: 1 })),
    });
    await flush();
    await vi.waitFor(() => expect(
      (lobbyUpdates.mock.calls.at(-1)?.[0] as LobbySnapshotPayload | undefined)?.players
        .some(({ peerId }) => peerId === "peer-guest"),
    ).toBe(true));
    const beforeValid = lobbyUpdates.mock.calls.at(-1)?.[0] as LobbySnapshotPayload;
    expect(beforeValid.players.find(({ peerId }) => peerId === "peer-guest")?.ready).toBe(false);

    bridge.emit({
      type: "message", role: "host", connectionId: "connection-a",
      messageJson: encodeLanMessage(envelope("ready-request", {
        peerId: "spoofed-peer", ready: true, build: buildPayload,
      }, { roomId, sequence: 3 })),
    });
    await flush();
    const afterValid = lobbyUpdates.mock.calls.at(-1)?.[0] as LobbySnapshotPayload;
    expect(afterValid.players.find(({ peerId }) => peerId === "peer-guest")?.ready).toBe(true);
    expect(afterValid.players.some(({ peerId }) => peerId === "spoofed-peer")).toBe(false);
    await runtime.dispose();
  });

  it("requires an accepted join before start-match, securely rebinds a manual target room, and drops stale or mismatched frames", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const buildPayload = {
      buildId: build.id,
      buildName: build.name,
      shipClassId: build.shipClassId,
      slots: structuredClone(build.slots),
    };
    const bridge = new FakeLanBridge();
    const lobbyUpdates = vi.fn();
    const clientStarts = vi.fn();
    const notices = vi.fn();
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(),
      onClientMatchStarted: clientStarts,
      onLobbyUpdated: lobbyUpdates,
      onReturnToMenu: vi.fn(),
      onNotice: notices,
      now: () => 1_000,
    });

    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });

    const joining = runtime.callbacks.manualJoin({ address: "192.168.1.20", port: 47778 });
    await vi.waitFor(() => expect(bridge.sent.some(({ message }) => message.type === "join-request")).toBe(true));
    const request = bridge.sent.find(({ message }) => message.type === "join-request")?.message;
    expect(request?.roomId).toMatch(/^manual-/);

    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("start-match", {
        seed: 7, serverTick: 0, hostShipId: "host", guestShipId: "guest",
      }, { roomId: request!.roomId, sequence: 10 })),
    });
    await flush();
    expect(clientStarts).not.toHaveBeenCalled();

    const lobby: LobbySnapshotPayload = {
      phase: "lobby",
      roomName: "Secure room",
      hostPeerId: "peer-host",
      players: [
        { peerId: "peer-host", commanderName: "Host", role: "host", connected: true, ready: true, build: buildPayload },
        { peerId: runtime.localPeerId, commanderName: profile.commanderName, role: "guest", connected: true, ready: false, build: buildPayload },
      ],
    };
    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("join-accepted", {
        peerId: runtime.localPeerId, assignedRole: "guest", lobby,
      }, { sequence: 11 })),
    });
    await expect(joining).resolves.toMatchObject({ ok: true });
    expect(lobbyUpdates).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "lobby" }), runtime.localPeerId);

    const readyLobby = structuredClone(lobby);
    readyLobby.players[1]!.ready = true;
    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("lobby-update", { lobby: readyLobby }, { sequence: 12 })),
    });
    await flush();
    expect(lobbyUpdates).toHaveBeenLastCalledWith(expect.objectContaining({ players: expect.arrayContaining([
      expect.objectContaining({ peerId: runtime.localPeerId, ready: true }),
    ]) }), runtime.localPeerId);

    const spoofed = structuredClone(readyLobby);
    spoofed.players[1]!.ready = false;
    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("lobby-update", { lobby: spoofed }, { sequence: 12 })),
    });
    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("lobby-update", { lobby: spoofed }, { sequence: 13, contentHash: "wrong" })),
    });
    await flush();
    expect(lobbyUpdates).toHaveBeenCalledTimes(2);

    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("start-match", {
        seed: 7, serverTick: 0, hostShipId: "host", guestShipId: "guest",
      }, { sequence: 14 })),
    });
    await flush();
    expect(clientStarts).not.toHaveBeenCalled();

    const matchLobby = structuredClone(readyLobby);
    matchLobby.phase = "in-match";
    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("lobby-update", { lobby: matchLobby }, { sequence: 15 })),
    });
    bridge.emit({
      type: "message", role: "guest",
      messageJson: encodeLanMessage(envelope("start-match", {
        seed: 7, serverTick: 0, hostShipId: "host", guestShipId: "guest",
      }, { sequence: 16 })),
    });
    await flush();
    expect(clientStarts).toHaveBeenCalledTimes(1);
    expect((clientStarts.mock.calls[0]![0] as unknown as { config: { build?: unknown } }).config.build).toEqual(buildPayload);
    await runtime.dispose();
  });

  it("fails an in-flight manual join immediately when the pending guest socket disconnects", async () => {
    const bridge = new FakeLanBridge();
    const runtime = new LanMultiplayerRuntime(bridge, createDefaultLocalProfile(), {
      onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: vi.fn(),
      onReturnToMenu: vi.fn(), onNotice: vi.fn(),
    });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });

    const joining = runtime.callbacks.manualJoin({ address: "192.168.1.22", port: 47778 });
    await vi.waitFor(() => expect(bridge.sent.some(({ message }) => message.type === "join-request")).toBe(true));
    bridge.emit({ type: "disconnected", role: "guest", hadError: true });
    await expect(joining).resolves.toEqual({ ok: false, errorSource: "联机连接已断开。" });
    await runtime.dispose();
  });

  it("disconnects a host connection after a sliding-window threshold of malformed frames", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const buildPayload = {
      buildId: build.id, buildName: build.name, shipClassId: build.shipClassId, slots: structuredClone(build.slots),
    };
    const bridge = new FakeLanBridge();
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: vi.fn(),
      onReturnToMenu: vi.fn(), onNotice: vi.fn(), now: () => 1_000,
    });
    await runtime.callbacks.createRoom({ roomName: "Guarded room", buildId: build.id });
    const announcementJson = bridge.updateAnnouncement.mock.calls.at(-1)?.[0];
    const roomId = parseLanMessage(JSON.parse(String(announcementJson)))!.roomId;
    bridge.emit({ type: "connected", role: "host", connectionId: "connection-malformed" });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-malformed",
      messageJson: encodeLanMessage(envelope("join-request", {
        peerId: "peer-malformed", commanderName: "Malformed guest",
        expectedGameVersion: LAN_GAME_VERSION, expectedContentHash: LAN_CONTENT_HASH, build: buildPayload,
      }, { roomId, sequence: 1 })),
    });
    await vi.waitFor(() => expect(runtime.currentGuestConnectionId()).toBe("connection-malformed"));
    bridge.closeConnection.mockClear();
    for (let index = 0; index < 5; index += 1) {
      bridge.emit({
        type: "message", role: "host", connectionId: "connection-malformed",
        messageJson: index % 2 === 0 ? "{" : JSON.stringify({ protocolVersion: 99, type: "join-request" }),
      });
    }
    await flush();
    await vi.waitFor(() => expect(bridge.closeConnection).toHaveBeenCalledWith("connection-malformed", "protocol-violation"));
    await runtime.dispose();
  });

  it("disconnects an accepted guest after repeated over-frequency input frames", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const buildPayload = {
      buildId: build.id, buildName: build.name, shipClassId: build.shipClassId, slots: structuredClone(build.slots),
    };
    const bridge = new FakeLanBridge();
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: vi.fn(),
      onReturnToMenu: vi.fn(), onNotice: vi.fn(), now: () => 1_000,
    });
    await runtime.callbacks.createRoom({ roomName: "Rate guarded", buildId: build.id });
    const announcementJson = bridge.updateAnnouncement.mock.calls.at(-1)?.[0];
    const roomId = parseLanMessage(JSON.parse(String(announcementJson)))!.roomId;
    bridge.emit({ type: "connected", role: "host", connectionId: "connection-fast" });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-fast",
      messageJson: encodeLanMessage(envelope("join-request", {
        peerId: "peer-fast", commanderName: "Fast guest",
        expectedGameVersion: LAN_GAME_VERSION, expectedContentHash: LAN_CONTENT_HASH, build: buildPayload,
      }, { roomId, sequence: 1 })),
    });
    await vi.waitFor(() => expect(runtime.currentGuestConnectionId()).toBe("connection-fast"));
    await runtime.callbacks.readyLobby({ ready: true, buildId: build.id });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-fast",
      messageJson: encodeLanMessage(envelope("ready-request", {
        peerId: "peer-fast", ready: true, build: buildPayload,
      }, { roomId, sequence: 2 })),
    });
    await vi.waitFor(async () => expect(await runtime.callbacks.startLobby()).toMatchObject({ ok: true }));

    for (let index = 1; index <= 35; index += 1) {
      bridge.emit({
        type: "message", role: "host", connectionId: "connection-fast",
        messageJson: encodeLanMessage(envelope("input-frame", {
          peerId: "peer-fast", inputSequence: index,
          command: { throttle: 0, rudder: 0, aimPoint: { x: 0, y: 0, z: 1_000 }, fire: false },
        }, { roomId, sequence: index + 2 })),
      });
    }
    await vi.waitFor(() => expect(bridge.closeConnection).toHaveBeenCalledWith("connection-fast", "protocol-violation"));
    await runtime.dispose();
  });

  it("closes and cleans up an accepted socket when the guest returns to the lobby", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const buildPayload = {
      buildId: build.id, buildName: build.name, shipClassId: build.shipClassId, slots: structuredClone(build.slots),
    };
    const bridge = new FakeLanBridge();
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: vi.fn(),
      onReturnToMenu: vi.fn(), onNotice: vi.fn(), now: () => 1_000,
    });
    await runtime.callbacks.createRoom({ roomName: "Leave room", buildId: build.id });
    const roomId = parseLanMessage(JSON.parse(String(bridge.updateAnnouncement.mock.calls.at(-1)?.[0])))!.roomId;
    bridge.emit({ type: "connected", role: "host", connectionId: "connection-leaving" });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-leaving",
      messageJson: encodeLanMessage(envelope("join-request", {
        peerId: "peer-leaving", commanderName: "Leaving guest",
        expectedGameVersion: LAN_GAME_VERSION, expectedContentHash: LAN_CONTENT_HASH, build: buildPayload,
      }, { roomId, sequence: 1 })),
    });
    await vi.waitFor(() => expect(runtime.currentGuestConnectionId()).toBe("connection-leaving"));

    bridge.emit({
      type: "message", role: "host", connectionId: "connection-leaving",
      messageJson: encodeLanMessage(envelope("return-to-lobby", { reason: "guest-request" }, { roomId, sequence: 2 })),
    });

    await vi.waitFor(() => expect(bridge.closeConnection).toHaveBeenCalledWith("connection-leaving", "guest-left"));
    expect(runtime.currentGuestConnectionId()).toBeUndefined();
    expect(runtime.currentGuestPeerId()).toBeUndefined();
    bridge.emit({ type: "disconnected", role: "host", connectionId: "connection-leaving", hadError: false });
    bridge.emit({ type: "disconnected", role: "host", connectionId: "connection-leaving", hadError: false });
    await flush();
    expect(runtime.currentGuestPeerId()).toBeUndefined();
    expect(bridge.closeConnection).toHaveBeenCalledTimes(1);
    await runtime.dispose();
  });

  it("counts valid protocol messages that are illegal for the current state and closes at the threshold", async () => {
    const profile = createDefaultLocalProfile();
    const build = profile.savedShipBuilds[0]!;
    const buildPayload = {
      buildId: build.id, buildName: build.name, shipClassId: build.shipClassId, slots: structuredClone(build.slots),
    };
    const bridge = new FakeLanBridge();
    let now = 1_000;
    const runtime = new LanMultiplayerRuntime(bridge, profile, {
      onHostMatchStarted: vi.fn(), onClientMatchStarted: vi.fn(), onLobbyUpdated: vi.fn(),
      onReturnToMenu: vi.fn(), onNotice: vi.fn(), now: () => now,
    });
    await runtime.callbacks.createRoom({ roomName: "State guarded", buildId: build.id });
    const roomId = parseLanMessage(JSON.parse(String(bridge.updateAnnouncement.mock.calls.at(-1)?.[0])))!.roomId;
    bridge.emit({ type: "connected", role: "host", connectionId: "connection-illegal" });
    bridge.emit({
      type: "message", role: "host", connectionId: "connection-illegal",
      messageJson: encodeLanMessage(envelope("join-request", {
        peerId: "peer-illegal", commanderName: "Illegal guest",
        expectedGameVersion: LAN_GAME_VERSION, expectedContentHash: LAN_CONTENT_HASH, build: buildPayload,
      }, { roomId, sequence: 1 })),
    });
    await vi.waitFor(() => expect(runtime.currentGuestConnectionId()).toBe("connection-illegal"));
    bridge.closeConnection.mockClear();

    const sendIllegalInput = (index: number) => {
      bridge.emit({
        type: "message", role: "host", connectionId: "connection-illegal",
        messageJson: encodeLanMessage(envelope("input-frame", {
          peerId: "peer-illegal", inputSequence: index + 1,
          command: { throttle: 0, rudder: 0, aimPoint: { x: 0, y: 0, z: 1_000 }, fire: false },
        }, { roomId, sequence: index + 2 })),
      });
    };
    for (let index = 0; index < 4; index += 1) sendIllegalInput(index);
    await flush();
    expect(bridge.closeConnection).not.toHaveBeenCalled();

    now += 2_001;
    for (let index = 4; index < 8; index += 1) sendIllegalInput(index);
    await flush();
    expect(bridge.closeConnection).not.toHaveBeenCalled();
    sendIllegalInput(8);

    await vi.waitFor(() => expect(bridge.closeConnection).toHaveBeenCalledWith("connection-illegal", "protocol-violation"));
    await runtime.dispose();
  });

  it("contains malformed JSON and rejected async bridge events without an unhandled rejection", async () => {
    const bridge = new FakeLanBridge();
    const notice = vi.fn();
    const runtime = new LanMultiplayerRuntime(bridge, createDefaultLocalProfile(), {
      onHostMatchStarted: vi.fn(),
      onClientMatchStarted: vi.fn(),
      onLobbyUpdated: vi.fn(),
      onReturnToMenu: vi.fn(),
      onNotice: notice,
    });

    bridge.emit({ type: "message", role: "guest", messageJson: "{" });
    bridge.emit({ type: "announcement", address: "127.0.0.1", port: 47777, announcementJson: "not-json" });
    await flush();
    expect(notice).toHaveBeenCalledWith("收到无效的联机消息。");
    await runtime.dispose();
  });
});
