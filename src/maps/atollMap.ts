import type { ShipClassId } from "../ships/classes";
import { getShipClass } from "../ships/classes";
import type { Vec3 } from "../sim/types";

export type BattleMapId = "atoll-prototype" | "open-sea-range";
export type AtollTerrainKind = "shallow" | "sandbar" | "mountain";

export interface AtollTerrainZone {
  id: string;
  kind: AtollTerrainKind;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  heightMeters?: number;
  depthMeters?: number;
  radialProfile?: readonly number[];
}

export interface BattleMapDefinition {
  id: BattleMapId;
  name: string;
  halfExtentMeters: number;
  terrain: readonly AtollTerrainZone[];
}

export interface TerrainNavigation {
  kind: "deep" | "shallow" | "grounded";
  speedMultiplier: number;
  depthMeters: number;
  zone?: AtollTerrainZone;
}

export interface TerrainContact {
  zone: AtollTerrainZone;
  point: Vec3;
  distanceFraction: number;
  heightMeters: number;
}

const degrees = (value: number): number => value * Math.PI / 180;
const COAST_NW = [1.12, 1.2, 1.08, .82, .55, .62, .9, 1.16, 1.24, 1.02, .78, .7, .88, 1.14, 1.08, .84, .68, .76, 1.04, 1.18, .96, .72, .86, 1.06] as const;
const COAST_NE = [.92, 1.16, 1.25, 1.04, .74, .62, .7, .98, 1.2, 1.1, .86, .58, .66, .94, 1.18, 1.08, .8, .7, .9, 1.22, 1.14, .88, .72, .8] as const;
const COAST_SW = [1.18, 1.02, .76, .58, .64, .92, 1.24, 1.12, .82, .6, .7, 1.04, 1.2, .98, .72, .54, .62, .94, 1.16, 1.08, .86, .68, .9, 1.22] as const;
const COAST_SE = [.78, 1.04, 1.22, 1.1, .84, .6, .68, .96, 1.18, .98, .7, .56, .74, 1.08, 1.24, 1.02, .76, .66, .88, 1.14, 1.06, .82, .62, .7] as const;


interface TerrainDerived {
  cosine: number;
  sine: number;
  seed: number;
  seedCosine: number;
  seedSine: number;
  maximumRadial: number;
  baseBoundX: number;
  baseBoundZ: number;
}

const TERRAIN_DERIVED = new WeakMap<object, TerrainDerived>();

function terrainDerived(zone: Readonly<AtollTerrainZone>): TerrainDerived {
  const cached = TERRAIN_DERIVED.get(zone);
  if (cached) return cached;
  let seedInteger = 0;
  for (const character of zone.id) {
    seedInteger = (seedInteger * 31 + character.charCodeAt(0)) >>> 0;
  }
  const seed = seedInteger / 4_294_967_296 * Math.PI * 2;
  const cosine = Math.cos(zone.rotation);
  const sine = Math.sin(zone.rotation);
  const maximumRadial = zone.radialProfile
    ? Math.max(...zone.radialProfile)
    : zone.kind === "sandbar" ? 1.38 : zone.kind === "mountain" ? 1.31 : 1.26;
  const derived = {
    cosine,
    sine,
    seed,
    seedCosine: Math.cos(seed),
    seedSine: Math.sin(seed),
    maximumRadial,
    baseBoundX: Math.abs(cosine) * zone.radiusX + Math.abs(sine) * zone.radiusZ,
    baseBoundZ: Math.abs(sine) * zone.radiusX + Math.abs(cosine) * zone.radiusZ,
  };
  TERRAIN_DERIVED.set(zone, derived);
  return derived;
}

/**
 * One deterministic source for the 3D terrain, ship physics and both tactical maps.
 * The four mountain islands follow the approved concept art while the cardinal gaps
 * remain deep-water deployment and manoeuvre lanes.
 */
