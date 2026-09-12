import type { EquipmentCategory } from "../profile/equipmentCatalog";
import { EQUIPMENT_BY_ID } from "../profile/equipmentCatalog";
import type { ShipClassId } from "../ships/classes";
import type { MainGunId } from "../ships/components";

/** Appearance only. Exterior dimensions are metres; the adapter cancels hull scaling. */
export interface HistoricalGunHousingProfile {
  readonly id: string;
  readonly name: string;
  readonly shield: "open" | "enclosed";
  readonly depth: number;
  readonly height: number;
  readonly topScale: number;
  readonly chamfer: number;
  readonly rangefinder: number;
  readonly roof: "flat" | "stepped" | "rounded";
  readonly barrelDiameter: number;
  readonly pairedPorts?: boolean;
  readonly silhouette?: "type-c-wedge" | "mk38-box" | "rp10-rounded";
}

const gun = (id: string, name: string, depth: number, height: number, topScale: number,
  chamfer: number, rangefinder: number, roof: HistoricalGunHousingProfile["roof"],
  barrelDiameter: number, extra: Partial<HistoricalGunHousingProfile> = {}): HistoricalGunHousingProfile =>
  Object.freeze({ id, name, shield: "enclosed", depth, height, topScale, chamfer, rangefinder, roof, barrelDiameter, ...extra });

/** Rarity never selects a different CL/BB historical turret or a rarity-coloured paint. */
export const HISTORICAL_CLASS_GUN_HOUSINGS: Readonly<Partial<Record<ShipClassId, HistoricalGunHousingProfile>>> = Object.freeze({
  cleveland: gun("6in-47-mk16", "6-inch/47 Mk 16 triple turret", 5.4, 2.65, .86, .72, 6.4, "stepped", .4),
  edinburgh: gun("6in-mkxxiii", "6-inch Mk XXIII triple turret", 5.9, 2.5, .91, .95, 5.8, "flat", .39),
  nurnberg: gun("15cm-sk-c25", "15 cm SK C/25 triple turret", 5.6, 2.45, .77, 1.1, 5.9, "stepped", .4),
  agano: gun("15cm-41st-year", "41st Year 15 cm twin turret", 5.15, 2.55, .8, .85, 4.8, "rounded", .4),
  dido: gun("qf-5.25-mki", "QF 5.25-inch Mk I twin turret", 4.95, 2.85, .78, .75, 0, "rounded", .35),
  "north-carolina": gun("16in-45-mk6", "16-inch/45 Mk 6 triple turret", 6.65, 3.25, .87, 1.1, 8.5, "stepped", .66),
  "king-george-v": gun("bl-14in-mkvii", "BL 14-inch Mk VII turret", 6.35, 3.05, .88, .8, 9.8, "flat", .59, { pairedPorts: true }),
  bismarck: gun("38cm-sk-c34", "38 cm SK C/34 twin turret", 6.8, 3.25, .72, 1.35, 9.0, "stepped", .63),
  yamato: gun("type-94-46cm", "Type 94 46 cm triple turret", 7.25, 3.55, .71, 1.55, 11.4, "stepped", .75),
  richelieu: gun("380mm-45-mle1935", "380 mm/45 Mle 1935 quadruple turret", 6.9, 3.15, .82, 1.25, 10.2, "rounded", .63, { pairedPorts: true }),
});

export const HISTORICAL_DESTROYER_GUN_HOUSINGS: Readonly<Record<MainGunId, HistoricalGunHousingProfile>> = Object.freeze({
  "mk1-single": gun("qf-4.7-cp-xviii", "QF 4.7-inch Mk IX / CP Mk XVIII single mount", 3.9, 2.3, .96, .45, 0, "flat", .36, { shield: "open" }),
  "mk2-twin": gun("12.7cm-type-c", "3rd Year 12.7 cm Type C twin mount", 4.95, 2.65, .81, .68, 0, "stepped", .4, { silhouette: "type-c-wedge" }),
  "mk3-twin": gun("5in-38-mk38", "5-inch/38 Mk 38 twin mount", 4.65, 2.85, .88, .62, 0, "flat", .4, { silhouette: "mk38-box" }),
  "mk4-twin": gun("qf-4.5-rp10", "QF 4.5-inch RP10 Mk IV twin mount", 4.85, 2.8, .75, .85, 0, "rounded", .37, { silhouette: "rp10-rounded" }),
});

