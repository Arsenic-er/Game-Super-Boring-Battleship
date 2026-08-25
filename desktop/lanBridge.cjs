const dgram = require("node:dgram");
const { EventEmitter } = require("node:events");
const { WebSocket, WebSocketServer } = require("ws");

const LAN_DISCOVERY_PORT = 47_777;
const LAN_GAME_PORTS = [
  47_778, 47_779, 47_780, 47_781, 47_782, 47_783, 47_784, 47_785, 47_786, 47_787, 47_788,
];
const UDP_MAX_BYTES = 1_024;
const WS_MAX_BYTES = 64 * 1_024;
const DISCOVERY_PROBE = "__BATTLESHIP_LAN_PROBE__";
const BROADCAST_ADDRESSES = ["255.255.255.255", "127.0.0.1"];
const SUPPORTED_CAPABILITIES = Object.freeze({ desktop: true, canHost: true, canDiscover: true });
const ALLOWED_PORTS = new Set(LAN_GAME_PORTS);

function isCanonicalIpv4Octet(value) {
  if (value === "0") return true;
  if (!/^[1-9]\d{0,2}$/.test(value)) return false;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric <= 255;
}

function isCanonicalIpv4(value) {
  if (typeof value !== "string" || value.length < 7 || value.length > 15) return false;
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => isCanonicalIpv4Octet(part));
}

function assertStringPayload(value, maxBytes, kind) {
  if (typeof value !== "string") throw new TypeError(`${kind}-must-be-string`);
  if (Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(`message-too-large:${maxBytes}`);
}

function waitForUdpBound(socket, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      socket.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      socket.off("error", onError);
      resolve();
    };
    socket.once("error", onError);
    socket.once("listening", onListening);
    socket.bind(port);
  });
}

