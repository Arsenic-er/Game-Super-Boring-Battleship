import type { ShipClassId } from "../ships/classes";

export const SHIP_ASSET_SCHEMA_VERSION = 1 as const;

export const REQUIRED_SHIP_HARDPOINTS = [
  "HP_MAIN_FWD_01",
  "HP_MAIN_AFT_01",
  "HP_TORPEDO_CENTER_01",
  "HP_AA_PORT_01",
  "HP_AA_STARBOARD_01",
  "HP_BRIDGE_01",
  "HP_MAST_01",
  "FX_FUNNEL_01",
  "FX_WAKE_PORT",
  "FX_WAKE_STARBOARD",
  "FX_DAMAGE_BOW",
  "FX_DAMAGE_ENGINE",
  "FX_DAMAGE_STERN",
] as const;

export type ShipHardpointName = typeof REQUIRED_SHIP_HARDPOINTS[number];
export type ShipLodLevel = 0 | 1 | 2;
export type ShipCollisionZone = "bow" | "central" | "bridge" | "machinery" | "magazine" | "stern";

export interface ShipAssetCoordinateSystem {
  units: "meters";
  up: "+Y";
  bow: "+Z";
  origin: "waterline-center";
  rootScale: 1;
  rootRotation: [0, 0, 0];
}

export interface ShipAssetProvenance {
  creator: string;
  sourceUrl: string;
  licenseId: string;
  redistributionAllowed: true;
  downloadedAt: string;
  sha256: string;
  modifications: string[];
}

export interface ShipAssetLod {
  level: ShipLodLevel;
  file: string;
  sha256: string;
  triangles: number;
  materials: number;
  maxTextureSize: number;
}

export interface ShipCollisionVolume {
  nodeName: string;
  zone: ShipCollisionZone;
  center: [number, number, number];
  size: [number, number, number];
}

export interface ShipAssetManifest {
  schemaVersion: typeof SHIP_ASSET_SCHEMA_VERSION;
  shipClassId: ShipClassId;
  displayName: string;
  coordinateSystem: ShipAssetCoordinateSystem;
  provenance: ShipAssetProvenance;
  lods: [ShipAssetLod, ShipAssetLod, ShipAssetLod];
  hardpoints: string[];
  renderNodes: string[];
  collisionVolumes: ShipCollisionVolume[];
}

export interface ShipAssetValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ShipAssetValidationResult {
  valid: boolean;
  issues: ShipAssetValidationIssue[];
  manifest?: ShipAssetManifest;
}

const LOD_BUDGETS: Record<ShipLodLevel, {
  triangles: number;
  materials: number;
  maxTextureSize: number;
}> = {
  0: { triangles: 45_000, materials: 6, maxTextureSize: 1024 },
  1: { triangles: 15_000, materials: 4, maxTextureSize: 1024 },
  2: { triangles: 4_000, materials: 2, maxTextureSize: 512 },
};

const COLLISION_ZONES = new Set<ShipCollisionZone>([
  "bow", "central", "bridge", "machinery", "magazine", "stern",
]);

