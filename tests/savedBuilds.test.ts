import { describe, expect, it } from "vitest";
import {
  createDefaultLocalProfile,
  normalizeLocalProfile,
} from "../src/profile/localProfile";
import {
  battleLoadoutForSavedBuild,
  deleteShipBuild,
  overwriteShipBuild,
  saveCurrentShipBuild,
  savedBuildReadiness,
} from "../src/profile/savedBuilds";
import { equipComponent, selectShipClass } from "../src/profile/localProfile";

describe("saved ship builds", () => {
  it("migrates v5 profiles with a ready inherited build", () => {
    const current = selectShipClass(createDefaultLocalProfile(), "bismarck");
    const migrated = normalizeLocalProfile({
      ...current,
      version: 5,
      savedShipBuilds: undefined,
      selectedBattleBuildId: undefined,
    });
    expect(migrated.version).toBe(7);
    expect(migrated.savedShipBuilds).toHaveLength(1);
    expect(migrated.savedShipBuilds[0]?.shipClassId).toBe("bismarck");
    expect(savedBuildReadiness(migrated, migrated.savedShipBuilds[0]!).ready).toBe(true);
  });

  it("saves a deep snapshot and changes it only on explicit overwrite", () => {
    const base = createDefaultLocalProfile();
    const saved = saveCurrentShipBuild(base, "快速驱逐", () => "fast-dd");
    expect(saved.success).toBe(true);
    const build = saved.profile.savedShipBuilds.find(({ id }) => id === "fast-dd")!;
    const changed = equipComponent(normalizeLocalProfile({
      ...saved.profile,
      inventory: { ...saved.profile.inventory, "engine-purple": 1 },
    }), "engine-purple");
    expect(build.slots.engine).not.toEqual(changed.slotLoadoutsByShipClass.fletcher.engine);
    const overwritten = overwriteShipBuild(changed, "fast-dd");
    expect(overwritten.savedShipBuilds.find(({ id }) => id === "fast-dd")?.slots.engine)
      .toEqual(overwritten.slotLoadoutsByShipClass.fletcher.engine);
    expect(deleteShipBuild(overwritten, "fast-dd").savedShipBuilds.some(({ id }) =>
      id === "fast-dd")).toBe(false);
  });

  it("turns a ready saved build into its own battle loadout", () => {
    const profile = createDefaultLocalProfile();
    const buildId = profile.savedShipBuilds[0]!.id;
    const loadout = battleLoadoutForSavedBuild(profile, buildId);
    expect(loadout?.shipClassId).toBe("fletcher");
    expect(loadout?.mainGunMounts).toBeGreaterThan(0);
  });
});
