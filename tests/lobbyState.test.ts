import { describe, expect, it } from "vitest";
import {
  HostLobby,
  normalizeLanBuildDescriptor,
  type HostLobbyConfig,
  type LobbySnapshot,
} from "../src/net/lobbyState";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import type { JoinRequestPayload, LanBuildDescriptor } from "../src/net/protocol";

function build(overrides: Partial<LanBuildDescriptor> = {}): LanBuildDescriptor {
  return {
    buildId: "fletcher-standard",
    buildName: "Fletcher Standard",
    shipClassId: "fletcher",
    slots: {
      mainGun: ["mainGun-common", "mainGun-common", null, null, null],
      torpedo: ["torpedo-common", null],
      antiAir: ["antiAir-common", null, null, null],
      sideGun: [],
      depthCharge: ["depthCharge-common", null],
      magazine: ["magazine-common"],
      engine: ["engine-common"],
      steering: ["steering-common"],
    },
    ...overrides,
  };
}

function joinRequest(overrides: Partial<JoinRequestPayload> = {}): JoinRequestPayload {
  return {
    peerId: "peer-guest-1",
    commanderName: "Guest Commander",
    expectedGameVersion: LAN_GAME_VERSION,
    expectedContentHash: LAN_CONTENT_HASH,
    build: build(),
    ...overrides,
  };
}

function createLobby(overrides: Partial<HostLobbyConfig> = {}): HostLobby {
  return new HostLobby({
    roomName: "Atoll Patrol",
    hostPeerId: "peer-host-1",
    hostCommanderName: "Host Admiral",
    gameVersion: LAN_GAME_VERSION,
    contentHash: LAN_CONTENT_HASH,
    hostBuild: build({ buildId: "host-build", buildName: "Host Standard" }),
    ...overrides,
  });
}

function snapshotPlayerIds(snapshot: LobbySnapshot): string[] {
  return snapshot.players.map((player) => `${player.role}:${player.peerId}`);
}

describe("HostLobby", () => {
  it("rejects version/content mismatches, duplicate peers, and over-capacity joins", () => {
    const lobby = createLobby();

    expect(lobby.join(joinRequest({ expectedGameVersion: "0.0.0" }))).toMatchObject({
      accepted: false,
      reason: "version-mismatch",
    });
    expect(lobby.join(joinRequest({ expectedContentHash: "bad-hash" }))).toMatchObject({
      accepted: false,
      reason: "content-mismatch",
    });

    expect(lobby.join(joinRequest())).toMatchObject({
      accepted: true,
    });
    expect(lobby.join(joinRequest())).toMatchObject({
      accepted: false,
      reason: "already-joined",
    });
    expect(lobby.join(joinRequest({ peerId: "peer-guest-2" }))).toMatchObject({
      accepted: false,
      reason: "room-full",
    });
  });

  it("rejects incompatible builds and clears readiness when a player changes build", () => {
    const lobby = createLobby();
    expect(lobby.join(joinRequest({
      peerId: "bad-build-peer",
      build: build({
        slots: {
          ...build().slots,
          mainGun: ["engine-common", null, null, null, null],
        },
      }),
    }))).toMatchObject({
      accepted: false,
      reason: "invalid-build",
    });

    const readyLobby = createLobby();
    expect(readyLobby.setReady("peer-host-1", true)).toMatchObject({ ok: true });
    expect(readyLobby.snapshot().players[0]?.ready).toBe(true);

    expect(readyLobby.setBuild("peer-host-1", build({
      buildId: "host-fast",
      buildName: "Host Fast",
      slots: {
        ...build().slots,
        engine: ["engine-purple"],
      },
    }))).toMatchObject({ ok: true });
    expect(readyLobby.snapshot().players[0]?.ready).toBe(false);
  });

  it("starts only when both connected players are ready and have legal builds", () => {
    const lobby = createLobby();
    expect(lobby.canStart()).toBe(false);
    expect(lobby.start()).toMatchObject({ ok: false, reason: "cannot-start" });

    expect(lobby.join(joinRequest())).toMatchObject({ accepted: true });
    expect(lobby.setReady("peer-host-1", true)).toMatchObject({ ok: true });
    expect(lobby.canStart()).toBe(false);

    expect(lobby.setReady("peer-guest-1", true)).toMatchObject({ ok: true });
    expect(lobby.canStart()).toBe(true);
    expect(lobby.start()).toMatchObject({ ok: true });
    expect(lobby.snapshot().phase).toBe("in-match");
  });

  it("removes the guest on leave, closes if the host leaves, and freezes snapshots", () => {
    const lobby = createLobby();
    expect(lobby.join(joinRequest())).toMatchObject({ accepted: true });

    lobby.leave("peer-guest-1");
    expect(snapshotPlayerIds(lobby.snapshot())).toEqual(["host:peer-host-1"]);
    expect(lobby.snapshot().phase).toBe("lobby");

    const snapshot = lobby.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.players)).toBe(true);
    expect(Object.isFrozen(snapshot.players[0]!)).toBe(true);
    expect(() => {
      (snapshot.players[0]!).ready = true;
    }).toThrow();

    lobby.leave("peer-host-1");
    expect(lobby.snapshot().phase).toBe("closing");
    expect(lobby.snapshot().players[0]?.connected).toBe(false);
  });

  it("deep-freezes player build slots in snapshots", () => {
    const lobby = createLobby();
    const snapshot = lobby.snapshot();
    const player = snapshot.players[0]!;
    const frozenBuild = player.build!;

    expect(Object.isFrozen(frozenBuild)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.mainGun)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.torpedo)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.antiAir)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.sideGun)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.depthCharge)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.magazine)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.engine)).toBe(true);
    expect(Object.isFrozen(frozenBuild.slots.steering)).toBe(true);

    expect(() => {
      frozenBuild.slots.mainGun[0] = null;
    }).toThrow();
    expect(() => {
      (frozenBuild.slots.antiAir as (string | null)[]).push("antiAir-common");
    }).toThrow();

    const fresh = lobby.snapshot();
    expect(fresh.players[0]?.build?.slots.mainGun[0]).toBe("mainGun-common");
    expect(fresh.players[0]?.build?.slots.antiAir).toEqual(["antiAir-common", null, null, null]);
  });

  it("exports a reusable build normalizer that rejects category, slot-count, and compatibility attacks", () => {
    expect(normalizeLanBuildDescriptor(build())).toEqual(build());
    expect(normalizeLanBuildDescriptor(build({
      slots: {
        ...build().slots,
        mainGun: ["engine-common", null, null, null, null],
      },
    }))).toBeUndefined();
    expect(normalizeLanBuildDescriptor(build({
      shipClassId: "cleveland",
      slots: {
        ...build().slots,
        torpedo: ["torpedo-common", null],
      },
    }))).toBeUndefined();
    expect(normalizeLanBuildDescriptor(build({
      slots: {
        ...build().slots,
        antiAir: ["antiAir-common", null, null, null, null],
      },
    }))).toBeUndefined();
  });

});
