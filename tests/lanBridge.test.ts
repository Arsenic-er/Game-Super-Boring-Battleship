import { EventEmitter } from "node:events";
import net from "node:net";
import { createRequire } from "node:module";
import Module from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { LAN_DISCOVERY_PORT, LAN_GAME_PORTS } from "../src/net/protocol";
import {
  UNSUPPORTED_LAN_CAPABILITIES,
  createLanBridgeClient,
  type LanBridgeEvent,
} from "../src/net/lanBridge";

const require = createRequire(import.meta.url);
const lanBridgeModule = require("../desktop/lanBridge.cjs") as {
  CHANNELS?: Record<string, string>;
  createLanBridge: (options?: unknown) => TestBridge;
  createLanIpcController?: (options: {
    bridge: FakeBridge;
    ipcMain: FakeIpcMain;
    getWindowFromSender: (sender: FakeSender) => FakeWindow | undefined;
  }) => { dispose(): Promise<void> };
  parseDiscoveryAnnouncementJson?: (json: string) => unknown;
  assertLanBridgeStringPayload?: (value: string, maxBytes: number, kind: string) => void;
  validateLanWebSocketUrl?: (value: string) => string;
};
const { createLanBridge } = lanBridgeModule;

const EVENT_TIMEOUT_MS = 4_000;
const openBridges: TestBridge[] = [];
const openNetServers: net.Server[] = [];
const openWsServers: WebSocketServer[] = [];
const openWsClients: WebSocket[] = [];

interface TestBridge {
  capabilities(): Promise<{ desktop: true; canHost: true; canDiscover: true }>;
  createRoom(request: { announcementJson: string }): Promise<{ port: number }>;
  updateAnnouncement(announcementJson: string): Promise<void>;
  closeRoom(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  acceptConnection(connectionId: string): Promise<void>;
  closeConnection(connectionId: string, reason?: string): Promise<void>;
  send(messageJson: string, target?: { connectionId?: string }): Promise<void>;
  subscribe(listener: (event: LanBridgeEvent) => void): () => void;
  dispose(): Promise<void>;
}

interface FakeBridge {
  capabilities: ReturnType<typeof vi.fn>;
  createRoom: ReturnType<typeof vi.fn>;
  updateAnnouncement: ReturnType<typeof vi.fn>;
  closeRoom: ReturnType<typeof vi.fn>;
  startDiscovery: ReturnType<typeof vi.fn>;
  stopDiscovery: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  acceptConnection: ReturnType<typeof vi.fn>;
  closeConnection: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  subscribe: (listener: (event: LanBridgeEvent) => void) => () => void;
  emit: (event: LanBridgeEvent) => void;
}

class FakeUdpSocket extends EventEmitter {
  readonly sent: Array<{ message: string; port: number; address: string }> = [];
  listening = false;
  bindCalls = 0;
  setBroadcastCalls = 0;
  closeCalls = 0;
  boundPort?: number;
  readonly bindHistory: number[] = [];

  bind(port: number) {
    this.bindCalls += 1;
    this.boundPort = port;
    this.bindHistory.push(port);
    this.listening = true;
    queueMicrotask(() => this.emit("listening"));
  }

  setBroadcast(value: boolean) {
    if (value) this.setBroadcastCalls += 1;
  }

  send(message: string | Buffer, port: number, address: string, callback?: (error?: Error | null) => void) {
    this.sent.push({
      message: typeof message === "string" ? message : message.toString("utf8"),
      port,
      address,
    });
    callback?.(null);
  }

  close(callback?: () => void) {
    this.closeCalls += 1;
    this.listening = false;
    callback?.();
    this.emit("close");
  }
}

class FakeWebSocketServer extends EventEmitter {
  closeCalls = 0;
  readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown>) {
    super();
    this.options = options;
    queueMicrotask(() => this.emit("listening"));
  }

  close(callback?: () => void) {
    this.closeCalls += 1;
    callback?.();
  }
}

class FakeIpcMain {
  readonly handlers = new Map<string, (event: { sender: FakeSender }, ...args: unknown[]) => unknown>();

  handle(channel: string, handler: (event: { sender: FakeSender }, ...args: unknown[]) => unknown) {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string) {
    this.handlers.delete(channel);
  }
}

class FakeWindow extends EventEmitter {
  destroyed = false;

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("closed");
  }
}

class FakeSender extends EventEmitter {
  readonly send = vi.fn<(channel: string, payload: unknown) => void>();
  destroyed = false;

  constructor(readonly id: number) {
    super();
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("destroyed");
  }
}

