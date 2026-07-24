export type TorpedoId = "mk-ix" | "g7a-t1" | "mk-15-mod-3" | "type-93-mod-3";

export interface TorpedoDefinition {
  id: TorpedoId;
  name: string;
  shortLabel: string;
  caliberMm: number;
  speedMetersPerSecond: number;
  reloadSeconds: number;
  damage: number;
  armingDistanceMeters: number;
  maximumRangeMeters: number;
  detectionRangeMeters: number;
  storageRiskMultiplier: number;
}

export const TORPEDO_DEFINITIONS: Record<TorpedoId, TorpedoDefinition> = {
  "mk-ix": {
    id: "mk-ix",
    name: "21英寸 Mk IX鱼雷",
    shortLabel: "Mk IX",
    caliberMm: 533,
    speedMetersPerSecond: 26,
    reloadSeconds: 42,
    damage: 145,
    armingDistanceMeters: 120,
    maximumRangeMeters: 3_500,
    detectionRangeMeters: 500,
    storageRiskMultiplier: 1,
  },
  "g7a-t1": {
    id: "g7a-t1",
    name: "G7a T1蒸汽瓦斯鱼雷",
    shortLabel: "G7a T1",
    caliberMm: 533,
    speedMetersPerSecond: 27,
    reloadSeconds: 45,
    damage: 152,
    armingDistanceMeters: 130,
    maximumRangeMeters: 4_000,
    detectionRangeMeters: 650,
    storageRiskMultiplier: 1.04,
  },
  "mk-15-mod-3": {
    id: "mk-15-mod-3",
    name: "Mk 15 Mod 3鱼雷",
    shortLabel: "Mk 15 Mod 3",
    caliberMm: 533,
    speedMetersPerSecond: 28,
    reloadSeconds: 40,
    damage: 164,
    armingDistanceMeters: 120,
    maximumRangeMeters: 3_800,
    detectionRangeMeters: 520,
    storageRiskMultiplier: 1.07,
  },
  "type-93-mod-3": {
    id: "type-93-mod-3",
    name: "九三式三型氧气鱼雷",
    shortLabel: "九三式三型",
    caliberMm: 610,
    speedMetersPerSecond: 29,
    reloadSeconds: 52,
    damage: 188,
    armingDistanceMeters: 160,
    maximumRangeMeters: 4_800,
    detectionRangeMeters: 360,
    storageRiskMultiplier: 1.12,
  },
};

export const DEFAULT_TORPEDO_ID: TorpedoId = "mk-ix";

export function getTorpedo(id: TorpedoId): TorpedoDefinition {
  return TORPEDO_DEFINITIONS[id] ?? TORPEDO_DEFINITIONS[DEFAULT_TORPEDO_ID];
}
