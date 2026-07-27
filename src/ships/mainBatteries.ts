import { GUN } from "../sim/config";
import type { MainGunId, MainGunVisualDefinition } from "./components";
import { getMainGun } from "./components";
import type { ShipClassId } from "./classes";

export interface MainBatteryMountDefinition {
  /** Position along the hull: +0.5 is the bow and -0.5 is the stern. */
  longitudinalFraction: number;
  barrelCount: 1 | 2 | 3 | 4;
}

export interface EffectiveMainBatteryDefinition {
  id: string;
  name: string;
  shortLabel: string;
  caliberMm: number;
  damagePerShell: number;
  reloadSeconds: number;
  traverseDegreesPerSecond: number;
  dispersionMultiplier: number;
  muzzleVelocity: number;
  maximumRangeMeters: number;
  mounts: MainBatteryMountDefinition[];
  visual: MainGunVisualDefinition;
}

interface HistoricalMainBatteryDefinition extends Omit<EffectiveMainBatteryDefinition, "mounts"> {
  mounts: readonly MainBatteryMountDefinition[];
}

const HISTORICAL_MAIN_BATTERIES: Partial<Record<ShipClassId, HistoricalMainBatteryDefinition>> = {
  cleveland: {
    id: "6in-47-mk16", name: "6-inch/47 Mk 16 三联装主炮", shortLabel: "4×3 152 mm Mk 16", caliberMm: 152,
    damagePerShell: 38.75, reloadSeconds: 6.8, traverseDegreesPerSecond: 10, dispersionMultiplier: 0.94,
    muzzleVelocity: 762, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .30, barrelCount: 3 }, { longitudinalFraction: .17, barrelCount: 3 }, { longitudinalFraction: -.17, barrelCount: 3 }, { longitudinalFraction: -.30, barrelCount: 3 }],
    visual: { barrelCount: 3, barrelLength: 10.2, barrelSpacing: .82, mountDiameter: 6.2, houseWidth: 6.8 },
  },
  edinburgh: {
    id: "6in-mkxxiii", name: "6-inch Mk XXIII 三联装主炮", shortLabel: "4×3 152 mm Mk XXIII", caliberMm: 152,
    damagePerShell: 37.5, reloadSeconds: 7.5, traverseDegreesPerSecond: 7, dispersionMultiplier: 1,
    muzzleVelocity: 841, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .30, barrelCount: 3 }, { longitudinalFraction: .17, barrelCount: 3 }, { longitudinalFraction: -.17, barrelCount: 3 }, { longitudinalFraction: -.30, barrelCount: 3 }],
    visual: { barrelCount: 3, barrelLength: 10.1, barrelSpacing: .82, mountDiameter: 6.2, houseWidth: 6.8 },
  },
  nurnberg: {
    id: "15cm-sk-c25", name: "15 cm SK C/25 三联装主炮", shortLabel: "3×3 150 mm SK C/25", caliberMm: 150,
    damagePerShell: 46.67, reloadSeconds: 7.5, traverseDegreesPerSecond: 8, dispersionMultiplier: 0.9,
    muzzleVelocity: 960, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .29, barrelCount: 3 }, { longitudinalFraction: -.18, barrelCount: 3 }, { longitudinalFraction: -.30, barrelCount: 3 }],
    visual: { barrelCount: 3, barrelLength: 10.1, barrelSpacing: .8, mountDiameter: 6, houseWidth: 6.6 },
  },
  agano: {
    id: "15cm-41st-year", name: "四十一年式 15 cm 双联装主炮", shortLabel: "3×2 152 mm 四十一年式", caliberMm: 152,
    damagePerShell: 60, reloadSeconds: 10, traverseDegreesPerSecond: 6, dispersionMultiplier: 1.02,
    muzzleVelocity: 850, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .29, barrelCount: 2 }, { longitudinalFraction: -.17, barrelCount: 2 }, { longitudinalFraction: -.29, barrelCount: 2 }],
    visual: { barrelCount: 2, barrelLength: 10.1, barrelSpacing: 1.0, mountDiameter: 5.8, houseWidth: 6.1 },
  },
  dido: {
    id: "qf-5.25-mki", name: "QF 5.25-inch Mk I 双联装主炮", shortLabel: "5×2 133 mm Mk I", caliberMm: 133,
    damagePerShell: 36, reloadSeconds: 8, traverseDegreesPerSecond: 10, dispersionMultiplier: 1.04,
    muzzleVelocity: 814, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .31, barrelCount: 2 }, { longitudinalFraction: .20, barrelCount: 2 }, { longitudinalFraction: .09, barrelCount: 2 }, { longitudinalFraction: -.19, barrelCount: 2 }, { longitudinalFraction: -.30, barrelCount: 2 }],
    visual: { barrelCount: 2, barrelLength: 9.4, barrelSpacing: .92, mountDiameter: 5.5, houseWidth: 5.8 },
  },
  "north-carolina": {
    id: "16in-45-mk6", name: "16-inch/45 Mk 6 三联装主炮", shortLabel: "3×3 406 mm Mk 6", caliberMm: 406,
    damagePerShell: 150, reloadSeconds: 30, traverseDegreesPerSecond: 4, dispersionMultiplier: 0.94,
    muzzleVelocity: 701, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .28, barrelCount: 3 }, { longitudinalFraction: .15, barrelCount: 3 }, { longitudinalFraction: -.25, barrelCount: 3 }],
    visual: { barrelCount: 3, barrelLength: 13.5, barrelSpacing: 1.18, mountDiameter: 8.2, houseWidth: 9.1 },
  },
  "king-george-v": {
    id: "bl-14in-mkvii", name: "BL 14-inch Mk VII 主炮", shortLabel: "4+2+4 356 mm Mk VII", caliberMm: 356,
    damagePerShell: 132, reloadSeconds: 30, traverseDegreesPerSecond: 2, dispersionMultiplier: 1,
    muzzleVelocity: 757, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .28, barrelCount: 4 }, { longitudinalFraction: .15, barrelCount: 2 }, { longitudinalFraction: -.25, barrelCount: 4 }],
    visual: { barrelCount: 4, barrelLength: 13, barrelSpacing: 1.08, mountDiameter: 8.5, houseWidth: 9.6 },
  },
  bismarck: {
    id: "38cm-sk-c34", name: "38 cm SK C/34 双联装主炮", shortLabel: "4×2 380 mm SK C/34", caliberMm: 380,
    damagePerShell: 160, reloadSeconds: 25, traverseDegreesPerSecond: 5, dispersionMultiplier: 0.96,
    muzzleVelocity: 820, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .29, barrelCount: 2 }, { longitudinalFraction: .16, barrelCount: 2 }, { longitudinalFraction: -.16, barrelCount: 2 }, { longitudinalFraction: -.29, barrelCount: 2 }],
    visual: { barrelCount: 2, barrelLength: 13.2, barrelSpacing: 1.35, mountDiameter: 8, houseWidth: 8.8 },
  },
  yamato: {
    id: "type-94-46cm", name: "九四式 46 cm 三联装主炮", shortLabel: "3×3 460 mm 九四式", caliberMm: 460,
    damagePerShell: 188.89, reloadSeconds: 35, traverseDegreesPerSecond: 3, dispersionMultiplier: 1.02,
    muzzleVelocity: 780, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .28, barrelCount: 3 }, { longitudinalFraction: .15, barrelCount: 3 }, { longitudinalFraction: -.25, barrelCount: 3 }],
    visual: { barrelCount: 3, barrelLength: 14.5, barrelSpacing: 1.35, mountDiameter: 9.2, houseWidth: 10.2 },
  },
  richelieu: {
    id: "380mm-45-mle1935", name: "380 mm/45 Mle 1935 四联装主炮", shortLabel: "2×4 380 mm Mle 1935", caliberMm: 380,
    damagePerShell: 177.5, reloadSeconds: 40, traverseDegreesPerSecond: 5, dispersionMultiplier: 1.12,
    muzzleVelocity: 830, maximumRangeMeters: 5_000,
    mounts: [{ longitudinalFraction: .29, barrelCount: 4 }, { longitudinalFraction: .15, barrelCount: 4 }],
    visual: { barrelCount: 4, barrelLength: 13.4, barrelSpacing: 1.05, mountDiameter: 8.8, houseWidth: 10 },
  },
};

