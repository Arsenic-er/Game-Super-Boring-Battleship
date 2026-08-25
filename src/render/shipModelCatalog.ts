import {
  createShipModelRegistry,
  EMPTY_SHIP_MODEL_REGISTRY,
  type ShipModelRegistry,
  type ShipModelRegistryIssue,
  type ShipModelSource,
} from "./shipModelRegistry";

export const DEFAULT_SHIP_MODEL_CATALOG_URL = "/assets/ships/catalog.json";

export interface ShipModelCatalogLoadResult {
  registry: ShipModelRegistry;
  issues: readonly ShipModelRegistryIssue[];
}

export interface ShipCatalogResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export type ShipCatalogFetcher = (url: string) => Promise<ShipCatalogResponse>;

interface CatalogPackage {
  baseUrl: string;
  manifestUrl: string;
}

function parseCatalog(value: unknown): CatalogPackage[] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !Array.isArray(record.packages)) return undefined;
  const packages: CatalogPackage[] = [];
  for (const item of record.packages) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
    const packageRecord = item as Record<string, unknown>;
    if (typeof packageRecord.baseUrl !== "string" || typeof packageRecord.manifestUrl !== "string") return undefined;
    packages.push({ baseUrl: packageRecord.baseUrl, manifestUrl: packageRecord.manifestUrl });
  }
  return packages;
}

const browserFetch: ShipCatalogFetcher = async (url) => fetch(url);

export async function loadShipModelCatalog(
  fetcher: ShipCatalogFetcher = browserFetch,
  catalogUrl = DEFAULT_SHIP_MODEL_CATALOG_URL,
): Promise<ShipModelCatalogLoadResult> {
  try {
    const response = await fetcher(catalogUrl);
    if (!response.ok) throw new Error(`Catalog request failed: ${catalogUrl}`);
    const packages = parseCatalog(await response.json());
    if (!packages) {
      return {
        registry: EMPTY_SHIP_MODEL_REGISTRY,
        issues: [{ code: "catalog.invalid", path: catalogUrl, message: "Ship model catalog is invalid.", severity: "error" }],
      };
    }

    const sources: ShipModelSource[] = [];
    const issues: ShipModelRegistryIssue[] = [];
    for (const item of packages) {
      try {
        const manifestResponse = await fetcher(item.manifestUrl);
        if (!manifestResponse.ok) throw new Error(`Manifest request failed: ${item.manifestUrl}`);
        sources.push({ baseUrl: item.baseUrl, manifest: await manifestResponse.json() });
      } catch (error) {
        issues.push({
          code: "catalog.manifest-fetch-failed",
          path: item.manifestUrl,
          message: error instanceof Error ? error.message : "Unable to fetch ship manifest.",
          severity: "error",
        });
      }
    }
    const registry = createShipModelRegistry(sources);
    return { registry, issues: [...issues, ...registry.issues] };
  } catch (error) {
    return {
      registry: EMPTY_SHIP_MODEL_REGISTRY,
      issues: [{
        code: "catalog.fetch-failed",
        path: catalogUrl,
        message: error instanceof Error ? error.message : "Unable to fetch ship model catalog.",
        severity: "error",
      }],
    };
  }
}