export const ATOLL_TERRAIN_ZONES: readonly AtollTerrainZone[] = [
  { id: "lagoon-nw", kind: "shallow", x: -1_650, z: 1_700, radiusX: 1_180, radiusZ: 930, rotation: degrees(24), depthMeters: 9, radialProfile: COAST_NW },
  { id: "mountain-nw", kind: "mountain", x: -1_680, z: 1_720, radiusX: 760, radiusZ: 570, rotation: degrees(24), heightMeters: 305, radialProfile: COAST_NW },
  { id: "lagoon-ne", kind: "shallow", x: 1_650, z: 1_760, radiusX: 1_120, radiusZ: 900, rotation: degrees(-22), depthMeters: 9, radialProfile: COAST_NE },
  { id: "mountain-ne", kind: "mountain", x: 1_680, z: 1_790, radiusX: 720, radiusZ: 560, rotation: degrees(-22), heightMeters: 340, radialProfile: COAST_NE },
  { id: "lagoon-sw", kind: "shallow", x: -1_720, z: -1_670, radiusX: 1_150, radiusZ: 920, rotation: degrees(-22), depthMeters: 9, radialProfile: COAST_SW },
  { id: "mountain-sw", kind: "mountain", x: -1_750, z: -1_690, radiusX: 740, radiusZ: 560, rotation: degrees(-22), heightMeters: 285, radialProfile: COAST_SW },
  { id: "lagoon-se", kind: "shallow", x: 1_700, z: -1_730, radiusX: 1_130, radiusZ: 900, rotation: degrees(25), depthMeters: 9, radialProfile: COAST_SE },
  { id: "mountain-se", kind: "mountain", x: 1_730, z: -1_760, radiusX: 730, radiusZ: 550, rotation: degrees(25), heightMeters: 325, radialProfile: COAST_SE },

  { id: "reef-nw", kind: "shallow", x: -3_750, z: 3_630, radiusX: 1_650, radiusZ: 470, rotation: degrees(18), depthMeters: 6.5 },
  { id: "sand-nw", kind: "sandbar", x: -3_820, z: 3_690, radiusX: 1_120, radiusZ: 175, rotation: degrees(18), heightMeters: 8 },
  { id: "reef-ne", kind: "shallow", x: 3_720, z: 3_680, radiusX: 1_620, radiusZ: 470, rotation: degrees(-17), depthMeters: 6.5 },
  { id: "sand-ne", kind: "sandbar", x: 3_790, z: 3_730, radiusX: 1_080, radiusZ: 170, rotation: degrees(-17), heightMeters: 7 },
  { id: "reef-sw", kind: "shallow", x: -3_720, z: -3_650, radiusX: 1_620, radiusZ: 470, rotation: degrees(-17), depthMeters: 6.5 },
  { id: "sand-sw", kind: "sandbar", x: -3_790, z: -3_710, radiusX: 1_080, radiusZ: 170, rotation: degrees(-17), heightMeters: 7 },
  { id: "reef-se", kind: "shallow", x: 3_750, z: -3_620, radiusX: 1_650, radiusZ: 470, rotation: degrees(18), depthMeters: 6.5 },
  { id: "sand-se", kind: "sandbar", x: 3_820, z: -3_680, radiusX: 1_120, radiusZ: 175, rotation: degrees(18), heightMeters: 8 },

  { id: "reef-west", kind: "shallow", x: -4_550, z: 0, radiusX: 480, radiusZ: 1_300, rotation: degrees(-3), depthMeters: 6 },
  { id: "sand-west", kind: "sandbar", x: -4_610, z: 40, radiusX: 175, radiusZ: 820, rotation: degrees(-3), heightMeters: 6 },
  { id: "reef-east", kind: "shallow", x: 4_550, z: 0, radiusX: 480, radiusZ: 1_300, rotation: degrees(-3), depthMeters: 6 },
  { id: "sand-east", kind: "sandbar", x: 4_610, z: -40, radiusX: 175, radiusZ: 820, rotation: degrees(-3), heightMeters: 6 },

  { id: "central-shoal-nw", kind: "shallow", x: -620, z: 830, radiusX: 370, radiusZ: 190, rotation: degrees(-28), depthMeters: 6 },
  { id: "central-sand-nw", kind: "sandbar", x: -650, z: 850, radiusX: 210, radiusZ: 78, rotation: degrees(-28), heightMeters: 5 },
  { id: "central-shoal-se", kind: "shallow", x: 720, z: -560, radiusX: 370, radiusZ: 190, rotation: degrees(-28), depthMeters: 6 },
  { id: "central-sand-se", kind: "sandbar", x: 750, z: -580, radiusX: 210, radiusZ: 78, rotation: degrees(-28), heightMeters: 5 },
] as const;

export const ATOLL_MAP: BattleMapDefinition = {
  id: "atoll-prototype",
  name: "破晓环礁",
  halfExtentMeters: 6_000,
  terrain: ATOLL_TERRAIN_ZONES,
};

