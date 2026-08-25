export interface LanCapabilitiesSupported {
  desktop: true;
  canHost: true;
  canDiscover: true;
}

export interface LanCapabilitiesUnsupported {
  desktop: false;
  canHost: false;
  canDiscover: false;
  reason: "unsupported";
}

export type LanCapabilities = LanCapabilitiesSupported | LanCapabilitiesUnsupported;

export interface LanSendTarget {
  connectionId?: string;
}

export type LanBridgeEvent =
  | { type: "announcement"; announcementJson: string; address: string; port: number }
  | { type: "probe"; address: string; port: number }
  | { type: "connected"; role: "host" | "guest"; url?: string; connectionId?: string }
  | { type: "message"; role: "host" | "guest"; messageJson: string; connectionId?: string }
  | { type: "error"; role: "host" | "guest"; code: string; message: string; connectionId?: string }
  | { type: "disconnected"; role: "host" | "guest"; hadError: boolean; connectionId?: string };

export interface BattleshipLanApi {
  capabilities(): Promise<LanCapabilities>;
  createRoom(request: { announcementJson: string }): Promise<{ port: number; address: string }>;
  updateAnnouncement(announcementJson: string): Promise<void>;
  closeRoom(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  acceptConnection(connectionId: string): Promise<void>;
  closeConnection(connectionId: string, reason?: string): Promise<void>;
  send(messageJson: string, target?: LanSendTarget): Promise<void>;
  subscribe(listener: (event: LanBridgeEvent) => void): () => void;
}

export const UNSUPPORTED_LAN_CAPABILITIES: LanCapabilitiesUnsupported = Object.freeze({
  desktop: false,
  canHost: false,
  canDiscover: false,
  reason: "unsupported",
});

const UNSUPPORTED_ERROR = "LAN bridge is only available in the desktop app.";

function getNativeLanBridge(): BattleshipLanApi | undefined {
  if (typeof window === "undefined") return undefined;
  return window.battleshipLan;
}

function requireNativeLanBridge(): BattleshipLanApi {
  const bridge = getNativeLanBridge();
  if (!bridge) throw new Error(UNSUPPORTED_ERROR);
  return bridge;
}

export function createLanBridgeClient(): BattleshipLanApi {
  return {
    capabilities: async () => getNativeLanBridge()?.capabilities() ?? UNSUPPORTED_LAN_CAPABILITIES,
    createRoom: async (request) => requireNativeLanBridge().createRoom(request),
    updateAnnouncement: async (announcementJson) => requireNativeLanBridge().updateAnnouncement(announcementJson),
    closeRoom: async () => requireNativeLanBridge().closeRoom(),
    startDiscovery: async () => requireNativeLanBridge().startDiscovery(),
    stopDiscovery: async () => requireNativeLanBridge().stopDiscovery(),
    connect: async (url) => requireNativeLanBridge().connect(url),
    disconnect: async () => requireNativeLanBridge().disconnect(),
    acceptConnection: async (connectionId) => requireNativeLanBridge().acceptConnection(connectionId),
    closeConnection: async (connectionId, reason) => requireNativeLanBridge().closeConnection(connectionId, reason),
    send: async (messageJson, target) => requireNativeLanBridge().send(messageJson, target),
    subscribe: (listener) => getNativeLanBridge()?.subscribe(listener) ?? (() => undefined),
  };
}