export function historicalMainGunHousing(shipClassId: ShipClassId, mainGunId: MainGunId): HistoricalGunHousingProfile {
  return HISTORICAL_CLASS_GUN_HOUSINGS[shipClassId] ?? HISTORICAL_DESTROYER_GUN_HOUSINGS[mainGunId];
}

export interface HistoricalEquipmentProfile {
  readonly equipmentId: string;
  readonly category: EquipmentCategory;
  readonly name: string;
  readonly layout: string;
  readonly barrels: number;
  readonly evidence: "manual-family" | "photographic-family" | "schematic";
}

const layouts: Record<string, readonly [string, number, HistoricalEquipmentProfile["evidence"]]> = {
  "torpedo-common": ["british-open-twin", 2, "photographic-family"],
  "torpedo-purple": ["german-open-triple", 3, "photographic-family"],
  "torpedo-gold": ["us-quintuple", 5, "manual-family"],
  "torpedo-redGold": ["japanese-shielded-quad", 4, "photographic-family"],
  "antiAir-common": ["oerlikon-pedestal", 1, "manual-family"],
  "antiAir-purple": ["pom-pom-octuple", 8, "photographic-family"],
  "antiAir-gold": ["bofors-twin", 2, "manual-family"],
  "antiAir-redGold": ["bofors-quad-director", 4, "manual-family"],
  "sideGun-common": ["sk-c33-open-twin", 2, "photographic-family"],
  "sideGun-purple": ["qf525-enclosed-twin", 2, "photographic-family"],
  "sideGun-gold": ["sk-c28-enclosed-twin", 2, "photographic-family"],
  "sideGun-redGold": ["mk16-enclosed-triple", 3, "manual-family"],
  "depthCharge-common": ["mk-vii-stern-rails", 0, "photographic-family"],
  "depthCharge-purple": ["type95-y-thrower", 0, "photographic-family"],
  "depthCharge-gold": ["mk6-k-gun", 0, "manual-family"],
  "depthCharge-redGold": ["hedgehog-24-spigots", 24, "photographic-family"],
  "magazine-common": ["qf-handling-room", 0, "schematic"],
  "magazine-purple": ["cased-ammunition-chain", 0, "schematic"],
  "magazine-gold": ["mk38-dual-feed", 0, "manual-family"],
  "magazine-redGold": ["flash-tight-flooding", 0, "schematic"],
  "engine-common": ["parsons-geared-turbines", 0, "schematic"],
  "engine-purple": ["kampon-geared-turbines", 0, "schematic"],
  "engine-gold": ["ge-geared-turbines", 0, "manual-family"],
  "engine-redGold": ["wagner-deschimag-steam", 0, "schematic"],
  "steering-common": ["single-rudder-ram", 0, "schematic"],
  "steering-purple": ["dual-pump-ram", 0, "schematic"],
  "steering-gold": ["dual-circuit-ram", 0, "manual-family"],
  "steering-redGold": ["gearing-electrohydraulic", 0, "manual-family"],
};

export const HISTORICAL_EQUIPMENT_PROFILES: Readonly<Record<string, HistoricalEquipmentProfile>> = Object.freeze(
  Object.fromEntries(Object.entries(layouts).map(([equipmentId, [layout, barrels, evidence]]) => {
    const equipment = EQUIPMENT_BY_ID[equipmentId]!;
    return [equipmentId, Object.freeze({ equipmentId, category: equipment.category, name: equipment.name, layout, barrels, evidence })];
  })),
);

export function historicalEquipmentProfile(equipmentId: string): HistoricalEquipmentProfile {
  const profile = HISTORICAL_EQUIPMENT_PROFILES[equipmentId];
  if (!profile) throw new Error(`No historical equipment profile: ${equipmentId}`);
  return profile;
}