export const OPEN_SEA_RANGE_MAP: BattleMapDefinition = {
  id: "open-sea-range",
  name: "外海试验场",
  halfExtentMeters: 6_000,
  terrain: [],
};

export function battleMapDefinition(mapId: BattleMapId): BattleMapDefinition {
  return mapId === "atoll-prototype" ? ATOLL_MAP : OPEN_SEA_RANGE_MAP;
}

function terrainSeed(zone: Readonly<AtollTerrainZone>): number {
  return terrainDerived(zone).seed;
}

function localEllipsePoint(zone: Readonly<AtollTerrainZone>, x: number, z: number): { x: number; z: number } {
  const dx = x - zone.x;
  const dz = z - zone.z;
  const { cosine, sine } = terrainDerived(zone);
  return {
    x: dx * cosine - dz * sine,
    z: dx * sine + dz * cosine,
  };
}

export function terrainZoneRadialFactor(
  zone: Readonly<AtollTerrainZone>,
  angle: number,
): number {
  const profile = zone.radialProfile;
  if (profile && profile.length >= 3) {
    const wrapped = ((angle / (Math.PI * 2)) % 1 + 1) % 1 * profile.length;
    const index = Math.floor(wrapped);
    const next = (index + 1) % profile.length;
    const blend = wrapped - index;
    return profile[index]! * (1 - blend) + profile[next]! * blend;
  }
  const seed = terrainSeed(zone);
  const amplitude = zone.kind === "mountain" ? .16 : zone.kind === "sandbar" ? .2 : .13;
  return Math.max(.58, 1
    + Math.sin(angle * 3 + seed) * amplitude
    + Math.sin(angle * 5 - seed * .7) * amplitude * .48
    + Math.cos(angle * 2 + seed * 1.3) * amplitude * .32);
}

function normalizedTerrainRadius(
  zone: Readonly<AtollTerrainZone>,
  localX: number,
  localZ: number,
): number {
  const normalizedX = localX / Math.max(1, zone.radiusX);
  const normalizedZ = localZ / Math.max(1, zone.radiusZ);
  const angle = Math.atan2(normalizedZ, normalizedX);
  return Math.hypot(normalizedX, normalizedZ) / terrainZoneRadialFactor(zone, angle);
}

export function terrainZoneContains(
  zone: Readonly<AtollTerrainZone>,
  x: number,
  z: number,
  paddingMeters = 0,
): boolean {
  const derived = terrainDerived(zone);
  const paddingRatio = paddingMeters / Math.max(1, Math.min(zone.radiusX, zone.radiusZ));
  const boundX = derived.baseBoundX * (derived.maximumRadial + paddingRatio);
  const boundZ = derived.baseBoundZ * (derived.maximumRadial + paddingRatio);
  if (
    Math.abs(x - zone.x) > boundX
    || Math.abs(z - zone.z) > boundZ
  ) return false;
  const local = localEllipsePoint(zone, x, z);
  const normalizedRadius = normalizedTerrainRadius(zone, local.x, local.z);
  return normalizedRadius <= 1 + paddingRatio;
}

export function terrainContour(
  zone: Readonly<AtollTerrainZone>,
  segments = 32,
  scale = 1,
): Array<{ x: number; z: number }> {
  const count = Math.max(12, segments);
  const { cosine, sine } = terrainDerived(zone);
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    const radial = terrainZoneRadialFactor(zone, angle) * scale;
    const localX = Math.cos(angle) * zone.radiusX * radial;
    const localZ = Math.sin(angle) * zone.radiusZ * radial;
    return {
      x: zone.x + localX * cosine + localZ * sine,
      z: zone.z - localX * sine + localZ * cosine,
    };
  });
}

