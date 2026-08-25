import { describe, expect, it } from "vitest";
import {
  REQUIRED_SHIP_HARDPOINTS,
  validateShipAssetManifest,
} from "../src/render/shipAssetManifest";

const validManifest = (): unknown => ({
  schemaVersion: 1,
  shipClassId: "fletcher",
  displayName: "Fletcher class benchmark",
  coordinateSystem: {
    units: "meters",
    up: "+Y",
    bow: "+Z",
    origin: "waterline-center",
    rootScale: 1,
    rootRotation: [0, 0, 0],
  },
  provenance: {
    creator: "Example naval artist",
    sourceUrl: "https://example.com/fletcher",
    licenseId: "CC-BY-4.0",
    redistributionAllowed: true,
    downloadedAt: "2026-08-25",
    sha256: "a".repeat(64),
    modifications: ["LOD reduction", "project hardpoints"],
  },
  lods: [
    { level: 0, file: "lod0.glb", sha256: "b".repeat(64), triangles: 42_000, materials: 6, maxTextureSize: 1024 },
    { level: 1, file: "lod1.glb", sha256: "c".repeat(64), triangles: 14_000, materials: 4, maxTextureSize: 1024 },
    { level: 2, file: "lod2.glb", sha256: "d".repeat(64), triangles: 3_500, materials: 2, maxTextureSize: 512 },
  ],
  hardpoints: [...REQUIRED_SHIP_HARDPOINTS],
  renderNodes: ["HULL_LOD0", "DECK_LOD0", "SUPERSTRUCTURE_LOD0"],
  collisionVolumes: [
    { nodeName: "COLLIDER_BOW", zone: "bow", center: [0, 2, 42], size: [10, 6, 24] },
    { nodeName: "COLLIDER_MACHINERY", zone: "machinery", center: [0, 1, -4], size: [11, 6, 32] },
    { nodeName: "COLLIDER_STERN", zone: "stern", center: [0, 2, -43], size: [9, 6, 22] },
  ],
});

const issueCodes = (input: unknown): string[] => (
  validateShipAssetManifest(input).issues.map((issue) => issue.code)
);

describe("ship asset manifest validation", () => {
  it("accepts a complete provenance-gated Fletcher package", () => {
    const result = validateShipAssetManifest(validManifest());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.manifest?.shipClassId).toBe("fletcher");
  });

  it("rejects an unknown schema version", () => {
    const manifest = validManifest() as Record<string, unknown>;
    manifest.schemaVersion = 2;
    expect(issueCodes(manifest)).toContain("schema.unsupported");
  });

  it("rejects provenance that does not permit redistribution", () => {
    const manifest = validManifest() as { provenance: Record<string, unknown> };
    manifest.provenance.redistributionAllowed = false;
    expect(issueCodes(manifest)).toContain("provenance.redistribution-required");
  });

  it("rejects runtime LOD files that are not binary GLB", () => {
    const manifest = validManifest() as { lods: Array<Record<string, unknown>> };
    manifest.lods[1]!.file = "lod1.gltf";
    expect(issueCodes(manifest)).toContain("lod.glb-required");
  });

  it("rejects a LOD without its own runtime checksum", () => {
    const manifest = validManifest() as { lods: Array<Record<string, unknown>> };
    manifest.lods[2]!.sha256 = "not-a-checksum";
    expect(issueCodes(manifest)).toContain("lod.sha256-required");
  });

  it("rejects each LOD when it exceeds its independent performance budget", () => {
    const manifest = validManifest() as { lods: Array<Record<string, unknown>> };
    manifest.lods[0]!.triangles = 45_001;
    manifest.lods[1]!.materials = 5;
    manifest.lods[2]!.triangles = 4_001;
    expect(issueCodes(manifest)).toEqual(expect.arrayContaining([
      "lod.triangle-budget",
      "lod.material-budget",
    ]));
  });

  it("rejects a package missing a required combat hardpoint", () => {
    const manifest = validManifest() as { hardpoints: string[] };
    manifest.hardpoints = manifest.hardpoints.filter((name) => name !== "HP_MAIN_FWD_01");
    expect(issueCodes(manifest)).toContain("hardpoint.required");
  });

  it("rejects collision volumes that alias visible render nodes", () => {
    const manifest = validManifest() as {
      collisionVolumes: Array<Record<string, unknown>>;
    };
    manifest.collisionVolumes[0]!.nodeName = "HULL_LOD0";
    expect(issueCodes(manifest)).toContain("collision.render-node-alias");
  });
});
