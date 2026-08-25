import { describe, expect, it, vi } from "vitest";
import { createLanBridgeClient, UNSUPPORTED_LAN_CAPABILITIES } from "../src/net/lanBridge";
import { LanMultiplayerRuntime } from "../src/net/lanMultiplayerRuntime";
import { createDefaultLocalProfile } from "../src/profile/localProfile";

describe("browser LAN startup", () => {
  it("constructs and disposes the multiplayer runtime without an Electron preload bridge", async () => {
    const bridge = createLanBridgeClient();

    const runtime = new LanMultiplayerRuntime(bridge, createDefaultLocalProfile(), {
      onHostMatchStarted: vi.fn(),
      onClientMatchStarted: vi.fn(),
      onReturnToMenu: vi.fn(),
      onNotice: vi.fn(),
    });

    await expect(runtime.callbacks.capabilities()).resolves.toEqual(UNSUPPORTED_LAN_CAPABILITIES);
    await expect(runtime.dispose()).resolves.toBeUndefined();
  });
});
