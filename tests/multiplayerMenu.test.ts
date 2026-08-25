import { describe, expect, it, vi } from "vitest";
import { createDefaultLocalProfile, type LocalProfile, type SavedShipBuild } from "../src/profile/localProfile";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import { RoomDirectory, type DiscoveredRoom } from "../src/net/roomDirectory";
import { HostLobby, type LobbySnapshot } from "../src/net/lobbyState";
import type { LanBuildDescriptor } from "../src/net/protocol";
import {
  MULTIPLAYER_MENU_SOURCE_STRINGS,
  MultiplayerMenu,
  MultiplayerMenuController,
  approximateRoomPingMs,
  chooseInitialMultiplayerBuildId,
  deriveLanCapabilityState,
  deriveLobbyControls,
  parseManualJoinTarget,
} from "../src/ui/multiplayerMenu";
import { SUPPORTED_GAME_LOCALES, translateGameText } from "../src/i18n/gameLocale";

function savedBuildToLan(build: SavedShipBuild): LanBuildDescriptor {
  return {
    buildId: build.id,
    buildName: build.name,
    shipClassId: build.shipClassId,
    slots: structuredClone(build.slots),
  };
}

function makeRoom(overrides: Partial<DiscoveredRoom> = {}): DiscoveredRoom {
  return {
    roomId: "room-alpha",
    roomName: "Alpha Room",
    hostName: "Host Admiral",
    address: "192.168.1.24",
    port: 47778,
    playerCount: 1,
    capacity: 2,
    phase: "lobby",
    lastSeenAt: 1_000,
    gameVersion: LAN_GAME_VERSION,
    contentHash: LAN_CONTENT_HASH,
    ...overrides,
  };
}

function makeProfileWithUnreadyBuild(): { profile: LocalProfile; readyBuildId: string; unreadyBuildId: string } {
  const profile = createDefaultLocalProfile();
  const readyBuild = profile.savedShipBuilds[0]!;
  const unreadyBuild: SavedShipBuild = {
    ...readyBuild,
    id: "unready-build",
    name: "Unready Build",
    slots: {
      mainGun: readyBuild.slots.mainGun.map(() => null),
      torpedo: readyBuild.slots.torpedo.map(() => null),
      antiAir: readyBuild.slots.antiAir.map(() => null),
      sideGun: readyBuild.slots.sideGun.map(() => null),
      depthCharge: readyBuild.slots.depthCharge.map(() => null),
      magazine: readyBuild.slots.magazine.map(() => null),
      engine: readyBuild.slots.engine.map(() => null),
      steering: readyBuild.slots.steering.map(() => null),
    },
  };
  return {
    profile: {
      ...profile,
      savedShipBuilds: [readyBuild, unreadyBuild],
      selectedBattleBuildId: unreadyBuild.id,
    },
    readyBuildId: readyBuild.id,
    unreadyBuildId: unreadyBuild.id,
  };
}

function createHostSnapshot(profile: LocalProfile, readyBuildId: string, guestReady: boolean): LobbySnapshot {
  const readyBuild = profile.savedShipBuilds.find(({ id }) => id === readyBuildId)!;
  const lobby = new HostLobby({
    roomName: "Atoll Patrol",
    hostPeerId: "peer-host",
    hostCommanderName: "Host Admiral",
    gameVersion: "0.6.13",
    contentHash: "lan-test",
    hostBuild: savedBuildToLan(readyBuild),
  });
  expect(lobby.join({
    peerId: "peer-guest",
    commanderName: "Guest Commander",
    expectedGameVersion: "0.6.13",
    expectedContentHash: "lan-test",
    build: savedBuildToLan(readyBuild),
  }).accepted).toBe(true);
  expect(lobby.setReady("peer-host", true).ok).toBe(true);
  expect(lobby.setReady("peer-guest", guestReady).ok).toBe(true);
  return lobby.snapshot();
}

