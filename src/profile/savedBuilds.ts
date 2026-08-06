import { getShipClass } from "../ships/classes";
import {
  battleLoadoutFromSlots,
  normalizeLocalProfile,
  type BattleLoadout,
  type LocalProfile,
  type SavedBuildReadiness,
  type SavedShipBuild,
} from "./localProfile";
import { CATEGORY_META } from "./equipmentCatalog";
import type { EquipmentCategory } from "./equipmentCatalog";

const categories = Object.keys(CATEGORY_META) as EquipmentCategory[];
const MAX_SAVED_SHIP_BUILDS = 24;

export function savedBuildReadiness(
  profileSource: LocalProfile,
  build: SavedShipBuild,
): SavedBuildReadiness {
  const profile = normalizeLocalProfile(profileSource);
  const required = new Map<string, number>();
  for (const category of categories) {
    for (const itemId of build.slots[category] ?? []) {
      if (itemId) required.set(itemId, (required.get(itemId) ?? 0) + 1);
    }
  }
  const missing = Array.from(required, ([itemId, count]) => ({
    itemId,
    required: count,
    owned: profile.inventory[itemId] ?? 0,
  })).filter(({ required: count, owned }) => owned < count);
  return { ready: missing.length === 0, missing };
}

export function saveCurrentShipBuild(
  source: LocalProfile,
  name: string,
  idFactory: () => string = () => `build-${Date.now().toString(36)}`,
): { profile: LocalProfile; buildId?: string; success: boolean; reason: "ok" | "name-required" | "limit" } {
  const profile = normalizeLocalProfile(source);
  const normalizedName = name.trim().slice(0, 24);
  if (!normalizedName) return { profile, success: false, reason: "name-required" };
  if (profile.savedShipBuilds.length >= MAX_SAVED_SHIP_BUILDS) {
    return { profile, success: false, reason: "limit" };
  }
  let buildId = idFactory().trim().slice(0, 64) || `build-${profile.savedShipBuilds.length + 1}`;
  if (profile.savedShipBuilds.some(({ id }) => id === buildId)) {
    buildId = `${buildId}-${profile.savedShipBuilds.length + 1}`.slice(0, 64);
  }
  const build: SavedShipBuild = {
    id: buildId,
    name: normalizedName,
    shipClassId: profile.shipClassId,
    slots: structuredClone(profile.slotLoadoutsByShipClass[profile.shipClassId]),
  };
  return {
    profile: normalizeLocalProfile({
      ...profile,
      savedShipBuilds: [...profile.savedShipBuilds, build],
      selectedBattleBuildId: buildId,
    }),
    buildId,
    success: true,
    reason: "ok",
  };
}

export function overwriteShipBuild(source: LocalProfile, buildId: string): LocalProfile {
  const profile = normalizeLocalProfile(source);
  const build = profile.savedShipBuilds.find(({ id }) => id === buildId);
  if (!build) return profile;
  const savedShipBuilds = profile.savedShipBuilds.map((entry) => entry.id === buildId ? {
    ...entry,
    shipClassId: profile.shipClassId,
    slots: structuredClone(profile.slotLoadoutsByShipClass[profile.shipClassId]),
    name: entry.name || `${getShipClass(profile.shipClassId).name} 配置`,
  } : entry);
  return normalizeLocalProfile({ ...profile, savedShipBuilds });
}

export function deleteShipBuild(source: LocalProfile, buildId: string): LocalProfile {
  const profile = normalizeLocalProfile(source);
  const savedShipBuilds = profile.savedShipBuilds.filter(({ id }) => id !== buildId);
  return normalizeLocalProfile({
    ...profile,
    savedShipBuilds,
    selectedBattleBuildId: profile.selectedBattleBuildId === buildId
      ? savedShipBuilds[0]?.id ?? null
      : profile.selectedBattleBuildId,
  });
}

export function selectBattleBuild(source: LocalProfile, buildId: string): LocalProfile {
  const profile = normalizeLocalProfile(source);
  const build = profile.savedShipBuilds.find(({ id }) => id === buildId);
  if (!build || !savedBuildReadiness(profile, build).ready) return profile;
  return normalizeLocalProfile({ ...profile, selectedBattleBuildId: buildId });
}

export function battleLoadoutForSavedBuild(
  source: LocalProfile,
  buildId: string,
): BattleLoadout | undefined {
  const profile = normalizeLocalProfile(source);
  const build = profile.savedShipBuilds.find(({ id }) => id === buildId);
  if (!build || !savedBuildReadiness(profile, build).ready) return undefined;
  return battleLoadoutFromSlots(build.shipClassId, build.slots);
}
