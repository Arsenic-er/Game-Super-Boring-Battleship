import type { ShellPenetrationProfile, ShipState } from "../sim/types";
import type { MainGunId, MainGunVisualDefinition } from "./components";
import { getMainGun } from "./components";
import type { ShipClassId } from "./classes";

export const MAIN_BATTERY_MODEL_LENGTH = 112;
export const MAIN_BATTERY_MODEL_BEAM = 11;
export const MAIN_BATTERY_DECK_HEIGHT = 6.05;
export const MAIN_BATTERY_SUPERFIRING_HEIGHT = 7.65;
export const MAIN_BATTERY_CRADLE_HEIGHT = 1.45;

export interface MainBatteryMountDefinition {
  /** Position along the hull: +0.5 is the bow and -0.5 is the stern. */
  longitudinalFraction: number;
  /** Position across the hull: positive values are starboard. */
  lateralFraction: number;
  /** Unscaled vertical hardpoint in the shared 112 m hull model. */
  localHeight: number;
  barrelCount: 1 | 2 | 3 | 4;
}

export interface MainBatteryLocalPosition {
  x: number;
  y: number;
  z: number;
}

export const mainBatteryMountLocalPosition = (
  mount: MainBatteryMountDefinition,
): MainBatteryLocalPosition => ({
  x: mount.lateralFraction * MAIN_BATTERY_MODEL_BEAM,
  y: mount.localHeight,
  z: mount.longitudinalFraction * MAIN_BATTERY_MODEL_LENGTH,
});

export const mainBatteryMuzzleLocalHeight = (mount: MainBatteryMountDefinition): number =>
  mount.localHeight + MAIN_BATTERY_CRADLE_HEIGHT;

function batteryMount(
  longitudinalFraction: number,
  barrelCount: 1 | 2 | 3 | 4,
  localHeight = MAIN_BATTERY_DECK_HEIGHT,
  lateralFraction = 0,
): MainBatteryMountDefinition {
  return { longitudinalFraction, lateralFraction, localHeight, barrelCount };
}

/**
 * Turrets forward of amidships rest toward the bow; aft turrets rest toward
 * the stern. Both retain a 35 degree safety cone over the ship behind them.
 */
export function mainBatteryMountRestHeading(mount: MainBatteryMountDefinition): number {
  return mount.longitudinalFraction >= 0 ? 0 : Math.PI;
}

export const MAIN_BATTERY_TRAVERSE_LIMIT_RADIANS = 145 * Math.PI / 180;

/**
 * Compressed fire-control envelopes for the current 5 km battle space.
 * The ordering follows each historical battery's practical reach while
 * keeping shell flight times and the ten-minute single-player loop readable.
 */
export const MAIN_BATTERY_MAXIMUM_RANGE_METERS: Readonly<Record<ShipClassId, number>> = {
  fletcher: 3_850,
  "j-class": 3_650,
  kagero: 3_750,
  "type-1936a": 4_050,
  tashkent: 4_250,
  cleveland: 4_100,
  edinburgh: 4_250,
  nurnberg: 4_400,
  agano: 3_950,
  dido: 4_000,
  "north-carolina": 4_700,
  "king-george-v": 4_800,
  bismarck: 4_850,
  yamato: 5_000,
  richelieu: 4_950,
};

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
  shellProfile: ShellPenetrationProfile;
  mounts: MainBatteryMountDefinition[];
  visual: MainGunVisualDefinition;
}

interface HistoricalMainBatteryDefinition extends Omit<EffectiveMainBatteryDefinition, "mounts" | "shellProfile"> {
  mounts: readonly MainBatteryMountDefinition[];
}