const UPGRADE_MODIFIERS: Record<MainGunId, {
  damage: number; reload: number; traverse: number; dispersion: number; velocity: number;
}> = {
  "mk1-single": { damage: 1, reload: 1, traverse: 1, dispersion: 1, velocity: 1 },
  "mk2-twin": { damage: 1.04, reload: 1.04, traverse: .96, dispersion: 1.05, velocity: 1.01 },
  "mk3-twin": { damage: 1.08, reload: .96, traverse: 1.02, dispersion: .97, velocity: 1.02 },
  "mk4-twin": { damage: 1.12, reload: .92, traverse: 1.06, dispersion: .92, velocity: 1.04 },
};

const HISTORICAL_UPGRADE_LABELS: Record<MainGunId, string> = {
  "mk1-single": "标准炮术配置",
  "mk2-twin": "改进炮闩组件",
  "mk3-twin": "强化扬弹组件",
  "mk4-twin": "精密火控组件",
};

function genericMounts(count: number, barrelCount: 1 | 2 | 3 | 4): MainBatteryMountDefinition[] {
  const safeCount = Math.max(1, count);
  return Array.from({ length: safeCount }, (_, index) => ({
    longitudinalFraction: safeCount === 1 ? .28 : .30 - index * (.62 / (safeCount - 1)),
    barrelCount,
  }));
}

