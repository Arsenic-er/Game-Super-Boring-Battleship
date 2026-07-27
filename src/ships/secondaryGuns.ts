export type SecondaryGunId =
  | "sideGun-common"
  | "sideGun-purple"
  | "sideGun-gold"
  | "sideGun-redGold";

export interface SecondaryGunDefinition {
  id: SecondaryGunId;
  shortLabel: string;
  caliberMm: number;
  damage: number;
  reloadSeconds: number;
  maximumRangeMeters: number;
  muzzleVelocity: number;
  dispersionMultiplier: number;
  traverseRadiansPerSecond: number;
}

const degrees = (value: number): number => value * Math.PI / 180;

/**
 * Gameplay-compressed surface-battery values. Historical calibres and model
 * identities are retained, while range and damage are tuned for a 10-minute
 * single-player battle rather than presented as archival firing-table data.
 */
export const SECONDARY_GUNS: Record<SecondaryGunId, SecondaryGunDefinition> = {
  "sideGun-common": {
    id: "sideGun-common",
    shortLabel: "10.5cm SK C/33",
    caliberMm: 105,
    damage: 32,
    reloadSeconds: 6,
    maximumRangeMeters: 4_300,
    muzzleVelocity: 900,
    dispersionMultiplier: 1.65,
    traverseRadiansPerSecond: degrees(16),
  },
  "sideGun-purple": {
    id: "sideGun-purple",
    shortLabel: "QF 5.25in Mk I",
    caliberMm: 133,
    damage: 44,
    reloadSeconds: 7.2,
    maximumRangeMeters: 4_600,
    muzzleVelocity: 792,
    dispersionMultiplier: 1.45,
    traverseRadiansPerSecond: degrees(10),
  },
  "sideGun-gold": {
    id: "sideGun-gold",
    shortLabel: "15cm SK C/28",
    caliberMm: 150,
    damage: 56,
    reloadSeconds: 7.5,
    maximumRangeMeters: 5_200,
    muzzleVelocity: 875,
    dispersionMultiplier: 1.3,
    traverseRadiansPerSecond: degrees(8),
  },
  "sideGun-redGold": {
    id: "sideGun-redGold",
    shortLabel: "6in/47 Mk 16",
    caliberMm: 152,
    damage: 48,
    reloadSeconds: 5.5,
    maximumRangeMeters: 5_400,
    muzzleVelocity: 812,
    dispersionMultiplier: 1.18,
    traverseRadiansPerSecond: degrees(9),
  },
};

export function isSecondaryGunId(value: unknown): value is SecondaryGunId {
  return typeof value === "string" && value in SECONDARY_GUNS;
}

export function getSecondaryGun(id: SecondaryGunId): SecondaryGunDefinition {
  return SECONDARY_GUNS[id];
}
