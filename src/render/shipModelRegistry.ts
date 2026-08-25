import type { ShipClassId } from "../ships/classes";
import {
  validateShipAssetManifest,
  type ShipAssetManifest,
  type ShipAssetValidationIssue,
  type ShipLodLevel,
} from "./shipAssetManifest";

export type ShipVisualQuality = "low" | "medium";

export interface ShipModelSource {
  baseUrl: string;
  manifest: unknown;
}

export interface RegisteredShipModel {
  baseUrl: string;
  manifest: ShipAssetManifest;
}

export interface ShipModelRegistryIssue extends ShipAssetValidationIssue {
  shipClassId?: string;
}

export interface ShipModelRegistry {
  readonly issues: readonly ShipModelRegistryIssue[];
  get(shipClassId: ShipClassId): RegisteredShipModel | undefined;
  has(shipClassId: ShipClassId): boolean;
  entries(): IterableIterator<[ShipClassId, RegisteredShipModel]>;
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function createShipModelRegistry(sources: readonly ShipModelSource[]): ShipModelRegistry {
  const registrations = new Map<ShipClassId, RegisteredShipModel>();
  const issues: ShipModelRegistryIssue[] = [];

  for (const source of sources) {
    const validation = validateShipAssetManifest(source.manifest);
    if (!validation.valid || !validation.manifest) {
      issues.push(...validation.issues);
      continue;
    }

    const shipClassId = validation.manifest.shipClassId;
    if (registrations.has(shipClassId)) {
      issues.push({
        code: "registry.duplicate-class",
        path: shipClassId,
        message: `A ship model is already registered for ${shipClassId}.`,
        severity: "error",
        shipClassId,
      });
      continue;
    }

    registrations.set(shipClassId, {
      baseUrl: normalizedBaseUrl(source.baseUrl),
      manifest: validation.manifest,
    });
  }

  return {
    issues,
    get: (shipClassId) => registrations.get(shipClassId),
    has: (shipClassId) => registrations.has(shipClassId),
    entries: () => registrations.entries(),
  };
}

export function selectShipLod(quality: ShipVisualQuality, distanceMeters: number): ShipLodLevel {
  if (quality === "low") return 2;
  return Math.max(0, distanceMeters) < 1_800 ? 1 : 2;
}

export const EMPTY_SHIP_MODEL_REGISTRY = createShipModelRegistry([]);
