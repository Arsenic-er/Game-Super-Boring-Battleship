import { describe, expect, it } from "vitest";
import { resolveEquipmentSlot } from "../src/profile/automaticEquipmentSlot";
import { battleLoadout, createDefaultLocalProfile, equipComponent, loadLocalProfile, normalizeLocalProfile, saveLocalProfile } from "../src/profile/localProfile";
import { battleLoadoutForSavedBuild, saveCurrentShipBuild } from "../src/profile/savedBuilds";

function fixture(ids: (string | null)[] = ["mainGun-common", null, null, null, null], ownedGold = 2) {
  const p = createDefaultLocalProfile();
  p.shipClassId = "fletcher";
  p.slotLoadoutsByShipClass.fletcher.mainGun = [...ids];
  p.inventory["mainGun-gold"] = ownedGold;
  p.inventory["mainGun-common"] += 20;
  return normalizeLocalProfile(p);
}
describe("explicit equipment hardpoint selection", () => {
  it("preserves automatic targeting when no explicit slot was requested", () => {
    expect(resolveEquipmentSlot(["mainGun-common",null], "mainGun-gold")).toEqual({slotIndex:0,action:"replace"});
    expect(resolveEquipmentSlot(["mainGun-gold",null], "mainGun-gold")).toEqual({slotIndex:1,action:"install"});
  });
  it.each([-1, 5, 100, .5, NaN, Infinity])("rejects invalid or stale slot %s without silently falling back", (slot) => {
    const p=fixture(), before=structuredClone(p);
    expect(resolveEquipmentSlot(p.slotLoadoutsByShipClass.fletcher.mainGun,"mainGun-gold",slot)).toBeUndefined();
    expect(equipComponent(p,"mainGun-gold",slot)).toEqual(before);
    expect(p).toEqual(before);
  });
  it("rejects a category without hardpoints", () => {
    expect(resolveEquipmentSlot([],"torpedo-gold",0)).toBeUndefined();
  });
  it.each([0,1,2,3,4])("installs exactly into physical slot %i and preserves all other slots", (index) => {
    const p=fixture(), before=structuredClone(p);
    const target=resolveEquipmentSlot(p.slotLoadoutsByShipClass.fletcher.mainGun,"mainGun-gold",index)!;
    const next=equipComponent(p,"mainGun-gold",index);
    const expected=[...before.slotLoadoutsByShipClass.fletcher.mainGun]; expected[index]="mainGun-gold";
    expect(target.slotIndex).toBe(index);
    expect(next.slotLoadoutsByShipClass.fletcher.mainGun).toEqual(expected);
    expect(next.inventory).toEqual(before.inventory);
    expect(next.credits).toBe(before.credits);
    expect(next.savedShipBuilds).toEqual(before.savedShipBuilds);
    expect(p).toEqual(before);
  });
  it("replaces an aft model without moving or overwriting the forward one", () => {
    const p=fixture(["mainGun-common",null,null,null,"mainGun-common"]);
    const next=equipComponent(p,"mainGun-gold",4);
    expect(next.slotLoadoutsByShipClass.fletcher.mainGun).toEqual(["mainGun-common",null,null,null,"mainGun-gold"]);
  });
  it("does not duplicate the last owned copy into another hardpoint", () => {
    const p=fixture(["mainGun-common",null,null,null,"mainGun-gold"],1);
    expect(equipComponent(p,"mainGun-gold",2)).toEqual(p);
    expect(equipComponent(p,"mainGun-gold",4)).toEqual(p);
  });
  it("rejects unowned, unknown and incompatible equipment", () => {
    const p=fixture(undefined,0);
    p.inventory["sideGun-gold"]=2;
    const before=normalizeLocalProfile(p);
    for(const itemId of ["mainGun-gold","not-an-item","sideGun-gold"]) {
      expect(equipComponent(before,itemId,0)).toEqual(before);
    }
  });
  it("keeps the explicitly replaced aft slot in a sea-ready saved battle loadout", () => {
    const p=fixture(Array(5).fill("mainGun-common"));
    const fitted=equipComponent(p,"mainGun-gold",4);
    const saved=saveCurrentShipBuild(fitted,"Ready aft turret",()=> "ready-aft");
    expect(battleLoadoutForSavedBuild(saved.profile,"ready-aft")?.installedEquipment.mainGun)
      .toEqual(["mainGun-common","mainGun-common","mainGun-common","mainGun-common","mainGun-gold"]);
  });
  it("retains sparse physical slots through storage, saved drafts and editor loadout", () => {
    const expected=["mainGun-common",null,null,null,"mainGun-gold"];
    const fitted=equipComponent(fixture(),"mainGun-gold",4);
    const storage=new Map<string,string>();
    const adapter={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);}};
    expect(saveLocalProfile(fitted,adapter).ok).toBe(true);
    const restored=loadLocalProfile(adapter);
    expect(restored.slotLoadoutsByShipClass.fletcher.mainGun).toEqual(expected);
    expect(battleLoadout(restored).installedEquipment.mainGun).toEqual(expected);
    const saved=saveCurrentShipBuild(restored,"Aft turret test",()=> "aft-slot-test");
    expect(saved.success).toBe(true);
    expect(saved.profile.savedShipBuilds.find(build=>build.id==="aft-slot-test")?.slots.mainGun).toEqual(expected);
    // A sparse draft is allowed, but this class requires all five main mounts to sail.
    expect(battleLoadoutForSavedBuild(saved.profile,"aft-slot-test")).toBeUndefined();
  });
});