function zoneHeightAt(zone: Readonly<AtollTerrainZone>, x: number, z: number): number {
  if (zone.kind === "shallow") return 0;
  const local = localEllipsePoint(zone, x, z);
  const radial = normalizedTerrainRadius(zone, local.x, local.z);
  if (radial > 1) return 0;
  const inland = Math.max(0, 1 - radial);
  const height = zone.heightMeters ?? 0;
  if (zone.kind === "sandbar") return height * (.16 + .84 * inland ** .58);
  const nx = local.x / Math.max(1, zone.radiusX);
  const nz = local.z / Math.max(1, zone.radiusZ);
  const { seedCosine: cosine, seedSine: sine } = terrainDerived(zone);
  const ridgeX = nx * cosine - nz * sine;
  const ridgeZ = nx * sine + nz * cosine;
  const ridge = Math.exp(-((ridgeZ - ridgeX * .2) ** 2) / .035)
    * Math.exp(-(ridgeX ** 2) / 1.1);
  const peakA = Math.exp(-(((ridgeX + .28) / .24) ** 2 + ((ridgeZ + .05) / .3) ** 2));
  const peakB = Math.exp(-(((ridgeX - .18) / .3) ** 2 + ((ridgeZ - .18) / .22) ** 2));
  const peakC = Math.exp(-(((ridgeX - .42) / .22) ** 2 + ((ridgeZ + .16) / .25) ** 2));
  const relief = Math.min(
    1, .16 + ridge * .52 + Math.max(peakA, peakB * .86, peakC * .72) * .58,
  );
  return height * relief * inland ** .34;
}

export function terrainHeightAt(mapId: BattleMapId, x: number, z: number): number {
  return battleMapDefinition(mapId).terrain.reduce(
    (height, zone) => Math.max(height, zoneHeightAt(zone, x, z)),
    0,
  );
}

export function shipDraftMeters(shipClassId: ShipClassId): number {
  const hullId = getShipClass(shipClassId).hullId;
  return hullId === "battleship" ? 10.5 : hullId === "lightCruiser" ? 6.5 : 4.5;
}

export function terrainNavigationAt(
  mapId: BattleMapId,
  x: number,
  z: number,
  draftMeters: number,
): TerrainNavigation {
  const map = battleMapDefinition(mapId);
  if (Math.abs(x) > map.halfExtentMeters || Math.abs(z) > map.halfExtentMeters) {
    return { kind: "grounded", speedMultiplier: 0, depthMeters: 0 };
  }
  let shallow: AtollTerrainZone | undefined;
  for (const zone of map.terrain) {
    if (!terrainZoneContains(zone, x, z)) continue;
    if (zone.kind !== "shallow") {
      return { kind: "grounded", speedMultiplier: 0, depthMeters: 0, zone };
    }
    if (!shallow || (zone.depthMeters ?? 80) < (shallow.depthMeters ?? 80)) {
      shallow = zone;
    }
  }
  if (!shallow) {
    return { kind: "deep", speedMultiplier: 1, depthMeters: 80 };
  }
  const depthMeters = shallow.depthMeters ?? 80;
  const clearance = depthMeters - draftMeters;
  if (clearance <= 0.5) {
    return { kind: "grounded", speedMultiplier: 0, depthMeters, zone: shallow };
  }
  const speedMultiplier = clearance < 2.5 ? 0.42 : clearance < 5 ? 0.66 : 0.82;
  return { kind: "shallow", speedMultiplier, depthMeters, zone: shallow };
}

function segmentTerrainInterval(
  zone: Readonly<AtollTerrainZone>,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  paddingMeters = 0,
): { enter: number; exit: number } | undefined {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const closestFraction = lengthSquared <= 1e-9 ? 0 : Math.max(0, Math.min(1,
    ((zone.x - from.x) * dx + (zone.z - from.z) * dz) / lengthSquared,
  ));
  const closestX = from.x + dx * closestFraction;
  const closestZ = from.z + dz * closestFraction;
  const radialPadding = paddingMeters / Math.max(1, Math.min(zone.radiusX, zone.radiusZ));
  const reach = Math.max(zone.radiusX, zone.radiusZ)
    * (terrainDerived(zone).maximumRadial + radialPadding);
  if ((closestX - zone.x) ** 2 + (closestZ - zone.z) ** 2 > reach ** 2) return undefined;
  const length = Math.sqrt(lengthSquared);
  const sampleSpacing = Math.max(12, Math.min(zone.radiusX, zone.radiusZ) * .12);
  const steps = Math.max(8, Math.min(128, Math.ceil(length / sampleSpacing)));
  const containsAt = (fraction: number): boolean => terrainZoneContains(
    zone, from.x + dx * fraction, from.z + dz * fraction, paddingMeters,
  );
  let previousFraction = 0;
  let previousInside = containsAt(0);
  let enter: number | undefined = previousInside ? 0 : undefined;
  for (let index = 1; index <= steps; index += 1) {
    const fraction = index / steps;
    const inside = containsAt(fraction);
    if (!previousInside && inside && enter === undefined) {
      let low = previousFraction;
      let high = fraction;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const middle = (low + high) / 2;
        if (containsAt(middle)) high = middle; else low = middle;
      }
      enter = high;
    } else if (previousInside && !inside && enter !== undefined) {
      let low = previousFraction;
      let high = fraction;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const middle = (low + high) / 2;
        if (containsAt(middle)) low = middle; else high = middle;
      }
      return { enter, exit: low };
    }
    previousFraction = fraction;
    previousInside = inside;
  }
  return enter === undefined ? undefined : { enter, exit: 1 };
}

