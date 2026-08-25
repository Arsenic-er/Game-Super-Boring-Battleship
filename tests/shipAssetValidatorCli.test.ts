import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REQUIRED_SHIP_HARDPOINTS } from "../src/render/shipAssetManifest";
import {
  runShipAssetValidationCli,
  validateShipAssetRoot,
} from "../scripts/validate-ship-assets";

const temporaryRoots: string[] = [];
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

const createFletcherPackage = async (): Promise<{ root: string; lod1Path: string }> => {
  const root = await mkdtemp(join(tmpdir(), "battleship-assets-"));
  temporaryRoots.push(root);
  const shipRoot = join(root, "fletcher");
  await mkdir(shipRoot);
  const lodData = [Buffer.from("fletcher-lod0"), Buffer.from("fletcher-lod1"), Buffer.from("fletcher-lod2")];
  for (const [index, data] of lodData.entries()) {
    await writeFile(join(shipRoot, `lod${index}.glb`), data);
  }
  await writeFile(join(shipRoot, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    shipClassId: "fletcher",
    displayName: "Fletcher class benchmark",
    coordinateSystem: {
      units: "meters", up: "+Y", bow: "+Z", origin: "waterline-center",
      rootScale: 1, rootRotation: [0, 0, 0],
    },
    provenance: {
      creator: "Example naval artist",
      sourceUrl: "https://example.com/fletcher",
      licenseId: "CC-BY-4.0",
      redistributionAllowed: true,
      downloadedAt: "2026-08-25",
      sha256: "a".repeat(64),
      modifications: ["LOD reduction"],
    },
    lods: lodData.map((data, level) => ({
      level,
      file: `lod${level}.glb`,
      sha256: sha256(data),
      triangles: [42_000, 14_000, 3_500][level],
      materials: [6, 4, 2][level],
      maxTextureSize: [1024, 1024, 512][level],
    })),
    hardpoints: [...REQUIRED_SHIP_HARDPOINTS],
    renderNodes: ["HULL_LOD0"],
    collisionVolumes: [
      { nodeName: "COLLIDER_HULL", zone: "central", center: [0, 2, 0], size: [11, 6, 90] },
    ],
  }, null, 2));
  return { root, lod1Path: join(shipRoot, "lod1.glb") };
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("offline ship asset validation", () => {
  it("accepts a package only when every listed GLB matches its checksum", async () => {
    const { root } = await createFletcherPackage();
    const report = await validateShipAssetRoot(root);
    expect(report.valid).toBe(true);
    expect(report.packages).toHaveLength(1);
    expect(report.packages[0]).toMatchObject({ shipClassId: "fletcher", valid: true, issues: [] });
  });

  it("returns a non-zero CLI result and JSON issue after a GLB is modified", async () => {
    const { root, lod1Path } = await createFletcherPackage();
    await writeFile(lod1Path, "tampered-lod");
    const output: string[] = [];
    const exitCode = await runShipAssetValidationCli([root], (line) => output.push(line));
    const report = JSON.parse(output.join("\n")) as {
      valid: boolean;
      packages: Array<{ issues: Array<{ code: string }> }>;
    };
    expect(exitCode).toBe(1);
    expect(report.valid).toBe(false);
    expect(report.packages[0]!.issues.map(({ code }) => code)).toContain("file.checksum-mismatch");
  });

  it("treats an empty runtime directory as a valid zero-package baseline", async () => {
    const root = await mkdtemp(join(tmpdir(), "battleship-empty-assets-"));
    temporaryRoots.push(root);
    expect(await validateShipAssetRoot(root)).toMatchObject({ valid: true, packages: [] });
  });
});