const HISTORICAL_MAIN_BATTERIES: Partial<Record<ShipClassId, HistoricalMainBatteryDefinition>> = {
  cleveland: {
    id: "6in-47-mk16", name: "6-inch/47 Mk 16 三联装主炮", shortLabel: "4×3 152 mm Mk 16", caliberMm: 152,
    damagePerShell: 38.75, reloadSeconds: 6.8, traverseDegreesPerSecond: 10, dispersionMultiplier: 0.94,
    muzzleVelocity: 762, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.cleveland,
    mounts: [batteryMount(.30, 3), batteryMount(.17, 3, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.17, 3, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.30, 3)],
    visual: { barrelCount: 3, barrelLength: 10.2, barrelSpacing: .82, mountDiameter: 6.2, houseWidth: 6.8 },
  },
  edinburgh: {
    id: "6in-mkxxiii", name: "6-inch Mk XXIII 三联装主炮", shortLabel: "4×3 152 mm Mk XXIII", caliberMm: 152,
    damagePerShell: 37.5, reloadSeconds: 7.5, traverseDegreesPerSecond: 7, dispersionMultiplier: 1,
    muzzleVelocity: 841, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.edinburgh,
    mounts: [batteryMount(.30, 3), batteryMount(.17, 3, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.17, 3, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.30, 3)],
    visual: { barrelCount: 3, barrelLength: 10.1, barrelSpacing: .82, mountDiameter: 6.2, houseWidth: 6.8 },
  },
  nurnberg: {
    id: "15cm-sk-c25", name: "15 cm SK C/25 三联装主炮", shortLabel: "3×3 150 mm SK C/25", caliberMm: 150,
    damagePerShell: 46.67, reloadSeconds: 7.5, traverseDegreesPerSecond: 8, dispersionMultiplier: 0.9,
    muzzleVelocity: 960, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.nurnberg,
    mounts: [batteryMount(.29, 3), batteryMount(-.18, 3, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.30, 3)],
    visual: { barrelCount: 3, barrelLength: 10.1, barrelSpacing: .8, mountDiameter: 6, houseWidth: 6.6 },
  },
  agano: {
    id: "15cm-41st-year", name: "四十一年式 15 cm 双联装主炮", shortLabel: "3×2 152 mm 四十一年式", caliberMm: 152,
    damagePerShell: 60, reloadSeconds: 10, traverseDegreesPerSecond: 6, dispersionMultiplier: 1.02,
    muzzleVelocity: 850, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.agano,
    mounts: [batteryMount(.29, 2), batteryMount(-.17, 2, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.29, 2)],
    visual: { barrelCount: 2, barrelLength: 10.1, barrelSpacing: 1.0, mountDiameter: 5.8, houseWidth: 6.1 },
  },
  dido: {
    id: "qf-5.25-mki", name: "QF 5.25-inch Mk I 双联装主炮", shortLabel: "5×2 133 mm Mk I", caliberMm: 133,
    damagePerShell: 36, reloadSeconds: 8, traverseDegreesPerSecond: 10, dispersionMultiplier: 1.04,
    muzzleVelocity: 814, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.dido,
    mounts: [batteryMount(.31, 2), batteryMount(.20, 2, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(.09, 2), batteryMount(-.19, 2, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.30, 2)],
    visual: { barrelCount: 2, barrelLength: 9.4, barrelSpacing: .92, mountDiameter: 5.5, houseWidth: 5.8 },
  },
  "north-carolina": {
    id: "16in-45-mk6", name: "16-inch/45 Mk 6 三联装主炮", shortLabel: "3×3 406 mm Mk 6", caliberMm: 406,
    damagePerShell: 150, reloadSeconds: 30, traverseDegreesPerSecond: 4, dispersionMultiplier: 0.94,
    muzzleVelocity: 701, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS["north-carolina"],
    mounts: [batteryMount(.28, 3), batteryMount(.15, 3, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.25, 3)],
    visual: { barrelCount: 3, barrelLength: 13.5, barrelSpacing: 1.18, mountDiameter: 8.2, houseWidth: 9.1 },
  },
  "king-george-v": {
    id: "bl-14in-mkvii", name: "BL 14-inch Mk VII 主炮", shortLabel: "4+2+4 356 mm Mk VII", caliberMm: 356,
    damagePerShell: 132, reloadSeconds: 30, traverseDegreesPerSecond: 2, dispersionMultiplier: 1,
    muzzleVelocity: 757, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS["king-george-v"],
    mounts: [batteryMount(.28, 4), batteryMount(.15, 2, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.25, 4)],
    visual: { barrelCount: 4, barrelLength: 13, barrelSpacing: 1.08, mountDiameter: 8.5, houseWidth: 9.6 },
  },
  bismarck: {
    id: "38cm-sk-c34", name: "38 cm SK C/34 双联装主炮", shortLabel: "4×2 380 mm SK C/34", caliberMm: 380,
    damagePerShell: 160, reloadSeconds: 25, traverseDegreesPerSecond: 5, dispersionMultiplier: 0.96,
    muzzleVelocity: 820, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.bismarck,
    mounts: [batteryMount(.29, 2), batteryMount(.16, 2, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.16, 2, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.29, 2)],
    visual: { barrelCount: 2, barrelLength: 13.2, barrelSpacing: 1.35, mountDiameter: 8, houseWidth: 8.8 },
  },
  yamato: {
    id: "type-94-46cm", name: "九四式 46 cm 三联装主炮", shortLabel: "3×3 460 mm 九四式", caliberMm: 460,
    damagePerShell: 188.89, reloadSeconds: 35, traverseDegreesPerSecond: 3, dispersionMultiplier: 1.02,
    muzzleVelocity: 780, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.yamato,
    mounts: [batteryMount(.28, 3), batteryMount(.15, 3, MAIN_BATTERY_SUPERFIRING_HEIGHT), batteryMount(-.25, 3)],
    visual: { barrelCount: 3, barrelLength: 14.5, barrelSpacing: 1.35, mountDiameter: 9.2, houseWidth: 10.2 },
  },
  richelieu: {
    id: "380mm-45-mle1935", name: "380 mm/45 Mle 1935 四联装主炮", shortLabel: "2×4 380 mm Mle 1935", caliberMm: 380,
    damagePerShell: 177.5, reloadSeconds: 40, traverseDegreesPerSecond: 5, dispersionMultiplier: 1.12,
    muzzleVelocity: 830, maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS.richelieu,
    mounts: [batteryMount(.29, 4), batteryMount(.15, 4, MAIN_BATTERY_SUPERFIRING_HEIGHT)],
    visual: { barrelCount: 4, barrelLength: 13.4, barrelSpacing: 1.05, mountDiameter: 8.8, houseWidth: 10 },
  },
};

const UPGRADE_MODIFIERS: Record<MainGunId, {
  damage: number; reload: number; traverse: number; dispersion: number; velocity: number;
}> = {
  "mk1-single": { damage: 1, reload: 1, traverse: 1, dispersion: 1, velocity: 1 },
  "mk2-twin": { damage: 1.015, reload: 1.015, traverse: .98, dispersion: 1.025, velocity: 1.005 },
  "mk3-twin": { damage: 1.035, reload: .985, traverse: 1.01, dispersion: .985, velocity: 1.01 },
  "mk4-twin": { damage: 1.055, reload: .965, traverse: 1.03, dispersion: .965, velocity: 1.02 },
};

const HISTORICAL_UPGRADE_LABELS: Record<MainGunId, string> = {
  "mk1-single": "标准炮术配置",
  "mk2-twin": "改进炮闩组件",
  "mk3-twin": "强化扬弹组件",
  "mk4-twin": "精密火控组件",
};

function genericMounts(count: number, barrelCount: 1 | 2 | 3 | 4): MainBatteryMountDefinition[] {
  const safeCount = Math.max(1, count);
  return Array.from({ length: safeCount }, (_, index) => {
    const longitudinalFraction = safeCount === 1
      ? .28
      : .30 - index * (.62 / (safeCount - 1));
    const superfiring = safeCount >= 3 && (index === 1 || index === safeCount - 2);
    return batteryMount(
      longitudinalFraction,
      barrelCount,
      superfiring ? MAIN_BATTERY_SUPERFIRING_HEIGHT : MAIN_BATTERY_DECK_HEIGHT,
    );
  });
}

export function mainBatteryShellProfile(
  shipClassId: ShipClassId,
  caliberMm: number,
): ShellPenetrationProfile {
  if (caliberMm === 127) {
    return {
      caliberMm,
      hePenetrationMm: 21,
      apMuzzlePenetrationMm: 72,
      apMinimumPenetrationMm: 42,
      apPenetrationLossMmPerSecond: 5,
      apOvermatchArmorMm: 8.9,
      apFuseArmingArmorMm: 8,
      apFuseTravelMeters: 8.5,
      apNormalizationDegrees: 10,
    };
  }
  const quarterCaliberHe = shipClassId === "nurnberg"
    || shipClassId === "bismarck"
    || shipClassId === "king-george-v";
  const apValues: Partial<Record<ShipClassId, readonly [number, number, number]>> = {
    cleveland: [155, 78, 6],
    edinburgh: [150, 76, 6],
    nurnberg: [155, 80, 6],
    agano: [140, 72, 6],
    dido: [115, 60, 5],
    "north-carolina": [520, 270, 28],
    "king-george-v": [440, 220, 18],
    bismarck: [500, 250, 27],
    yamato: [610, 310, 30],
    richelieu: [520, 260, 28],
  };
  const [apMuzzlePenetrationMm, apMinimumPenetrationMm, apPenetrationLossMmPerSecond]
    = apValues[shipClassId] ?? [caliberMm * 1.1, caliberMm * .68, caliberMm * .05];
  return {
    caliberMm,
    hePenetrationMm: Math.round(caliberMm / (quarterCaliberHe ? 4 : 6)),
    apMuzzlePenetrationMm,
    apMinimumPenetrationMm,
    apPenetrationLossMmPerSecond,
    apOvermatchArmorMm: caliberMm / 14.3,
    apFuseArmingArmorMm: caliberMm / 6,
    apFuseTravelMeters: Math.min(14, Math.max(8.5, caliberMm * .032)),
    apNormalizationDegrees: caliberMm >= 283 ? 6 : caliberMm >= 203 ? 7 : 8.5,
  };
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
      maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS[shipClassId],
      shellProfile: mainBatteryShellProfile(shipClassId, 127),
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
    shellProfile: mainBatteryShellProfile(shipClassId, historical.caliberMm),
    mounts: historical.mounts.slice(0, mountCount),
  };
}

/** Resolves an optional developer-only historical battery independently of the hull. */
export function effectiveMainBattery(
  ship: Readonly<Pick<ShipState, "shipClassId" | "mainGunId" | "mainGunMounts" | "developer">>,
): EffectiveMainBatteryDefinition {
  return getMainBattery(
    ship.developer?.enabled && ship.developer.mainBatteryClassId
      ? ship.developer.mainBatteryClassId
      : ship.shipClassId,
    ship.mainGunId,
    ship.mainGunMounts,
  );
}

export function mainBatteryBarrelCount(definition: EffectiveMainBatteryDefinition): number {
  return definition.mounts.reduce((total, mount) => total + mount.barrelCount, 0);
}