export function firstTerrainIntersection(
  mapId: BattleMapId,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  kinds: readonly AtollTerrainKind[] = ["sandbar", "mountain"],
): TerrainContact | undefined {
  let first: TerrainContact | undefined;
  for (const zone of battleMapDefinition(mapId).terrain) {
    if (!kinds.includes(zone.kind)) continue;
    const interval = segmentTerrainInterval(zone, from, to);
    if (!interval) continue;
    const steps = 14;
    for (let index = 0; index <= steps; index += 1) {
      const fraction = interval.enter + (interval.exit - interval.enter) * index / steps;
      if (first && fraction >= first.distanceFraction) break;
      const point = {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
      };
      const heightMeters = zoneHeightAt(zone, point.x, point.z);
      if (point.y <= heightMeters + 0.5) {
        first = { zone, point, distanceFraction: fraction, heightMeters };
        break;
      }
    }
  }
  return first;
}

export function firstNavigationHazard(
  mapId: BattleMapId,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  draftMeters: number,
  paddingMeters: number,
): TerrainContact | undefined {
  let first: TerrainContact | undefined;
  for (const zone of battleMapDefinition(mapId).terrain) {
    const blocks = zone.kind !== "shallow" || (zone.depthMeters ?? 80) - draftMeters <= 0.5;
    if (!blocks) continue;
    const interval = segmentTerrainInterval(zone, from, to, paddingMeters);
    if (!interval || (first && interval.enter >= first.distanceFraction)) continue;
    const point = {
      x: from.x + (to.x - from.x) * interval.enter,
      y: 0,
      z: from.z + (to.z - from.z) * interval.enter,
    };
    first = {
      zone,
      point,
      distanceFraction: interval.enter,
      heightMeters: zone.kind === "shallow" ? 0 : zoneHeightAt(zone, point.x, point.z),
    };
  }
  return first;
}

export function terrainBlocksLineOfSight(
  mapId: BattleMapId,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  fromHeightMeters = 18,
  toHeightMeters = 18,
): boolean {
  return Boolean(firstTerrainIntersection(
    mapId,
    { ...from, y: from.y + fromHeightMeters },
    { ...to, y: to.y + toHeightMeters },
    ["mountain"],
  ));
}

function headingRisk(
  mapId: BattleMapId,
  position: Readonly<Vec3>,
  heading: number,
  draftMeters: number,
): number {
  const distances = [220, 430, 700, 1_000];
  let risk = 0;
  for (const distance of distances) {
    const x = position.x + Math.sin(heading) * distance;
    const z = position.z + Math.cos(heading) * distance;
    const navigation = terrainNavigationAt(mapId, x, z, draftMeters);
    if (navigation.kind === "grounded") risk += 100 + (1_100 - distance) * 0.1;
    else if (navigation.kind === "shallow") risk += (1 - navigation.speedMultiplier) * 8;
  }
  return risk;
}

export function terrainSafeHeading(
  mapId: BattleMapId,
  position: Readonly<Vec3>,
  desiredHeading: number,
  shipClassId: ShipClassId,
): number {
  if (mapId === "open-sea-range") return desiredHeading;
  const draft = shipDraftMeters(shipClassId);
  const offsets = [0, degrees(22.5), degrees(-22.5), degrees(45), degrees(-45), degrees(67.5), degrees(-67.5), degrees(90), degrees(-90)];
  let bestHeading = desiredHeading;
  let bestRisk = Number.POSITIVE_INFINITY;
  for (const offset of offsets) {
    const candidate = desiredHeading + offset;
    const risk = headingRisk(mapId, position, candidate, draft) + Math.abs(offset) * 0.8;
    if (risk < bestRisk) {
      bestRisk = risk;
      bestHeading = candidate;
    }
  }
  return bestHeading;
}
