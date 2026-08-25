import { describe, expect, it } from "vitest";
import type { ShipAssetManifest } from "../src/render/shipAssetManifest";
import {
  createShipModelRegistry,
  selectShipLod,
} from "../src/render/shipModelRegistry";

const checksum = "a".repeat(64);

function validManifest(shipClassId: ShipAssetManifest["shipClassId"] = "fletcher"): ShipAssetManifest {
  return {
    schemaVersion: 1,
    shipClassId,
    displayName: "Test ship",
    coordinateSystem: {
      units: "meters",
      up: "+Y",
      bow: "+Z",
      origin: "waterline-center",
      rootScale: 1,
      rootRotation: [0, 0, 0],
    },
    provenance: {
      creator: "Test author",
      sourceUrl: "https://example.com/model",
      licenseId: "CC-BY-4.0",
      redistributionAllowed: true,
      downloadedAt: "2026-08-25",
      sha256: checksum,
      modifications: ["Test fixture"],
    },
    lods: ([0, 1, 2] as const).map((level) => ({
      level,
      file: `lod${level}.glb`,
      sha256: checksum,
      triangles: level === 0 ? 40_000 : level === 1 ? 12_000 : 3_000,
      materials: level === 0 ? 5 : level === 1 ? 3 : 2,
      maxTextureSize: level === 2 ? 512 : 1024,
    })) as ShipAssetManifest["lods"],
    hardpoints: [
      "HP_MAIN_FWD_01", "HP_MAIN_AFT_01", "HP_TORPEDO_CENTER_01",
      "HP_AA_PORT_01", "HP_AA_STARBOARD_01", "HP_BRIDGE_01", "HP_MAST_01",
      "FX_FUNNEL_01", "FX_WAKE_PORT", "FX_WAKE_STARBOARD",
      "FX_DAMAGE_BOW", "FX_DAMAGE_ENGINE", "FX_DAMAGE_STERN",
    ],
    renderNodes: ["Hull", "Superstructure"],
    collisionVolumes: [
      { nodeName: "COL_BOW", zone: "bow", center: [0, 0, 20], size: [8, 8, 25] },
      { nodeName: "COL_CENTRAL", zone: "central", center: [0, 0, 0], size: [10, 10, 30] },
      { nodeName: "COL_BRIDGE", zone: "bridge", center: [0, 8, 0], size: [8, 10, 8] },
      { nodeName: "COL_MACHINERY", zone: "machinery", center: [0, 0, -5], size: [8, 8, 12] },
      { nodeName: "COL_MAGAZINE", zone: "magazine", center: [0, 0, 10], size: [8, 8, 10] },
      { nodeName: "COL_STERN", zone: "stern", center: [0, 0, -20], size: [8, 8, 25] },
    ],
  };
}

describe("ship model registry", () => {
  it("registers a valid external package by ship class", () => {
    const registry = createShipModelRegistry([
      { baseUrl: "/assets/ships/fletcher/", manifest: validManifest() },
    ]);

    expect(registry.issues).toEqual([]);
    expect(registry.get("fletcher")?.baseUrl).toBe("/assets/ships/fletcher/");
  });

  it("refuses invalid packages instead of exposing them to runtime", () => {
    const manifest = validManifest() as unknown as Record<string, unknown>;
    manifest.provenance = {};
    const registry = createShipModelRegistry([{ baseUrl: "/bad/", manifest }]);

    expect(registry.get("fletcher")).toBeUndefined();
    expect(registry.issues.length).toBeGreaterThan(0);
  });

  it("keeps the first valid registration when a class is duplicated", () => {
    const registry = createShipModelRegistry([
      { baseUrl: "/first/", manifest: validManifest() },
      { baseUrl: "/second/", manifest: validManifest() },
    ]);

    expect(registry.get("fletcher")?.baseUrl).toBe("/first/");
    expect(registry.issues.some((issue) => issue.code === "registry.duplicate-class")).toBe(true);
  });
});

describe("ship LOD policy", () => {
  it("never selects LOD0 on low quality", () => {
    expect(selectShipLod("low", 0)).toBe(2);
    expect(selectShipLod("low", 250)).toBe(2);
  });

  it("uses LOD1 near the camera and LOD2 at range on medium quality", () => {
    expect(selectShipLod("medium", 1_799)).toBe(1);
    expect(selectShipLod("medium", 1_800)).toBe(2);
  });
});
