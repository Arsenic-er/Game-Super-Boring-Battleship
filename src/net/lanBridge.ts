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

export type LanBridgeEvent =
  | { type: "announcement"; announcementJson: string; address: string; port: number }
  | { type: "probe"; address: string; port: number }
  | { type: "connected"; role: "host" | "guest"; url?: string }
  | { type: "message"; role: "host" | "guest"; messageJson: string }
  | { type: "disconnected"; role: "host" | "guest"; hadError: boolean };

export interface BattleshipLanApi {
  capabilities(): Promise<LanCapabilities>;
  createRoom(request: { announcementJson: string }): Promise<{ port: number }>;
  updateAnnouncement(announcementJson: string): Promise<void>;
  closeRoom(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send(messageJson: string): Promise<void>;
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
    send: async (messageJson) => requireNativeLanBridge().send(messageJson),
    subscribe: (listener) => requireNativeLanBridge().subscribe(listener),
  };
}
