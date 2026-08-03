import { describe, expect, it } from "vitest";
import {
  applyBodyVisibility,
  OWN_SHIP_AIM_VISIBILITY,
  ownShipBodyVisibility,
} from "../src/render/shipAimPresentation";

describe("own ship aiming presentation", () => {
  it("fades only the player body while aiming", () => {
    expect(ownShipBodyVisibility("player", true)).toBe(OWN_SHIP_AIM_VISIBILITY);
    expect(ownShipBodyVisibility("player", false)).toBe(1);
    expect(ownShipBodyVisibility("escort", true)).toBe(1);
    expect(ownShipBodyVisibility("enemy", true)).toBe(1);
  });

  it("applies and restores visibility without accumulating", () => {
    const meshes = [{ visibility: 1 }, { visibility: 1 }];
    applyBodyVisibility(meshes, OWN_SHIP_AIM_VISIBILITY);
    expect(meshes.map((mesh) => mesh.visibility)).toEqual([
      OWN_SHIP_AIM_VISIBILITY,
      OWN_SHIP_AIM_VISIBILITY,
    ]);
    applyBodyVisibility(meshes, 1);
    applyBodyVisibility(meshes, 1);
    expect(meshes.map((mesh) => mesh.visibility)).toEqual([1, 1]);
  });
});
