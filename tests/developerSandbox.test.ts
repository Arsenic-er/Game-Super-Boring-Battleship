import { describe, expect, it } from "vitest";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import {
  clearDeveloperEntities,
  enableDeveloperMode,
  reconfigureDeveloperShip,
  removeDeveloperEntity,
  spawnDeveloperAirSquadron,
  spawnDeveloperShip,
} from "../src/sim/developerSandbox";
import {
  DEVELOPER_MIN_RELOAD_SECONDS,
  createInitialState,
  stepSimulation,
} from "../src/sim/simulation";
import type { ControlCommand } from "../src/sim/types";

const idle = (x = 0, z = 1_000): ControlCommand => ({
  throttle: 0,
  rudder: 0,
  aimPoint: { x, y: 0, z },
  fire: false,
});

describe("developer sandbox", () => {
  it("rebuilds a ship with a historical main battery from another hull", () => {
    const state = createInitialState();
    const replacement = reconfigureDeveloperShip(state, "player", {
      shipClassId: "fletcher",
      mainBatteryClassId: "yamato",
      mainGunId: "mk4-twin",
      mainGunMounts: 3,
      torpedoId: "type-93-mod-3",
      torpedoLauncherMounts: 4,
      secondaryGunId: "sideGun-redGold",
      secondaryGunMounts: 6,
      depthChargeMounts: 4,
      antiAirMounts: 12,
    });

    expect(replacement).toBeDefined();
    expect(replacement!.shipClassId).toBe("fletcher");
    expect(replacement!.developer?.mainBatteryClassId).toBe("yamato");
    expect(effectiveMainBattery(replacement!).caliberMm).toBe(460);
    expect(replacement!.mainBatteryMounts).toHaveLength(3);
    expect(replacement!.torpedoLauncherMounts).toBe(4);
    expect(replacement!.secondaryMounts).toHaveLength(6);
    expect(replacement!.depthChargeMounts).toBe(4);
  });

  it("keeps a forced speed despite engine destruction, flooding and a zero throttle command", () => {
    const state = createInitialState();
    const player = state.ships.find(({ id }) => id === "player")!;
    const startZ = player.position.z;
    enableDeveloperMode(player, true);
    player.developer!.forcedSpeedKnots = 88;
    player.modules.engine.health = 0;
    player.flooding = 100;
    player.throttle = 0;

    stepSimulation(state, new Map([["player", idle()]]), .1);

    expect(player.speedKnots).toBe(88);
    expect(player.position.z).toBeGreaterThan(startZ);
  });

  it("uses a bounded rapid-fire interval instead of creating a projectile storm every tick", () => {
    const state = createInitialState(41, "sea-trials");
    const player = state.ships.find(({ id }) => id === "player")!;
    enableDeveloperMode(player, true);
    player.aimPoint = { x: 0, y: 0, z: 100 };
    for (const mount of player.mainBatteryMounts) mount.heading = 0;
    const fire = { ...idle(0, 100), fire: true, weaponSlot: "mainGun" as const };

    stepSimulation(state, new Map([["player", fire]]), .01);
    const firstSalvo = state.shots.filter(({ ownerId, kind }) => ownerId === "player" && kind === "shell").length;
    expect(firstSalvo).toBeGreaterThan(0);
    expect(player.mainBatteryMounts[0]!.reloadRemaining).toBeCloseTo(DEVELOPER_MIN_RELOAD_SECONDS);

    stepSimulation(state, new Map([["player", fire]]), .01);
    expect(state.shots.filter(({ ownerId, kind }) => ownerId === "player" && kind === "shell")).toHaveLength(0);
  });

  it("does not consume torpedo reserves and reloads them at the safe developer interval", () => {
    const state = createInitialState(73, "sea-trials");
    const player = state.ships.find(({ id }) => id === "player")!;
    enableDeveloperMode(player, true);
    player.aimPoint = { x: 1_000, y: 0, z: player.position.z };
    player.torpedoLauncherHeading = Math.PI / 2;
    const reserve = player.torpedoReserveSalvos;
    const fire = { ...idle(1_000, player.position.z), fire: true, weaponSlot: "torpedo" as const };

    stepSimulation(state, new Map([["player", fire]]), .01);

    expect(state.projectiles.filter(({ kind, ownerId }) => kind === "torpedo" && ownerId === "player")).toHaveLength(2);
    expect(player.torpedoReserveSalvos).toBe(reserve);
    expect(player.torpedoReloadRemaining).toBeCloseTo(DEVELOPER_MIN_RELOAD_SECONDS);

    stepSimulation(state, new Map([["player", idle(1_000, player.position.z)]]), DEVELOPER_MIN_RELOAD_SECONDS);
    expect(player.torpedoesLoaded).toBe(2);
    expect(player.torpedoReserveSalvos).toBe(reserve);
  });

  it("adds friendly and enemy ships and aircraft, then removes their references safely", () => {
    const state = createInitialState();
    const friendly = spawnDeveloperShip(state, "player", "cleveland")!;
    const enemy = spawnDeveloperShip(state, "enemy", "bismarck")!;
    const friendlyAir = spawnDeveloperAirSquadron(state, "player", "fighter", 7)!;
    const enemyAir = spawnDeveloperAirSquadron(state, "enemy", "torpedoBomber", 5)!;

    expect(new Set([friendly.id, enemy.id, friendlyAir.id, enemyAir.id]).size).toBe(4);
    expect(friendly.aiControlled).toBe(true);
    expect(enemy.aiControlled).toBe(true);
    expect(enemy.countsForVictory).toBe(false);
    expect(friendlyAir.phase).toBe("patrolling");
    expect(friendlyAir.aircraftOperational).toBe(7);
    expect(enemyAir.contactsByTeam.player?.confidence).toBe(1);

    state.ships[0]!.secondaryTargetId = enemy.id;
    enemyAir.controllerId = enemy.id;
    expect(removeDeveloperEntity(state, enemy.id)).toBe(true);
    expect(state.ships.some(({ id }) => id === enemy.id)).toBe(false);
    expect(state.airSquadrons.some(({ id }) => id === enemyAir.id)).toBe(false);
    expect(state.ships[0]!.secondaryTargetId).toBeUndefined();
    expect(removeDeveloperEntity(state, "player")).toBe(false);

    const cleared = clearDeveloperEntities(state);
    expect(cleared).toContain(friendly.id);
    expect(state.ships.some(({ developerSpawned }) => developerSpawned)).toBe(false);
  });

  it("keeps the sandbox running after ordinary victory conditions are emptied", () => {
    const state = createInitialState();
    const player = state.ships.find(({ id }) => id === "player")!;
    enableDeveloperMode(player, true);
    state.ships = [player];

    stepSimulation(state, new Map([["player", idle()]]), .1);

    expect(state.status).toBe("running");
    expect(state.endReason).toBeUndefined();
  });
});
