import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateShipAssetManifest,
} from "../src/render/shipAssetManifest.ts";
import type {
  ShipAssetManifest,
  ShipAssetValidationIssue,
} from "../src/render/shipAssetManifest.ts";

export interface ShipAssetPackageReport {
  directory: string;
  shipClassId?: string;
  valid: boolean;
  issues: ShipAssetValidationIssue[];
}

export interface ShipAssetRootReport {
  root: string;
  valid: boolean;
  packages: ShipAssetPackageReport[];
}

const issue = (code: string, path: string, message: string): ShipAssetValidationIssue => ({
  code,
  path,
  message,
  severity: "error",
});

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

async function validatePackage(directory: string): Promise<ShipAssetPackageReport> {
  const issues: ShipAssetValidationIssue[] = [];
  let input: unknown;
  try {
    input = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  } catch (error) {
    issues.push(issue(
      "manifest.unreadable",
      "manifest.json",
      error instanceof Error ? error.message : "Unable to read manifest.json.",
    ));
    return { directory: basename(directory), valid: false, issues };
  }

  const manifestResult = validateShipAssetManifest(input);
  issues.push(...manifestResult.issues);
  const manifest = manifestResult.manifest;
  if (manifest) {
    if (basename(directory) !== manifest.shipClassId) {
      issues.push(issue(
        "directory.ship-class-mismatch",
        "shipClassId",
        `Directory ${basename(directory)} does not match ${manifest.shipClassId}.`,
      ));
    }
    await validateLodFiles(directory, manifest, issues);
  }

  return {
    directory: basename(directory),
    shipClassId: typeof (input as Record<string, unknown>).shipClassId === "string"
      ? (input as Record<string, unknown>).shipClassId as string
      : undefined,
    valid: issues.every(({ severity }) => severity !== "error"),
    issues,
  };
}

async function validateLodFiles(
  directory: string,
  manifest: ShipAssetManifest,
  issues: ShipAssetValidationIssue[],
): Promise<void> {
  for (const lod of manifest.lods) {
    const filePath = join(directory, lod.file);
    let data: Uint8Array;
    try {
      data = await readFile(filePath);
    } catch {
      issues.push(issue("file.missing", lod.file, `Missing ${lod.file}.`));
      continue;
    }
    if (sha256(data) !== lod.sha256.toLowerCase()) {
      issues.push(issue(
        "file.checksum-mismatch",
        lod.file,
        `${lod.file} does not match its declared SHA-256.`,
      ));
    }
  }
}

export async function validateShipAssetRoot(root: string): Promise<ShipAssetRootReport> {
  const absoluteRoot = resolve(root);
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(absoluteRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
  const packages = await Promise.all(directories.map(validatePackage));
  return {
    root: absoluteRoot,
    valid: packages.every(({ valid }) => valid),
    packages,
  };
}

export async function runShipAssetValidationCli(
  args: string[],
  write: (output: string) => void = console.log,
): Promise<number> {
  const report = await validateShipAssetRoot(args[0] ?? "public/assets/ships");
  write(JSON.stringify(report, null, 2));
  return report.valid ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await runShipAssetValidationCli(process.argv.slice(2));
}
