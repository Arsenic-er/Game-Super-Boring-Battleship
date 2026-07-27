import type { HullId } from "./hulls";

export type ShipClassId =
  | "fletcher" | "j-class" | "kagero" | "type-1936a" | "tashkent"
  | "cleveland" | "edinburgh" | "nurnberg" | "agano" | "dido"
  | "north-carolina" | "king-george-v" | "bismarck" | "yamato" | "richelieu";

export type WeaponHardpointCategory = "mainGun" | "torpedo" | "antiAir" | "sideGun" | "depthCharge";

export interface ShipClassDefinition {
  id: ShipClassId;
  hullId: HullId;
  name: string;
  englishName: string;
  country: string;
  serviceYear: string;
  role: string;
  description: string;
  historicalArmament: string;
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
  slotCounts: Record<WeaponHardpointCategory, number>;
  starterSlots: Record<WeaponHardpointCategory, number>;
  renderScale: { x: number; y: number; z: number };
  visualVariant: number;
}

const degrees = (value: number): number => value * Math.PI / 180;

type ClassInput = Omit<ShipClassDefinition, "renderScale">;
const define = (input: ClassInput): ShipClassDefinition => ({
  ...input,
  renderScale: { x: input.beam / 11, y: input.deckHeight / 8, z: input.length / 112 },
});

