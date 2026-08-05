import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { battleLoadoutFromSlots, type SlotLoadout } from "../src/profile/localProfile";
import {
  combatEquipmentVisualPlan,
  createCombatEquipmentVisual,
} from "../src/render/combatEquipmentVisuals";
import { createPixelShipPalette } from "../src/render/shipMaterials";
import { reconfigureDeveloperShip } from "../src/sim/developerSandbox";
import { createDeveloperShipState, createInitialState } from "../src/sim/simulation";
import type { InstalledEquipmentIds, ShipState } from "../src/sim/types";

const installedEquipment = (): InstalledEquipmentIds => ({
  mainGun: ["mainGun-common"],
  torpedo: ["torpedo-common", "torpedo-redGold"],
  antiAir: ["antiAir-common", "antiAir-purple", "antiAir-gold", "antiAir-redGold"],
  sideGun: ["sideGun-common", "sideGun-purple", "sideGun-gold", "sideGun-redGold"],
  depthCharge: [
    "depthCharge-common",
    "depthCharge-purple",
    "depthCharge-gold",
    "depthCharge-redGold",
  ],
  magazine: ["magazine-gold"],
  engine: ["engine-purple"],
  steering: ["steering-redGold"],
});

const visualTestShip = (): ShipState => createDeveloperShipState({
  id: "visual-test-ship",
  team: "player",
  shipClassId: "cleveland",
  position: { x: 0, y: 0, z: 0 },
  torpedoLauncherMounts: 2,
  antiAirMounts: 4,
  depthChargeMounts: 4,
  secondaryGunIds: [
    "sideGun-common",
    "sideGun-purple",
    "sideGun-gold",
    "sideGun-redGold",
  ],
  installedEquipment: installedEquipment(),
});

describe("combat equipment loadout identity", () => {
  it("preserves every installed slot from profile conversion into battle state", () => {
    const slots: SlotLoadout = installedEquipment();
    const loadout = battleLoadoutFromSlots("fletcher", slots);
    const state = createInitialState(
      0x719,
      "battle",
      loadout.mainGunId,
      loadout,
      loadout.torpedoId,
      loadout.shipClassId,
    );
    const player = state.ships.find(({ id }) => id === "player");
    expect(player?.installedEquipment).toEqual(loadout.installedEquipment);
    loadout.installedEquipment.antiAir[0] = "antiAir-redGold";
    expect(player?.installedEquipment.antiAir[0]).toBe("antiAir-common");
  });

  it("rebuilds only for stable equipment identity changes", () => {
    const ship = visualTestShip();
    const baseline = combatEquipmentVisualPlan(ship).signature;
    ship.hull -= 100;
    ship.reloadRemaining = 9;
    ship.heading += 0.5;
    expect(combatEquipmentVisualPlan(ship).signature).toBe(baseline);
    ship.installedEquipment.antiAir[0] = "antiAir-redGold";
    expect(combatEquipmentVisualPlan(ship).signature).not.toBe(baseline);
  });

  it("retains per-launcher torpedo history instead of cloning the first slot", () => {
    const plan = combatEquipmentVisualPlan(visualTestShip());
    expect(plan.torpedoEquipmentIds).toEqual(["torpedo-common", "torpedo-redGold"]);
    expect(plan.torpedoDefinitionIds).toEqual(["mk-ix", "type-93-mod-3"]);
    const ship = visualTestShip();
    ship.torpedoLauncherMounts = 1;
    ship.installedEquipment.torpedo = [null, "torpedo-redGold"];
    expect(combatEquipmentVisualPlan(ship).torpedoEquipmentIds).toEqual(["torpedo-redGold"]);
  });

  it("keeps legacy developer weapon controls visually synchronized", () => {
    const state = createInitialState();
    const current = state.ships.find(({ id }) => id === "player")!;
    const replacement = reconfigureDeveloperShip(state, current.id, {
      shipClassId: current.shipClassId,
      mainBatteryClassId: current.shipClassId,
      mainGunId: current.mainGunId,
      mainGunMounts: 2,
      torpedoId: "type-93-mod-3",
      torpedoLauncherMounts: 2,
      secondaryGunId: "sideGun-redGold",
      secondaryGunMounts: 2,
      depthChargeMounts: 1,
      antiAirMounts: 1,
    });
    expect(replacement?.installedEquipment.torpedo).toEqual([
      "torpedo-redGold",
      "torpedo-redGold",
    ]);
    expect(replacement?.installedEquipment.sideGun).toEqual([
      "sideGun-redGold",
      "sideGun-redGold",
    ]);
  });
});

describe("combat equipment geometry", () => {
  it("creates distinct finite low-cost mounts for every auxiliary historical model", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("ship", scene);
    const palette = createPixelShipPalette(scene, "combat-equipment-test", "ally");
    const materialCount = scene.materials.length;
    const ship = visualTestShip();
    const visual = createCombatEquipmentVisual(scene, parent, ship, palette, 1);
    const meshes = visual.root.getChildMeshes(false);

    expect(visual.secondaryTurrets).toHaveLength(4);
    for (const [index, expected] of [2, 2, 2, 3].entries()) {
      const barrelCount = meshes.filter((mesh) =>
        mesh.name.includes(`${ship.id}-secondary-${index}-`) && mesh.name.includes("-barrel-")).length;
      expect(barrelCount, `secondary mount ${index}`).toBe(expected);
    }
    for (const [index, expected] of [1, 8, 2, 4].entries()) {
      const barrelCount = meshes.filter((mesh) =>
        mesh.name.includes(`${ship.id}-aa-${index}-`) && mesh.name.includes("-barrel-")).length;
      expect(barrelCount, `AA mount ${index}`).toBe(expected);
    }
    for (const [index, expected] of [3, 7, 9, 12].entries()) {
      const meshCount = meshes.filter((mesh) => mesh.name.includes(`${ship.id}-depth-${index}-`)).length;
      expect(meshCount, `depth-charge mount ${index}`).toBe(expected);
    }
    expect(meshes.length).toBeLessThanOrEqual(70);
    expect(meshes.every((mesh) => {
      const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
      return [minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z]
        .every(Number.isFinite);
    })).toBe(true);
    expect(scene.materials.length).toBe(materialCount);
    scene.dispose();
    engine.dispose();
  });

  it("does not leak meshes, transform nodes or materials across repeated rebuilds", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("ship", scene);
    const palette = createPixelShipPalette(scene, "combat-equipment-leak", "ally");
    const ship = visualTestShip();
    const baseline = {
      meshes: scene.meshes.length,
      nodes: scene.transformNodes.length,
      materials: scene.materials.length,
    };
    for (let iteration = 0; iteration < 50; iteration += 1) {
      ship.installedEquipment.antiAir[0] = iteration % 2 ? "antiAir-purple" : "antiAir-common";
      const visual = createCombatEquipmentVisual(scene, parent, ship, palette, 1);
      visual.root.dispose(false, false);
      expect(scene.meshes.length).toBe(baseline.meshes);
      expect(scene.transformNodes.length).toBe(baseline.nodes);
      expect(scene.materials.length).toBe(baseline.materials);
    }
    scene.dispose();
    engine.dispose();
  });
});