const PLAYABLE_SHIP_CLASSES = new Set<ShipClassId>([
  "fletcher", "j-class", "kagero", "type-1936a", "tashkent",
  "cleveland", "edinburgh", "nurnberg", "agano", "dido",
  "north-carolina", "king-george-v", "bismarck", "yamato", "richelieu",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const isFiniteTuple3 = (value: unknown, positive = false): value is [number, number, number] => (
  Array.isArray(value)
  && value.length === 3
  && value.every((item) => typeof item === "number" && Number.isFinite(item) && (!positive || item > 0))
);

export function validateShipAssetManifest(input: unknown): ShipAssetValidationResult {
  const issues: ShipAssetValidationIssue[] = [];
  const error = (code: string, path: string, message: string): void => {
    issues.push({ code, path, message, severity: "error" });
  };

  if (!isRecord(input)) {
    error("manifest.object-required", "$", "Ship asset manifest must be an object.");
    return { valid: false, issues };
  }

  if (input.schemaVersion !== SHIP_ASSET_SCHEMA_VERSION) {
    error("schema.unsupported", "schemaVersion", `Expected schema version ${SHIP_ASSET_SCHEMA_VERSION}.`);
  }
  if (typeof input.shipClassId !== "string" || !PLAYABLE_SHIP_CLASSES.has(input.shipClassId as ShipClassId)) {
    error("ship-class.unknown", "shipClassId", "shipClassId must name a playable ship class.");
  }
  if (typeof input.displayName !== "string" || input.displayName.trim().length === 0) {
    error("display-name.required", "displayName", "displayName is required.");
  }

  const coordinate = input.coordinateSystem;
  if (!isRecord(coordinate)
    || coordinate.units !== "meters"
    || coordinate.up !== "+Y"
    || coordinate.bow !== "+Z"
    || coordinate.origin !== "waterline-center"
    || coordinate.rootScale !== 1
    || !isFiniteTuple3(coordinate.rootRotation)
    || coordinate.rootRotation.some((value) => value !== 0)) {
    error(
      "coordinates.invalid",
      "coordinateSystem",
      "Coordinates must use metres, +Y up, +Z bow, waterline-centre origin, unit scale and zero root rotation.",
    );
  }

  const provenance = input.provenance;
  if (!isRecord(provenance)) {
    error("provenance.required", "provenance", "Traceable provenance is required.");
  } else {
    if (typeof provenance.creator !== "string" || provenance.creator.trim().length === 0) {
      error("provenance.creator-required", "provenance.creator", "A creator is required.");
    }
    if (typeof provenance.sourceUrl !== "string" || !/^https:\/\/.+/i.test(provenance.sourceUrl)) {
      error("provenance.source-required", "provenance.sourceUrl", "An HTTPS source URL is required.");
    }
    if (typeof provenance.licenseId !== "string" || provenance.licenseId.trim().length === 0) {
      error("provenance.license-required", "provenance.licenseId", "A redistribution licence is required.");
    }
    if (provenance.redistributionAllowed !== true) {
      error(
        "provenance.redistribution-required",
        "provenance.redistributionAllowed",
        "The licence must explicitly permit redistribution.",
      );
    }
    if (typeof provenance.downloadedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(provenance.downloadedAt)) {
      error("provenance.date-required", "provenance.downloadedAt", "Download date must use YYYY-MM-DD.");
    }
    if (typeof provenance.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(provenance.sha256)) {
      error("provenance.sha256-required", "provenance.sha256", "A SHA-256 checksum is required.");
    }
    if (!Array.isArray(provenance.modifications)
      || !provenance.modifications.every((item) => typeof item === "string")) {
      error("provenance.modifications-required", "provenance.modifications", "Modification history must be a string list.");
    }
  }

  const lods = input.lods;
  if (!Array.isArray(lods)) {
    error("lod.list-required", "lods", "LOD0, LOD1 and LOD2 are required.");
  } else {
    for (const level of [0, 1, 2] as const) {
      const matching = lods.filter((lod) => isRecord(lod) && lod.level === level);
      if (matching.length !== 1) {
        error("lod.level-required", `lods.${level}`, `Exactly one LOD${level} entry is required.`);
        continue;
      }
      const lod = matching[0]!;
      const budget = LOD_BUDGETS[level];
      if (typeof lod.file !== "string" || !/^lod[0-2]\.glb$/i.test(lod.file)) {
        error("lod.glb-required", `lods.${level}.file`, `LOD${level} must reference a binary .glb file.`);
      }
      if (typeof lod.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(lod.sha256)) {
        error("lod.sha256-required", `lods.${level}.sha256`, `LOD${level} requires a SHA-256 checksum.`);
      }
      if (!Number.isInteger(lod.triangles) || (lod.triangles as number) <= 0) {
        error("lod.triangles-invalid", `lods.${level}.triangles`, "Triangle count must be a positive integer.");
      } else if ((lod.triangles as number) > budget.triangles) {
        error("lod.triangle-budget", `lods.${level}.triangles`, `LOD${level} exceeds ${budget.triangles} triangles.`);
      }
      if (!Number.isInteger(lod.materials) || (lod.materials as number) <= 0) {
        error("lod.materials-invalid", `lods.${level}.materials`, "Material count must be a positive integer.");
      } else if ((lod.materials as number) > budget.materials) {
        error("lod.material-budget", `lods.${level}.materials`, `LOD${level} exceeds ${budget.materials} materials.`);
      }
      if (!Number.isInteger(lod.maxTextureSize) || (lod.maxTextureSize as number) <= 0) {
        error("lod.texture-size-invalid", `lods.${level}.maxTextureSize`, "Texture size must be a positive integer.");
      } else if ((lod.maxTextureSize as number) > budget.maxTextureSize) {
        error("lod.texture-budget", `lods.${level}.maxTextureSize`, `LOD${level} exceeds ${budget.maxTextureSize}px textures.`);
      }
    }
  }

  const hardpoints = input.hardpoints;
  if (!Array.isArray(hardpoints) || !hardpoints.every((name) => typeof name === "string")) {
    error("hardpoint.list-required", "hardpoints", "Hardpoints must be a string list.");
  } else {
    const unique = new Set(hardpoints);
    if (unique.size !== hardpoints.length) {
      error("hardpoint.duplicate", "hardpoints", "Hardpoint names must be unique.");
    }
    for (const required of REQUIRED_SHIP_HARDPOINTS) {
      if (!unique.has(required)) {
        error("hardpoint.required", "hardpoints", `Missing required hardpoint ${required}.`);
      }
    }
  }

  const renderNodes = input.renderNodes;
  const renderNodeSet = new Set(
    Array.isArray(renderNodes)
      ? renderNodes.filter((node): node is string => typeof node === "string")
      : [],
  );
  if (!Array.isArray(renderNodes) || renderNodeSet.size !== renderNodes.length || renderNodeSet.size === 0) {
    error("render-nodes.invalid", "renderNodes", "Visible render nodes must be a non-empty unique string list.");
  }

  const collisions = input.collisionVolumes;
  if (!Array.isArray(collisions) || collisions.length === 0) {
    error("collision.required", "collisionVolumes", "At least one independent collision volume is required.");
  } else {
    const collisionNames = new Set<string>();
    collisions.forEach((volume, index) => {
      const path = `collisionVolumes.${index}`;
      if (!isRecord(volume)) {
        error("collision.invalid", path, "Collision volume must be an object.");
        return;
      }
      if (typeof volume.nodeName !== "string" || volume.nodeName.trim().length === 0) {
        error("collision.name-required", `${path}.nodeName`, "Collision nodeName is required.");
      } else {
        if (collisionNames.has(volume.nodeName)) {
          error("collision.duplicate", `${path}.nodeName`, "Collision node names must be unique.");
        }
        collisionNames.add(volume.nodeName);
        if (renderNodeSet.has(volume.nodeName)) {
          error(
            "collision.render-node-alias",
            `${path}.nodeName`,
            "A visual render node cannot also serve as a collision volume.",
          );
        }
      }
      if (typeof volume.zone !== "string" || !COLLISION_ZONES.has(volume.zone as ShipCollisionZone)) {
        error("collision.zone-invalid", `${path}.zone`, "Collision zone is not recognised.");
      }
      if (!isFiniteTuple3(volume.center)) {
        error("collision.center-invalid", `${path}.center`, "Collision centre must contain three finite numbers.");
      }
      if (!isFiniteTuple3(volume.size, true)) {
        error("collision.size-invalid", `${path}.size`, "Collision size must contain three positive finite numbers.");
      }
    });
  }

  const valid = issues.every((issue) => issue.severity !== "error");
  return valid
    ? { valid: true, issues, manifest: input as unknown as ShipAssetManifest }
    : { valid: false, issues };
}
