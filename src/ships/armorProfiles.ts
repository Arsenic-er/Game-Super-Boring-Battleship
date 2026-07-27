import type { ArmorZoneId, CompartmentId } from "../sim/types";
import type { ShipClassId } from "./classes";

export interface ShipArmorProfile {
  id: ShipClassId;
  scheme: string;
  /** Gameplay-compressed effective plate values, in millimetres. */
  zones: Record<ArmorZoneId, Record<CompartmentId, number>>;
}

type CompartmentArmor = Record<CompartmentId, number>;

const sections = (
  bow: number,
  bridge: number,
  engineRoom: number,
  magazine: number,
  stern: number,
): CompartmentArmor => ({ bow, bridge, engineRoom, magazine, stern });

const profile = (
  id: ShipClassId,
  scheme: string,
  side: CompartmentArmor,
  deck: CompartmentArmor,
  end: CompartmentArmor,
  superstructure: CompartmentArmor,
): ShipArmorProfile => ({ id, scheme, zones: { side, deck, end, superstructure } });

/**
 * These values preserve the relative protection and vulnerable areas of each
 * historical class while fitting the game's compressed 5 km engagement scale.
 * They are deliberately not a millimetre-perfect naval architecture model.
 */
export const SHIP_ARMOR_PROFILES: Record<ShipClassId, ShipArmorProfile> = {
  fletcher: profile("fletcher", "驱逐舰薄壳", sections(10, 6, 16, 20, 10), sections(10, 10, 10, 10, 10), sections(12, 12, 12, 12, 12), sections(10, 6, 16, 20, 10)),
  "j-class": profile("j-class", "驱逐舰薄壳", sections(12, 10, 16, 16, 12), sections(12, 10, 12, 12, 12), sections(12, 10, 12, 12, 12), sections(10, 10, 10, 10, 10)),
  kagero: profile("kagero", "驱逐舰薄壳", sections(12, 10, 16, 16, 12), sections(12, 10, 12, 12, 12), sections(12, 10, 12, 12, 12), sections(10, 10, 10, 10, 10)),
  "type-1936a": profile("type-1936a", "加强驱逐舰船壳", sections(13, 12, 20, 20, 13), sections(13, 12, 13, 13, 13), sections(13, 12, 13, 13, 13), sections(11, 11, 11, 11, 11)),
  tashkent: profile("tashkent", "大型驱逐舰船壳", sections(13, 12, 22, 22, 13), sections(13, 12, 13, 13, 13), sections(13, 12, 13, 13, 13), sections(12, 12, 12, 12, 12)),

  cleveland: profile("cleveland", "重点防护巡洋舰装甲盒", sections(25, 25, 127, 120, 25), sections(25, 25, 51, 51, 25), sections(25, 25, 25, 25, 25), sections(25, 25, 25, 25, 25)),
  edinburgh: profile("edinburgh", "巡洋舰装甲带", sections(25, 25, 114, 114, 25), sections(25, 25, 38, 51, 25), sections(25, 25, 25, 25, 25), sections(25, 25, 25, 25, 25)),
  nurnberg: profile("nurnberg", "分区式巡洋舰装甲带", sections(18, 16, 50, 50, 18), sections(18, 16, 25, 25, 18), sections(18, 16, 18, 18, 18), sections(16, 16, 16, 16, 16)),
  agano: profile("agano", "轻型巡洋舰装甲带", sections(16, 16, 60, 55, 16), sections(16, 16, 20, 20, 16), sections(16, 16, 16, 16, 16), sections(16, 16, 16, 16, 16)),
  dido: profile("dido", "防空巡洋舰装甲带", sections(19, 19, 76, 76, 19), sections(19, 19, 25, 25, 19), sections(19, 19, 19, 19, 19), sections(19, 19, 19, 19, 19)),

  "north-carolina": profile("north-carolina", "重点防护战列舰装甲盒", sections(32, 38, 305, 305, 32), sections(32, 38, 127, 140, 32), sections(32, 32, 32, 32, 32), sections(38, 38, 38, 38, 38)),
  "king-george-v": profile("king-george-v", "全长主装甲带", sections(32, 32, 374, 374, 32), sections(32, 32, 127, 152, 32), sections(32, 32, 32, 32, 32), sections(32, 32, 32, 32, 32)),
  bismarck: profile("bismarck", "穹甲复合防护", sections(32, 50, 320, 320, 32), sections(32, 50, 100, 120, 32), sections(32, 32, 32, 32, 32), sections(50, 50, 50, 50, 50)),
  yamato: profile("yamato", "超重型重点防护装甲盒", sections(32, 50, 410, 410, 32), sections(32, 50, 200, 230, 32), sections(32, 32, 32, 32, 32), sections(50, 50, 50, 50, 50)),
  richelieu: profile("richelieu", "倾斜式重点防护装甲盒", sections(30, 40, 330, 330, 30), sections(30, 40, 150, 170, 30), sections(30, 30, 30, 30, 30), sections(40, 40, 40, 40, 40)),
};

export function getShipArmorProfile(id: ShipClassId): ShipArmorProfile {
  return SHIP_ARMOR_PROFILES[id];
}

export function classArmorThickness(
  id: ShipClassId,
  compartment: CompartmentId,
  zone: ArmorZoneId,
): number {
  return SHIP_ARMOR_PROFILES[id].zones[zone][compartment];
}
