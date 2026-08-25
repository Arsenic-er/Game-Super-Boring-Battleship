import { describe, expect, it } from "vitest";
import { ClientBattleSession } from "../src/net/clientBattleSession";
import { HostBattleSession } from "../src/net/hostBattleSession";
import { HostLobby } from "../src/net/lobbyState";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import {
  encodeLanMessage,
  LAN_PROTOCOL_VERSION,
  parseLanMessage,
  type LanBuildDescriptor,
  type PlayerSnapshotPayload,
} from "../src/net/protocol";
import { replicationViewFor } from "../src/net/replicationView";
import { FIXED_STEP } from "../src/sim/config";
import type { ControlCommand, ProjectileState } from "../src/sim/types";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import { getTorpedo } from "../src/ships/torpedoes";

const HOST_ID = "loopback-host";
const GUEST_ID = "loopback-guest";

function build(
  peer: "host" | "guest",
  overrides: Partial<LanBuildDescriptor["slots"]> = {},
): LanBuildDescriptor {
  return {
    buildId: `${peer}-integration-build`,
    buildName: `${peer} integration build`,
    shipClassId: "fletcher",
    slots: {
      mainGun: ["mainGun-purple", "mainGun-purple", "mainGun-purple", "mainGun-purple", "mainGun-purple"],
      torpedo: ["torpedo-gold", null],
      antiAir: ["antiAir-purple", null, null, null],
      sideGun: [],
      depthCharge: ["depthCharge-purple", null],
      magazine: ["magazine-gold"],
      engine: ["engine-gold"],
      steering: ["steering-purple"],
      ...overrides,
    },
  };
}

function commandForGuest(host: HostBattleSession, fire: boolean): ControlCommand {
  const ship = host.state.ships.find(({ id }) => id === host.assignments.get(GUEST_ID))!;
  return {
    throttle: 0.75,
    rudder: 0.4,
    aimPoint: {
      x: ship.position.x + Math.sin(ship.heading) * 1_500,
      y: 0,
      z: ship.position.z + Math.cos(ship.heading) * 1_500,
    },
    fire,
    weaponSlot: "mainGun",
    ammoType: "he",
  };
}

function idleHost(host: HostBattleSession): ControlCommand {
  const ship = host.state.ships.find(({ id }) => id === host.assignments.get(HOST_ID))!;
  return {
    throttle: 0,
    rudder: 0,
    aimPoint: {
      x: ship.position.x + Math.sin(ship.heading) * 1_500,
      y: 0,
      z: ship.position.z + Math.cos(ship.heading) * 1_500,
    },
    fire: false,
  };
}

function deliverSnapshot(
  client: ClientBattleSession,
  payload: PlayerSnapshotPayload,
  sequence: number,
  receivedAt: number,
): void {
  const encoded = encodeLanMessage({
    protocolVersion: LAN_PROTOCOL_VERSION,
    gameVersion: LAN_GAME_VERSION,
    contentHash: LAN_CONTENT_HASH,
    roomId: "loopback-room",
    sequence,
    sentAt: receivedAt,
    type: "player-snapshot",
    payload,
  });
  const decoded = parseLanMessage(JSON.parse(encoded));
  expect(decoded?.type).toBe("player-snapshot");
  if (decoded?.type !== "player-snapshot") throw new Error("snapshot-loopback-failed");
  expect(client.receiveSnapshot(decoded.payload, receivedAt)).toMatchObject({ accepted: true });
}

function startedLoopback(): {
  host: HostBattleSession;
  client: ClientBattleSession;
  guestBuild: LanBuildDescriptor;
} {
  const hostBuild = build("host", { mainGun: ["mainGun-gold", "mainGun-gold", "mainGun-gold", "mainGun-gold", "mainGun-gold"] });
  const guestBuild = build("guest");
  const lobby = new HostLobby({
    roomName: "Loopback acceptance",
    hostPeerId: HOST_ID,
    hostCommanderName: "Host",
    gameVersion: LAN_GAME_VERSION,
    contentHash: LAN_CONTENT_HASH,
    hostBuild,
  });

  const joined = lobby.join({
    peerId: GUEST_ID,
    commanderName: "Guest",
    expectedGameVersion: LAN_GAME_VERSION,
    expectedContentHash: LAN_CONTENT_HASH,
    build: guestBuild,
  });
  expect(joined.accepted).toBe(true);
  expect(joined.lobby.players).toHaveLength(2);
  expect(lobby.setReady(HOST_ID, true).ok).toBe(true);
  expect(lobby.setReady(GUEST_ID, true).ok).toBe(true);
  expect(lobby.canStart()).toBe(true);
  expect(lobby.start()).toMatchObject({ ok: true, lobby: { phase: "in-match" } });

  return {
    guestBuild,
    host: new HostBattleSession({
      hostPeerId: HOST_ID,
      guestPeerId: GUEST_ID,
      seed: 700,
      teamSize: 3,
      hostBuild,
      guestBuild,
    }),
    client: new ClientBattleSession({
      roomId: "loopback-room",
      peerId: GUEST_ID,
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
      build: guestBuild,
    }),
  };
}

