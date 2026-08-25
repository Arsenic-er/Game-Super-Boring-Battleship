import type { ShipClassId } from "../ships/classes";
import type { ShipAssetManifest, ShipLodLevel } from "./shipAssetManifest";
import { selectShipLod, type ShipModelRegistry, type ShipVisualQuality } from "./shipModelRegistry";

export interface ShipModelLoadRequest<T> {
  registry: ShipModelRegistry;
  shipClassId: ShipClassId;
  quality: ShipVisualQuality;
  distanceMeters: number;
  loader: (baseUrl: string, file: string, manifest: ShipAssetManifest) => Promise<T>;
  fallback: () => T;
}

export type ShipModelLoadResult<T> =
  | { source: "external"; model: T; lod: ShipLodLevel }
  | { source: "procedural"; model: T; error?: unknown };

export async function loadRegisteredShipModel<T>(
  request: ShipModelLoadRequest<T>,
): Promise<ShipModelLoadResult<T>> {
  const registration = request.registry.get(request.shipClassId);
  if (!registration) {
    return { source: "procedural", model: request.fallback() };
  }

  const lod = selectShipLod(request.quality, request.distanceMeters);
  const file = registration.manifest.lods.find((entry) => entry.level === lod)?.file;
  if (!file) {
    return {
      source: "procedural",
      model: request.fallback(),
      error: new Error(`LOD${lod} is missing for ${request.shipClassId}.`),
    };
  }

  try {
    return {
      source: "external",
      model: await request.loader(registration.baseUrl, file, registration.manifest),
      lod,
    };
  } catch (error) {
    return { source: "procedural", model: request.fallback(), error };
  }
}