function createFakeBridge(): FakeBridge {
  let listener: ((event: LanBridgeEvent) => void) | undefined;
  return {
    capabilities: vi.fn(async () => ({ desktop: true, canHost: true, canDiscover: true })),
    createRoom: vi.fn(async () => ({ port: LAN_GAME_PORTS[0] })),
    updateAnnouncement: vi.fn(async () => undefined),
    closeRoom: vi.fn(async () => undefined),
    startDiscovery: vi.fn(async () => undefined),
    stopDiscovery: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    acceptConnection: vi.fn(async () => undefined),
    closeConnection: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    subscribe(assigned) {
      listener = assigned;
      return () => {
        if (listener === assigned) listener = undefined;
      };
    },
    emit(event) {
      listener?.(event);
    },
  };
}

function trackBridge<T extends TestBridge>(bridge: T): T {
  openBridges.push(bridge);
  return bridge;
}

function trackNetServer<T extends net.Server>(server: T): T {
  openNetServers.push(server);
  return server;
}

function trackWsServer<T extends WebSocketServer>(server: T): T {
  openWsServers.push(server);
  return server;
}

function trackWsClient<T extends WebSocket>(client: T): T {
  openWsClients.push(client);
  return client;
}

async function closeNetServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function closeWsServer(server: WebSocketServer): Promise<void> {
  for (const client of server.clients) {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
      client.terminate();
    }
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function closeWsClient(client: WebSocket): Promise<void> {
  if (client.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => {
    client.once("close", () => resolve());
    client.terminate();
  });
}

async function occupyPort(port: number): Promise<net.Server> {
  const server = trackNetServer(net.createServer());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function listenWsOnAllowedPort(
  configure: (server: WebSocketServer) => void = () => undefined,
): Promise<{ server: WebSocketServer; port: number }> {
  let lastError: Error | undefined;
  for (const port of LAN_GAME_PORTS) {
    try {
      const server = trackWsServer(new WebSocketServer({ host: "127.0.0.1", port, maxPayload: 256 * 1024 }));
      configure(server);
      await new Promise<void>((resolve, reject) => {
        server.once("listening", () => resolve());
        server.once("error", reject);
      });
      return { server, port };
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error("no-free-ws-port");
}

async function waitForEvent(
  bridge: TestBridge,
  predicate: (event: LanBridgeEvent) => boolean,
  timeoutMs: number = EVENT_TIMEOUT_MS,
): Promise<LanBridgeEvent> {
  return await new Promise<LanBridgeEvent>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("timed-out-waiting-for-event"));
    }, timeoutMs);

    const unsubscribe = bridge.subscribe((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

function collectEvents(bridge: TestBridge): { events: LanBridgeEvent[]; stop: () => void } {
  const events: LanBridgeEvent[] = [];
  const stop = bridge.subscribe((event) => {
    events.push(event);
  });
  return { events, stop };
}

function buildAnnouncementEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    protocolVersion: 1,
    gameVersion: "0.6.13",
    contentHash: "content-hash",
    roomId: "room-alpha",
    sequence: 1,
    sentAt: 1_725_000_000_000,
    type: "room-announcement",
    payload: {
      roomName: "Alpha Room",
      hostName: "Host Admiral",
      discoveryPort: LAN_DISCOVERY_PORT,
      port: LAN_GAME_PORTS[0],
      playerCount: 1,
      capacity: 2,
      phase: "lobby",
    },
  };

  return {
    ...base,
    ...overrides,
    payload: {
      ...base.payload,
      ...(typeof overrides.payload === "object" && overrides.payload !== null ? overrides.payload as Record<string, unknown> : {}),
    },
  };
}

function buildAnnouncementJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(buildAnnouncementEnvelope(overrides));
}

function loadPreloadModule(electronStub: { contextBridge: unknown; ipcRenderer: unknown }) {
  const resolved = require.resolve("../desktop/preload.cjs");
  delete require.cache[resolved];
  const mutableModule = Module as typeof Module & {
    _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
  };
  const originalLoad = mutableModule._load;
  mutableModule._load = function patched(request: string, parent: NodeModule | null, isMain: boolean) {
    if (request === "electron") return electronStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require("../desktop/preload.cjs") as {
      CHANNELS?: Record<string, string>;
      installBattleshipLanBridge?: (contextBridge: { exposeInMainWorld: (name: string, api: unknown) => void }, ipcRenderer: unknown) => void;
    };
  } finally {
    mutableModule._load = originalLoad;
    delete require.cache[resolved];
  }
}

afterEach(async () => {
  vi.useRealTimers();

  while (openBridges.length > 0) {
    const bridge = openBridges.pop();
    if (!bridge) continue;
    await bridge.dispose();
  }

  while (openWsClients.length > 0) {
    const client = openWsClients.pop();
    if (!client) continue;
    if (client.readyState !== WebSocket.CLOSED) await closeWsClient(client);
  }

  while (openWsServers.length > 0) {
    const server = openWsServers.pop();
    if (!server) continue;
    await closeWsServer(server);
  }

  while (openNetServers.length > 0) {
    const server = openNetServers.pop();
    if (!server) continue;
    if (server.listening) await closeNetServer(server);
  }

  delete (globalThis as { window?: unknown }).window;
});

describe("Electron LAN bridge", () => {
  it("accepts exact transport size boundaries and rejects oversized payloads", async () => {
    expect(lanBridgeModule.assertLanBridgeStringPayload).toBeTypeOf("function");
    expect(() => lanBridgeModule.assertLanBridgeStringPayload?.("u".repeat(1_024), 1_024, "announcement")).not.toThrow();
    expect(() => lanBridgeModule.assertLanBridgeStringPayload?.("x".repeat(1_025), 1_024, "announcement")).toThrow(/message-too-large/i);
    expect(() => lanBridgeModule.assertLanBridgeStringPayload?.("m".repeat(64 * 1_024), 64 * 1_024, "message")).not.toThrow();
    expect(() => lanBridgeModule.assertLanBridgeStringPayload?.("m".repeat(64 * 1_024 + 1), 64 * 1_024, "message")).toThrow(/message-too-large/i);
  });

  it("parses only valid room-announcement discovery envelopes", async () => {
    expect(lanBridgeModule.parseDiscoveryAnnouncementJson).toBeTypeOf("function");

    const valid = lanBridgeModule.parseDiscoveryAnnouncementJson?.(buildAnnouncementJson());
    expect(valid).toMatchObject({
      type: "room-announcement",
      roomId: "room-alpha",
      payload: { port: LAN_GAME_PORTS[0], discoveryPort: LAN_DISCOVERY_PORT },
    });

    const invalidJson = [
      "not-json",
      buildAnnouncementJson({ type: "join-request" }),
      buildAnnouncementJson({ extra: true }),
      buildAnnouncementJson({ payload: { extra: true } }),
      buildAnnouncementJson({ payload: { discoveryPort: 48_000 } }),
      buildAnnouncementJson({ payload: { port: 48_000 } }),
      buildAnnouncementJson({ payload: { phase: "unknown" } }),
      buildAnnouncementJson({ roomId: "" }),
    ];

    for (const input of invalidJson) {
      expect(lanBridgeModule.parseDiscoveryAnnouncementJson?.(input), input).toBeUndefined();
    }
  });

  it("uses an ephemeral probe socket for active discovery and reuses it until stop", async () => {
    vi.useFakeTimers();

    const sockets: FakeUdpSocket[] = [];
    const bridge = trackBridge(createLanBridge({
      createUdpSocket: () => {
        const socket = new FakeUdpSocket();
        sockets.push(socket);
        return socket;
      },
    }));

    const collected = collectEvents(bridge);

    await bridge.startDiscovery();
    await bridge.startDiscovery();

    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.bindHistory).toEqual([LAN_DISCOVERY_PORT]);
    expect(sockets[1]?.bindHistory).toEqual([0]);
    expect(sockets[1]?.setBroadcastCalls).toBe(1);
    expect(sockets[1]?.sent.map((entry) => entry.address)).toContain("255.255.255.255");
    expect(sockets[1]?.sent.map((entry) => entry.address)).toContain("127.0.0.1");

    sockets[0]?.emit("message", Buffer.from("not-json"), { address: "127.0.0.1", port: LAN_DISCOVERY_PORT });
    await Promise.resolve();
    expect(collected.events.filter((event) => event.type === "announcement")).toEqual([]);

    const valid = buildAnnouncementJson();
    sockets[1]?.emit("message", Buffer.from(valid), { address: "127.0.0.1", port: 49001 });
    await Promise.resolve();
    expect(collected.events.filter((event) => event.type === "announcement")).toMatchObject([
      { type: "announcement", announcementJson: valid },
    ]);

    vi.advanceTimersByTime(1_600);
    await Promise.resolve();
    expect(sockets[1]?.closeCalls).toBe(1);

    await bridge.startDiscovery();
    expect(sockets).toHaveLength(3);
    expect(sockets[2]?.bindHistory).toEqual([0]);

    await bridge.stopDiscovery();
    await bridge.stopDiscovery();
    expect(sockets[0]?.closeCalls).toBe(1);
    expect(sockets[2]?.closeCalls).toBe(1);
    collected.stop();
  });

  it("periodically broadcasts validated room announcements and unicasts probe responses", async () => {
    vi.useFakeTimers();

    const sockets: FakeUdpSocket[] = [];
    const servers: FakeWebSocketServer[] = [];
    const bridge = trackBridge(createLanBridge({
      createUdpSocket: () => {
        const socket = new FakeUdpSocket();
        sockets.push(socket);
        return socket;
      },
      createWebSocketServer: (options: Record<string, unknown>) => {
        const server = new FakeWebSocketServer(options);
        servers.push(server);
        return server;
      },
    }));

    const validAnnouncement = buildAnnouncementJson();
    await expect(bridge.createRoom({ announcementJson: validAnnouncement })).resolves.toEqual({ port: LAN_GAME_PORTS[0] });
    expect(sockets).toHaveLength(1);
    expect(servers).toHaveLength(1);
    expect(sockets[0]?.sent.some((entry) => entry.address === "255.255.255.255" && entry.message === validAnnouncement)).toBe(true);

    sockets[0]?.emit("message", Buffer.from("__BATTLESHIP_LAN_PROBE__"), { address: "127.0.0.88", port: 49999 });
    await Promise.resolve();
    expect(sockets[0]?.sent.some((entry) => entry.address === "127.0.0.88" && entry.port === 49999 && entry.message === validAnnouncement)).toBe(true);

    const initialBroadcastCount = sockets[0]?.sent.filter((entry) => entry.address === "255.255.255.255").length ?? 0;
    vi.advanceTimersByTime(1_100);
    expect((sockets[0]?.sent.filter((entry) => entry.address === "255.255.255.255").length ?? 0)).toBeGreaterThan(initialBroadcastCount);

    await expect(bridge.updateAnnouncement(buildAnnouncementJson({ payload: { roomName: "Bravo Room" } }))).resolves.toBeUndefined();
    await expect(bridge.updateAnnouncement('{"room":"bad"}')).rejects.toThrow(/invalid-announcement/i);

    await bridge.closeRoom();
    await bridge.closeRoom();
    expect(sockets[0]?.closeCalls).toBe(1);
    expect(servers[0]?.closeCalls).toBe(1);
  });

  it("selects the next allowed host port when the first LAN port is occupied and reuses the preferred port after close", async () => {
    const occupied = await occupyPort(LAN_GAME_PORTS[0]);
    const bridge = trackBridge(createLanBridge());
    const alpha = buildAnnouncementJson();
    const bravo = buildAnnouncementJson({ roomId: "room-bravo", payload: { port: LAN_GAME_PORTS[0], roomName: "Bravo Room" } });

    await expect(bridge.createRoom({ announcementJson: alpha })).resolves.toEqual({ port: LAN_GAME_PORTS[1] });
    await expect(bridge.createRoom({ announcementJson: alpha })).resolves.toEqual({ port: LAN_GAME_PORTS[1] });

    await bridge.closeRoom();
    await bridge.closeRoom();
    await closeNetServer(occupied);

    await expect(bridge.createRoom({ announcementJson: bravo })).resolves.toEqual({ port: LAN_GAME_PORTS[0] });
  });

  it("normalizes announcement payload ports to the actual hosted room port", async () => {
    const occupied = await occupyPort(LAN_GAME_PORTS[0]);
    const host = trackBridge(createLanBridge());
    const guest = trackBridge(createLanBridge());

    await guest.startDiscovery();

    const firstAnnouncement = waitForEvent(
      guest,
      (event) => event.type === "announcement" && JSON.parse(event.announcementJson).payload.roomName === "Alpha Room",
    );
    await expect(host.createRoom({
      announcementJson: buildAnnouncementJson({ payload: { roomName: "Alpha Room", port: LAN_GAME_PORTS[0] } }),
    })).resolves.toEqual({ port: LAN_GAME_PORTS[1] });

    const firstResolved = await firstAnnouncement;
    if (firstResolved.type !== "announcement") throw new Error("expected-announcement");
    const firstPayload = JSON.parse(firstResolved.announcementJson) as { payload: { port: number } };
    expect(firstPayload.payload.port).toBe(LAN_GAME_PORTS[1]);

    const secondAnnouncement = waitForEvent(
      guest,
      (event) => event.type === "announcement" && JSON.parse(event.announcementJson).payload.roomName === "Bravo Room",
    );
    await host.updateAnnouncement(buildAnnouncementJson({ payload: { roomName: "Bravo Room", port: LAN_GAME_PORTS[0] } }));

    const secondResolved = await secondAnnouncement;
    if (secondResolved.type !== "announcement") throw new Error("expected-announcement");
    const secondPayload = JSON.parse(secondResolved.announcementJson) as { payload: { port: number } };
    expect(secondPayload.payload.port).toBe(LAN_GAME_PORTS[1]);

    await closeNetServer(occupied);
  });

  it("broadcasts valid announcements, emits probe events, and relays exact-64KiB websocket payloads", async () => {
    const host = trackBridge(createLanBridge());
    const guest = trackBridge(createLanBridge());
    const announcementJson = buildAnnouncementJson();

    await guest.startDiscovery();
    await guest.startDiscovery();

    const announcement = waitForEvent(
      guest,
      (event) => event.type === "announcement" && event.announcementJson === announcementJson,
    );
    const room = await host.createRoom({ announcementJson });

    await expect(announcement).resolves.toMatchObject({
      type: "announcement",
      announcementJson,
    });

    const probe = waitForEvent(host, (event) => event.type === "probe");
    await guest.startDiscovery();
    await expect(probe).resolves.toMatchObject({ type: "probe" });

    const connected = waitForEvent(host, (event) => event.type === "connected");
    await guest.connect(`ws://127.0.0.1:${room.port}`);
    await guest.connect(`ws://127.0.0.1:${room.port}`);
    await expect(connected).resolves.toMatchObject({ type: "connected" });

    const exactPayload = "m".repeat(64 * 1_024);
    const message = waitForEvent(
      host,
      (event) => event.type === "message" && event.messageJson === exactPayload,
    );
    await guest.send(exactPayload);
    await expect(message).resolves.toMatchObject({
      type: "message",
      messageJson: exactPayload,
    });

    const disconnected = waitForEvent(host, (event) => event.type === "disconnected");
    await guest.disconnect();
    await guest.disconnect();
    await expect(disconnected).resolves.toMatchObject({ type: "disconnected" });
  });

  it("tags host websocket events with a stable connectionId and routes targeted host sends through that socket", async () => {
    const host = trackBridge(createLanBridge());
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });
    const client = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`, { maxPayload: 256 * 1024 }));

    const connected = await waitForEvent(host, (event) => event.type === "connected" && event.role === "host");
    if (connected.type !== "connected" || !connected.connectionId) throw new Error("expected-host-connection-id");

    const hostMessage = waitForEvent(
      host,
      (event) =>
        event.type === "message"
        && event.role === "host"
        && event.connectionId === connected.connectionId
        && event.messageJson === "guest->host",
    );
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });
    client.send("guest->host");
    await expect(hostMessage).resolves.toMatchObject({
      type: "message",
      role: "host",
      connectionId: connected.connectionId,
      messageJson: "guest->host",
    });

    const guestReceived = await new Promise<string>((resolve, reject) => {
      client.once("message", (payload, isBinary) => {
        if (isBinary) {
          reject(new Error("expected-text-message"));
          return;
        }
        resolve(typeof payload === "string" ? payload : payload.toString("utf8"));
      });
      void host.send("host->guest", { connectionId: connected.connectionId }).catch(reject);
    });
    expect(guestReceived).toBe("host->guest");

    await expect(host.send("bad-target", { connectionId: "host-connection-missing" })).rejects.toThrow(/connection-not-found/i);
  });

  it("rejects a second websocket client without evicting the active guest or breaking targeted sends", async () => {
    const host = trackBridge(createLanBridge());
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });
    const first = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    const connected = await waitForEvent(host, (event) => event.type === "connected" && event.role === "host");
    if (connected.type !== "connected" || !connected.connectionId) throw new Error("expected-host-connection-id");
    await host.acceptConnection(connected.connectionId);
    await new Promise<void>((resolve, reject) => {
      if (first.readyState === WebSocket.OPEN) resolve();
      else {
        first.once("open", () => resolve());
        first.once("error", reject);
      }
    });

    const newcomer = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    await new Promise<void>((resolve) => {
      newcomer.once("close", () => resolve());
      newcomer.once("error", () => resolve());
    });

    const originalReceived = new Promise<string>((resolve, reject) => {
      first.once("message", (payload, isBinary) => {
        if (isBinary) reject(new Error("expected-text-message"));
        else resolve(payload.toString("utf8"));
      });
      void host.send("still-active", { connectionId: connected.connectionId }).catch(reject);
    });
    await expect(originalReceived).resolves.toBe("still-active");

    const originalMessage = waitForEvent(
      host,
      (event) => event.type === "message"
        && event.connectionId === connected.connectionId
        && event.messageJson === "original-guest",
    );
    first.send("original-guest");
    await expect(originalMessage).resolves.toMatchObject({ connectionId: connected.connectionId });
  });

  it("keeps websocket clients pending until accepted and closes an unaccepted handshake on deadline", async () => {
    const host = trackBridge(createLanBridge({ pendingHandshakeMs: 80 }));
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });
    const pending = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    const connected = await waitForEvent(host, (event) => event.type === "connected" && event.role === "host");
    if (connected.type !== "connected" || !connected.connectionId) throw new Error("expected-pending-connection");
    await new Promise<void>((resolve, reject) => {
      if (pending.readyState === WebSocket.OPEN) resolve();
      else {
        pending.once("open", () => resolve());
        pending.once("error", reject);
      }
    });

    const newcomer = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    await new Promise<void>((resolve) => {
      newcomer.once("close", () => resolve());
      newcomer.once("error", () => resolve());
    });
    const disconnected = waitForEvent(
      host,
      (event) => event.type === "disconnected" && event.connectionId === connected.connectionId,
    );
    await expect(disconnected).resolves.toMatchObject({ type: "disconnected", role: "host" });
    await expect(host.acceptConnection(connected.connectionId)).rejects.toThrow(/connection-not-found/i);
  });

  it("promotes only the validated pending connection and can close a rejected connection by id", async () => {
    const host = trackBridge(createLanBridge({ pendingHandshakeMs: 4_500 }));
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });
    const acceptedClient = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    const connected = await waitForEvent(host, (event) => event.type === "connected" && event.role === "host");
    if (connected.type !== "connected" || !connected.connectionId) throw new Error("expected-pending-connection");
    await host.acceptConnection(connected.connectionId);

    const received = new Promise<string>((resolve, reject) => {
      acceptedClient.once("message", (payload) => resolve(payload.toString("utf8")));
      acceptedClient.once("error", reject);
      void host.send("accepted-only", { connectionId: connected.connectionId }).catch(reject);
    });
    await expect(received).resolves.toBe("accepted-only");

    const rejected = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    await new Promise<void>((resolve) => {
      rejected.once("close", () => resolve());
      rejected.once("error", () => resolve());
    });
    await expect(host.closeConnection(connected.connectionId, "protocol-violation")).resolves.toBeUndefined();
    expect(acceptedClient.readyState).toBe(WebSocket.CLOSED);
  });

  it("releases an accepted guest by connection id so a replacement can join without client-side close", async () => {
    const host = trackBridge(createLanBridge());
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });
    const first = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    const firstConnected = await waitForEvent(host, (event) => event.type === "connected" && event.role === "host");
    if (firstConnected.type !== "connected" || !firstConnected.connectionId) throw new Error("expected-first-connection");
    await host.acceptConnection(firstConnected.connectionId);
    const firstClosed = new Promise<void>((resolve) => first.once("close", () => resolve()));

    await host.closeConnection(firstConnected.connectionId, "guest-left");
    await firstClosed;

    const second = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    const secondConnected = await waitForEvent(
      host,
      (event) => event.type === "connected" && event.role === "host" && event.connectionId !== firstConnected.connectionId,
    );
    if (secondConnected.type !== "connected" || !secondConnected.connectionId) throw new Error("expected-second-connection");
    await host.acceptConnection(secondConnected.connectionId);
    const received = new Promise<string>((resolve, reject) => {
      second.once("message", (payload) => resolve(payload.toString("utf8")));
      second.once("error", reject);
      void host.send("replacement-active", { connectionId: secondConnected.connectionId }).catch(reject);
    });
    await expect(received).resolves.toBe("replacement-active");
  });

  it("enforces per-connection frame and byte sliding windows and resets them after the window", async () => {
    let now = 1_000;
    const host = trackBridge(createLanBridge({
      now: () => now,
      wsFrameWindowMs: 1_000,
      wsMaxFramesPerWindow: 3,
      wsMaxBytesPerWindow: 6,
    }));
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });
    const client = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    const connected = await waitForEvent(host, (event) => event.type === "connected" && event.role === "host");
    if (connected.type !== "connected" || !connected.connectionId) throw new Error("expected-rate-connection");
    await host.acceptConnection(connected.connectionId);
    await new Promise<void>((resolve, reject) => {
      if (client.readyState === WebSocket.OPEN) resolve();
      else {
        client.once("open", () => resolve());
        client.once("error", reject);
      }
    });
    const collected = collectEvents(host);

    client.send("aa");
    client.send("bb");
    client.send("cc");
    await vi.waitFor(() => expect(collected.events.filter((event) => event.type === "message")).toHaveLength(3));
    now += 1_001;
    client.send("aa");
    client.send("bb");
    client.send("cc");
    await vi.waitFor(() => expect(collected.events.filter((event) => event.type === "message")).toHaveLength(6));

    const disconnected = waitForEvent(
      host,
      (event) => event.type === "disconnected" && event.connectionId === connected.connectionId,
    );
    client.send("d");
    await expect(disconnected).resolves.toMatchObject({ type: "disconnected", role: "host" });
    expect(collected.events.some((event) => event.type === "error" && event.code === "rate-limited")).toBe(true);
    collected.stop();
  });

  it("counts binary websocket frames as protocol violations and closes only that connection", async () => {
    const host = trackBridge(createLanBridge());
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });
    const client = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`));
    const connected = await waitForEvent(host, (event) => event.type === "connected" && event.role === "host");
    if (connected.type !== "connected" || !connected.connectionId) throw new Error("expected-binary-connection");
    await host.acceptConnection(connected.connectionId);
    await new Promise<void>((resolve, reject) => {
      if (client.readyState === WebSocket.OPEN) resolve();
      else {
        client.once("open", () => resolve());
        client.once("error", reject);
      }
    });
    const collected = collectEvents(host);
    const disconnected = waitForEvent(
      host,
      (event) => event.type === "disconnected" && event.connectionId === connected.connectionId,
    );

    client.send(Buffer.from([0, 1, 2, 3]));

    await expect(disconnected).resolves.toMatchObject({ type: "disconnected", role: "host" });
    expect(collected.events.some((event) => event.type === "error" && event.code === "protocol-violation")).toBe(true);
    collected.stop();
  });

  it("emits error then one disconnected event when a raw websocket server sends an oversized frame to the guest bridge", async () => {
    const oversized = "x".repeat(64 * 1_024 + 1);
    const { port } = await listenWsOnAllowedPort((server) => {
      server.on("connection", (socket: WebSocket) => {
        socket.send(oversized);
      });
    });
    const guest = trackBridge(createLanBridge());
    const collected = collectEvents(guest);

    const errorEvent = waitForEvent(
      guest,
      (event) => event.type === "error" && event.role === "guest" && /message-too-large/i.test(event.message),
    );
    const disconnectedEvent = waitForEvent(
      guest,
      (event) => event.type === "disconnected" && event.role === "guest" && event.hadError,
    );

    await guest.connect(`ws://127.0.0.1:${port}`);
    await expect(errorEvent).resolves.toMatchObject({ type: "error", role: "guest" });
    await expect(disconnectedEvent).resolves.toMatchObject({ type: "disconnected", role: "guest", hadError: true });
    await Promise.resolve();
    expect(collected.events.filter((event) => event.type === "disconnected" && event.role === "guest")).toHaveLength(1);

    await guest.dispose();
    await guest.dispose();
    collected.stop();
  });

  it("emits error then one disconnected event when a raw websocket client sends an oversized frame to the host bridge", async () => {
    const host = trackBridge(createLanBridge());
    const collected = collectEvents(host);
    const room = await host.createRoom({ announcementJson: buildAnnouncementJson() });

    const errorEvent = waitForEvent(
      host,
      (event) => event.type === "error" && event.role === "host" && /message-too-large/i.test(event.message),
    );
    const disconnectedEvent = waitForEvent(
      host,
      (event) => event.type === "disconnected" && event.role === "host" && event.hadError,
    );

    const client = trackWsClient(new WebSocket(`ws://127.0.0.1:${room.port}`, { maxPayload: 256 * 1_024 }));
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });

    client.send("z".repeat(64 * 1_024 + 1));
    await expect(errorEvent).resolves.toMatchObject({ type: "error", role: "host" });
    await expect(disconnectedEvent).resolves.toMatchObject({ type: "disconnected", role: "host", hadError: true });
    await Promise.resolve();
    expect(collected.events.filter((event) => event.type === "disconnected" && event.role === "host")).toHaveLength(1);

    await host.dispose();
    await host.dispose();
    collected.stop();
  });

  it("rejects invalid websocket URLs including credentials, query, hash, path, and noncanonical port text", async () => {
    expect(lanBridgeModule.validateLanWebSocketUrl).toBeTypeOf("function");
    const invalidUrls = [
      "http://127.0.0.1:47778",
      "ws://localhost:47778",
      "ws://01.2.3.4:47778",
      "ws://127.0.0.1:48000",
      "ws://127.0.0.1:47778/lobby",
      "ws://user@127.0.0.1:47778",
      "ws://127.0.0.1:47778?room=1",
      "ws://127.0.0.1:47778#hash",
      "ws://127.0.0.1:047778",
    ];

    for (const url of invalidUrls) {
      expect(() => lanBridgeModule.validateLanWebSocketUrl?.(url), url).toThrow(/invalid-url/i);
    }
  });

  it("limits stateful IPC access to the owning sender and forwards events only to that owner", async () => {
    expect(lanBridgeModule.createLanIpcController).toBeTypeOf("function");
    const bridge = createFakeBridge();
    const ipcMain = new FakeIpcMain();
    const windows = new Map<number, FakeWindow>();
    const sender1 = new FakeSender(1);
    const sender2 = new FakeSender(2);
    windows.set(1, new FakeWindow());
    windows.set(2, new FakeWindow());

    const controller = lanBridgeModule.createLanIpcController?.({
      bridge,
      ipcMain,
      getWindowFromSender: (sender) => windows.get(sender.id),
    });

    const channels = lanBridgeModule.CHANNELS ?? {
      capabilities: "battleship-lan:capabilities",
      createRoom: "battleship-lan:create-room",
      event: "battleship-lan:event",
    };

    await expect(ipcMain.handlers.get(channels.capabilities)?.({ sender: sender1 })).resolves.toEqual({
      desktop: true,
      canHost: true,
      canDiscover: true,
    });
    await expect(ipcMain.handlers.get(channels.capabilities)?.({ sender: sender2 })).resolves.toEqual({
      desktop: true,
      canHost: true,
      canDiscover: true,
    });

    const announcementJson = buildAnnouncementJson();
    await expect(ipcMain.handlers.get(channels.createRoom)?.({ sender: sender1 }, { announcementJson })).resolves.toEqual({
      port: LAN_GAME_PORTS[0],
    });
    await expect(ipcMain.handlers.get(channels.createRoom)?.({ sender: sender2 }, { announcementJson })).rejects.toThrow(/lan-owner-mismatch/i);

    bridge.emit({ type: "probe", address: "127.0.0.1", port: LAN_DISCOVERY_PORT });
    expect(sender1.send).toHaveBeenCalledWith(channels.event, { type: "probe", address: "127.0.0.1", port: LAN_DISCOVERY_PORT });
    expect(sender2.send).not.toHaveBeenCalled();

    sender1.destroy();
    await Promise.resolve();

    await expect(ipcMain.handlers.get(channels.createRoom)?.({ sender: sender2 }, { announcementJson })).resolves.toEqual({
      port: LAN_GAME_PORTS[0],
    });

    await controller?.dispose();
    expect(bridge.dispose).toHaveBeenCalled();
  });

  it("exposes preload subscribe unsubscribe without leaking event listeners", async () => {
    const listeners = new Map<string, ((event: unknown, payload: unknown) => void)[]>();
    const contextBridge = { exposeInMainWorld: vi.fn<(name: string, api: unknown) => void>() };
    const ipcRenderer = {
      invoke: vi.fn(async () => undefined),
      on: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
        listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
      }),
      off: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
        listeners.set(channel, (listeners.get(channel) ?? []).filter((candidate) => candidate !== listener));
      }),
    };

    const preload = loadPreloadModule({ contextBridge, ipcRenderer });
    expect(preload.installBattleshipLanBridge).toBeTypeOf("function");

    const [, api] = contextBridge.exposeInMainWorld.mock.calls[0] as [string, {
      send: (messageJson: string, target?: { connectionId?: string }) => Promise<void>;
      acceptConnection: (connectionId: string) => Promise<void>;
      closeConnection: (connectionId: string, reason?: string) => Promise<void>;
      subscribe: (listener: (payload: unknown) => void) => () => void;
    }];
    const received: unknown[] = [];
    const unsubscribe = api.subscribe((payload) => {
      received.push(payload);
    });

    const eventChannel = preload.CHANNELS?.event ?? "battleship-lan:event";
    listeners.get(eventChannel)?.[0]?.({}, { id: 1 });
    unsubscribe();
    expect(listeners.get(eventChannel) ?? []).toHaveLength(0);
    listeners.get(eventChannel)?.[0]?.({}, { id: 2 });

    expect(received).toEqual([{ id: 1 }]);
    await api.send("payload", { connectionId: "host-connection-1" });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(preload.CHANNELS?.send ?? "battleship-lan:send", "payload", { connectionId: "host-connection-1" });
    await api.acceptConnection("host-connection-1");
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(preload.CHANNELS?.acceptConnection ?? "battleship-lan:accept-connection", "host-connection-1");
    await api.closeConnection("host-connection-1", "invalid-request");
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(preload.CHANNELS?.closeConnection ?? "battleship-lan:close-connection", "host-connection-1", "invalid-request");
    expect(ipcRenderer.off).toHaveBeenCalledOnce();
  });

  it("reports unsupported capabilities when the desktop preload API is absent", async () => {
    const bridge = createLanBridgeClient();

    await expect(bridge.capabilities()).resolves.toEqual(UNSUPPORTED_LAN_CAPABILITIES);
    await expect(bridge.createRoom({ announcementJson: buildAnnouncementJson() })).rejects.toThrow(/desktop app/i);
    expect(() => bridge.subscribe(() => undefined)).toThrow(/desktop app/i);
  });
});
