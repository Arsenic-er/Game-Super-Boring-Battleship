import {
  battleLoadoutFromSlots, createDefaultLocalProfile, equipComponent, purchaseComponent,
  researchComponent, selectShipClass,
  type BattleLoadout, type LocalProfile, type SavedShipBuild,
} from "../../src/profile/localProfile";
import {
  battleLoadoutForSavedBuild, saveCurrentShipBuild, savedBuildReadiness, selectBattleBuild,
} from "../../src/profile/savedBuilds";
import { shipDraftMeters, terrainNavigationAt } from "../../src/maps/atollMap";
import { BATTLE_SPAWN } from "../../src/sim/config";
import { createInitialState } from "../../src/sim/simulation";
import type { BattleState, Vec3 } from "../../src/sim/types";

export type PrototypeSpawnSide = "default" | "mirrored";
export const PROTOTYPE_PLAYER_BUILDS = [
  "default-fletcher", "cleveland-starter", "north-carolina-magazine-refit",
] as const;
export type PrototypePlayerBuild = typeof PROTOTYPE_PLAYER_BUILDS[number];

export function prototypePlayerBuild(raw: string | undefined): PrototypePlayerBuild {
  if (raw === undefined) return "default-fletcher";
  if ((PROTOTYPE_PLAYER_BUILDS as readonly string[]).includes(raw)) return raw as PrototypePlayerBuild;
  throw new Error("PROTOTYPE_PLAYER_BUILD must be default-fletcher, cleveland-starter or north-carolina-magazine-refit");
}

/** Only production profile/armory/save APIs; no granted credits, inventory or developer overrides. */
export function prepareFleetSmokeBuild(fixture: PrototypePlayerBuild = "default-fletcher"): {
  profile: LocalProfile; build: SavedShipBuild; loadout: BattleLoadout;
} {
  // Keep the default profile and slot conversion exactly as the original smoke.
  let profile = createDefaultLocalProfile();
  if (fixture === "default-fletcher") {
    const build = profile.savedShipBuilds.find(({ id }) => id === profile.selectedBattleBuildId)!;
    return { profile, build, loadout: battleLoadoutFromSlots(build.shipClassId, build.slots) };
  }
  if (fixture !== "cleveland-starter" && fixture !== "north-carolina-magazine-refit") {
    throw new Error("Unsupported prototype player build");
  }
  profile = selectShipClass(profile, fixture === "cleveland-starter" ? "cleveland" : "north-carolina");
  if (fixture === "north-carolina-magazine-refit") {
    const researched = researchComponent(profile, "magazine-purple");
    if (!researched.success) throw new Error(`Smoke magazine research failed: ${researched.reason}`);
    const purchased = purchaseComponent(researched.profile, "magazine-purple");
    if (!purchased.success) throw new Error(`Smoke magazine purchase failed: ${purchased.reason}`);
    profile = equipComponent(purchased.profile, "magazine-purple", 0);
    if (profile.slotLoadoutsByShipClass["north-carolina"].magazine[0] !== "magazine-purple") {
      throw new Error("Smoke magazine was not installed");
    }
  }
  // Selecting a hull creates its starter save; outfitting does not modify that snapshot.
  const saved = saveCurrentShipBuild(profile,
    fixture === "cleveland-starter" ? "Smoke Cleveland starter" : "Smoke NC magazine refit",
    () => `smoke-${fixture}`);
  if (!saved.success || !saved.buildId) throw new Error(`Smoke build save failed: ${saved.reason}`);
  profile = selectBattleBuild(saved.profile, saved.buildId);
  const build = profile.savedShipBuilds.find(({ id }) => id === saved.buildId)!;
  if (profile.selectedBattleBuildId !== saved.buildId || !savedBuildReadiness(profile, build).ready) {
    throw new Error("Smoke build is not selected and sea-ready");
  }
  const loadout = battleLoadoutForSavedBuild(profile, saved.buildId);
  if (!loadout) throw new Error("Smoke saved build has no valid battle loadout");
  return { profile, build, loadout };
}

/** Capture before combat; never infer installed equipment from the fixture name. */
export function fleetSmokePlayerBuildReport(state: BattleState, fixture: PrototypePlayerBuild) {
  if (fixture === "default-fletcher") return {};
  const player = state.ships.find(({ id }) => id === "player");
  if (!player) throw new Error("Smoke report needs the player ship");
  return { playerBuild: fixture, playerBuildLoadout: {
    shipClassId: player.shipClassId, hullId: player.hullId, mainGunId: player.mainGunId,
    torpedoId: player.torpedoId, mainGunMounts: player.mainGunMounts,
    torpedoLauncherMounts: player.torpedoLauncherMounts,
    antiAirMounts: player.antiAirMounts, secondaryMounts: player.secondaryMounts.length,
    installedEquipment: structuredClone(player.installedEquipment),
    performance: { ...player.performance },
  } };
}

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

/** Optional saved-build fixtures leave the default profile/factory inputs unchanged. */
export function createFleetSmokeBattle(teamSize: 5 | 7, seed: number,
  side: PrototypeSpawnSide = "default", playerBuild: PrototypePlayerBuild = "default-fletcher"): BattleState {
  const { loadout } = prepareFleetSmokeBuild(playerBuild);
  const state = createInitialState(seed, "battle", loadout.mainGunId, loadout, loadout.torpedoId,
    loadout.shipClassId, { teamSize, weatherId: "clear" });
  return applyFleetSmokeSpawnSide(state, side);
}