function closeUdpSocket(socket) {
  if (!socket) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function sendUdp(socket, message, port, address) {
  return new Promise((resolve, reject) => {
    socket.send(message, port, address, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function closeWebSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once("close", () => resolve());
    try {
      if (socket.readyState === WebSocket.CLOSING) return;
      socket.close();
    } catch {
      resolve();
    }
  });
}

function closeWebSocketServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function validateLanWebSocketUrl(value) {
  if (typeof value !== "string") throw new Error("invalid-url");
  const match = /^ws:\/\/([^\/:?#]+):(\d+)$/.exec(value);
  if (!match) throw new Error("invalid-url");

  const [, host, portText] = match;
  if (!isCanonicalIpv4(host)) throw new Error("invalid-url");

  const port = Number(portText);
  if (!Number.isInteger(port) || !ALLOWED_PORTS.has(port)) throw new Error("invalid-url");
  return `ws://${host}:${port}`;
}

class LanBridge {
  constructor() {
    this.events = new EventEmitter();
    this.roomServer = undefined;
    this.roomPort = undefined;
    this.roomAnnouncementJson = undefined;
    this.hostDiscoverySocket = undefined;
    this.discoverySocket = undefined;
    this.hostPeerSocket = undefined;
    this.clientSocket = undefined;
    this.clientUrl = undefined;
    this.connectPromise = undefined;
  }

  async capabilities() {
    return SUPPORTED_CAPABILITIES;
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener-must-be-function");
    this.events.on("event", listener);
    return () => this.events.off("event", listener);
  }

  emit(event) {
    this.events.emit("event", Object.freeze({ ...event }));
  }

  async createRoom(request) {
    const announcementJson = request?.announcementJson;
    assertStringPayload(announcementJson, UDP_MAX_BYTES, "announcement");

    if (this.roomServer && this.roomPort) {
      if (this.roomAnnouncementJson !== announcementJson) await this.updateAnnouncement(announcementJson);
      return { port: this.roomPort };
    }

    await this.ensureHostDiscoverySocket();

    let lastError;
    for (const port of LAN_GAME_PORTS) {
      try {
        const server = await this.createRoomServer(port);
        this.roomServer = server;
        this.roomPort = port;
        this.roomAnnouncementJson = announcementJson;
        await this.broadcastAnnouncement();
        return { port };
      } catch (error) {
        if (error && error.code === "EADDRINUSE") {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("no-available-port");
  }

  async updateAnnouncement(announcementJson) {
    assertStringPayload(announcementJson, UDP_MAX_BYTES, "announcement");
    if (!this.roomServer) throw new Error("room-not-active");
    this.roomAnnouncementJson = announcementJson;
    await this.broadcastAnnouncement();
  }

  async closeRoom() {
    const peerSocket = this.hostPeerSocket;
    this.hostPeerSocket = undefined;
    await closeWebSocket(peerSocket);

    const server = this.roomServer;
    this.roomServer = undefined;
    this.roomPort = undefined;
    this.roomAnnouncementJson = undefined;
    await closeWebSocketServer(server);

    const discoverySocket = this.hostDiscoverySocket;
    this.hostDiscoverySocket = undefined;
    await closeUdpSocket(discoverySocket);
  }

  async startDiscovery() {
    if (!this.discoverySocket) {
      const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      socket.on("message", (message, remote) => this.onDiscoveryMessage(message, remote));
      await waitForUdpBound(socket, LAN_DISCOVERY_PORT);
      socket.setBroadcast(true);
      this.discoverySocket = socket;
    }

    await sendUdp(this.discoverySocket, DISCOVERY_PROBE, LAN_DISCOVERY_PORT, "127.0.0.1");
  }

  async stopDiscovery() {
    const socket = this.discoverySocket;
    this.discoverySocket = undefined;
    await closeUdpSocket(socket);
  }

  async connect(url) {
    const normalizedUrl = validateLanWebSocketUrl(url);
    if (this.clientSocket && this.clientSocket.readyState === WebSocket.OPEN && this.clientUrl === normalizedUrl) return;
    if (this.connectPromise && this.clientUrl === normalizedUrl) return this.connectPromise;

    await this.disconnect();
    this.clientUrl = normalizedUrl;

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(normalizedUrl, { maxPayload: WS_MAX_BYTES });
      this.clientSocket = socket;
      this.attachSocket(socket, { role: "guest", url: normalizedUrl });

      let settled = false;
      const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("error", onError);
        socket.off("close", onCloseBeforeOpen);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (this.clientSocket === socket) this.clientSocket = undefined;
        if (this.clientUrl === normalizedUrl) this.clientUrl = undefined;
        this.connectPromise = undefined;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const onOpen = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.connectPromise = undefined;
        this.emit({ type: "connected", role: "guest", url: normalizedUrl });
        resolve();
      };
      const onError = (error) => fail(error);
      const onCloseBeforeOpen = () => fail(new Error("connection-closed"));

      socket.once("open", onOpen);
      socket.once("error", onError);
      socket.once("close", onCloseBeforeOpen);
    });

    return this.connectPromise;
  }

  async disconnect() {
    const socket = this.clientSocket;
    const pending = this.connectPromise;
    this.connectPromise = undefined;
    this.clientUrl = undefined;
    this.clientSocket = undefined;
    await closeWebSocket(socket);
    if (pending) await Promise.allSettled([pending]);
  }

  async send(messageJson) {
    assertStringPayload(messageJson, WS_MAX_BYTES, "message");
    const socket = this.clientSocket?.readyState === WebSocket.OPEN
      ? this.clientSocket
      : this.hostPeerSocket?.readyState === WebSocket.OPEN
        ? this.hostPeerSocket
        : undefined;
    if (!socket) throw new Error("not-connected");
    await new Promise((resolve, reject) => {
      socket.send(messageJson, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async dispose() {
    await this.stopDiscovery();
    await this.disconnect();
    await this.closeRoom();
  }

  async ensureHostDiscoverySocket() {
    if (this.hostDiscoverySocket) return;
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("message", (message, remote) => this.onHostDiscoveryMessage(message, remote));
    await waitForUdpBound(socket, LAN_DISCOVERY_PORT);
    socket.setBroadcast(true);
    this.hostDiscoverySocket = socket;
  }

  async createRoomServer(port) {
    return await new Promise((resolve, reject) => {
      const server = new WebSocketServer({ host: "0.0.0.0", port, maxPayload: WS_MAX_BYTES });
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        server.on("connection", (socket, request) => {
          const previousSocket = this.hostPeerSocket;
          this.hostPeerSocket = socket;
          this.attachSocket(socket, { role: "host" });
          this.emit({
            type: "connected",
            role: "host",
            url: `ws://${request.socket.remoteAddress || "127.0.0.1"}:${request.socket.remotePort || 0}`,
          });
          if (previousSocket && previousSocket !== socket) void closeWebSocket(previousSocket);
        });
        resolve(server);
      };
      server.once("error", onError);
      server.once("listening", onListening);
    });
  }

  attachSocket(socket, metadata) {
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      const text = typeof data === "string" ? data : data.toString("utf8");
      if (Buffer.byteLength(text, "utf8") > WS_MAX_BYTES) {
        socket.close(1009, "message-too-large");
        return;
      }
      this.emit({ type: "message", role: metadata.role, messageJson: text });
    });

    socket.on("close", (code) => {
      if (metadata.role === "guest" && this.clientSocket === socket) {
        this.clientSocket = undefined;
        this.clientUrl = undefined;
      }
      if (metadata.role === "host" && this.hostPeerSocket === socket) this.hostPeerSocket = undefined;
      this.emit({ type: "disconnected", role: metadata.role, hadError: code !== 1000 && code !== 1005 });
    });
  }

  onDiscoveryMessage(message, remote) {
    if (message.length > UDP_MAX_BYTES) return;
    const text = message.toString("utf8");
    if (text === DISCOVERY_PROBE) return;
    this.emit({
      type: "announcement",
      announcementJson: text,
      address: remote.address,
      port: remote.port,
    });
  }

  onHostDiscoveryMessage(message, remote) {
    if (message.length > UDP_MAX_BYTES) return;
    if (message.toString("utf8") !== DISCOVERY_PROBE) return;
    this.emit({ type: "probe", address: remote.address, port: remote.port });
    if (this.roomAnnouncementJson && this.hostDiscoverySocket) {
      void sendUdp(this.hostDiscoverySocket, this.roomAnnouncementJson, remote.port, remote.address).catch(() => {});
    }
  }

  async broadcastAnnouncement() {
    if (!this.hostDiscoverySocket || !this.roomAnnouncementJson) return;
    await Promise.allSettled(
      BROADCAST_ADDRESSES.map((address) => sendUdp(this.hostDiscoverySocket, this.roomAnnouncementJson, LAN_DISCOVERY_PORT, address)),
    );
  }
}

function createLanBridge() {
  return new LanBridge();
}

module.exports = {
  LAN_DISCOVERY_PORT,
  LAN_GAME_PORTS,
  LanBridge,
  createLanBridge,
  validateLanWebSocketUrl,
};
