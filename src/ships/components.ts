export type MainGunId = "mk1-single" | "mk2-twin" | "mk3-twin" | "mk4-twin";

export interface MainGunVisualDefinition {
  barrelCount: 1 | 2 | 3 | 4;
  barrelLength: number;
  barrelSpacing: number;
  mountDiameter: number;
  houseWidth: number;
}

export interface MainGunDefinition {
  id: MainGunId;
  name: string;
  shortLabel: string;
  description: string;
  cost: number;
  damage: number;
  reloadSeconds: number;
  traverseDegreesPerSecond: number;
  dispersionMultiplier: number;
  muzzleVelocity: number;
  visual: MainGunVisualDefinition;
}

export const DEFAULT_MAIN_GUN_ID: MainGunId = "mk1-single";
export const FRONT_TURRET_TRAVERSE_LIMIT_RADIANS = 150 * Math.PI / 180;

export const MAIN_GUNS: Record<MainGunId, MainGunDefinition> = {
  "mk1-single": {
    id: "mk1-single",
    name: "127 mm Mk.I 单装炮",
    shortLabel: "Mk.I 单装炮",
    description: "轻型炮座，装填和转向较快，适合持续修正射击。",
    cost: 0,
    damage: 270,
    reloadSeconds: 5.5,
    traverseDegreesPerSecond: 12,
    dispersionMultiplier: 1,
    muzzleVelocity: 720,
    visual: {
      barrelCount: 1,
      barrelLength: 8.6,
      barrelSpacing: 0,
      mountDiameter: 4.65,
      houseWidth: 4.35,
    },
  },
  "mk2-twin": {
    id: "mk2-twin",
    name: "127 mm Mk.II 双联装炮",
    shortLabel: "Mk.II 双联装炮",
    description: "双联装重炮，单次伤害更高，但装填、转向和散布表现较差。",
    cost: 800,
    damage: 360,
    reloadSeconds: 7.4,
    traverseDegreesPerSecond: 8.5,
    dispersionMultiplier: 1.12,
    muzzleVelocity: 735,
    visual: {
      barrelCount: 2,
      barrelLength: 8.9,
      barrelSpacing: 1.15,
      mountDiameter: 5.15,
      houseWidth: 4.9,
    },
  },
  "mk3-twin": {
    id: "mk3-twin",
    name: "127 mm Mk.III 强化双联装炮",
    shortLabel: "Mk.III 强化双联装炮",
    description: "强化供弹与炮塔驱动，装填、伤害与炮管辨识度进一步提升。",
    cost: 0,
    damage: 405,
    reloadSeconds: 6.8,
    traverseDegreesPerSecond: 9.4,
    dispersionMultiplier: 1.02,
    muzzleVelocity: 755,
    visual: { barrelCount: 2, barrelLength: 9.15, barrelSpacing: 1.2, mountDiameter: 5.25, houseWidth: 5.05 },
  },
  "mk4-twin": {
    id: "mk4-twin",
    name: "127 mm Mk.IV 舰队试制双联装炮",
    shortLabel: "Mk.IV 赤金双联装炮",
    description: "舰队试制炮塔，在火力、装填和转速之间取得最高等级平衡。",
    cost: 0,
    damage: 450,
    reloadSeconds: 6.2,
    traverseDegreesPerSecond: 10.2,
    dispersionMultiplier: 0.94,
    muzzleVelocity: 775,
    visual: { barrelCount: 2, barrelLength: 9.4, barrelSpacing: 1.25, mountDiameter: 5.4, houseWidth: 5.2 },
  },
};

export const MAIN_GUN_OPTIONS = Object.values(MAIN_GUNS);

export function isMainGunId(value: unknown): value is MainGunId {
  return typeof value === "string" && value in MAIN_GUNS;
}

export function getMainGun(id: MainGunId): MainGunDefinition {
  return MAIN_GUNS[id] ?? MAIN_GUNS[DEFAULT_MAIN_GUN_ID];
}