describe("LAN co-op loopback acceptance", () => {
  it("completes join, ready and start, applies guest controls, converges on authority and hands a disconnect to AI", () => {
    const { host, client } = startedLoopback();
    const guestShipId = host.assignments.get(GUEST_ID)!;
    const guestShip = host.state.ships.find(({ id }) => id === guestShipId)!;
    guestShip.reloadRemaining = 0;

    const input = client.submitLocalCommand(commandForGuest(host, true), 1);
    expect(input.payload.command).toMatchObject({ throttle: 0.75, rudder: 0.4, fire: true });
    expect(host.acceptInput(GUEST_ID, input.payload, 1)).toMatchObject({ accepted: true });

    let snapshot = undefined;
    for (let tick = 1; tick <= 6; tick += 1) {
      const output = host.step(idleHost(host), FIXED_STEP);
      snapshot = output.snapshots.get(GUEST_ID) ?? snapshot;
    }
    expect(snapshot).toBeDefined();
    expect(snapshot!.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "shot", ownerId: guestShipId }),
    ]));
    expect(host.state.ships.find(({ id }) => id === guestShipId)).toMatchObject({ throttle: 0.75 });
    expect(Math.abs(host.state.ships.find(({ id }) => id === guestShipId)!.rudder)).toBeGreaterThan(0);

    deliverSnapshot(client, snapshot!, 1, 100);
    const clientView = client.renderState(220);
    expect(clientView.serverTick).toBe(6);
    expect(clientView.serverTick).toBe(snapshot!.serverTick);
    expect(clientView.state.objective.scores).toEqual(host.state.objective.scores);

    host.disconnectGuest(host.state.time);
    expect(host.assignments.has(GUEST_ID)).toBe(false);
    expect(host.state.ships.find(({ id }) => id === guestShipId)).toMatchObject({ aiControlled: true });
    for (let elapsed = 0; elapsed < 5; elapsed += FIXED_STEP) host.step(idleHost(host), FIXED_STEP);
    expect(host.state.ships.find(({ id }) => id === guestShipId)!.aiDecision).toBeDefined();
  });

  it("reconstructs the real guest loadout, effects, HUD ranges, air events and battle result from host snapshots", () => {
    const { host, client } = startedLoopback();
    const guestShipId = host.assignments.get(GUEST_ID)!;
    const hostGuest = host.state.ships.find(({ id }) => id === guestShipId)!;
    const origin = { ...hostGuest.position };
    const shell: ProjectileState = {
      id: 90_001,
      ownerId: guestShipId,
      team: "player",
      kind: "shell",
      ammoType: "he",
      position: { x: origin.x + 10, y: 20, z: origin.z + 20 },
      previousPosition: { x: origin.x, y: 18, z: origin.z },
      velocity: { x: 2, y: 10, z: 50 },
      damage: 10,
      age: 0.1,
    };
    const torpedo: ProjectileState = {
      id: 90_002,
      ownerId: guestShipId,
      team: "player",
      kind: "torpedo",
      position: { x: origin.x - 10, y: 0, z: origin.z + 15 },
      previousPosition: { x: origin.x - 10, y: 0, z: origin.z + 10 },
      velocity: { x: 0, y: 0, z: 25 },
      damage: 500,
      age: 0.2,
      detectionRange: 700,
    };
    host.state.projectiles.push(shell, torpedo);
    host.state.airEvents.push({
      id: 90_003,
      time: host.state.time,
      kind: "attackHit",
      team: "player",
      controllerId: guestShipId,
      squadronId: "guest-squadron",
      orderKind: "strikeShip",
      targetId: guestShipId,
      position: { x: origin.x, y: 80, z: origin.z + 100 },
      weapon: "heBomb",
      damage: 123,
      aircraftLost: 1,
      lossCause: "airCombat",
    });

    const richSnapshot = replicationViewFor(host.state, guestShipId, 1, 0);
    deliverSnapshot(client, richSnapshot, 1, 100);
    const richView = client.renderState(220);
    const clientGuest = richView.state.ships.find(({ id }) => id === guestShipId)!;
    expect(clientGuest.mainGunId).toBe("mk2-twin");
    expect(clientGuest.torpedoId).toBe("mk-15-mod-3");
    expect(clientGuest.installedEquipment.mainGun).toEqual([
      "mainGun-purple", "mainGun-purple", "mainGun-purple", "mainGun-purple", "mainGun-purple",
    ]);
    expect(clientGuest.performance).toEqual(hostGuest.performance);
    expect(effectiveMainBattery(clientGuest).maximumRangeMeters)
      .toBe(effectiveMainBattery(hostGuest).maximumRangeMeters);
    expect(getTorpedo(clientGuest.torpedoId).maximumRangeMeters)
      .toBe(getTorpedo(hostGuest.torpedoId).maximumRangeMeters);
    expect(richView.state.projectiles.map(({ id }) => id)).toEqual(expect.arrayContaining([shell.id, torpedo.id]));
    expect(richView.state.airEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 90_003,
        kind: "attackHit",
        orderKind: "strikeShip",
        targetId: guestShipId,
        weapon: "heBomb",
        damage: 123,
        aircraftLost: 1,
        lossCause: "airCombat",
      }),
    ]));

    host.step(idleHost(host), FIXED_STEP);
    for (const enemy of host.state.ships.filter(({ team }) => team === "enemy")) enemy.hull = 0;
    const terminalOutput = host.step(idleHost(host), FIXED_STEP);
    const resultSnapshot = terminalOutput.snapshots.get(GUEST_ID);
    expect(host.state.status).toBe("player-won");
    expect(resultSnapshot).toBeDefined();
    deliverSnapshot(client, resultSnapshot!, 2, 300);
    const resultView = client.renderState(420);
    expect(resultView.serverTick).toBe(resultSnapshot!.serverTick);
    expect(resultView.state.status).toBe(host.state.status);
    expect(resultView.state.endReason).toBe(host.state.endReason);
  });
});
