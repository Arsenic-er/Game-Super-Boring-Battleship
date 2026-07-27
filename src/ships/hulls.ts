export type HullId = "destroyer" | "lightCruiser" | "battleship";

export interface HullDefinition {
  id: HullId;
  name: string;
  classCode: string;
  description: string;
  length: number;
  beam: number;
  deckHeight: number;
  maxHull: number;
  maxSpeedKnots: number;
  accelerationKnotsPerSecond: number;
  brakingKnotsPerSecond: number;
  rudderShiftPerSecond: number;
  maximumTurningSpeedLoss: number;
  maxTurnRateRadians: number;
  compartmentHealthMultiplier: number;
  armorMultiplier: number;
  detectionBonusMeters: number;
  massFactor: number;
  supportsTorpedoes: boolean;
  renderScale: { x: number; y: number; z: number };
}

const degrees = (value: number): number => value * Math.PI / 180;

export const HULLS: Record<HullId, HullDefinition> = {
  destroyer: {
    id: "destroyer",
    name: "驱逐舰 DD-01",
    classCode: "DD",
    description: "高速、低轮廓与灵活转向，依赖鱼雷和烟幕创造交战窗口。",
    length: 112,
    beam: 11,
    deckHeight: 8,
    maxHull: 1_000,
    maxSpeedKnots: 35.5,
    accelerationKnotsPerSecond: 0.38,
    brakingKnotsPerSecond: 0.56,
    rudderShiftPerSecond: 0.32,
    maximumTurningSpeedLoss: 0.12,
    maxTurnRateRadians: degrees(2.9),
    compartmentHealthMultiplier: 1,
    armorMultiplier: 1,
    detectionBonusMeters: 0,
    massFactor: 1,
    supportsTorpedoes: true,
    renderScale: { x: 1, y: 1, z: 1 },
  },
  lightCruiser: {
    id: "lightCruiser",
    name: "轻巡洋舰 CL-01",
    classCode: "CL",
    description: "火力与生存能力更均衡，舰体更大但仍能进行侧舷鱼雷攻击。",
    length: 170,
    beam: 17,
    deckHeight: 12,
    maxHull: 1_950,
    maxSpeedKnots: 32,
    accelerationKnotsPerSecond: 0.25,
    brakingKnotsPerSecond: 0.4,
    rudderShiftPerSecond: 0.22,
    maximumTurningSpeedLoss: 0.16,
    maxTurnRateRadians: degrees(1.75),
    compartmentHealthMultiplier: 1.75,
    armorMultiplier: 1.35,
    detectionBonusMeters: 520,
    massFactor: 2.8,
    supportsTorpedoes: true,
    renderScale: { x: 17 / 11, y: 1.32, z: 170 / 112 },
  },
  battleship: {
    id: "battleship",
    name: "战列舰 BB-01",
    classCode: "BB",
    description: "厚重耐久、转向迟缓且目标显著；首版不装备鱼雷。",
    length: 225,
    beam: 31,
    deckHeight: 18,
    maxHull: 3_600,
    maxSpeedKnots: 27,
    accelerationKnotsPerSecond: 0.14,
    brakingKnotsPerSecond: 0.24,
    rudderShiftPerSecond: 0.13,
    maximumTurningSpeedLoss: 0.22,
    maxTurnRateRadians: degrees(0.85),
    compartmentHealthMultiplier: 3.1,
    armorMultiplier: 1.8,
    detectionBonusMeters: 1_050,
    massFactor: 8.5,
    supportsTorpedoes: false,
    renderScale: { x: 31 / 11, y: 1.62, z: 225 / 112 },
  },
};

export const DEFAULT_HULL_ID: HullId = "destroyer";

export function isHullId(value: unknown): value is HullId {
  return typeof value === "string" && value in HULLS;
}

export function getHull(id: HullId): HullDefinition {
  return HULLS[id];
}
