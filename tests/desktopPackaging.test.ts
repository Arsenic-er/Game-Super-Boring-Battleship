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

const readRepositoryFile = (relativePath: string): Promise<string> => readFile(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

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

describe("localized release guides", () => {
  it.each([
    {
      file: "README.zh-CN.md",
      facts: ["0.7.1", "15–20 分钟", "双人局域网合作", "搜索房间", "手动 IPv4", "Windows 目录版（ZIP）"],
      obsolete: "10 分钟",
    },
    {
      file: "README.zh-TW.md",
      facts: ["0.7.1", "15–20 分鐘", "雙人區域網路合作", "搜尋房間", "手動 IPv4", "Windows 目錄版（ZIP）"],
      obsolete: "10 分鐘",
    },
    {
      file: "README.ja.md",
      facts: ["0.7.1", "15～20分", "2人LAN協力", "ルーム検索", "手動IPv4", "Windows ディレクトリ版（ZIP）"],
      obsolete: "10分間",
    },
    {
      file: "README.es.md",
      facts: ["0.7.1", "15–20 minutos", "cooperativo LAN para dos jugadores", "búsqueda de salas", "IPv4 manual", "Windows (ZIP)"],
      obsolete: "diez minutos",
    },
    {
      file: "README.de.md",
      facts: ["0.7.1", "15–20 Minuten", "LAN-Koop für zwei Spieler", "Raumsuche", "IPv4-Adresse", "Windows-Verzeichnisversion (ZIP)"],
      obsolete: "zehnminütigen",
    },
    {
      file: "README.ru.md",
      facts: ["0.7.1", "15–20 минут", "по локальной сети для двух игроков", "поиск комнат", "ручной ввод IPv4", "каталога (ZIP)"],
      obsolete: "десятиминутных",
    },
  ])("keeps $file aligned with the 0.7.1 product and directory release", async ({ file, facts, obsolete }) => {
    const guide = await readRepositoryFile(file);

    for (const fact of facts) expect(guide).toContain(fact);
    expect(guide).not.toContain(obsolete);
  });
});

describe("active release documentation", () => {
  it.each([
    "docs/CONVERSATION_SUMMARY.md",
    "docs/superpowers/plans/2026-08-25-external-ship-model-pipeline.md",
    "docs/superpowers/specs/2026-08-25-external-ship-model-pipeline-design.md",
  ])("uses the real ship asset validation command in %s", async (file) => {
    const guide = await readRepositoryFile(file);

    expect(guide).toContain("npm run assets:ships:validate -- public/assets/ships");
    expect(guide).not.toContain("npm run assets:validate");
  });
});