export const SHIP_CLASSES: Record<ShipClassId, ShipClassDefinition> = {
  fletcher: define({
    id: "fletcher", hullId: "destroyer", name: "弗莱彻级", englishName: "Fletcher class", country: "美国", serviceYear: "1942", role: "高速均衡 / 防空 / 反潜",
    description: "成熟而均衡的舰队驱逐舰，兼顾炮击、雷击、防空与反潜。",
    historicalArmament: "5 × 单装 5in/38 Mk 12；2 × 五联 Mk 15；K-gun 与艉轨",
    length: 114.7, beam: 12.1, deckHeight: 8.4, maxHull: 1_100, maxSpeedKnots: 36.5,
    accelerationKnotsPerSecond: .39, brakingKnotsPerSecond: .57, rudderShiftPerSecond: .34, maximumTurningSpeedLoss: .12, maxTurnRateRadians: degrees(3),
    compartmentHealthMultiplier: 1.12, armorMultiplier: 1, detectionBonusMeters: 40, massFactor: 1.08,
    slotCounts: { mainGun: 5, torpedo: 2, antiAir: 4, sideGun: 0, depthCharge: 2 }, starterSlots: { mainGun: 5, torpedo: 1, antiAir: 1, sideGun: 0, depthCharge: 1 }, visualVariant: 0,
  }),
  "j-class": define({
    id: "j-class", hullId: "destroyer", name: "J级", englishName: "J class", country: "英国", serviceYear: "1939", role: "敏捷均衡",
    description: "紧凑的舰队驱逐舰，以三座双联主炮和强力雷击维持均衡输出。",
    historicalArmament: "3 × 双联 QF 4.7in Mk XII；2 × 五联 21in Mk IX；投射器与艉轨",
    length: 108.7, beam: 10.9, deckHeight: 7.8, maxHull: 1_000, maxSpeedKnots: 36,
    accelerationKnotsPerSecond: .4, brakingKnotsPerSecond: .59, rudderShiftPerSecond: .35, maximumTurningSpeedLoss: .11, maxTurnRateRadians: degrees(3.15),
    compartmentHealthMultiplier: 1, armorMultiplier: .98, detectionBonusMeters: 0, massFactor: .96,
    slotCounts: { mainGun: 3, torpedo: 2, antiAir: 3, sideGun: 0, depthCharge: 2 }, starterSlots: { mainGun: 3, torpedo: 1, antiAir: 1, sideGun: 0, depthCharge: 1 }, visualVariant: 1,
  }),
  kagero: define({
    id: "kagero", hullId: "destroyer", name: "阳炎级", englishName: "Kagerō class", country: "日本", serviceYear: "1939", role: "隐蔽雷击",
    description: "低轮廓水雷战驱逐舰，以九三式鱼雷和隐蔽接敌见长。",
    historicalArmament: "3 × 双联 12.7cm 三年式；2 × 四联 610mm 九三式；深弹投放装置",
    length: 118.5, beam: 10.8, deckHeight: 8, maxHull: 1_050, maxSpeedKnots: 35,
    accelerationKnotsPerSecond: .37, brakingKnotsPerSecond: .55, rudderShiftPerSecond: .33, maximumTurningSpeedLoss: .12, maxTurnRateRadians: degrees(2.95),
    compartmentHealthMultiplier: 1.05, armorMultiplier: 1, detectionBonusMeters: -90, massFactor: 1.02,
    slotCounts: { mainGun: 3, torpedo: 2, antiAir: 3, sideGun: 0, depthCharge: 2 }, starterSlots: { mainGun: 3, torpedo: 1, antiAir: 1, sideGun: 0, depthCharge: 1 }, visualVariant: 2,
  }),
  "type-1936a": define({
    id: "type-1936a", hullId: "destroyer", name: "1936A型（Z23）", englishName: "Type 1936A (Z23)", country: "德国", serviceYear: "1942改装型", role: "重炮驱逐舰",
    description: "采用 Z23 后期重炮布置，火炮更重，舰体与暴露也相应增大。",
    historicalArmament: "1 × 双联 + 3 × 单装 15cm；2 × 四联 533mm；深弹",
    length: 127, beam: 12, deckHeight: 8.8, maxHull: 1_200, maxSpeedKnots: 36,
    accelerationKnotsPerSecond: .34, brakingKnotsPerSecond: .51, rudderShiftPerSecond: .3, maximumTurningSpeedLoss: .14, maxTurnRateRadians: degrees(2.65),
    compartmentHealthMultiplier: 1.2, armorMultiplier: 1.08, detectionBonusMeters: 170, massFactor: 1.28,
    slotCounts: { mainGun: 4, torpedo: 2, antiAir: 3, sideGun: 0, depthCharge: 2 }, starterSlots: { mainGun: 4, torpedo: 1, antiAir: 1, sideGun: 0, depthCharge: 1 }, visualVariant: 3,
  }),
  tashkent: define({
    id: "tashkent", hullId: "destroyer", name: "塔什干级", englishName: "Tashkent class", country: "苏联", serviceYear: "1941战斗形态", role: "超高速炮艇",
    description: "大型高速驱逐领舰，以极高航速和三座双联 130mm 炮进行机动作战。",
    historicalArmament: "3 × 双联 130mm B-2LM；3 × 三联 533mm；投射器与艉轨",
    length: 139.8, beam: 13.7, deckHeight: 9.2, maxHull: 1_250, maxSpeedKnots: 42.5,
    accelerationKnotsPerSecond: .41, brakingKnotsPerSecond: .53, rudderShiftPerSecond: .27, maximumTurningSpeedLoss: .17, maxTurnRateRadians: degrees(2.5),
    compartmentHealthMultiplier: 1.28, armorMultiplier: 1.04, detectionBonusMeters: 260, massFactor: 1.42,
    slotCounts: { mainGun: 3, torpedo: 3, antiAir: 3, sideGun: 0, depthCharge: 2 }, starterSlots: { mainGun: 3, torpedo: 1, antiAir: 1, sideGun: 0, depthCharge: 1 }, visualVariant: 4,
  }),
  cleveland: define({
    id: "cleveland", hullId: "lightCruiser", name: "克利夫兰级", englishName: "Cleveland class", country: "美国", serviceYear: "1942", role: "高射速 / 舰队防空",
    description: "主炮射速、防空和生存均衡；史实没有水面鱼雷。",
    historicalArmament: "4 × 三联 6in/47 Mk 16；6 × 双联 5in/38；无鱼雷",
    length: 185.9, beam: 20.2, deckHeight: 13, maxHull: 2_200, maxSpeedKnots: 32.5,
    accelerationKnotsPerSecond: .24, brakingKnotsPerSecond: .39, rudderShiftPerSecond: .21, maximumTurningSpeedLoss: .17, maxTurnRateRadians: degrees(1.68),
    compartmentHealthMultiplier: 1.92, armorMultiplier: 1.42, detectionBonusMeters: 620, massFactor: 3.2,
    slotCounts: { mainGun: 4, torpedo: 0, antiAir: 5, sideGun: 6, depthCharge: 0 }, starterSlots: { mainGun: 4, torpedo: 0, antiAir: 2, sideGun: 6, depthCharge: 0 }, visualVariant: 0,
  }),
  edinburgh: define({
    id: "edinburgh", hullId: "lightCruiser", name: "爱丁堡级", englishName: "Edinburgh subclass", country: "英国", serviceYear: "1939", role: "均衡 / 工具性",
    description: "城级末批轻巡洋舰，具备完整 152mm 炮组、鱼雷和副炮。",
    historicalArmament: "4 × 三联 6in Mk XXIII；2 × 三联 533mm；6 × 双联 4in",
    length: 187, beam: 19.3, deckHeight: 12.8, maxHull: 2_100, maxSpeedKnots: 32.25,
    accelerationKnotsPerSecond: .23, brakingKnotsPerSecond: .38, rudderShiftPerSecond: .21, maximumTurningSpeedLoss: .17, maxTurnRateRadians: degrees(1.65),
    compartmentHealthMultiplier: 1.86, armorMultiplier: 1.4, detectionBonusMeters: 590, massFactor: 3.05,
    slotCounts: { mainGun: 4, torpedo: 2, antiAir: 4, sideGun: 6, depthCharge: 0 }, starterSlots: { mainGun: 4, torpedo: 1, antiAir: 1, sideGun: 6, depthCharge: 0 }, visualVariant: 1,
  }),
  nurnberg: define({
    id: "nurnberg", hullId: "lightCruiser", name: "纽伦堡级", englishName: "Nürnberg class", country: "德国", serviceYear: "1935", role: "精准炮击 / 多雷具",
    description: "紧凑轻巡洋舰，舰尾炮组和多组鱼雷发射器形成鲜明布局。",
    historicalArmament: "3 × 三联 15cm SK C/25；4 × 三联 533mm；88mm 与轻防空",
    length: 181.3, beam: 16.3, deckHeight: 11.6, maxHull: 1_850, maxSpeedKnots: 32,
    accelerationKnotsPerSecond: .25, brakingKnotsPerSecond: .4, rudderShiftPerSecond: .23, maximumTurningSpeedLoss: .15, maxTurnRateRadians: degrees(1.82),
    compartmentHealthMultiplier: 1.65, armorMultiplier: 1.32, detectionBonusMeters: 450, massFactor: 2.55,
    slotCounts: { mainGun: 3, torpedo: 4, antiAir: 4, sideGun: 0, depthCharge: 0 }, starterSlots: { mainGun: 3, torpedo: 2, antiAir: 1, sideGun: 0, depthCharge: 0 }, visualVariant: 2,
  }),
  agano: define({
    id: "agano", hullId: "lightCruiser", name: "阿贺野级", englishName: "Agano class", country: "日本", serviceYear: "1942", role: "水雷战队旗舰",
    description: "为指挥水雷战队设计的高速轻巡；按玩法规则不开放深水炸弹槽。",
    historicalArmament: "3 × 双联 152mm；2 × 四联 610mm；2 × 双联 80mm",
    length: 174.1, beam: 15.2, deckHeight: 11.5, maxHull: 1_750, maxSpeedKnots: 35,
    accelerationKnotsPerSecond: .27, brakingKnotsPerSecond: .4, rudderShiftPerSecond: .24, maximumTurningSpeedLoss: .15, maxTurnRateRadians: degrees(1.9),
    compartmentHealthMultiplier: 1.58, armorMultiplier: 1.25, detectionBonusMeters: 360, massFactor: 2.35,
    slotCounts: { mainGun: 3, torpedo: 2, antiAir: 3, sideGun: 2, depthCharge: 0 }, starterSlots: { mainGun: 3, torpedo: 1, antiAir: 1, sideGun: 2, depthCharge: 0 }, visualVariant: 3,
  }),
  dido: define({
    id: "dido", hullId: "lightCruiser", name: "黛朵级", englishName: "Dido class", country: "英国", serviceYear: "1940完整设计型", role: "防空轻巡 / 双用途炮",
    description: "以五座双联 5.25in 双用途主炮构成防空与水面火力核心。",
    historicalArmament: "5 × 双联 5.25in；2 × 三联 533mm；砰砰炮",
    length: 156, beam: 15.4, deckHeight: 11.2, maxHull: 1_700, maxSpeedKnots: 32.25,
    accelerationKnotsPerSecond: .28, brakingKnotsPerSecond: .42, rudderShiftPerSecond: .25, maximumTurningSpeedLoss: .14, maxTurnRateRadians: degrees(1.98),
    compartmentHealthMultiplier: 1.5, armorMultiplier: 1.22, detectionBonusMeters: 300, massFactor: 2.1,
    slotCounts: { mainGun: 5, torpedo: 2, antiAir: 3, sideGun: 0, depthCharge: 0 }, starterSlots: { mainGun: 5, torpedo: 1, antiAir: 1, sideGun: 0, depthCharge: 0 }, visualVariant: 4,
  }),
  "north-carolina": define({
    id: "north-carolina", hullId: "battleship", name: "北卡罗来纳级", englishName: "North Carolina class", country: "美国", serviceYear: "1941", role: "中远程精准 / 防空",
    description: "高速战列舰的早期代表，主炮布局均衡并拥有强大的双用途副炮。",
    historicalArmament: "3 × 三联 16in/45；10 × 双联 5in/38；无鱼雷",
    length: 222.1, beam: 33, deckHeight: 18, maxHull: 3_700, maxSpeedKnots: 28,
    accelerationKnotsPerSecond: .14, brakingKnotsPerSecond: .24, rudderShiftPerSecond: .13, maximumTurningSpeedLoss: .21, maxTurnRateRadians: degrees(.88),
    compartmentHealthMultiplier: 3.05, armorMultiplier: 1.78, detectionBonusMeters: 1_020, massFactor: 8.2,
    slotCounts: { mainGun: 3, torpedo: 0, antiAir: 6, sideGun: 10, depthCharge: 0 }, starterSlots: { mainGun: 3, torpedo: 0, antiAir: 2, sideGun: 10, depthCharge: 0 }, visualVariant: 0,
  }),
  "king-george-v": define({
    id: "king-george-v", hullId: "battleship", name: "乔治五世级", englishName: "King George V class", country: "英国", serviceYear: "1940", role: "均衡 / 抗线",
    description: "两座四联与一座双联主炮构成独特布局，防护和双用途副炮均衡。",
    historicalArmament: "2 × 四联 + 1 × 双联 14in；8 × 双联 5.25in；无鱼雷",
    length: 227.1, beam: 31.4, deckHeight: 18, maxHull: 3_600, maxSpeedKnots: 28,
    accelerationKnotsPerSecond: .14, brakingKnotsPerSecond: .24, rudderShiftPerSecond: .13, maximumTurningSpeedLoss: .21, maxTurnRateRadians: degrees(.86),
    compartmentHealthMultiplier: 3, armorMultiplier: 1.82, detectionBonusMeters: 1_000, massFactor: 8,
    slotCounts: { mainGun: 3, torpedo: 0, antiAir: 6, sideGun: 8, depthCharge: 0 }, starterSlots: { mainGun: 3, torpedo: 0, antiAir: 2, sideGun: 8, depthCharge: 0 }, visualVariant: 1,
  }),
  bismarck: define({
    id: "bismarck", hullId: "battleship", name: "俾斯麦级", englishName: "Bismarck class", country: "德国", serviceYear: "1940", role: "装甲 / 副炮近战",
    description: "厚重装甲、四座双联 380mm 炮与强大的中口径副炮群。",
    historicalArmament: "4 × 双联 38cm SK C/34；6 × 双联 15cm；无鱼雷",
    length: 251, beam: 36, deckHeight: 19, maxHull: 4_000, maxSpeedKnots: 30.8,
    accelerationKnotsPerSecond: .15, brakingKnotsPerSecond: .24, rudderShiftPerSecond: .12, maximumTurningSpeedLoss: .23, maxTurnRateRadians: degrees(.8),
    compartmentHealthMultiplier: 3.28, armorMultiplier: 1.92, detectionBonusMeters: 1_180, massFactor: 9.2,
    slotCounts: { mainGun: 4, torpedo: 0, antiAir: 6, sideGun: 6, depthCharge: 0 }, starterSlots: { mainGun: 4, torpedo: 0, antiAir: 2, sideGun: 6, depthCharge: 0 }, visualVariant: 2,
  }),
  yamato: define({
    id: "yamato", hullId: "battleship", name: "大和级", englishName: "Yamato class", country: "日本", serviceYear: "1943形态", role: "超重炮 / 远距",
    description: "最大型战列舰之一，以三座三联 460mm 主炮和极高防护为核心。",
    historicalArmament: "3 × 三联 460mm；4 × 三联 155mm；无鱼雷",
    length: 263, beam: 38.9, deckHeight: 20, maxHull: 4_700, maxSpeedKnots: 27,
    accelerationKnotsPerSecond: .12, brakingKnotsPerSecond: .22, rudderShiftPerSecond: .11, maximumTurningSpeedLoss: .24, maxTurnRateRadians: degrees(.72),
    compartmentHealthMultiplier: 3.65, armorMultiplier: 2.08, detectionBonusMeters: 1_350, massFactor: 11.4,
    slotCounts: { mainGun: 3, torpedo: 0, antiAir: 8, sideGun: 4, depthCharge: 0 }, starterSlots: { mainGun: 3, torpedo: 0, antiAir: 3, sideGun: 4, depthCharge: 0 }, visualVariant: 3,
  }),
  richelieu: define({
    id: "richelieu", hullId: "battleship", name: "黎塞留级", englishName: "Richelieu class", country: "法国", serviceYear: "1943完成态", role: "全前置主炮 / 高速",
    description: "两座四联 380mm 主炮全部前置，具备战列舰中突出的高速。",
    historicalArmament: "2 × 四联 380mm；3 × 三联 152mm；无鱼雷",
    length: 247.9, beam: 33.1, deckHeight: 18.5, maxHull: 3_900, maxSpeedKnots: 30,
    accelerationKnotsPerSecond: .15, brakingKnotsPerSecond: .25, rudderShiftPerSecond: .13, maximumTurningSpeedLoss: .21, maxTurnRateRadians: degrees(.87),
    compartmentHealthMultiplier: 3.18, armorMultiplier: 1.86, detectionBonusMeters: 1_110, massFactor: 8.8,
    slotCounts: { mainGun: 2, torpedo: 0, antiAir: 6, sideGun: 3, depthCharge: 0 }, starterSlots: { mainGun: 2, torpedo: 0, antiAir: 2, sideGun: 3, depthCharge: 0 }, visualVariant: 4,
  }),
};

export const DEFAULT_SHIP_CLASS_ID: ShipClassId = "fletcher";
export const SHIP_CLASS_IDS = Object.keys(SHIP_CLASSES) as ShipClassId[];

export function isShipClassId(value: unknown): value is ShipClassId {
  return typeof value === "string" && value in SHIP_CLASSES;
}

export function getShipClass(id: ShipClassId): ShipClassDefinition {
  return SHIP_CLASSES[id];
}

export function shipClassesForHull(hullId: HullId): ShipClassDefinition[] {
  return SHIP_CLASS_IDS.map(getShipClass).filter((shipClass) => shipClass.hullId === hullId);
}
