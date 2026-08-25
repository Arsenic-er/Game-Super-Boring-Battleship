import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface DesktopPackageManifest {
  scripts: Record<string, string>;
  build: {
    asar: boolean;
    asarUnpack?: string[];
    win?: {
      target?: Array<string | { target: string }>;
    };
  };
}

const readManifest = async (): Promise<DesktopPackageManifest> => JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as DesktopPackageManifest;

describe("Windows desktop packaging contract", () => {
  it("builds an unpacked Windows x64 game directory by default", async () => {
    const manifest = await readManifest();

    expect(manifest.scripts["desktop:dist"]).toBe(
      "npm run build && electron-builder --win --x64 --dir",
    );
  });

  it("keeps a separate ZIP command for GitHub release delivery", async () => {
    const manifest = await readManifest();

    expect(manifest.scripts["desktop:zip"]).toBe(
      "npm run build && electron-builder --win zip --x64",
    );
  });

  it("keeps code in ASAR while exposing stable game asset directories", async () => {
    const manifest = await readManifest();

    expect(manifest.build.asar).toBe(true);
    expect(manifest.build.asarUnpack).toEqual(expect.arrayContaining([
      "dist/assets/ships/**/*",
      "dist/assets/textures/**/*",
      "dist/assets/equipment/**/*",
      "dist/assets/cursors/**/*",
      "dist/assets/audio/**/*",
    ]));
  });

  it("does not retain the legacy single-file portable target", async () => {
    const manifest = await readManifest();
    const targets = (manifest.build.win?.target ?? []).map((target) => (
      typeof target === "string" ? target : target.target
    ));

    expect(targets).not.toContain("portable");
  });
});
