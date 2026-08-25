import { describe, expect, it } from "vitest";
import type { ControlCommand } from "../src/sim/types";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import { ClientBattleSession } from "../src/net/clientBattleSession";
import type { LanBuildDescriptor, PlayerSnapshotPayload } from "../src/net/protocol";

function baseCommand(): ControlCommand {
  return {
    throttle: 0.5,
    rudder: -0.25,
    aimPoint: { x: 300, y: 0, z: 1_200 },
    fire: false,
    weaponSlot: "mainGun",
    torpedoSpread: "narrow",
    ammoType: "he",
    activateSmoke: false,
    activateHydro: false,
    deployDepthCharge: false,
    repairHull: false,
    damageControlPriority: "balanced",
  };
}

function snapshot(overrides: Partial<PlayerSnapshotPayload> = {}): PlayerSnapshotPayload {
  return {
    controlledShipId: "guest-ship",
    serverTick: 1,
    lastProcessedInputSequence: 0,
    time: 0,
    self: {
      id: "guest-ship",
      team: "player",
      shipClassId: "fletcher",
      position: { x: 0, y: 0, z: 0 },
      heading: 350 * Math.PI / 180,
      speedKnots: 10,
      throttle: 0,
      hull: 900,
      maxHull: 1_000,
      reloadRemaining: 0,
      torpedoReloadRemaining: 0,
      smokeCharges: 2,
      hydroCharges: 2,
    },
    friendlies: [
      {
        id: "ally-1",
        shipClassId: "cleveland",
        position: { x: -120, y: 0, z: -80 },
        heading: Math.PI / 3,
        speedKnots: 18,
        hullRatio: 0.8,
      },
    ],
    contacts: [
      {
        id: "contact-1",
        team: "enemy",
        observedAt: 0,
        position: { x: 600, y: 0, z: 900 },
        heading: Math.PI / 2,
        speedKnots: 22,
        rangeMeters: 1_200,
        confidence: 0.7,
        estimatedHullRatio: 0.65,
      },
    ],
    projectiles: [],
    torpedoes: [],
    aircraft: [],
    objective: {
      center: { x: 90, y: 0, z: 175 },
      radius: 450,
      captureProgress: 0,
      owner: null,
      capturingTeam: null,
      contested: false,
      scores: { player: 0, enemy: 0 },
    },
    events: [],
    ...overrides,
  };
}

function upgradedBuild(): LanBuildDescriptor {
  return {
    buildId: "guest-upgraded",
    buildName: "Twin battery guest",
    shipClassId: "fletcher",
    slots: {
      mainGun: ["mainGun-purple", "mainGun-purple", null, null, null],
      torpedo: ["torpedo-gold", null],
      antiAir: ["antiAir-purple", null, null, null],
      sideGun: [],
      depthCharge: ["depthCharge-purple", null],
      magazine: ["magazine-gold"],
      engine: ["engine-gold"],
      steering: ["steering-purple"],
    },
  };
}

