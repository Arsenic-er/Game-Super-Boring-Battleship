import { describe, expect, it } from "vitest";
import { SHIP_CLASSES, getShipClass } from "../src/ships/classes";
import { effectiveMainBattery, mainBatteryMountLocalPosition } from "../src/ships/mainBatteries";
import { resolveLoadoutVisualPlan, VISUAL_EQUIPMENT_CATEGORIES } from "../src/render/loadoutVisualPlan";
import { LoadoutVisualRegistry } from "../src/render/loadoutVisualRegistry";
import { createDeveloperShipState, gunMuzzleOrigins } from "../src/sim/simulation";
import type { InstalledEquipmentIds } from "../src/sim/types";

const mixedSlots = (): InstalledEquipmentIds => ({
  mainGun: ["mainGun-common", null, "mainGun-purple", null, "mainGun-gold"],
  torpedo: [null, "torpedo-redGold"], antiAir: ["antiAir-common", null, "antiAir-gold", "antiAir-redGold"],
  sideGun: [null, "sideGun-purple", "sideGun-gold", null], depthCharge: [null, "depthCharge-redGold"],
  magazine: ["magazine-gold"], engine: ["engine-purple"], steering: ["steering-redGold"],
});

describe("canonical ordered loadout visual plan", () => {
  for (const hull of Object.values(SHIP_CLASSES)) it(`preserves all eight categories for ${hull.id}`, () => {
    const slots = mixedSlots();
    for (const category of ["mainGun", "torpedo", "antiAir", "sideGun", "depthCharge"] as const) {
      slots[category] = Array.from({ length: hull.slotCounts[category] }, (_, index) => index % 3 === 1 ? null : `${category}-${index % 2 ? "gold" : "common"}`);
    }
    const plan = resolveLoadoutVisualPlan(hull.id, slots);
    const registry = new LoadoutVisualRegistry();
    registry.begin("solo-battle");
    const combatPlan = registry.register("solo-battle", "player", hull.id, slots);
    expect(combatPlan).toEqual(plan);
    for (const category of VISUAL_EQUIPMENT_CATEGORIES) {
      expect(plan.slots[category].map((slot) => slot.equipmentId)).toEqual(slots[category]);
      const mounts = category === "magazine" || category === "engine" || category === "steering"
        ? plan.internalModules.filter((mount) => mount.category === category) : plan[category];
      expect(mounts.map((mount) => mount.slotIndex)).toEqual(slots[category].flatMap((id, index) => id === null ? [] : [index]));
      expect(mounts.every((mount) => Object.values(mount.position).every(Number.isFinite))).toBe(true);
    }
    if (hull.hullId === "battleship") expect(plan.torpedo).toHaveLength(0);
  });

  it("degrades invalid IDs within their own category and never fills null slots", () => {
    const slots = mixedSlots();
    slots.torpedo = [null, "engine-gold", "deleted-torpedo"];
    const plan = resolveLoadoutVisualPlan("fletcher", slots);
    expect(plan.slots.torpedo.map(({ equipmentId, status }) => ({ equipmentId, status }))).toEqual([
      { equipmentId: null, status: "empty" }, { equipmentId: "torpedo-common", status: "fallback" },
      { equipmentId: "torpedo-common", status: "fallback" },
    ]);
    expect(plan.torpedo.map(({ slotIndex }) => slotIndex)).toEqual([1, 2]);
    slots.mainGun[0] = "mainGun-redGold";
    expect(plan.mainGun[0]?.equipmentId).toBe("mainGun-common");
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.slots.mainGun)).toBe(true);
    expect(Object.isFrozen(plan.mainGun[0]?.position)).toBe(true);
  });

  it("keeps main and secondary simulation hardpoints aligned across empty and mixed slots", () => {
    const slots = mixedSlots();
    const ship = createDeveloperShipState({ id: "player", team: "player", shipClassId: "fletcher",
      position: { x: 0, y: 0, z: 0 }, installedEquipment: slots, mainGunMounts: 3,
      secondaryGunIds: ["sideGun-purple", "sideGun-gold"] });
    const plan = resolveLoadoutVisualPlan(ship.shipClassId, slots);
    const battery = effectiveMainBattery(ship);
    expect(ship.mainBatteryMounts).toHaveLength(3);
    expect(plan.mainGun.map(({ slotIndex }) => slotIndex)).toEqual([0, 2, 4]);
    expect(plan.mainGun.map(({ position }) => position)).toEqual(battery.mounts.map(mainBatteryMountLocalPosition));
    expect(plan.mainGun.map(({ visual }) => visual.barrelCount)).toEqual([1, 2, 2]);
    expect(gunMuzzleOrigins(ship)).toHaveLength(5);
    expect(ship.secondaryMounts.map(({ side }) => side)).toEqual([1, -1]);
    expect(plan.sideGun.map(({ position }) => position.z * getShipClass(ship.shipClassId).renderScale.z))
      .toEqual(ship.secondaryMounts.map(({ longitudinalOffset }) => longitudinalOffset));
  });

  it("gives empty weapons no phantom mounts", () => {
    const slots = mixedSlots();
    slots.mainGun = [null, null, null, null, null]; slots.torpedo = [null, null];
    const plan = resolveLoadoutVisualPlan("fletcher", slots);
    expect(plan.mainGun).toHaveLength(0);
    expect(plan.torpedo).toHaveLength(0);
  });
});

describe("visual session registry", () => {
  for (const scope of ["reward-battle-uuid", "lan-match-uuid", "sea-trials-uuid"]) it(`clears ${scope} and cannot reuse another session's player ID`, () => {
    const registry = new LoadoutVisualRegistry();
    registry.begin(scope);
    const first = registry.register(scope, "player", "fletcher", mixedSlots());
    const changed = mixedSlots(); changed.mainGun[0] = "mainGun-redGold";
    registry.begin(`${scope}-second`);
    expect(registry.size).toBe(0);
    expect(registry.get(scope, "player")).toBeUndefined();
    expect(() => registry.register(scope, "player", "fletcher", changed)).toThrow(/inactive/);
    const next = registry.register(`${scope}-second`, "player", "fletcher", changed);
    expect(next.signature).not.toBe(first.signature);
    expect(first.mainGun[0]?.equipmentId).toBe("mainGun-common");
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.sessionScope).toBeUndefined();
  });
});
