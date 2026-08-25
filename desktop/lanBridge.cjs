const dgram = require("node:dgram");
const { EventEmitter } = require("node:events");
const { WebSocket, WebSocketServer } = require("ws");

const LAN_PROTOCOL_VERSION = 1;
const LAN_DISCOVERY_PORT = 47_777;
const LAN_GAME_PORTS = [
  47_778, 47_779, 47_780, 47_781, 47_782, 47_783, 47_784, 47_785, 47_786, 47_787, 47_788,
];
const LAN_ROOM_PHASES = ["advertising", "lobby", "starting", "in-match", "post-match", "closing"];
const CHANNELS = Object.freeze({
  capabilities: "battleship-lan:capabilities",
  createRoom: "battleship-lan:create-room",
  updateAnnouncement: "battleship-lan:update-announcement",
  closeRoom: "battleship-lan:close-room",
  startDiscovery: "battleship-lan:start-discovery",
  stopDiscovery: "battleship-lan:stop-discovery",
  connect: "battleship-lan:connect",
  disconnect: "battleship-lan:disconnect",
  acceptConnection: "battleship-lan:accept-connection",
  closeConnection: "battleship-lan:close-connection",
  send: "battleship-lan:send",
  event: "battleship-lan:event",
});
const UDP_MAX_BYTES = 1_024;
const WS_MAX_BYTES = 64 * 1_024;
const ANNOUNCEMENT_INTERVAL_MS = 1_000;
const PROBE_WINDOW_MS = 1_500;
const PENDING_HANDSHAKE_MS = 4_500;
const WS_FRAME_WINDOW_MS = 1_000;
const WS_MAX_FRAMES_PER_WINDOW = 120;
const WS_MAX_BYTES_PER_WINDOW = 512 * 1_024;
const DISCOVERY_PROBE = "__BATTLESHIP_LAN_PROBE__";
const BROADCAST_ADDRESSES = ["255.255.255.255", "127.0.0.1"];
const SUPPORTED_CAPABILITIES = Object.freeze({ desktop: true, canHost: true, canDiscover: true });
const ALLOWED_PORTS = new Set(LAN_GAME_PORTS);
const ALLOWED_MESSAGE_TYPES = new Set(["room-announcement"]);
const ROOM_ANNOUNCEMENT_KEYS = Object.freeze([
  "protocolVersion",
  "gameVersion",
  "contentHash",
  "roomId",
  "sequence",
  "sentAt",
  "type",
  "payload",
]);
const ROOM_ANNOUNCEMENT_PAYLOAD_KEYS = Object.freeze([
  "roomName",
  "hostName",
  "discoveryPort",
  "port",
  "playerCount",
  "capacity",
  "phase",
]);
const STATEFUL_CHANNELS = Object.freeze([
  CHANNELS.createRoom,
  CHANNELS.updateAnnouncement,
  CHANNELS.closeRoom,
  CHANNELS.startDiscovery,
  CHANNELS.stopDiscovery,
  CHANNELS.connect,
  CHANNELS.disconnect,
  CHANNELS.acceptConnection,
  CHANNELS.closeConnection,
  CHANNELS.send,
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function readNonEmptyString(value, maxLength) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function readFiniteInteger(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return undefined;
  return value;
}

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

function assertLanBridgeStringPayload(value, maxBytes, kind) {
  if (typeof value !== "string") throw new TypeError(`${kind}-must-be-string`);
  if (Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(`message-too-large:${maxBytes}`);
}

function websocketDataByteLength(data) {
  if (typeof data === "string") return Buffer.byteLength(data, "utf8");
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + (chunk?.byteLength ?? Buffer.byteLength(chunk)), 0);
  }
  return data?.byteLength ?? Buffer.byteLength(data);
}

function serializeDiscoveryAnnouncement(announcement, roomPort) {
  return JSON.stringify({
    protocolVersion: LAN_PROTOCOL_VERSION,
    gameVersion: announcement.gameVersion,
    contentHash: announcement.contentHash,
    roomId: announcement.roomId,
    sequence: announcement.sequence,
    sentAt: announcement.sentAt,
    type: "room-announcement",
    payload: {
      roomName: announcement.payload.roomName,
      hostName: announcement.payload.hostName,
      discoveryPort: LAN_DISCOVERY_PORT,
      port: roomPort ?? announcement.payload.port,
      playerCount: announcement.payload.playerCount,
      capacity: 2,
      phase: announcement.payload.phase,
    },
  });
}

function normalizeDiscoveryAnnouncementJson(json, roomPort) {
  const announcement = parseDiscoveryAnnouncementJson(json);
  if (!announcement) return undefined;
  return serializeDiscoveryAnnouncement(announcement, roomPort);
}

function parseDiscoveryAnnouncementJson(json) {
  assertLanBridgeStringPayload(json, UDP_MAX_BYTES, "announcement");

  let value;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }

  if (!isRecord(value) || !hasExactKeys(value, ROOM_ANNOUNCEMENT_KEYS)) return undefined;
  const protocolVersion = readFiniteInteger(value.protocolVersion, { min: LAN_PROTOCOL_VERSION, max: LAN_PROTOCOL_VERSION });
  const gameVersion = readNonEmptyString(value.gameVersion, 32);
  const contentHash = readNonEmptyString(value.contentHash, 128);
  const roomId = readNonEmptyString(value.roomId, 64);
  const sequence = readFiniteInteger(value.sequence, { min: 0 });
  const sentAt = readFiniteInteger(value.sentAt, { min: 0 });
  const type = typeof value.type === "string" && ALLOWED_MESSAGE_TYPES.has(value.type) ? value.type : undefined;
  if (!protocolVersion || !gameVersion || !contentHash || !roomId || sequence === undefined || sentAt === undefined || !type) {
    return undefined;
  }

  const payload = value.payload;
  if (!isRecord(payload) || !hasExactKeys(payload, ROOM_ANNOUNCEMENT_PAYLOAD_KEYS)) return undefined;
  const roomName = readNonEmptyString(payload.roomName, 48);
  const hostName = readNonEmptyString(payload.hostName, 32);
  const discoveryPort = readFiniteInteger(payload.discoveryPort, { min: LAN_DISCOVERY_PORT, max: LAN_DISCOVERY_PORT });
  const port = readFiniteInteger(payload.port);
  const playerCount = readFiniteInteger(payload.playerCount, { min: 1, max: 2 });
  const capacity = readFiniteInteger(payload.capacity, { min: 2, max: 2 });
  const phase = typeof payload.phase === "string" && LAN_ROOM_PHASES.includes(payload.phase) ? payload.phase : undefined;
  if (!roomName || !hostName || discoveryPort !== LAN_DISCOVERY_PORT || port === undefined || !ALLOWED_PORTS.has(port) || !phase) {
    return undefined;
  }
  if ((playerCount !== 1 && playerCount !== 2) || capacity !== 2) return undefined;

  return Object.freeze({
    protocolVersion: LAN_PROTOCOL_VERSION,
    gameVersion,
    contentHash,
    roomId,
    sequence,
    sentAt,
    type: "room-announcement",
    payload: Object.freeze({
      roomName,
      hostName,
      discoveryPort: LAN_DISCOVERY_PORT,
      port,
      playerCount,
      capacity: 2,
      phase,
    }),
  });
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
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    socket.once("close", finish);
    try {
      if (socket.readyState === WebSocket.CLOSING) return;
      socket.close();
    } catch {
      finish();
    }
  });
}