describe("multiplayer menu helpers", () => {
  it("accepts only canonical IPv4 manual join targets and allowed LAN ports", () => {
    expect(parseManualJoinTarget("192.168.1.24", "47778")).toEqual({
      ok: true,
      address: "192.168.1.24",
      port: 47778,
    });
    expect(parseManualJoinTarget("01.2.3.4", "47778")).toEqual({
      ok: false,
      reason: "invalid-address",
    });
    expect(parseManualJoinTarget("battleship.local", "47778")).toEqual({
      ok: false,
      reason: "invalid-address",
    });
    expect(parseManualJoinTarget("192.168.1.24", "47777")).toEqual({
      ok: false,
      reason: "invalid-port",
    });
  });

  it("keeps multiplayer navigation available while disabling native-only actions in unsupported browsers", () => {
    expect(deriveLanCapabilityState({
      desktop: false,
      canHost: false,
      canDiscover: false,
      reason: "unsupported",
    })).toEqual({
      canEnter: true,
      canCreate: false,
      canSearch: false,
      canRefresh: false,
      canManualConnect: false,
      unsupportedSource: "局域网联机仅在桌面版可用。",
      manualJoinSource: "手动加入也需要桌面版联机桥。",
    });

    expect(deriveLanCapabilityState({
      desktop: true,
      canHost: true,
      canDiscover: true,
    })).toEqual({
      canEnter: true,
      canCreate: true,
      canSearch: true,
      canRefresh: true,
      canManualConnect: true,
      unsupportedSource: null,
      manualJoinSource: null,
    });
  });

  it("sorts fresh discoveries ahead of in-match rooms and expires stale broadcasts", () => {
    const directory = new RoomDirectory();
    expect(directory.ingest(makeRoom({ roomId: "room-c", roomName: "Convoy", phase: "in-match", lastSeenAt: 1_000 }))).toBe(true);
    expect(directory.ingest(makeRoom({ roomId: "room-a", roomName: "Atoll", phase: "lobby", lastSeenAt: 1_500 }))).toBe(true);
    expect(directory.ingest(makeRoom({ roomId: "room-b", roomName: "Beacon", phase: "lobby", lastSeenAt: 2_000 }))).toBe(true);

    expect(directory.list().map(({ roomId }) => roomId)).toEqual(["room-a", "room-b", "room-c"]);
    expect(approximateRoomPingMs(2_250, 2_117)).toBe(133);

    directory.expire(5_000);
    expect(directory.list().map(({ roomId }) => roomId)).toEqual(["room-b"]);
    expect(Object.isFrozen(directory.list()[0]!)).toBe(true);
  });

  it("prefers a sea-ready saved build for lobby selection and gates ready/start by role and build readiness", () => {
    const { profile, readyBuildId, unreadyBuildId } = makeProfileWithUnreadyBuild();
    expect(chooseInitialMultiplayerBuildId(profile)).toBe(readyBuildId);

    const hostSnapshot = createHostSnapshot(profile, readyBuildId, true);
    expect(deriveLobbyControls({
      snapshot: hostSnapshot,
      localPeerId: "peer-host",
      profile,
      selectedBuildId: unreadyBuildId,
    })).toMatchObject({
      localRole: "host",
      canReady: false,
      canStart: false,
      showStart: true,
      selectedBuildReady: false,
    });

    expect(deriveLobbyControls({
      snapshot: hostSnapshot,
      localPeerId: "peer-host",
      profile,
      selectedBuildId: readyBuildId,
    })).toMatchObject({
      localRole: "host",
      canReady: true,
      canStart: true,
      showStart: true,
      selectedBuildReady: true,
    });

    expect(deriveLobbyControls({
      snapshot: hostSnapshot,
      localPeerId: "peer-guest",
      profile,
      selectedBuildId: readyBuildId,
    })).toMatchObject({
      localRole: "guest",
      canReady: true,
      canStart: false,
      showStart: false,
    });
  });

  it("dispatches lobby callbacks only when the current local state allows them", async () => {
    const { profile, readyBuildId, unreadyBuildId } = makeProfileWithUnreadyBuild();
    const snapshot = createHostSnapshot(profile, readyBuildId, true);
    const callbacks = {
      capabilities: vi.fn(async () => ({ desktop: true as const, canHost: true as const, canDiscover: true as const })),
      createRoom: vi.fn(async () => ({ ok: false, errorSource: "stub" })),
      searchRooms: vi.fn(async () => ({ ok: true, rooms: [] })),
      manualJoin: vi.fn(async () => ({ ok: false, errorSource: "stub" })),
      leaveRoom: vi.fn(async () => ({ ok: true })),
      readyLobby: vi.fn(async () => ({ ok: true })),
      startLobby: vi.fn(async () => ({ ok: true })),
    };
    const controller = new MultiplayerMenuController(profile, callbacks);
    controller.setLobby(snapshot, "peer-host");
    controller.selectBuild(unreadyBuildId);

    await controller.requestReady(true);
    expect(callbacks.readyLobby).not.toHaveBeenCalled();

    controller.selectBuild(readyBuildId);
    await controller.requestReady(true);
    expect(callbacks.readyLobby).toHaveBeenCalledWith({ ready: true, buildId: readyBuildId });

    await controller.requestStart();
    expect(callbacks.startLobby).toHaveBeenCalledTimes(1);

    const guestController = new MultiplayerMenuController(profile, callbacks);
    guestController.setLobby(snapshot, "peer-guest");
    guestController.selectBuild(readyBuildId);
    await guestController.requestStart();
    expect(callbacks.startLobby).toHaveBeenCalledTimes(1);
  });

  it("prefers a newly selected sea-ready profile build, otherwise keeps the current valid multiplayer selection", () => {
    const base = createDefaultLocalProfile();
    const buildA = { ...base.savedShipBuilds[0]!, id: "build-a", name: "Build A" };
    const buildB = { ...base.savedShipBuilds[0]!, id: "build-b", name: "Build B" };
    const callbacks = {
      capabilities: vi.fn(async () => ({ desktop: true as const, canHost: true as const, canDiscover: true as const })),
      createRoom: vi.fn(async () => ({ ok: false, errorSource: "stub" })),
      searchRooms: vi.fn(async () => ({ ok: false, errorSource: "搜索尚未连接到对战会话" })),
      manualJoin: vi.fn(async () => ({ ok: false, errorSource: "stub" })),
      leaveRoom: vi.fn(async () => ({ ok: true })),
      readyLobby: vi.fn(async () => ({ ok: true })),
      startLobby: vi.fn(async () => ({ ok: true })),
    };

    const controller = new MultiplayerMenuController({
      ...base,
      savedShipBuilds: [buildA, buildB],
      selectedBattleBuildId: buildA.id,
    }, callbacks);

    controller.selectBuild(buildA.id);
    controller.setProfile({
      ...base,
      savedShipBuilds: [buildA, buildB],
      selectedBattleBuildId: buildB.id,
    });
    expect(controller.getSelectedBuildId()).toBe(buildB.id);

    controller.selectBuild(buildA.id);
    controller.setProfile({
      ...base,
      savedShipBuilds: [buildA, { ...buildB, slots: {
        mainGun: buildB.slots.mainGun.map(() => null),
        torpedo: buildB.slots.torpedo.map(() => null),
        antiAir: buildB.slots.antiAir.map(() => null),
        sideGun: buildB.slots.sideGun.map(() => null),
        depthCharge: buildB.slots.depthCharge.map(() => null),
        magazine: buildB.slots.magazine.map(() => null),
        engine: buildB.slots.engine.map(() => null),
        steering: buildB.slots.steering.map(() => null),
      } }],
      selectedBattleBuildId: buildB.id,
    });
    expect(controller.getSelectedBuildId()).toBe(buildA.id);
  });

  it("renders incompatible room cards with the remote game version and a disabled join action", () => {
    const directory = new RoomDirectory();
    expect(directory.ingest(makeRoom({
      roomId: "room-legacy",
      roomName: "Legacy Room",
      gameVersion: "0.6.12",
      contentHash: "lan-legacy-hash",
    }))).toBe(true);

    const markup = (MultiplayerMenu.prototype as unknown as {
      roomCardsMarkup(this: { roomDirectory: RoomDirectory; loadingRooms: boolean; now: () => number }): string;
    }).roomCardsMarkup.call({
      roomDirectory: directory,
      loadingRooms: false,
      now: () => 1_500,
    });

    expect(markup).toContain(">0.6.12<");
    expect(markup).toContain(">不兼容<");
    expect(markup).toMatch(/multiplayer-room-join" type="button" data-room-id="room-legacy" disabled>加入<\/button>/);
  });

  it("renders discovered room text and identifiers without creating executable markup", () => {
    const directory = new RoomDirectory();
    expect(directory.ingest(makeRoom({
      roomId: `room\" data-owned=\"yes`,
      roomName: `<img src=x onerror=x>`,
      hostName: `\"><svg onload=x>`,
      gameVersion: `<script>x=1</script>`,
    }))).toBe(true);

    const markup = (MultiplayerMenu.prototype as unknown as {
      roomCardsMarkup(this: { roomDirectory: RoomDirectory; loadingRooms: boolean; now: () => number }): string;
    }).roomCardsMarkup.call({ roomDirectory: directory, loadingRooms: false, now: () => 1_500 });

    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain('data-owned="yes"');
    expect(markup).toContain("&lt;img");
    expect(markup).toContain("&quot; data-owned=&quot;yes");
  });

  it("renders remote commander and build names as inert lobby text", () => {
    const markup = (MultiplayerMenu.prototype as unknown as {
      seatMarkup(
        this: { controller: { getLobby: () => { localPeerId?: string } } },
        title: string,
        player: LobbySnapshot["players"][number] | undefined,
        localBuildName: string | null,
      ): string;
    }).seatMarkup.call({
      controller: { getLobby: () => ({ localPeerId: "peer-host" }) },
    }, "客席位", {
      peerId: "peer-guest",
      role: "guest",
      connected: true,
      ready: true,
      commanderName: `<img src=x onerror=globalThis.__commanderXss=1>`,
      build: {
        ...savedBuildToLan(createDefaultLocalProfile().savedShipBuilds[0]!),
        buildName: `\"><svg onload=globalThis.__buildXss=1>`,
      },
    }, null);

    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<svg");
    expect(markup).toContain("&lt;img");
    expect(markup).toContain("&quot;&gt;&lt;svg");
  });

  it("renders localized lobby roles and a dedicated ready-status field in seat cards", () => {
    const profile = createDefaultLocalProfile();
    const readyBuildId = profile.savedShipBuilds[0]!.id;
    const snapshot = createHostSnapshot(profile, readyBuildId, true);
    const localBuildName = profile.savedShipBuilds[0]!.name;

    const markup = (MultiplayerMenu.prototype as unknown as {
      seatMarkup(
        this: { controller: { getLobby: () => { localPeerId?: string } } },
        title: string,
        player: LobbySnapshot["players"][number] | undefined,
        localBuildName: string | null,
      ): string;
    }).seatMarkup.call({
      controller: {
        getLobby: () => ({ localPeerId: "peer-host" }),
      },
    }, "房主席位", snapshot.players[0], localBuildName);

    expect(markup).toContain(">房主<");
    expect(markup).toContain("<dt>准备状态</dt><dd>已准备</dd>");
    expect(markup).not.toContain(">host<");
    expect(markup).not.toContain(">guest<");
    expect(markup).not.toContain("<dt>游戏版本</dt><dd>已准备</dd>");
  });

  it("keeps the lobby visible when leave fails and surfaces the returned error", async () => {
    const render = vi.fn();
    const fakeMenu = {
      controller: {
        requestLeave: vi.fn(async () => ({ ok: false, errorSource: "离开房间尚未连接到对战会话" })),
      },
      screen: "lobby" as const,
      statusSource: null,
      render,
    };

    await (MultiplayerMenu.prototype as unknown as {
      handleLeaveRoom(this: {
        controller: { requestLeave: () => Promise<{ ok: boolean; errorSource?: string }> };
        screen: "directory" | "lobby";
        statusSource: string | null;
        render: () => void;
      }): Promise<void>;
    }).handleLeaveRoom.call(fakeMenu);

    expect(fakeMenu.screen).toBe("lobby");
    expect(fakeMenu.statusSource).toBe("离开房间尚未连接到对战会话");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("accepts an externally pushed lobby snapshot and rerenders immediately", () => {
    const profile = createDefaultLocalProfile();
    const snapshot = createHostSnapshot(profile, profile.savedShipBuilds[0]!.id, false);
    const setLobby = vi.fn();
    const render = vi.fn();
    const fakeMenu = {
      controller: { setLobby },
      screen: "directory" as "directory" | "lobby",
      render,
    };

    (MultiplayerMenu.prototype as unknown as {
      setLobby(this: typeof fakeMenu, next: LobbySnapshot, peerId: string): void;
    }).setLobby.call(fakeMenu, snapshot, "peer-host");

    expect(setLobby).toHaveBeenCalledWith(snapshot, "peer-host");
    expect(fakeMenu.screen).toBe("lobby");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("shows the actual host IPv4 address and selected fallback port in the lobby", () => {
    const profile = createDefaultLocalProfile();
    const snapshot = createHostSnapshot(profile, profile.savedShipBuilds[0]!.id, false);
    const markup = (MultiplayerMenu.prototype as unknown as {
      lobbyMarkup(this: {
        controller: {
          getLobbyControls: () => Record<string, unknown>;
          getSelectedBuildId: () => string;
          getLobby: () => { localPeerId: string };
        };
        profile: typeof profile;
        hostEndpoint: { address: string; port: number };
        seatMarkup: () => string;
        buildOptionsMarkup: () => string;
      }, next: LobbySnapshot, peerId: string): string;
    }).lobbyMarkup.call({
      controller: {
        getLobbyControls: () => ({
          localRole: "host", canReady: true, canStart: false, canLeave: true,
          showStart: true, selectedBuildReady: true,
        }),
        getSelectedBuildId: () => profile.savedShipBuilds[0]!.id,
        getLobby: () => ({ localPeerId: "peer-host" }),
      },
      profile,
      hostEndpoint: { address: "192.168.1.88", port: 47779 },
      seatMarkup: () => "",
      buildOptionsMarkup: () => "",
    }, snapshot, "peer-host");

    expect(markup).toContain("192.168.1.88:47779");
    expect(markup).toContain("multiplayer-copy-endpoint");
    expect(markup).toContain("主机地址");
  });

  it("copies the displayed host endpoint through the browser clipboard API", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fakeMenu = {
      hostEndpoint: { address: "192.168.1.88", port: 47779 },
      statusSource: null as string | null,
      render: vi.fn(),
    };

    await (MultiplayerMenu.prototype as unknown as {
      copyHostEndpoint(this: typeof fakeMenu): Promise<void>;
    }).copyHostEndpoint.call(fakeMenu);

    expect(writeText).toHaveBeenCalledWith("192.168.1.88:47779");
    expect(fakeMenu.statusSource).toBe("主机地址已复制。");
  });

  it("tracks the full multiplayer source-string surface for locale coverage", () => {
    expect(MULTIPLAYER_MENU_SOURCE_STRINGS).toContain("多人联机");
    expect(MULTIPLAYER_MENU_SOURCE_STRINGS).toContain("手动加入也需要桌面版联机桥。");
    expect(MULTIPLAYER_MENU_SOURCE_STRINGS).toContain("搜索尚未连接到对战会话");
    expect(MULTIPLAYER_MENU_SOURCE_STRINGS).toContain("近似延迟（最近广播）");
    expect(MULTIPLAYER_MENU_SOURCE_STRINGS).toContain("主机地址");
    expect(MULTIPLAYER_MENU_SOURCE_STRINGS).toContain("复制地址");
    expect(new Set(MULTIPLAYER_MENU_SOURCE_STRINGS).size).toBe(MULTIPLAYER_MENU_SOURCE_STRINGS.length);
    for (const source of [
      "客席已断开 · AI 已接管。",
      "客席已离开 · AI 已接管。",
      "房主已断开 · 已返回主菜单。",
      "房间已关闭 · 已返回主菜单。",
      "收到无效的联机消息。",
      "多人联机已禁用开发者改动。",
      "主机地址",
      "复制地址",
      "主机地址已复制。",
      "无法复制主机地址。",
      "返回联机大厅",
    ]) {
      for (const locale of SUPPORTED_GAME_LOCALES.filter((value) => value !== "zh-CN")) {
        expect(translateGameText(source, locale), `${source} -> ${locale}`).not.toBe(source);
      }
    }
  });
});
