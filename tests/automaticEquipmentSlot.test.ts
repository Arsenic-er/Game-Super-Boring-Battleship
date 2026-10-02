import { describe, expect, it } from "vitest";
import { resolveAutomaticEquipmentSlot } from "../src/profile/automaticEquipmentSlot";
import { createDefaultLocalProfile, equipComponent, normalizeLocalProfile } from "../src/profile/localProfile";

function fixture(slots: (string | null)[], gold = 4) {
  const p = createDefaultLocalProfile();
  p.shipClassId = "fletcher";
  p.slotLoadoutsByShipClass.fletcher.mainGun = p.slotLoadoutsByShipClass.fletcher.mainGun.map((_, i) => slots[i] ?? null);
  p.inventory["mainGun-gold"] = gold;
  p.inventory["mainGun-common"] += 20;
  return normalizeLocalProfile(p);
}
describe("shared automatic equipment target", () => {
  it.each([
    {name: "new model with spare rear slots", slots: ["mainGun-common", null], item: "mainGun-gold", target: {slotIndex: 0, action: "replace"}},
    {name: "same model appends", slots: ["mainGun-gold", null], item: "mainGun-gold", target: {slotIndex: 1, action: "install"}},
    {name: "full rack replaces first", slots: ["mainGun-common", "mainGun-common"], item: "mainGun-gold", target: {slotIndex: 0, action: "replace"}},
    {name: "sparse rack keeps physical slot zero", slots: [null, "mainGun-common"], item: "mainGun-gold", target: {slotIndex: 0, action: "install"}},
    {name: "existing model uses first hole", slots: [null, "mainGun-gold", null], item: "mainGun-gold", target: {slotIndex: 0, action: "install"}},
    {name: "same model in full rack", slots: ["mainGun-gold", "mainGun-gold"], item: "mainGun-gold", target: {slotIndex: 0, action: "replace"}},
  ])("$name is pure and deterministic", ({slots, item, target}) => {
    const original = structuredClone(slots);
    expect(resolveAutomaticEquipmentSlot(slots, item)).toEqual(target);
    expect(resolveAutomaticEquipmentSlot(slots, item)).toEqual(target);
    expect(slots).toEqual(original);
  });
  it("returns no target for a category without hardpoints", () => {
    expect(resolveAutomaticEquipmentSlot([], "sideGun-gold")).toBeUndefined();
  });
  it.each([
    ["new model with empty slots", ["mainGun-common", null, null, null, null], 0],
    ["same model append", ["mainGun-gold", null, null, null, null], 1],
    ["full rack replace", ["mainGun-common","mainGun-common","mainGun-common","mainGun-common","mainGun-common"], 0],
    ["sparse physical slot", [null, "mainGun-common", null, null, null], 0],
  ] as const)("%s transaction changes exactly the preview target", (_name, input, index) => {
    const p = fixture([...input]);
    const before = structuredClone(p);
    const target = resolveAutomaticEquipmentSlot(p.slotLoadoutsByShipClass.fletcher.mainGun, "mainGun-gold");
    expect(target?.slotIndex).toBe(index);
    const next = equipComponent(p, "mainGun-gold");
    const expected = [...before.slotLoadoutsByShipClass.fletcher.mainGun];
    expected[index] = "mainGun-gold";
    expect(next.slotLoadoutsByShipClass.fletcher.mainGun).toEqual(expected);
    expect(next.inventory).toEqual(before.inventory);
    expect(next.savedShipBuilds).toEqual(before.savedShipBuilds);
    expect(p).toEqual(before);
  });
  it("rejects additional installations after all copies are installed", () => {
    const p = fixture(["mainGun-gold", null], 1);
    const before = structuredClone(p);
    expect(resolveAutomaticEquipmentSlot(p.slotLoadoutsByShipClass.fletcher.mainGun, "mainGun-gold")?.slotIndex).toBe(1);
    expect(equipComponent(p, "mainGun-gold").slotLoadoutsByShipClass).toEqual(before.slotLoadoutsByShipClass);
    expect(p).toEqual(before);
  });
  it("rejects incompatible side guns and unknown components without mutation", () => {
    const p = fixture(["mainGun-common", null]);
    p.inventory["sideGun-gold"] = 1;
    const normalized = normalizeLocalProfile(p);
    for (const item of ["sideGun-gold", "unknown-model"]) {
      const before = structuredClone(normalized);
      expect(equipComponent(normalized, item).slotLoadoutsByShipClass).toEqual(before.slotLoadoutsByShipClass);
      expect(normalized).toEqual(before);
    }
  });
  it("does not require an extra copy for an unchanged full-rack first slot", () => {
    const p = fixture(Array(5).fill("mainGun-gold"), 5);
    expect(equipComponent(p, "mainGun-gold").slotLoadoutsByShipClass).toEqual(p.slotLoadoutsByShipClass);
  });
});
