import type { ShipClassId } from "../ships/classes";

export type BridgeForm = "round" | "admiralty" | "enclosed" | "wedge" | "leader" | "cruiser" | "town" | "tower" | "pagoda" | "french";
export interface HistoricalFunnel {
  /** Longitudinal fraction of length, positive toward the bow. Other sizes are metres. */
  z: number; width: number; depth: number; height: number; rake: number;
}
export interface HistoricalShipProfile {
  id: ShipClassId;
  era: string;
  /** Half-breadths at the common stations, normalized to half the class beam. */
  breadths: readonly number[];
  bow: "clipper" | "raked" | "atlantic" | "spoon";
  stern: "round" | "transom" | "cruiser";
  sheer: number;
  forecastleEnd: number;
  bridge: { form: BridgeForm; z: number; width: number; depth: number; height: number; tiers: number };
  funnels: readonly HistoricalFunnel[];
  masts: readonly { z: number; height: number; tripod: boolean; rake: number }[];
  aviation: "none" | "stern-pair" | "midships-cross" | "midships-single" | "stern-rails";
  aviationZ: number;
  shafts: 2 | 3 | 4;
  notes: string;
}

export const HISTORICAL_HULL_STATIONS = [-.5, -.47, -.41, -.32, -.2, -.06, .08, .2, .3, .39, .455, .485, .5] as const;

