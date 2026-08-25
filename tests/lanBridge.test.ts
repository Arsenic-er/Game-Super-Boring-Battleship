import net from "node:net";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { LAN_GAME_PORTS } from "../src/net/protocol";
import {
  UNSUPPORTED_LAN_CAPABILITIES,
  createLanBridgeClient,
  type LanBridgeEvent,
} from "../src/net/lanBridge";

const require = createRequire(import.meta.url);
const { createLanBridge } = require("../desktop/lanBridge.cjs") as {
  createLanBridge: () => {
    capabilities(): Promise<{ desktop: true; canHost: true; canDiscover: true }>;
    createRoom(request: { announcementJson: string }): Promise<{ port: number }>;
    updateAnnouncement(announcementJson: string): Promise<void>;
    closeRoom(): Promise<void>;
    startDiscovery(): Promise<void>;
    stopDiscovery(): Promise<void>;
    connect(url: string): Promise<void>;
    disconnect(): Promise<void>;
    send(messageJson: string): Promise<void>;
    subscribe(listener: (event: LanBridgeEvent) => void): () => void;
    dispose(): Promise<void>;
  };
};

type TestBridge = ReturnType<typeof createLanBridge>;

const EVENT_TIMEOUT_MS = 4_000;
const openBridges: TestBridge[] = [];
const openServers: net.Server[] = [];

function trackBridge<T extends TestBridge>(bridge: T): T {
  openBridges.push(bridge);
  return bridge;
}

function trackServer<T extends net.Server>(server: T): T {
  openServers.push(server);
  return server;
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function occupyPort(port: number): Promise<net.Server> {
  const server = trackServer(net.createServer());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
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

afterEach(async () => {
  while (openBridges.length > 0) {
    const bridge = openBridges.pop();
    if (!bridge) continue;
    await bridge.dispose();
  }

  while (openServers.length > 0) {
    const server = openServers.pop();
    if (!server) continue;
    if (server.listening) await closeServer(server);
  }

  delete (globalThis as { window?: unknown }).window;
});

describe("Electron LAN bridge", () => {
  it("selects the next allowed host port when the first LAN port is occupied and reuses the preferred port after close", async () => {
    const occupied = await occupyPort(LAN_GAME_PORTS[0]);
    const bridge = trackBridge(createLanBridge());

    await expect(bridge.createRoom({ announcementJson: '{"room":"alpha"}' })).resolves.toEqual({ port: LAN_GAME_PORTS[1] });
    await expect(bridge.createRoom({ announcementJson: '{"room":"alpha"}' })).resolves.toEqual({ port: LAN_GAME_PORTS[1] });

    await bridge.closeRoom();
    await bridge.closeRoom();
    await closeServer(occupied);

    await expect(bridge.createRoom({ announcementJson: '{"room":"bravo"}' })).resolves.toEqual({ port: LAN_GAME_PORTS[0] });
  });

  it("broadcasts announcements, emits probe events, and relays websocket connect message disconnect lifecycle", async () => {
    const host = trackBridge(createLanBridge());
    const guest = trackBridge(createLanBridge());

    await guest.startDiscovery();
    await guest.startDiscovery();

    const announcement = waitForEvent(
      guest,
      (event) => event.type === "announcement" && event.announcementJson === '{"room":"alpha"}',
    );
    const room = await host.createRoom({ announcementJson: '{"room":"alpha"}' });

    await expect(announcement).resolves.toMatchObject({
      type: "announcement",
      announcementJson: '{"room":"alpha"}',
    });

    const probe = waitForEvent(host, (event) => event.type === "probe");
    await guest.startDiscovery();
    await expect(probe).resolves.toMatchObject({ type: "probe" });

    const connected = waitForEvent(host, (event) => event.type === "connected");
    await guest.connect(`ws://127.0.0.1:${room.port}`);
    await guest.connect(`ws://127.0.0.1:${room.port}`);
    await expect(connected).resolves.toMatchObject({ type: "connected" });

    const message = waitForEvent(
      host,
      (event) => event.type === "message" && event.messageJson === '{"kind":"ping"}',
    );
    await guest.send('{"kind":"ping"}');
    await expect(message).resolves.toMatchObject({
      type: "message",
      messageJson: '{"kind":"ping"}',
    });

    const disconnected = waitForEvent(host, (event) => event.type === "disconnected");
    await guest.disconnect();
    await guest.disconnect();
    await expect(disconnected).resolves.toMatchObject({ type: "disconnected" });
  });

  it("rejects oversized transport strings and invalid websocket URLs", async () => {
    const host = trackBridge(createLanBridge());
    const guest = trackBridge(createLanBridge());

    await expect(host.createRoom({ announcementJson: "x".repeat(1_025) })).rejects.toThrow(/message-too-large/i);
    const room = await host.createRoom({ announcementJson: '{"room":"alpha"}' });
    await expect(host.updateAnnouncement("y".repeat(1_025))).rejects.toThrow(/message-too-large/i);

    const invalidUrls = [
      "http://127.0.0.1:47778",
      "ws://localhost:47778",
      "ws://01.2.3.4:47778",
      "ws://127.0.0.1:48000",
      "ws://127.0.0.1:47778/lobby",
    ];

    for (const url of invalidUrls) {
      await expect(guest.connect(url), url).rejects.toThrow(/invalid-url/i);
    }

    const connected = waitForEvent(host, (event) => event.type === "connected");
    await guest.connect(`ws://127.0.0.1:${room.port}`);
    await expect(connected).resolves.toMatchObject({ type: "connected" });
    await expect(guest.send("z".repeat(65_537))).rejects.toThrow(/message-too-large/i);
  });

  it("reports unsupported capabilities when the desktop preload API is absent", async () => {
    const bridge = createLanBridgeClient();

    await expect(bridge.capabilities()).resolves.toEqual(UNSUPPORTED_LAN_CAPABILITIES);
    await expect(bridge.createRoom({ announcementJson: '{"room":"alpha"}' })).rejects.toThrow(/desktop app/i);
    expect(() => bridge.subscribe(() => undefined)).toThrow(/desktop app/i);
  });
});