function closeWebSocketWithReason(socket, code, reason) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    socket.once("close", finish);
    try {
      if (socket.readyState === WebSocket.CLOSING) return;
      socket.close(code, reason);
    } catch {
      finish();
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
  if (portText.length > 1 && portText.startsWith("0")) throw new Error("invalid-url");

  const port = Number(portText);
  if (!Number.isInteger(port) || String(port) != portText || !ALLOWED_PORTS.has(port)) throw new Error("invalid-url");
  return `ws://${host}:${port}`;
}

function normalizeBridgeError(error) {
  if (error && typeof error === "object" && error.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
    return { code: "message-too-large", message: "message-too-large" };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/protocol-violation/i.test(message)) {
    return { code: "protocol-violation", message: "protocol-violation" };
  }
  if (/rate-limited/i.test(message)) {
    return { code: "rate-limited", message: "rate-limited" };
  }
  if (/max payload size exceeded/i.test(message) || /message-too-large/i.test(message)) {
    return { code: "message-too-large", message: "message-too-large" };
  }
  return { code: "socket-error", message };
}

class LanBridge {
  constructor(options = {}) {
    this.events = new EventEmitter();
    this.createUdpSocket = options.createUdpSocket ?? (() => dgram.createSocket({ type: "udp4", reuseAddr: true }));
    this.createWebSocketServer = options.createWebSocketServer ?? ((serverOptions) => new WebSocketServer(serverOptions));
    this.WebSocketClass = options.WebSocketClass ?? WebSocket;
    this.setIntervalFn = options.setInterval ?? setInterval;
    this.clearIntervalFn = options.clearInterval ?? clearInterval;

    this.roomServer = undefined;
    this.roomPort = undefined;
    this.roomAnnouncementJson = undefined;
    this.hostDiscoverySocket = undefined;
    this.discoverySocket = undefined;
    this.hostPeerSocket = undefined;
    this.hostPeerConnectionId = undefined;
    this.hostPendingConnections = new Map();
    this.clientSocket = undefined;
    this.clientUrl = undefined;
    this.connectPromise = undefined;
    this.announcementTimer = undefined;
    this.probeSocket = undefined;
    this.probeTimer = undefined;
    this.probeWindowMs = options.probeWindowMs ?? PROBE_WINDOW_MS;
    this.pendingHandshakeMs = options.pendingHandshakeMs ?? PENDING_HANDSHAKE_MS;
    this.setTimeoutFn = options.setTimeout ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeout ?? clearTimeout;
    this.nowFn = options.now ?? Date.now;
    this.wsFrameWindowMs = options.wsFrameWindowMs ?? WS_FRAME_WINDOW_MS;
    this.wsMaxFramesPerWindow = options.wsMaxFramesPerWindow ?? WS_MAX_FRAMES_PER_WINDOW;
    this.wsMaxBytesPerWindow = options.wsMaxBytesPerWindow ?? WS_MAX_BYTES_PER_WINDOW;
    this.socketStates = new WeakMap();
    this.nextHostConnectionId = 0;
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
    if (!parseDiscoveryAnnouncementJson(announcementJson)) throw new Error("invalid-announcement");

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
        this.roomAnnouncementJson = normalizeDiscoveryAnnouncementJson(announcementJson, port);
        this.startAnnouncementTimer();
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
    if (!parseDiscoveryAnnouncementJson(announcementJson)) throw new Error("invalid-announcement");
    if (!this.roomServer || this.roomPort === undefined) return;
    this.roomAnnouncementJson = normalizeDiscoveryAnnouncementJson(announcementJson, this.roomPort);
    await this.broadcastAnnouncement();
  }