export function getMainBattery(
  shipClassId: ShipClassId,
  upgradeId: MainGunId,
  equippedMounts: number,
): EffectiveMainBatteryDefinition {
  const historical = HISTORICAL_MAIN_BATTERIES[shipClassId];
  if (!historical) {
    const gun = getMainGun(upgradeId);
    return {
      id: gun.id,
      name: gun.name,
      shortLabel: gun.shortLabel,
      caliberMm: 127,
      damagePerShell: gun.damage / gun.visual.barrelCount,
      reloadSeconds: gun.reloadSeconds,
      traverseDegreesPerSecond: gun.traverseDegreesPerSecond,
      dispersionMultiplier: gun.dispersionMultiplier,
      muzzleVelocity: gun.muzzleVelocity,
      maximumRangeMeters: GUN.maxAimRange,
      mounts: genericMounts(equippedMounts, gun.visual.barrelCount),
      visual: gun.visual,
    };
  }
  const modifier = UPGRADE_MODIFIERS[upgradeId];
  const mountCount = Math.max(1, Math.min(equippedMounts, historical.mounts.length));
  return {
    ...historical,
    id: `${historical.id}:${upgradeId}`,
    shortLabel: `${historical.shortLabel} · ${HISTORICAL_UPGRADE_LABELS[upgradeId]}`,
    damagePerShell: historical.damagePerShell * modifier.damage,
    reloadSeconds: historical.reloadSeconds * modifier.reload,
    traverseDegreesPerSecond: historical.traverseDegreesPerSecond * modifier.traverse,
    dispersionMultiplier: historical.dispersionMultiplier * modifier.dispersion,
    muzzleVelocity: historical.muzzleVelocity * modifier.velocity,
    mounts: historical.mounts.slice(0, mountCount),
  };
}

export function mainBatteryBarrelCount(definition: EffectiveMainBatteryDefinition): number {
  return definition.mounts.reduce((total, mount) => total + mount.barrelCount, 0);
}
