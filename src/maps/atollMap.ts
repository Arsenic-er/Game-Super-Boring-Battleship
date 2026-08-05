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

/**
 * One deterministic source for the 3D terrain, ship physics and both tactical maps.
 * The four mountain islands follow the approved concept art while the cardinal gaps
 * remain deep-water deployment and manoeuvre lanes.
 */
export const ATOLL_TERRAIN_ZONES: readonly AtollTerrainZone[] = [
  { id: "lagoon-nw", kind: "shallow", x: -1_650, z: 1_700, radiusX: 1_180, radiusZ: 930, rotation: degrees(24), depthMeters: 9 },
  { id: "mountain-nw", kind: "mountain", x: -1_680, z: 1_720, radiusX: 760, radiusZ: 570, rotation: degrees(24), heightMeters: 305 },
  { id: "lagoon-ne", kind: "shallow", x: 1_650, z: 1_760, radiusX: 1_120, radiusZ: 900, rotation: degrees(-22), depthMeters: 9 },
  { id: "mountain-ne", kind: "mountain", x: 1_680, z: 1_790, radiusX: 720, radiusZ: 560, rotation: degrees(-22), heightMeters: 340 },
  { id: "lagoon-sw", kind: "shallow", x: -1_720, z: -1_670, radiusX: 1_150, radiusZ: 920, rotation: degrees(-22), depthMeters: 9 },
  { id: "mountain-sw", kind: "mountain", x: -1_750, z: -1_690, radiusX: 740, radiusZ: 560, rotation: degrees(-22), heightMeters: 285 },
  { id: "lagoon-se", kind: "shallow", x: 1_700, z: -1_730, radiusX: 1_130, radiusZ: 900, rotation: degrees(25), depthMeters: 9 },
  { id: "mountain-se", kind: "mountain", x: 1_730, z: -1_760, radiusX: 730, radiusZ: 550, rotation: degrees(25), heightMeters: 325 },

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

function localEllipsePoint(zone: Readonly<AtollTerrainZone>, x: number, z: number): { x: number; z: number } {
  const dx = x - zone.x;
  const dz = z - zone.z;
  const cosine = Math.cos(zone.rotation);
  const sine = Math.sin(zone.rotation);
  return {
    x: dx * cosine - dz * sine,
    z: dx * sine + dz * cosine,
  };
}

export function terrainZoneContains(
  zone: Readonly<AtollTerrainZone>,
  x: number,
  z: number,
  paddingMeters = 0,
): boolean {
  const local = localEllipsePoint(zone, x, z);
  const radiusX = Math.max(1, zone.radiusX + paddingMeters);
  const radiusZ = Math.max(1, zone.radiusZ + paddingMeters);
  return (local.x / radiusX) ** 2 + (local.z / radiusZ) ** 2 <= 1;
}

export function terrainContour(
  zone: Readonly<AtollTerrainZone>,
  segments = 28,
  scale = 1,
): Array<{ x: number; z: number }> {
  const cosine = Math.cos(zone.rotation);
  const sine = Math.sin(zone.rotation);
  return Array.from({ length: Math.max(8, segments) }, (_, index) => {
    const angle = index / Math.max(8, segments) * Math.PI * 2;
    const localX = Math.cos(angle) * zone.radiusX * scale;
    const localZ = Math.sin(angle) * zone.radiusZ * scale;
    return {
      x: zone.x + localX * cosine + localZ * sine,
      z: zone.z - localX * sine + localZ * cosine,
    };
  });
}

function zoneHeightAt(zone: Readonly<AtollTerrainZone>, x: number, z: number): number {
  if (zone.kind === "shallow") return 0;
  const local = localEllipsePoint(zone, x, z);
  const radialSquared = (local.x / zone.radiusX) ** 2 + (local.z / zone.radiusZ) ** 2;
  if (radialSquared > 1) return 0;
  const profile = Math.max(0, 1 - radialSquared);
  const edgeFloor = zone.kind === "sandbar" ? 0.28 : 0.04;
  return (zone.heightMeters ?? 0) * (edgeFloor + (1 - edgeFloor) * profile ** 0.72);
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
  const solid = map.terrain.find((zone) =>
    zone.kind !== "shallow" && terrainZoneContains(zone, x, z));
  if (solid) return { kind: "grounded", speedMultiplier: 0, depthMeters: 0, zone: solid };
  const shallows = map.terrain.filter((zone) =>
    zone.kind === "shallow" && terrainZoneContains(zone, x, z));
  if (shallows.length === 0) {
    return { kind: "deep", speedMultiplier: 1, depthMeters: 80 };
  }
  const shallow = shallows.reduce((least, zone) =>
    (zone.depthMeters ?? 80) < (least.depthMeters ?? 80) ? zone : least);
  const depthMeters = shallow.depthMeters ?? 80;
  const clearance = depthMeters - draftMeters;
  if (clearance <= 0.5) {
    return { kind: "grounded", speedMultiplier: 0, depthMeters, zone: shallow };
  }
  const speedMultiplier = clearance < 2.5 ? 0.42 : clearance < 5 ? 0.66 : 0.82;
  return { kind: "shallow", speedMultiplier, depthMeters, zone: shallow };
}

function segmentEllipseInterval(
  zone: Readonly<AtollTerrainZone>,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  paddingMeters = 0,
): { enter: number; exit: number } | undefined {
  const start = localEllipsePoint(zone, from.x, from.z);
  const end = localEllipsePoint(zone, to.x, to.z);
  const radiusX = Math.max(1, zone.radiusX + paddingMeters);
  const radiusZ = Math.max(1, zone.radiusZ + paddingMeters);
  const sx = start.x / radiusX;
  const sz = start.z / radiusZ;
  const dx = (end.x - start.x) / radiusX;
  const dz = (end.z - start.z) / radiusZ;
  const a = dx * dx + dz * dz;
  const b = 2 * (sx * dx + sz * dz);
  const c = sx * sx + sz * sz - 1;
  if (a <= 1e-12) return c <= 0 ? { enter: 0, exit: 1 } : undefined;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return c <= 0 ? { enter: 0, exit: 1 } : undefined;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  const enter = Math.max(0, Math.min(first, second));
  const exit = Math.min(1, Math.max(first, second));
  return enter <= exit ? { enter, exit } : undefined;
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
    const interval = segmentEllipseInterval(zone, from, to);
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
    const interval = segmentEllipseInterval(zone, from, to, paddingMeters);
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