describe("ClientBattleSession", () => {
  it("starts input sequences at 1, strips telemetry fields, clamps controls, and requires monotonic finite now", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    const first = session.submitLocalCommand({
      ...baseCommand(),
      throttle: 9,
      rudder: -4,
      aiDecision: {
        role: "screen",
        phase: "forming",
        desiredHeading: 0,
        throttle: 1,
        fireIntent: false,
      },
      perception: { mode: "tracking", confidence: 1 },
    } as unknown as ControlCommand, 1_000);

    expect(first.payload.inputSequence).toBe(1);
    expect(first.payload.command.throttle).toBe(1);
    expect(first.payload.command.rudder).toBe(-1);
    expect("aiDecision" in first.payload.command).toBe(false);
    expect("perception" in first.payload.command).toBe(false);

    const second = session.submitLocalCommand(baseCommand(), 1_034);
    expect(second.payload.inputSequence).toBe(2);

    expect(() => session.submitLocalCommand(baseCommand(), Number.NaN)).toThrow(/invalid-now/);
    expect(() => session.submitLocalCommand(baseCommand(), 1_020)).toThrow(/non-monotonic-now/);
  });

  it("rejects stale or invalid snapshots before mutating the interpolation buffer", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({ serverTick: 3, time: 1 }), 1_000)).toEqual({
      accepted: true,
      reason: "accepted",
    });
    expect(session.receiveSnapshot(snapshot({ serverTick: 3, time: 1.1 }), 1_020)).toEqual({
      accepted: false,
      reason: "stale-tick",
    });
    expect(session.receiveSnapshot(snapshot({ serverTick: 4, time: 0.9 }), 1_040)).toEqual({
      accepted: false,
      reason: "stale-time",
    });
    expect(session.receiveSnapshot(snapshot({ serverTick: 5, time: Number.NaN as unknown as number }), 1_060)).toEqual({
      accepted: false,
      reason: "invalid-time",
    });
  });

  it("interpolates with a 120 ms buffer, extrapolates until 500 ms, then freezes at the boundary", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({
      serverTick: 1,
      time: 0,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: 350 * Math.PI / 180,
        speedKnots: 10,
        throttle: 0,
        hull: 900,
        maxHull: 1_000,
        reloadRemaining: 0,
        torpedoReloadRemaining: 0,
        smokeCharges: 2,
        hydroCharges: 2,
      },
    }), 0)).toMatchObject({ accepted: true });
    expect(session.receiveSnapshot(snapshot({
      serverTick: 2,
      time: 0.2,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 20, y: 0, z: 0 },
        heading: 10 * Math.PI / 180,
        speedKnots: 20,
        throttle: 1,
        hull: 750,
        maxHull: 1_000,
        reloadRemaining: 0.5,
        torpedoReloadRemaining: 2,
        smokeCharges: 1,
        hydroCharges: 2,
      },
    }), 200)).toMatchObject({ accepted: true });

    const interpolated = session.renderState(220);
    expect(interpolated.state.time).toBeCloseTo(0.1, 5);
    const own = interpolated.state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(own.position.x).toBeCloseTo(10, 5);
    expect(own.heading * 180 / Math.PI).toBeCloseTo(0, 3);
    expect(own.speedKnots).toBeCloseTo(15, 5);

    const extrapolated = session.renderState(550);
    const extrapolatedOwn = extrapolated.state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(extrapolatedOwn.position.x).toBeGreaterThan(20);
    expect(extrapolatedOwn.heading * 180 / Math.PI).toBeGreaterThan(10);

    const boundary = session.renderState(700);
    const frozen = session.renderState(900);
    const boundaryOwn = boundary.state.ships.find((ship) => ship.id === "guest-ship")!;
    const frozenOwn = frozen.state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(boundaryOwn.position.x).toBeGreaterThan(extrapolatedOwn.position.x);
    expect(frozenOwn.position.x).toBeCloseTo(boundaryOwn.position.x, 5);
    expect(frozenOwn.heading).toBeCloseTo(boundaryOwn.heading, 5);
  });

  it("matches friendly interpolation history by ship id instead of array index", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha", peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH,
    });
    session.receiveSnapshot(snapshot({
      serverTick: 1,
      time: 0,
      friendlies: [{
        id: "ally-a", shipClassId: "cleveland",
        position: { x: -1_000, y: 0, z: 0 }, heading: 0, speedKnots: 5, hullRatio: 0.9,
      }, {
        id: "ally-b", shipClassId: "fletcher",
        position: { x: 100, y: 0, z: 0 }, heading: 0.2, speedKnots: 20, hullRatio: 0.8,
      }],
    }), 0);
    session.receiveSnapshot(snapshot({
      serverTick: 2,
      time: 0.2,
      friendlies: [{
        id: "ally-b", shipClassId: "fletcher",
        position: { x: 300, y: 0, z: 0 }, heading: 0.4, speedKnots: 24, hullRatio: 0.7,
      }],
    }), 200);

    const ally = session.renderState(220).state.ships.find(({ id }) => id === "ally-b")!;
    expect(ally.position.x).toBeCloseTo(200, 5);
    expect(ally.heading).toBeCloseTo(0.3, 5);
    expect(ally.speedKnots).toBeCloseTo(22, 5);
    expect(ally.hull / ally.maxHull).toBeCloseTo(0.75, 5);
  });

  it("releases next-snapshot visual events only after the interpolation timeline crosses their boundary", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha", peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH,
    });
    session.receiveSnapshot(snapshot({ serverTick: 1, time: 0, events: [] }), 0);
    session.receiveSnapshot(snapshot({
      serverTick: 2,
      time: 0.2,
      events: [{
        id: 701, kind: "shot", team: "player", ownerId: "guest-ship",
        position: { x: 10, y: 2, z: 20 }, projectileKind: "shell", ammoType: "he",
      }],
    }), 200);

    expect(session.renderState(220).state.shots).toEqual([]);
    expect(session.renderState(319).state.shots).toEqual([]);
    expect(session.renderState(320).state.shots.map(({ id }) => id)).toEqual([701]);
    expect(session.renderState(320).state.shots).toEqual([]);
    expect(session.renderState(600).state.shots).toEqual([]);
  });

  it("releases a single-snapshot event once during extrapolation and never replays it after freeze", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha", peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH,
    });
    session.receiveSnapshot(snapshot({
      serverTick: 1,
      time: 0,
      events: [{
        id: 702, kind: "splash", position: { x: 30, y: 0, z: 40 },
        damage: 0, projectileKind: "shell", ammoType: "ap",
      }],
    }), 0);

    expect(session.renderState(119).state.impacts).toEqual([]);
    expect(session.renderState(120).state.impacts.map(({ id }) => id)).toEqual([702]);
    expect(session.renderState(350).state.impacts).toEqual([]);
    expect(session.renderState(700).state.impacts).toEqual([]);
    expect(session.renderState(900).state.impacts).toEqual([]);
  });

  it("dead-reckons a single snapshot from its velocity and freezes that result after 500 ms", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });
    session.receiveSnapshot(snapshot({
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: Math.PI / 2,
        speedKnots: 20,
        throttle: 1,
        hull: 900,
        maxHull: 1_000,
        reloadRemaining: 0,
        torpedoReloadRemaining: 0,
        smokeCharges: 2,
        hydroCharges: 2,
      },
    }), 0);

    const moving = session.renderState(350).state.ships[0]!;
    const boundary = session.renderState(500).state.ships[0]!;
    const frozen = session.renderState(900).state.ships[0]!;
    expect(moving.position.x).toBeGreaterThan(0);
    expect(boundary.position.x).toBeGreaterThan(moving.position.x);
    expect(frozen.position.x).toBeCloseTo(boundary.position.x, 5);
  });

  it("predicts only movement/readout locally and never mutates authoritative damage state from input alone", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({
      serverTick: 1,
      lastProcessedInputSequence: 0,
      time: 0,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        speedKnots: 0,
        throttle: 0,
        hull: 640,
        maxHull: 1_000,
        reloadRemaining: 4,
        torpedoReloadRemaining: 8,
        smokeCharges: 2,
        hydroCharges: 1,
      },
    }), 0)).toMatchObject({ accepted: true });

    session.submitLocalCommand({
      ...baseCommand(),
      throttle: 1,
      rudder: 1,
      repairHull: true,
      fire: true,
    }, 33);
    session.submitLocalCommand({
      ...baseCommand(),
      throttle: 1,
      rudder: 1,
      repairHull: true,
      fire: true,
    }, 66);

    const predicted = session.renderState(186);
    const own = predicted.state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(own.position.z).toBeGreaterThan(0);
    expect(own.heading).toBeGreaterThan(0);
    expect(own.hull).toBe(640);
    expect(own.maxHull).toBe(1_000);
    expect(own.reloadRemaining).toBe(4);
    expect(own.torpedoReloadRemaining).toBe(8);
  });

  it("snaps back to the authoritative state once the server acks and propagates disconnect state", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({
      serverTick: 1,
      lastProcessedInputSequence: 0,
      time: 0,
    }), 0)).toMatchObject({ accepted: true });

    for (let index = 1; index <= 6; index += 1) {
      session.submitLocalCommand({ ...baseCommand(), throttle: 1 }, index * 33);
    }
    const predicted = session.renderState(240).state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(predicted.position.z).toBeGreaterThan(0);

    expect(session.receiveSnapshot(snapshot({
      serverTick: 2,
      lastProcessedInputSequence: 6,
      time: 0.2,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        speedKnots: 0,
        throttle: 0,
        hull: 900,
        maxHull: 1_000,
        reloadRemaining: 0,
        torpedoReloadRemaining: 0,
        smokeCharges: 2,
        hydroCharges: 2,
      },
    }), 200)).toMatchObject({ accepted: true });

    const reconciled = session.renderState(320).state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(reconciled.position.z).toBeCloseTo(0, 5);

    session.disconnect("timeout");
    const disconnected = session.renderState(320);
    expect(disconnected.connected).toBe(false);
    expect(disconnected.disconnectReason).toBe("timeout");
  });

  it.each([
    { pendingCount: 1, mode: "blend", min: 0, max: 4 },
    { pendingCount: 3, mode: "converge", min: 0, max: 5 },
    { pendingCount: 7, mode: "snap", min: 0, max: 0.001 },
  ])("reconciles $mode drift even while $pendingCount inputs remain unacknowledged", ({ pendingCount, min, max }) => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });
    session.receiveSnapshot(snapshot({
      serverTick: 1,
      lastProcessedInputSequence: 0,
      time: 0,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        speedKnots: 0,
        throttle: 0,
        hull: 640,
        maxHull: 1_000,
        reloadRemaining: 4,
        torpedoReloadRemaining: 8,
        smokeCharges: 2,
        hydroCharges: 1,
      },
    }), 0);
    for (let index = 1; index <= pendingCount; index += 1) {
      session.submitLocalCommand({ ...baseCommand(), throttle: 1, rudder: 0 }, index * 33);
    }

    const own = session.renderState(pendingCount * 33 + 120).state.ships[0]!;
    expect(own.position.z).toBeGreaterThanOrEqual(min);
    expect(own.position.z).toBeLessThanOrEqual(max);
    expect(own.hull).toBe(640);
    expect(own.reloadRemaining).toBe(4);
  });

  it("clones and exposes only replicated projectile, torpedo, aircraft, and event records", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });
    const replicated = snapshot({
      projectiles: [{
        id: 41, team: "enemy", kind: "shell", ammoType: "he",
        position: { x: 1, y: 2, z: 3 }, velocity: { x: 4, y: 5, z: 6 }, age: 0.5,
      }],
      torpedoes: [{
        id: 42, team: "enemy", kind: "torpedo",
        position: { x: 7, y: -1, z: 8 }, velocity: { x: 1, y: 0, z: 2 }, age: 1, detectionRange: 700,
      }],
      aircraft: [{
        team: "enemy", role: "fighter", phase: "patrolling",
        position: { x: 10, y: 80, z: 20 }, heading: 1.2, aircraftOperational: 4,
      }],
      events: [
        { id: 51, kind: "shot", team: "player", ownerId: "guest-ship", position: { x: 0, y: 3, z: 0 }, projectileKind: "shell", ammoType: "he", weaponSource: "aircraft", airWeapon: "heBomb" },
        { id: 52, kind: "splash", position: { x: 20, y: 0, z: 30 }, damage: 0, projectileKind: "shell", ammoType: "ap", weaponSource: "mainGun" },
        { id: 53, time: 4, kind: "landed", team: "player", controllerId: "guest-ship", squadronId: "air-1", position: { x: 30, y: 70, z: 40 } },
        { id: 54, kind: "shot", team: "player", ownerId: "guest-ship", position: { x: 0, y: 0, z: 1 }, projectileKind: "depthCharge", weaponSource: "secondary" },
        { id: 55, time: 4.5, kind: "aircraftLost", team: "enemy", position: { x: 35, y: 80, z: 45 }, aircraftLost: 2, lossCause: "flak" },
        {
          id: 56, time: 5, kind: "orderRejected", team: "player",
          controllerId: "guest-ship", squadronId: "air-1", orderKind: "strikeShip",
          rejectReason: "invalid-target", position: { x: 30, y: 70, z: 40 },
        },
      ],
    });
    session.receiveSnapshot(replicated, 0);
    replicated.projectiles[0]!.position = { x: 999, y: 999, z: 999 };

    const state = session.renderState(120).state;
    expect(state.projectiles.map(({ id }) => id)).toEqual([41, 42]);
    expect(state.projectiles[0]!.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(state.airSquadrons).toHaveLength(1);
    expect(state.shots.map(({ id }) => id)).toEqual([51, 54]);
    expect(state.shots[0]).toMatchObject({ weaponSource: "aircraft", airWeapon: "heBomb" });
    expect(state.shots[1]).toMatchObject({ kind: "depthCharge", weaponSource: "secondary" });
    expect(state.impacts.map(({ id }) => id)).toEqual([52]);
    expect(state.impacts[0]).toMatchObject({ projectileKind: "shell", ammoType: "ap", weaponSource: "mainGun" });
    expect(state.airEvents.map(({ id }) => id)).toEqual([53, 55, 56]);
    expect(state.airEvents[1]).toMatchObject({
      time: 4.5, kind: "aircraftLost", team: "enemy", aircraftLost: 2, lossCause: "flak",
    });
    expect(state.airEvents[1]!.controllerId).toMatch(/^replicated-anonymous-air-/);
    expect(state.airEvents[2]).toMatchObject({
      time: 5, kind: "orderRejected", team: "player", orderKind: "strikeShip", rejectReason: "invalid-target",
    });
    expect(state.projectiles[0]!.position).not.toEqual({ x: 999, y: 999, z: 999 });
  });

  it("reconstructs self and friendly visible loadouts from validated build and scoped snapshot data", () => {
    const build = upgradedBuild();
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
      build,
    } as unknown as ConstructorParameters<typeof ClientBattleSession>[0]);
    const installedEquipment = structuredClone(build.slots);
    session.receiveSnapshot(snapshot({
      self: {
        ...snapshot().self,
        mainGunId: "mk2-twin",
        torpedoId: "mk-15-mod-3",
        mainGunMounts: 2,
        torpedoLauncherMounts: 1,
        depthChargeMounts: 1,
        antiAirMounts: 1,
        antiAirEfficiencyMultiplier: 1.06,
        installedEquipment,
        performance: {
          maxSpeedMultiplier: 1.1,
          accelerationMultiplier: 1.085,
          turnMultiplier: 1.06,
          reloadMultiplier: 0.928,
          magazineRiskMultiplier: 1.01,
        },
      },
      friendlies: [{
        ...snapshot().friendlies[0],
        shipClassId: "fletcher",
        mainGunId: "mk2-twin",
        torpedoId: "mk-15-mod-3",
        mainGunMounts: 2,
        torpedoLauncherMounts: 1,
        depthChargeMounts: 0,
        antiAirMounts: 2,
        antiAirEfficiencyMultiplier: 1.06,
        installedEquipment,
        performance: {
          maxSpeedMultiplier: 1.1,
          accelerationMultiplier: 1.085,
          turnMultiplier: 1.06,
          reloadMultiplier: 0.928,
          magazineRiskMultiplier: 1.01,
        },
      }],
    }), 0);

    const state = session.renderState(120).state;
    const own = state.ships.find(({ id }) => id === "guest-ship")!;
    const ally = state.ships.find(({ id }) => id === "ally-1")!;
    for (const ship of [own, ally]) {
      expect(ship.mainGunId).toBe("mk2-twin");
      expect(ship.torpedoId).toBe("mk-15-mod-3");
      expect(ship.mainGunMounts).toBe(2);
      expect(ship.installedEquipment.mainGun).toEqual(["mainGun-purple", "mainGun-purple", null, null, null]);
      expect(ship.performance.maxSpeedMultiplier).toBe(1.1);
    }
  });

  it("drops replicated entities whose team was not explicitly disclosed", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha", peerId: "peer-guest", gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH,
    });
    session.receiveSnapshot(snapshot({
      projectiles: [{ id: 91, kind: "shell", position: { x: 0, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 } }],
      aircraft: [{ role: "fighter", phase: "patrolling", position: { x: 0, y: 80, z: 0 }, heading: 0, aircraftOperational: 4 }],
      events: [{ id: 92, kind: "weaponReleased", position: { x: 0, y: 80, z: 0 } }],
    }), 0);
    const state = session.renderState(120).state;
    expect(state.projectiles).toEqual([]);
    expect(state.airSquadrons).toEqual([]);
    expect(state.airEvents).toEqual([]);
  });

  it("enumerates replicated air event metadata instead of accepting or inventing invalid values", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha", peerId: "peer-guest", gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH,
    });
    session.receiveSnapshot(snapshot({
      events: [
        {
          id: 93, time: 6, kind: "orderRejected", team: "player",
          controllerId: "guest-ship", squadronId: "air-1",
          orderKind: "scriptInjection", rejectReason: "made-up", lossCause: "unknown-cause",
          position: { x: 0, y: 80, z: 0 },
        },
        { id: 94, time: 7, kind: "invented-event", team: "enemy", position: { x: 0, y: 80, z: 0 } },
        { id: 95, kind: "landed", team: "enemy", position: { x: 0, y: 80, z: 0 } },
      ],
    }), 0);

    const events = session.renderState(120).state.airEvents;
    expect(events.map(({ id }) => id)).toEqual([93]);
    expect(events[0]).not.toHaveProperty("orderKind");
    expect(events[0]).not.toHaveProperty("rejectReason");
    expect(events[0]).not.toHaveProperty("lossCause");
  });
});
