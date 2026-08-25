import { describe, expect, it } from "vitest";
import { replicationViewFor } from "../src/net/replicationView";
import { createInitialState } from "../src/sim/simulation";
import type { AirCombatEvent, ImpactEvent, ProjectileState, ShotEvent } from "../src/sim/types";

function placeEnemyVisible(state: ReturnType<typeof createInitialState>): void {
  const player = state.ships.find((ship) => ship.id === "player")!;
  const enemy = state.ships.find((ship) => ship.id === "enemy")!;
  enemy.position = {
    x: player.position.x + 1_100,
    y: player.position.y,
    z: player.position.z + 200,
  };
  enemy.previousPosition = { ...enemy.position };
}

describe("replicationViewFor", () => {
  it("redacts hidden hostile source identity across every replicated category", () => {
    const state = createInitialState(401, "battle");
    const player = state.ships.find((ship) => ship.id === "player")!;
    const enemy = state.ships.find((ship) => ship.id === "enemy")!;
    enemy.position = {
      x: player.position.x + 6_000,
      y: player.position.y,
      z: player.position.z + 6_000,
    };
    enemy.previousPosition = { ...enemy.position };

    state.projectiles = [
      {
        id: 900,
        ownerId: enemy.id,
        team: "enemy",
        kind: "shell",
        ammoType: "he",
        position: { x: player.position.x + 900, y: 10, z: player.position.z },
        previousPosition: { x: player.position.x + 920, y: 10, z: player.position.z },
        velocity: { x: -100, y: 0, z: 0 },
        damage: 1,
        age: 1,
      },
      {
        id: 901,
        ownerId: enemy.id,
        team: "enemy",
        kind: "torpedo",
        position: { x: player.position.x + 500, y: 0, z: player.position.z },
        previousPosition: { x: player.position.x + 520, y: 0, z: player.position.z },
        velocity: { x: -25, y: 0, z: 0 },
        damage: 100,
        age: 1,
        detectionRange: 650,
      },
    ] as ProjectileState[];
    state.shots = [{
      id: 902,
      ownerId: enemy.id,
      team: "enemy",
      kind: "shell",
      ammoType: "he",
      position: { x: player.position.x + 850, y: 5, z: player.position.z },
    }] as ShotEvent[];
    state.impacts = [{
      id: 903,
      kind: "hit",
      position: { x: player.position.x + 100, y: 0, z: player.position.z + 25 },
      sourceId: enemy.id,
      sourceTeam: "enemy",
      targetId: player.id,
      damage: 33,
      projectileKind: "shell",
      ammoType: "he",
    }] as ImpactEvent[];
    state.airSquadrons = [{
      id: "enemy-squadron-hidden",
      controllerId: enemy.id,
      team: "enemy",
      role: "fighter",
      recoverySource: { kind: "carrier", shipId: enemy.id },
      contactsByTeam: {},
      phase: "patrolling",
      position: { x: player.position.x + 600, y: 300, z: player.position.z + 100 },
      previousPosition: { x: player.position.x + 650, y: 300, z: player.position.z + 100 },
      heading: 0,
      aircraftCapacity: 6,
      aircraftOperational: 6,
      airframeHealth: 100,
      maxAirframeHealth: 100,
      ammoRemaining: 100,
      ordnanceRemaining: 0,
      cohesion: 1,
      fuelRemainingSeconds: 300,
      phaseStartedAt: 0,
      lastUpdatedAt: 0,
      attackRunReleased: false,
    }];
    state.airEvents = [{
      id: 904,
      time: state.time,
      kind: "weaponReleased",
      team: "enemy",
      controllerId: enemy.id,
      squadronId: "enemy-squadron-hidden",
      position: { x: player.position.x + 5_000, y: 400, z: player.position.z + 5_000 },
    } as AirCombatEvent];

    const view = replicationViewFor(state, "player", 6, 0);
    const serialized = JSON.stringify(view);

    expect(view.contacts).toHaveLength(0);
    expect(view.projectiles).toEqual(expect.arrayContaining([
      expect.not.objectContaining({ ownerId: enemy.id }),
    ]));
    expect(view.torpedoes).toEqual(expect.arrayContaining([
      expect.not.objectContaining({ ownerId: enemy.id }),
    ]));
    expect(view.events).toEqual(expect.arrayContaining([
      expect.not.objectContaining({ ownerId: enemy.id }),
      expect.not.objectContaining({ sourceId: enemy.id }),
    ]));
    expect(view.aircraft).toEqual(expect.arrayContaining([
      expect.not.objectContaining({ id: "enemy-squadron-hidden" }),
      expect.not.objectContaining({ controllerId: enemy.id }),
    ]));
    expect(serialized).not.toContain('"ownerId":"enemy"');
    expect(serialized).not.toContain('"sourceId":"enemy"');
    expect(serialized).not.toContain('"controllerId":"enemy"');
    expect(serialized).not.toContain('enemy-squadron-hidden');
    expect(view.events.some((event) => event.id === 904)).toBe(false);
  });

  it("preserves visible hostile identity while still hiding full ship internals", () => {
    const visible = createInitialState(402, "battle");
    placeEnemyVisible(visible);
    visible.time = 1;
    const player = visible.ships.find((ship) => ship.id === "player")!;
    const enemy = visible.ships.find((ship) => ship.id === "enemy")!;

    visible.projectiles = [{
      id: 910,
      ownerId: enemy.id,
      team: "enemy",
      kind: "shell",
      ammoType: "he",
      position: { x: player.position.x + 900, y: 10, z: player.position.z },
      previousPosition: { x: player.position.x + 920, y: 10, z: player.position.z },
      velocity: { x: -100, y: 0, z: 0 },
      damage: 1,
      age: 1,
    }] as ProjectileState[];
    visible.shots = [{
      id: 911,
      ownerId: enemy.id,
      team: "enemy",
      kind: "shell",
      ammoType: "he",
      position: { x: enemy.position.x, y: enemy.position.y + 10, z: enemy.position.z },
    }] as ShotEvent[];
    visible.impacts = [{
      id: 912,
      kind: "hit",
      position: { x: player.position.x + 100, y: player.position.y, z: player.position.z + 25 },
      sourceId: enemy.id,
      sourceTeam: "enemy",
      targetId: player.id,
      damage: 33,
      projectileKind: "shell",
      ammoType: "he",
    }] as ImpactEvent[];
    visible.airSquadrons = [{
      id: "enemy-squadron-visible",
      controllerId: enemy.id,
      team: "enemy",
      role: "fighter",
      recoverySource: { kind: "carrier", shipId: enemy.id },
      contactsByTeam: {},
      phase: "patrolling",
      position: { x: player.position.x + 500, y: 300, z: player.position.z + 100 },
      previousPosition: { x: player.position.x + 520, y: 300, z: player.position.z + 100 },
      heading: 0,
      aircraftCapacity: 6,
      aircraftOperational: 6,
      airframeHealth: 100,
      maxAirframeHealth: 100,
      ammoRemaining: 100,
      ordnanceRemaining: 0,
      cohesion: 1,
      fuelRemainingSeconds: 300,
      phaseStartedAt: 0,
      lastUpdatedAt: 0,
      attackRunReleased: false,
    }];
    visible.airEvents = [{
      id: 913,
      time: visible.time,
      kind: "weaponReleased",
      team: "enemy",
      controllerId: enemy.id,
      squadronId: "enemy-squadron-visible",
      position: { x: player.position.x + 400, y: 250, z: player.position.z + 100 },
      targetId: player.id,
    } as AirCombatEvent];

    const view = replicationViewFor(visible, "player", 6, 3);

    expect(view.contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: enemy.id }),
    ]));
    expect(view.projectiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: enemy.id, kind: "shell" }),
    ]));
    expect(view.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 911, ownerId: enemy.id }),
      expect.objectContaining({ id: 912, sourceId: enemy.id, targetId: player.id }),
      expect.objectContaining({ id: 913, controllerId: enemy.id, squadronId: "enemy-squadron-visible" }),
    ]));
    expect(view.aircraft).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "enemy-squadron-visible", controllerId: enemy.id }),
    ]));
    expect("hull" in view.contacts[0]!).toBe(false);
    expect("modules" in view.contacts[0]!).toBe(false);
  });

  it("deep-clones every snapshot branch so callers cannot mutate authoritative state", () => {
    const state = createInitialState(403, "battle");
    placeEnemyVisible(state);
    state.time = 1;

    const snapshot = replicationViewFor(state, "player", 12, 7);
    (snapshot.self.position as { x: number }).x = 123_456;
    (snapshot.objective.center as { x: number }).x = -999;
    if (snapshot.contacts[0]) {
      (snapshot.contacts[0].position as { x: number }).x = 777;
    }

    const fresh = replicationViewFor(state, "player", 12, 7);
    const player = state.ships.find((ship) => ship.id === "player")!;

    expect(player.position.x).not.toBe(123_456);
    expect(state.objective.center.x).not.toBe(-999);
    expect(fresh.self).not.toBe(snapshot.self);
    expect(fresh.self.position).not.toBe(snapshot.self.position);
    if (fresh.contacts[0]) {
      const freshContact = fresh.contacts[0] as { position: { x: number } };
      const mutatedContact = snapshot.contacts[0] as { position: { x: number } } | undefined;
      expect(freshContact.position.x).not.toBe(777);
      expect(freshContact.position).not.toBe(mutatedContact?.position);
    }
  });

  it("replicates friendly visible loadouts and complete filtered visual event metadata", () => {
    const state = createInitialState(404, "battle");
    const player = state.ships.find(({ id }) => id === "player")!;
    const friendly = state.ships.find(({ team, id }) => team === "player" && id !== player.id)!;
    player.mainGunId = "mk2-twin";
    player.torpedoId = "mk-15-mod-3";
    player.mainGunMounts = 2;
    player.installedEquipment.mainGun = ["mainGun-purple", "mainGun-purple"];
    player.performance.maxSpeedMultiplier = 1.1;
    friendly.mainGunId = "mk2-twin";
    friendly.torpedoId = "mk-15-mod-3";
    friendly.mainGunMounts = 2;
    friendly.installedEquipment.mainGun = ["mainGun-purple", "mainGun-purple"];
    friendly.performance.maxSpeedMultiplier = 1.1;
    state.shots = [{
      id: 950,
      ownerId: player.id,
      team: "player",
      kind: "depthCharge",
      weaponSource: "secondary",
      position: { ...player.position },
    }];
    state.impacts = [{
      id: 951,
      kind: "underwater-explosion",
      position: { ...player.position },
      sourceId: player.id,
      sourceTeam: "player",
      projectileKind: "depthCharge",
      weaponSource: "aircraft",
      airWeapon: "heBomb",
      ammoType: "he",
    }];
    state.airEvents = [{
      id: 952,
      time: state.time,
      kind: "weaponReleased",
      team: "enemy",
      controllerId: "hidden-air-controller",
      squadronId: "hidden-air-squadron",
      position: { x: player.position.x + 100, y: 90, z: player.position.z + 100 },
      weapon: "aerialTorpedo",
    }];

    const view = replicationViewFor(state, player.id, 6, 0);
    expect(view.self).toMatchObject({
      mainGunId: "mk2-twin",
      torpedoId: "mk-15-mod-3",
      mainGunMounts: 2,
      performance: expect.objectContaining({ maxSpeedMultiplier: 1.1 }),
      installedEquipment: expect.objectContaining({ mainGun: ["mainGun-purple", "mainGun-purple"] }),
    });
    expect(view.friendlies.find(({ id }) => id === friendly.id)).toMatchObject({
      mainGunId: "mk2-twin",
      torpedoId: "mk-15-mod-3",
      mainGunMounts: 2,
      performance: expect.objectContaining({ maxSpeedMultiplier: 1.1 }),
    });
    expect(view.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 950, projectileKind: "depthCharge", weaponSource: "secondary", team: "player" }),
      expect.objectContaining({ id: 951, projectileKind: "depthCharge", weaponSource: "aircraft", airWeapon: "heBomb", ammoType: "he" }),
      expect.objectContaining({ id: 952, kind: "weaponReleased", team: "enemy", weapon: "aerialTorpedo" }),
    ]));
    const air = view.events.find(({ id }) => id === 952)!;
    expect(air).not.toHaveProperty("controllerId");
    expect(air).not.toHaveProperty("squadronId");
  });
});
