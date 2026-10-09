import { battleLoadoutFromSlots, createDefaultLocalProfile } from "../../src/profile/localProfile";
import { shipDraftMeters, terrainNavigationAt } from "../../src/maps/atollMap";
import { BATTLE_SPAWN } from "../../src/sim/config";
import { createInitialState } from "../../src/sim/simulation";
import type { BattleState, Vec3 } from "../../src/sim/types";

export type PrototypeSpawnSide = "default" | "mirrored";

/** Explicitly opt in; an invalid setting must not silently run the default side. */
export function prototypeSpawnSide(raw: string | undefined): PrototypeSpawnSide {
  if (raw === undefined || raw === "default") return "default";
  if (raw === "mirrored") return "mirrored";
  throw new Error("PROTOTYPE_SPAWN_SIDE must be default or mirrored");
}

export const FLEET_SMOKE_SIDE_SWAP = {
  kind: "rigid-180-degree-rotation",
  centerX: (BATTLE_SPAWN.player.x + BATTLE_SPAWN.enemy.x) / 2,
  centerZ: (BATTLE_SPAWN.player.z + BATTLE_SPAWN.enemy.z) / 2,
  terrainTransformed: false,
} as const;

function rotatePoint(point: Vec3): Vec3 {
  return { x: 2 * FLEET_SMOKE_SIDE_SWAP.centerX - point.x, y: point.y,
    z: 2 * FLEET_SMOKE_SIDE_SWAP.centerZ - point.z };
}

function rotateHeading(heading: number): number {
  const rotated = heading + Math.PI;
  return rotated > Math.PI ? rotated - Math.PI * 2 : rotated;
}

/**
 * Test-only side swap, not a terrain reflection or team/loadout exchange.
 * A rigid half turn preserves each fleet's spacing and port/starboard geometry.
 * Apply before creating a session or observing; no live entities may be present.
 */
export function applyFleetSmokeSpawnSide(state: BattleState, side: PrototypeSpawnSide): BattleState {
  if (side === "default") return state;
  if (side !== "mirrored") throw new Error("Unsupported prototype spawn side");
  if (state.time !== 0 || state.mode !== "battle" || state.status !== "running"
    || state.airSquadrons.length || state.projectiles.length || state.depthCharges.length
    || state.underwaterTargets.length || state.smokeClouds.length
    || state.shots.length || state.impacts.length || state.airEvents.length
    || Object.keys(state.sensorSnapshots).length || Object.keys(state.collisionCooldowns).length
    || state.ships.some((ship) => ship.speedKnots !== 0 || ship.throttle !== 0
      || ship.perception || ship.aiDecision)) {
    throw new Error("Prototype side swap requires a fresh, unobserved battle state");
  }
  for (const ship of state.ships) {
    ship.position = rotatePoint(ship.position);
    ship.previousPosition = rotatePoint(ship.previousPosition);
    ship.aimPoint = rotatePoint(ship.aimPoint);
    ship.heading = rotateHeading(ship.heading);
    ship.turretHeading = rotateHeading(ship.turretHeading);
    ship.torpedoLauncherHeading = rotateHeading(ship.torpedoLauncherHeading);
    for (const mount of ship.mainBatteryMounts) mount.heading = rotateHeading(mount.heading);
    for (const mount of ship.secondaryMounts) mount.heading = rotateHeading(mount.heading);
    const navigation = terrainNavigationAt(state.mapId, ship.position.x, ship.position.z,
      shipDraftMeters(ship.shipClassId));
    ship.navigationZone = navigation.kind;
    ship.waterDepthMeters = navigation.depthMeters;
  }
  return state;
}

/** Same default profile and factory inputs as the original full-battle smoke. */
export function createFleetSmokeBattle(teamSize: 5 | 7, seed: number,
  side: PrototypeSpawnSide = "default"): BattleState {
  const profile = createDefaultLocalProfile();
  const build = profile.savedShipBuilds.find(({ id }) => id === profile.selectedBattleBuildId)!;
  const loadout = battleLoadoutFromSlots(build.shipClassId, build.slots);
  const state = createInitialState(seed, "battle", loadout.mainGunId, loadout, loadout.torpedoId,
    loadout.shipClassId, { teamSize, weatherId: "clear" });
  return applyFleetSmokeSpawnSide(state, side);
}
