import { describe, expect, it } from "vitest";
import type { ShipAssetManifest } from "../src/render/shipAssetManifest";
import { loadShipModelCatalog } from "../src/render/shipModelCatalog";

const checksum = "a".repeat(64);
const manifest: ShipAssetManifest = {
  schemaVersion: 1,
  shipClassId: "fletcher",
  displayName: "Fletcher",
  coordinateSystem: { units: "meters", up: "+Y", bow: "+Z", origin: "waterline-center", rootScale: 1, rootRotation: [0, 0, 0] },
  provenance: { creator: "Author", sourceUrl: "https://example.com/model", licenseId: "CC-BY-4.0", redistributionAllowed: true, downloadedAt: "2026-08-25", sha256: checksum, modifications: ["Optimized"] },
  lods: [
    { level: 0, file: "lod0.glb", sha256: checksum, triangles: 40_000, materials: 5, maxTextureSize: 1024 },
    { level: 1, file: "lod1.glb", sha256: checksum, triangles: 12_000, materials: 3, maxTextureSize: 1024 },
    { level: 2, file: "lod2.glb", sha256: checksum, triangles: 3_000, materials: 2, maxTextureSize: 512 },
  ],
  hardpoints: ["HP_MAIN_FWD_01", "HP_MAIN_AFT_01", "HP_TORPEDO_CENTER_01", "HP_AA_PORT_01", "HP_AA_STARBOARD_01", "HP_BRIDGE_01", "HP_MAST_01", "FX_FUNNEL_01", "FX_WAKE_PORT", "FX_WAKE_STARBOARD", "FX_DAMAGE_BOW", "FX_DAMAGE_ENGINE", "FX_DAMAGE_STERN"],
  renderNodes: ["Hull"],
  collisionVolumes: [
    { nodeName: "COL_BOW", zone: "bow", center: [0, 0, 20], size: [8, 8, 25] },
    { nodeName: "COL_CENTRAL", zone: "central", center: [0, 0, 0], size: [10, 10, 30] },
    { nodeName: "COL_BRIDGE", zone: "bridge", center: [0, 8, 0], size: [8, 10, 8] },
    { nodeName: "COL_MACHINERY", zone: "machinery", center: [0, 0, -5], size: [8, 8, 12] },
    { nodeName: "COL_MAGAZINE", zone: "magazine", center: [0, 0, 10], size: [8, 8, 10] },
    { nodeName: "COL_STERN", zone: "stern", center: [0, 0, -20], size: [8, 8, 25] },
  ],
};

describe("runtime ship model catalog", () => {
  it("fetches declared manifests and registers valid packages", async () => {
    const requested: string[] = [];
    const result = await loadShipModelCatalog(async (url) => {
      requested.push(url);
      if (url === "/assets/ships/catalog.json") {
        return { ok: true, json: async () => ({ schemaVersion: 1, packages: [{ baseUrl: "/assets/ships/fletcher/", manifestUrl: "/assets/ships/fletcher/manifest.json" }] }) };
      }
      return { ok: true, json: async () => manifest };
    });

    expect(requested).toEqual(["/assets/ships/catalog.json", "/assets/ships/fletcher/manifest.json"]);
    expect(result.registry.has("fletcher")).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("returns an empty safe registry when the catalog cannot be loaded", async () => {
    const result = await loadShipModelCatalog(async () => { throw new Error("offline"); });

    expect(result.registry.has("fletcher")).toBe(false);
    expect(result.issues[0]?.code).toBe("catalog.fetch-failed");
  });
});