  async closeRoom() {
    this.stopAnnouncementTimer();

    const peerSocket = this.hostPeerSocket;
    this.hostPeerSocket = undefined;
    this.hostPeerConnectionId = undefined;
    const pendingSockets = [...this.hostPendingConnections.values()].map(({ socket, timer }) => {
      this.clearTimeoutFn(timer);
      return socket;
    });
    this.hostPendingConnections.clear();
    await Promise.all([closeWebSocket(peerSocket), ...pendingSockets.map((socket) => closeWebSocket(socket))]);

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
      const socket = this.createUdpSocket();
      socket.on("message", (message, remote) => this.onDiscoveryMessage(message, remote));
      socket.on("error", () => {});
      await waitForUdpBound(socket, LAN_DISCOVERY_PORT);
      socket.setBroadcast(true);
      this.discoverySocket = socket;
    }

    const probeSocket = this.probeSocket ?? this.createUdpSocket();
    if (!this.probeSocket) {
      probeSocket.on("message", (message, remote) => this.onDiscoveryMessage(message, remote));
      probeSocket.on("error", () => {
        void this.stopProbeSocket();
      });
      await waitForUdpBound(probeSocket, 0);
      probeSocket.setBroadcast(true);
      this.probeSocket = probeSocket;
    }

    this.startProbeTimer(true);
    await Promise.allSettled(BROADCAST_ADDRESSES.map((address) => sendUdp(probeSocket, DISCOVERY_PROBE, LAN_DISCOVERY_PORT, address)));
  }

  async stopDiscovery() {
    await this.stopProbeSocket();
    const socket = this.discoverySocket;
    this.discoverySocket = undefined;
    await closeUdpSocket(socket);
  }

  async connect(url) {
    const normalizedUrl = validateLanWebSocketUrl(url);
    if (this.clientSocket && this.clientSocket.readyState === this.WebSocketClass.OPEN && this.clientUrl === normalizedUrl) return;
    if (this.connectPromise && this.clientUrl === normalizedUrl) return this.connectPromise;

    await this.disconnect();
    this.clientUrl = normalizedUrl;

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new this.WebSocketClass(normalizedUrl, { maxPayload: WS_MAX_BYTES });
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

  async send(messageJson, target = undefined) {
    assertLanBridgeStringPayload(messageJson, WS_MAX_BYTES, "message");
    const socket = this.clientSocket?.readyState === this.WebSocketClass.OPEN
      ? this.clientSocket
      : this.resolveHostSocketTarget(target);
    if (!socket) throw new Error("not-connected");
    await new Promise((resolve, reject) => {
      socket.send(messageJson, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async acceptConnection(connectionId) {
    if (typeof connectionId !== "string" || !connectionId) throw new Error("connection-not-found");
    if (connectionId === this.hostPeerConnectionId
      && this.hostPeerSocket?.readyState === this.WebSocketClass.OPEN) return;
    const pending = this.hostPendingConnections.get(connectionId);
    if (!pending || pending.socket.readyState !== this.WebSocketClass.OPEN) throw new Error("connection-not-found");
    if (this.hostPeerSocket?.readyState === this.WebSocketClass.OPEN) throw new Error("room-full");
    this.clearTimeoutFn(pending.timer);
    this.hostPendingConnections.delete(connectionId);
    this.hostPeerSocket = pending.socket;
    this.hostPeerConnectionId = connectionId;
  }

  async closeConnection(connectionId, reason = "connection-rejected") {
    if (typeof connectionId !== "string" || !connectionId) throw new Error("connection-not-found");
    let socket;
    if (connectionId === this.hostPeerConnectionId) {
      socket = this.hostPeerSocket;
      this.hostPeerSocket = undefined;
      this.hostPeerConnectionId = undefined;
    } else {
      const pending = this.hostPendingConnections.get(connectionId);
      if (pending) {
        this.clearTimeoutFn(pending.timer);
        this.hostPendingConnections.delete(connectionId);
        socket = pending.socket;
      }
    }
    if (!socket) throw new Error("connection-not-found");
    const safeReason = typeof reason === "string" && reason.length > 0
      ? reason.slice(0, 80)
      : "connection-rejected";
    await closeWebSocketWithReason(socket, 1008, safeReason);
  }

  async dispose() {
    await this.stopDiscovery();
    await this.disconnect();
    await this.closeRoom();
  }

  async ensureHostDiscoverySocket() {
    if (this.hostDiscoverySocket) return;
    const socket = this.createUdpSocket();
    socket.on("message", (message, remote) => this.onHostDiscoveryMessage(message, remote));
    socket.on("error", () => {});
    await waitForUdpBound(socket, LAN_DISCOVERY_PORT);
    socket.setBroadcast(true);
    this.hostDiscoverySocket = socket;
  }

  async createRoomServer(port) {
    return await new Promise((resolve, reject) => {
      const server = this.createWebSocketServer({ host: "0.0.0.0", port, maxPayload: WS_MAX_BYTES });
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        server.on("connection", (socket, request = { socket: {} }) => {
          const hasPendingConnection = [...this.hostPendingConnections.values()]
            .some(({ socket: pendingSocket }) => pendingSocket.readyState === this.WebSocketClass.OPEN);
          if (this.hostPeerSocket?.readyState === this.WebSocketClass.OPEN || hasPendingConnection) {
            try { socket.close(1013, "room-full"); } catch { /* ignore */ }
            return;
          }
          const connectionId = this.allocateHostConnectionId();
          this.attachSocket(socket, { role: "host", connectionId });
          const timer = this.setTimeoutFn(() => {
            const pending = this.hostPendingConnections.get(connectionId);
            if (!pending || pending.socket !== socket) return;
            this.hostPendingConnections.delete(connectionId);
            void closeWebSocketWithReason(socket, 1008, "handshake-timeout");
          }, this.pendingHandshakeMs);
          this.hostPendingConnections.set(connectionId, { socket, timer });
          this.emit({
            type: "connected",
            role: "host",
            url: `ws://${request.socket.remoteAddress || "127.0.0.1"}:${request.socket.remotePort || 0}`,
            connectionId,
          });
        });
        resolve(server);
      };
      server.once("error", onError);
      server.once("listening", onListening);
    });
  }

  resolveHostSocketTarget(target) {
    if (!target?.connectionId) {
      return this.hostPeerSocket?.readyState === this.WebSocketClass.OPEN ? this.hostPeerSocket : undefined;
    }
    if (target.connectionId === this.hostPeerConnectionId
      && this.hostPeerSocket?.readyState === this.WebSocketClass.OPEN) return this.hostPeerSocket;
    const pending = this.hostPendingConnections.get(target.connectionId);
    if (pending?.socket.readyState === this.WebSocketClass.OPEN) return pending.socket;
    throw new Error("connection-not-found");
  }

  allocateHostConnectionId() {
    this.nextHostConnectionId += 1;
    return `host-connection-${this.nextHostConnectionId}`;
  }

  attachSocket(socket, metadata) {
    const state = {
      role: metadata.role,
      disconnected: false,
      connectionId: metadata.connectionId,
      inboundFrames: [],
    };
    this.socketStates.set(socket, state);

    socket.on("message", (data, isBinary) => {
      const byteLength = websocketDataByteLength(data);
      const withinRateLimit = this.recordInboundFrame(state, byteLength);
      if (isBinary) {
        this.emitSocketError(socket, state, new Error("protocol-violation"));
        void closeWebSocketWithReason(socket, 1008, "protocol-violation");
        return;
      }
      if (!withinRateLimit) {
        this.emitSocketError(socket, state, new Error("rate-limited"));
        void closeWebSocketWithReason(socket, 1008, "rate-limited");
        return;
      }
      const text = typeof data === "string" ? data : data.toString("utf8");
      if (Buffer.byteLength(text, "utf8") > WS_MAX_BYTES) {
        this.emitSocketError(socket, state, new Error("message-too-large"));
        try { socket.terminate(); } catch { /* ignore */ }
        return;
      }
      this.emit({ type: "message", role: metadata.role, messageJson: text, connectionId: metadata.connectionId });
    });

    socket.on("error", (error) => {
      this.emitSocketError(socket, state, error);
      try {
        if (socket.readyState !== this.WebSocketClass.CLOSED && socket.readyState !== this.WebSocketClass.CLOSING) {
          socket.terminate();
        }
      } catch {
        /* ignore */
      }
    });

    socket.on("close", (code) => {
      if (state.disconnected) return;
      state.disconnected = true;
      if (metadata.role === "guest" && this.clientSocket === socket) {
        this.clientSocket = undefined;
        this.clientUrl = undefined;
      }
      if (metadata.role === "host" && this.hostPeerSocket === socket) {
        this.hostPeerSocket = undefined;
        this.hostPeerConnectionId = undefined;
      }
      if (metadata.role === "host" && metadata.connectionId) {
        const pending = this.hostPendingConnections.get(metadata.connectionId);
        if (pending?.socket === socket) {
          this.clearTimeoutFn(pending.timer);
          this.hostPendingConnections.delete(metadata.connectionId);
        }
      }
      this.emit({
        type: "disconnected",
        role: metadata.role,
        hadError: code !== 1000 && code !== 1005,
        connectionId: metadata.connectionId,
      });
    });
  }

  recordInboundFrame(state, byteLength) {
    const now = this.nowFn();
    state.inboundFrames = state.inboundFrames
      .filter(({ receivedAt }) => now - receivedAt < this.wsFrameWindowMs);
    const bytesInWindow = state.inboundFrames
      .reduce((total, frame) => total + frame.byteLength, 0);
    if (state.inboundFrames.length + 1 > this.wsMaxFramesPerWindow
      || bytesInWindow + byteLength > this.wsMaxBytesPerWindow) return false;
    state.inboundFrames.push({ receivedAt: now, byteLength });
    return true;
  }

  emitSocketError(socket, state, error) {
    if (state.errored) return;
    state.errored = true;
    const normalized = normalizeBridgeError(error);
    this.emit({
      type: "error",
      role: state.role,
      code: normalized.code,
      message: normalized.message,
      connectionId: state.connectionId,
    });
  }

  onDiscoveryMessage(message, remote) {
    if (message.length > UDP_MAX_BYTES) return;
    const text = message.toString("utf8");
    if (text === DISCOVERY_PROBE) return;
    if (!parseDiscoveryAnnouncementJson(text)) return;
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

  startAnnouncementTimer() {
    if (this.announcementTimer || !this.roomAnnouncementJson) return;
    this.announcementTimer = this.setIntervalFn(() => {
      void this.broadcastAnnouncement();
    }, ANNOUNCEMENT_INTERVAL_MS);
  }

  stopAnnouncementTimer() {
    if (!this.announcementTimer) return;
    this.clearIntervalFn(this.announcementTimer);
    this.announcementTimer = undefined;
  }

  startProbeTimer(reset = false) {
    if (this.probeTimer && !reset) return;
    if (this.probeTimer && reset) {
      this.clearTimeoutFn(this.probeTimer);
      this.probeTimer = undefined;
    }
    this.probeTimer = this.setTimeoutFn(() => {
      void this.stopProbeSocket();
    }, this.probeWindowMs);
  }

  async stopProbeSocket() {
    if (this.probeTimer) {
      this.clearTimeoutFn(this.probeTimer);
      this.probeTimer = undefined;
    }
    const socket = this.probeSocket;
    this.probeSocket = undefined;
    await closeUdpSocket(socket);
  }
}

function createLanBridge(options) {
  return new LanBridge(options);
}

function createLanIpcController({ bridge, ipcMain, getWindowFromSender }) {
  let ownerSenderId;
  let ownerRecord;
  const unsubscribeBridge = bridge.subscribe((payload) => {
    if (!ownerRecord || ownerRecord.sender.isDestroyed()) return;
    ownerRecord.sender.send(CHANNELS.event, payload);
  });

  function releaseOwner(sender, shouldDispose = true) {
    if (!ownerRecord || ownerRecord.sender !== sender) return;
    sender.removeListener("destroyed", ownerRecord.onSenderDestroyed);
    if (ownerRecord.window && !ownerRecord.window.isDestroyed()) {
      ownerRecord.window.removeListener("closed", ownerRecord.onWindowClosed);
    }
    ownerRecord = undefined;
    ownerSenderId = undefined;
    if (shouldDispose) void bridge.dispose();
  }

  function claimOwner(sender) {
    if (ownerSenderId === undefined) {
      const window = getWindowFromSender(sender);
      const onSenderDestroyed = () => releaseOwner(sender, true);
      const onWindowClosed = () => releaseOwner(sender, true);
      sender.once("destroyed", onSenderDestroyed);
      if (window) window.once("closed", onWindowClosed);
      ownerSenderId = sender.id;
      ownerRecord = { sender, window, onSenderDestroyed, onWindowClosed };
      return;
    }
    if (ownerSenderId !== sender.id) throw new Error("lan-owner-mismatch");
  }

  function registerHandler(channel, callback, { stateful = true } = {}) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (stateful) claimOwner(event.sender);
      return await callback(event.sender, ...args);
    });
  }

  registerHandler(CHANNELS.capabilities, async () => await bridge.capabilities(), { stateful: false });
  registerHandler(CHANNELS.createRoom, async (_sender, request) => await bridge.createRoom(request));
  registerHandler(CHANNELS.updateAnnouncement, async (_sender, announcementJson) => await bridge.updateAnnouncement(announcementJson));
  registerHandler(CHANNELS.closeRoom, async () => await bridge.closeRoom());
  registerHandler(CHANNELS.startDiscovery, async () => await bridge.startDiscovery());
  registerHandler(CHANNELS.stopDiscovery, async () => await bridge.stopDiscovery());
  registerHandler(CHANNELS.connect, async (_sender, url) => await bridge.connect(url));
  registerHandler(CHANNELS.disconnect, async () => await bridge.disconnect());
  registerHandler(CHANNELS.acceptConnection, async (_sender, connectionId) => await bridge.acceptConnection(connectionId));
  registerHandler(CHANNELS.closeConnection, async (_sender, connectionId, reason) => await bridge.closeConnection(connectionId, reason));
  registerHandler(CHANNELS.send, async (_sender, messageJson, target) => await bridge.send(messageJson, target));

  return {
    async dispose() {
      unsubscribeBridge();
      if (ownerRecord) releaseOwner(ownerRecord.sender, false);
      for (const channel of [CHANNELS.capabilities, ...STATEFUL_CHANNELS]) {
        if (typeof ipcMain.removeHandler === "function") ipcMain.removeHandler(channel);
      }
      await bridge.dispose();
    },
  };
}

module.exports = {
  ANNOUNCEMENT_INTERVAL_MS,
  CHANNELS,
  DISCOVERY_PROBE,
  LAN_DISCOVERY_PORT,
  LAN_GAME_PORTS,
  PENDING_HANDSHAKE_MS,
  LanBridge,
  UDP_MAX_BYTES,
  WS_MAX_BYTES,
  assertLanBridgeStringPayload,
  createLanBridge,
  createLanIpcController,
  normalizeDiscoveryAnnouncementJson,
  parseDiscoveryAnnouncementJson,
  validateLanWebSocketUrl,
};