/** Original silhouette reconstructions, not measured shipyard lofting. See docs/historical-models-ships.md. */
export const HISTORICAL_SHIP_PROFILES: Readonly<Record<ShipClassId, HistoricalShipProfile>> = {
  fletcher: {
    id: "fletcher", era: "1942", breadths: [.35,.63,.82,.94,.99,1,1,.93,.81,.57,.31,.13,.018],
    bow: "raked", stern: "round", sheer: .85, forecastleEnd: -.44,
    bridge: { form: "round", z: .095, width: 7.5, depth: 9.4, height: 8.7, tiers: 3 },
    funnels: [{ z: .005, width: 3.3, depth: 5.2, height: 8.2, rake: 6 }, { z: -.105, width: 3.1, depth: 4.7, height: 7.8, rake: 6 }],
    masts: [{ z: .15, height: 19, tripod: true, rake: 3 }, { z: -.19, height: 12, tripod: false, rake: 2 }],
    aviation: "none", aviationZ: 0, shafts: 2, notes: "Early rounded bridge; two separated raked stacks; flush deck. No late square bridge.",
  },
  "j-class": {
    id: "j-class", era: "1939", breadths: [.28,.60,.82,.93,.99,1,.97,.89,.72,.49,.25,.10,.018],
    bow: "raked", stern: "round", sheer: 1.05, forecastleEnd: .12,
    bridge: { form: "admiralty", z: .095, width: 7.8, depth: 8.8, height: 6.8, tiers: 2 },
    funnels: [{ z: -.055, width: 4.2, depth: 6.5, height: 8.3, rake: 10 }],
    masts: [{ z: .145, height: 19.5, tripod: true, rake: 7 }, { z: -.20, height: 10, tripod: false, rake: 8 }],
    aviation: "none", aviationZ: 0, shafts: 2, notes: "Single broad funnel, low open Admiralty bridge and broken forecastle distinguish J/K layout.",
  },
  kagero: {
    id: "kagero", era: "1939", breadths: [.22,.55,.79,.94,1,.99,.95,.86,.68,.43,.23,.09,.014],
    bow: "clipper", stern: "cruiser", sheer: 1.35, forecastleEnd: .105,
    bridge: { form: "enclosed", z: .22, width: 7, depth: 10, height: 8.7, tiers: 3 },
    funnels: [{ z: .085, width: 3.7, depth: 5.8, height: 8.3, rake: 15 }, { z: -.105, width: 3.0, depth: 4.8, height: 7.6, rake: 12 }],
    masts: [{ z: .16, height: 17.5, tripod: true, rake: 3 }, { z: -.20, height: 13, tripod: true, rake: 2 }],
    aviation: "none", aviationZ: 0, shafts: 2, notes: "Enclosed tiered bridge; unequal raked funnels; long low after deck and narrow cruiser stern.",
  },
  "type-1936a": {
    id: "type-1936a", era: "1942改装型", breadths: [.30,.61,.83,.96,1,.99,.95,.88,.75,.53,.29,.12,.018],
    bow: "atlantic", stern: "transom", sheer: 1.65, forecastleEnd: .09,
    bridge: { form: "wedge", z: .19, width: 8.7, depth: 10.5, height: 9.2, tiers: 3 },
    funnels: [{ z: .065, width: 3.8, depth: 6.6, height: 8.9, rake: 13 }, { z: -.14, width: 3.6, depth: 5.5, height: 8.2, rake: 13 }],
    masts: [{ z: .135, height: 20.5, tripod: true, rake: 4 }, { z: -.24, height: 10.5, tripod: false, rake: 7 }],
    aviation: "none", aviationZ: 0, shafts: 2, notes: "Z23 1942 heavy-gun form: flared bow, angular bridge wings and two large raked funnels.",
  },
  tashkent: {
    id: "tashkent", era: "1941战斗形态", breadths: [.26,.57,.81,.95,.99,1,.96,.89,.73,.50,.28,.115,.014],
    bow: "clipper", stern: "cruiser", sheer: 1.2, forecastleEnd: .10,
    bridge: { form: "leader", z: .095, width: 8.1, depth: 12.2, height: 9.6, tiers: 3 },
    funnels: [{ z: -.02, width: 4.2, depth: 7.1, height: 10, rake: 19 }, { z: -.15, width: 3.9, depth: 6.7, height: 9.7, rake: 19 }],
    masts: [{ z: .145, height: 22, tripod: true, rake: 12 }, { z: -.255, height: 13.5, tripod: false, rake: 12 }],
    aviation: "none", aviationZ: 0, shafts: 2, notes: "Italian-built long leader hull, rounded streamlined bridge and strongly raked funnels/masts.",
  },
  cleveland: {
    id: "cleveland", era: "1942", breadths: [.39,.68,.88,.97,1,1,.99,.94,.82,.61,.35,.16,.023],
    bow: "raked", stern: "cruiser", sheer: 1.15, forecastleEnd: -.44,
    bridge: { form: "cruiser", z: .085, width: 13, depth: 19, height: 15.5, tiers: 4 },
    funnels: [{ z: .012, width: 5.4, depth: 8.5, height: 12.8, rake: 4 }, { z: -.09, width: 5.2, depth: 7.8, height: 12.1, rake: 4 }],
    masts: [{ z: .065, height: 28, tripod: true, rake: 0 }, { z: -.12, height: 22, tripod: true, rake: 0 }],
    aviation: "stern-pair", aviationZ: -.415, shafts: 4, notes: "Tall enclosed US bridge, paired thin stacks, after-hangar hatch and two quarterdeck catapults.",
  },
  edinburgh: {
    id: "edinburgh", era: "1939", breadths: [.31,.60,.83,.97,1,1,.98,.91,.77,.54,.30,.135,.019],
    bow: "spoon", stern: "cruiser", sheer: 1.3, forecastleEnd: -.31,
    bridge: { form: "town", z: .083, width: 13.8, depth: 18, height: 14.8, tiers: 4 },
    funnels: [{ z: .025, width: 5.2, depth: 7.3, height: 12.5, rake: 8 }, { z: -.13, width: 5.0, depth: 7.0, height: 12.2, rake: 8 }],
    masts: [{ z: .075, height: 28.5, tripod: true, rake: 3 }, { z: -.20, height: 22.5, tripod: true, rake: 3 }],
    aviation: "midships-cross", aviationZ: -.06, shafts: 4, notes: "Town-group high block bridge, widely spaced stacks and transverse catapult with paired hangars.",
  },
  nurnberg: {
    id: "nurnberg", era: "1935", breadths: [.23,.52,.77,.92,.99,1,.96,.88,.71,.47,.255,.10,.016],
    bow: "raked", stern: "cruiser", sheer: 1.1, forecastleEnd: .095,
    bridge: { form: "tower", z: .155, width: 10.4, depth: 14.2, height: 13.2, tiers: 3 },
    funnels: [{ z: .025, width: 5.1, depth: 7.8, height: 13.2, rake: 8 }, { z: -.09, width: 4.3, depth: 6.5, height: 12.2, rake: 8 }],
    masts: [{ z: .12, height: 27, tripod: true, rake: 5 }, { z: -.135, height: 19, tripod: false, rake: 6 }],
    aviation: "midships-single", aviationZ: -.035, shafts: 3, notes: "Slender hull, forward tower bridge, two unequal stacks and central catapult; after artillery field left clear.",
  },
  agano: {
    id: "agano", era: "1942", breadths: [.27,.57,.81,.94,.99,1,.96,.88,.72,.46,.24,.09,.012],
    bow: "clipper", stern: "cruiser", sheer: 1.45, forecastleEnd: .08,
    bridge: { form: "enclosed", z: .07, width: 9.4, depth: 16, height: 16.4, tiers: 4 },
    funnels: [{ z: .015, width: 6.9, depth: 12.0, height: 14.5, rake: 19 }],
    masts: [{ z: .115, height: 27, tripod: true, rake: 3 }, { z: -.135, height: 21, tripod: true, rake: 3 }],
    aviation: "midships-single", aviationZ: -.085, shafts: 4, notes: "One large trunked funnel, narrow tall bridge and broad aviation working deck; not two cruiser chimneys.",
  },
  dido: {
    id: "dido", era: "1940完整设计型", breadths: [.30,.61,.84,.96,1,.99,.95,.86,.70,.46,.245,.10,.018],
    bow: "raked", stern: "cruiser", sheer: 1.0, forecastleEnd: .075,
    bridge: { form: "admiralty", z: .02, width: 9.9, depth: 11.5, height: 12.8, tiers: 3 },
    funnels: [{ z: -.045, width: 4.0, depth: 6.4, height: 11.2, rake: 6 }, { z: -.135, width: 3.8, depth: 5.9, height: 10.7, rake: 6 }],
    masts: [{ z: .002, height: 23.5, tripod: true, rake: 2 }, { z: -.22, height: 17.5, tripod: true, rake: 3 }],
    aviation: "none", aviationZ: 0, shafts: 4, notes: "Compact AA cruiser: bridge behind three forward mounts, narrow paired stacks; no aircraft catapult.",
  },
  "north-carolina": {
    id: "north-carolina", era: "1941", breadths: [.31,.61,.84,.96,1,1,.98,.91,.77,.55,.33,.15,.018],
    bow: "clipper", stern: "transom", sheer: 1.85, forecastleEnd: -.46,
    bridge: { form: "tower", z: .06, width: 18, depth: 25, height: 24.5, tiers: 5 },
    funnels: [{ z: -.025, width: 6.3, depth: 9.2, height: 17.5, rake: 2 }, { z: -.135, width: 6.0, depth: 8.6, height: 16.3, rake: 2 }],
    masts: [{ z: .055, height: 39, tripod: true, rake: 0 }, { z: -.16, height: 29, tripod: true, rake: 0 }],
    aviation: "stern-pair", aviationZ: -.41, shafts: 4, notes: "Fine raked bow, tall narrow tower foremast, two slim stacks, broad stern catapults; 1941 fittings simplified.",
  },
  "king-george-v": {
    id: "king-george-v", era: "1940", breadths: [.41,.72,.90,.985,1,1,.99,.94,.83,.63,.37,.15,.024],
    bow: "raked", stern: "transom", sheer: .55, forecastleEnd: -.46,
    bridge: { form: "admiralty", z: .062, width: 20.5, depth: 22, height: 22, tiers: 4 },
    funnels: [{ z: -.03, width: 7.2, depth: 11.2, height: 17, rake: 3 }, { z: -.145, width: 6.8, depth: 10.7, height: 16.5, rake: 3 }],
    masts: [{ z: .035, height: 36, tripod: true, rake: 0 }, { z: -.195, height: 29, tripod: true, rake: 0 }],
    aviation: "midships-cross", aviationZ: -.085, shafts: 4, notes: "Relatively low-sheer bow; massive slab bridge and twin broad funnels; 1940 athwartship aviation layout.",
  },
  bismarck: {
    id: "bismarck", era: "1940", breadths: [.32,.64,.88,.97,1,1,.98,.92,.80,.60,.35,.145,.016],
    bow: "atlantic", stern: "cruiser", sheer: 2.25, forecastleEnd: -.45,
    bridge: { form: "wedge", z: .065, width: 21, depth: 26, height: 24.0, tiers: 4 },
    funnels: [{ z: -.027, width: 10.5, depth: 14.5, height: 20, rake: 8 }],
    masts: [{ z: .038, height: 37, tripod: true, rake: 0 }, { z: -.11, height: 31.5, tripod: true, rake: 3 }],
    aviation: "midships-cross", aviationZ: -.085, shafts: 3, notes: "Atlantic bow, broad armoured conning tower, single large funnel and tall after tripod; central aircraft hangar.",
  },
  yamato: {
    id: "yamato", era: "1943形态", breadths: [.43,.73,.92,.99,1,1,.98,.93,.82,.65,.42,.21,.03],
    bow: "spoon", stern: "transom", sheer: 1.65, forecastleEnd: -.46,
    bridge: { form: "pagoda", z: .055, width: 20, depth: 25, height: 28.5, tiers: 6 },
    funnels: [{ z: -.025, width: 10, depth: 14, height: 20.5, rake: 23 }],
    masts: [{ z: .045, height: 41, tripod: false, rake: 0 }, { z: -.13, height: 31, tripod: true, rake: 10 }],
    aviation: "stern-rails", aviationZ: -.40, shafts: 4, notes: "Broad shouldered hull with bulbous forefoot, tall pagoda, steeply raked single funnel and stern handling rails; 1943 not 1945 AA forest.",
  },
  richelieu: {
    id: "richelieu", era: "1943完成态", breadths: [.35,.67,.88,.97,1,1,.98,.90,.75,.52,.285,.12,.014],
    bow: "clipper", stern: "transom", sheer: 1.65, forecastleEnd: -.46,
    bridge: { form: "french", z: .052, width: 20.2, depth: 25, height: 27, tiers: 5 },
    funnels: [{ z: -.10, width: 11.8, depth: 15, height: 23, rake: 27 }],
    masts: [{ z: .04, height: 39, tripod: false, rake: 0 }, { z: -.13, height: 30, tripod: false, rake: 8 }],
    aviation: "none", aviationZ: -.40, shafts: 4, notes: "All-forward battery field, compact tower bridge and distinctive raked funnel/mast assembly; aviation removed in 1943 refit.",
  },
};
