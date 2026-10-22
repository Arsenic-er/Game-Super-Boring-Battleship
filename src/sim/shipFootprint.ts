import {
  battleMapDefinition, shipDraftMeters, terrainContour,
  type AtollTerrainZone, type BattleMapDefinition, type BattleMapId,
} from "../maps/atollMap";
import { getShipClass, type ShipClassId } from "../ships/classes";

export interface FootprintPoint { x: number; z: number }
export interface ShipFootprintPose { position: Readonly<FootprintPoint>; heading: number }
export interface ShipTerrainFootprintContact {
  blocked: boolean;
  boundary: boolean;
  zoneIds: readonly string[];
}
export interface ShipTerrainMotion {
  fraction: number;
  position: FootprintPoint;
  heading: number;
  blocked: boolean;
  startedOverlapping: boolean;
  exiting: boolean;
  budgetExhausted: boolean;
  /** An old overlap permitted outward translation, but its attempted yaw was rejected. */
  rotationBlocked?: boolean;
  /** Contact at the accepted pose, including any remaining legacy overlap. */
  contact: ShipTerrainFootprintContact;
  /** The rejected sweep's obstruction, not a claim that the accepted pose penetrated it. */
  blockingContact?: ShipTerrainFootprintContact;
}

type MapSource = BattleMapId | Readonly<BattleMapDefinition>;
interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
interface Coast { zone: Readonly<AtollTerrainZone>; points: FootprintPoint[]; error: number; bounds: Bounds }
const COASTS = new WeakMap<object, Coast>();
const EPS = 1e-8;
const MAX_SWEEP_STEPS = 32;
const MAX_CORNER_TRAVEL = 2;
const CLEAR: ShipTerrainFootprintContact = Object.freeze({ blocked: false, boundary: false, zoneIds: Object.freeze([]) });

/** Exactly the existing ship/ship collision OBB, not the projectile or rendered mesh. */
export function shipFootprintDimensions(shipClassId: ShipClassId): { halfLength: number; halfBeam: number } {
  const hull = getShipClass(shipClassId);
  return { halfLength: hull.length * .48, halfBeam: hull.beam * .55 };
}

export function shipFootprintCorners(shipClassId: ShipClassId, pose: Readonly<ShipFootprintPose>): FootprintPoint[] {
  const { halfLength: length, halfBeam: beam } = shipFootprintDimensions(shipClassId);
  const s = Math.sin(pose.heading), c = Math.cos(pose.heading), p = pose.position;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([f, r]) => ({
    x: p.x + s * length * f + c * beam * r,
    z: p.z + c * length * f - s * beam * r,
  }));
}

const cross = (a: FootprintPoint, b: FootprintPoint, p: FootprintPoint): number =>
  (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const bounds = (points: readonly FootprintPoint[]): Bounds => ({
  minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
  minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)),
});
const intersectsBounds = (a: Bounds, b: Bounds): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const mapDefinition = (map: MapSource): Readonly<BattleMapDefinition> =>
  typeof map === "string" ? battleMapDefinition(map) : map;
const blocksDraft = (zone: Readonly<AtollTerrainZone>, draft: number): boolean =>
  zone.kind !== "shallow" || (zone.depthMeters ?? 80) - draft <= .5;

function coast(zone: Readonly<AtollTerrainZone>): Coast {
  const cached = COASTS.get(zone);
  if (cached) return cached;
  // Analytic containment normalizes with max(1, radius), whereas terrainContour
  // uses raw radii. Preserve the original object/cache key, but conservatively
  // cover that effective analytic radius for sub-metre custom geometry. The
  // analytic raw-radius broad-phase can reject some of this extra envelope.
  const effectiveZone = zone.radiusX >= 1 && zone.radiusZ >= 1 ? zone
    : { ...zone, radiusX: Math.max(1, zone.radiusX), radiusZ: Math.max(1, zone.radiusZ) };
  const profile = zone.radialProfile;
  let maximum: number, slope: number, curvature: number, multiple = 16;
  if (profile && profile.length >= 3) {
    maximum = Math.max(...profile);
    slope = Math.max(...profile.map((r, i) => Math.abs(r - profile[(i + 1) % profile.length]!)))
      * profile.length / (Math.PI * 2);
    curvature = 0;
    // A chord must never straddle a derivative discontinuity at a profile knot.
    multiple = profile.length;
  } else {
    const amplitude = zone.kind === "mountain" ? .16 : zone.kind === "sandbar" ? .2 : .13;
    maximum = 1 + amplitude * 1.8;
    slope = amplitude * (3 + 5 * .48 + 2 * .32);
    curvature = amplitude * (9 + 25 * .48 + 4 * .32);
    // These supported harmonics stay above .58, so the radial max() is inactive.
  }
  const secondDerivative = Math.max(effectiveZone.radiusX, effectiveZone.radiusZ) * (maximum + 2 * slope + curvature);
  const desired = Math.ceil(Math.PI * 2 * Math.sqrt(secondDerivative / (8 * .5)));
  const segments = Math.max(multiple, Math.min(512, Math.ceil(Math.max(32, desired) / multiple) * multiple));
  // Re-align the cap too. The actual error below is retained even if > .5 m.
  const count = Math.max(multiple, Math.floor(segments / multiple) * multiple);
  const points = terrainContour(effectiveZone, count);
  // q(theta) = rotated diag(radii) * r(theta) * (cos(theta),sin(theta)).
  // ||q''|| <= maxRadius * (|r| + 2|r'| + |r''|). Linear chord error <= M*h*h/8.
  // Expanding a hull by this distance contains every curve/polygon discrepancy;
  // the cached polygon alone is NOT asserted to be the exact analytic coastline.
  const error = secondDerivative * (Math.PI * 2 / count) ** 2 / 8 + EPS;
  const box = bounds(points);
  box.minX -= error; box.maxX += error; box.minZ -= error; box.maxZ += error;
  const result = { zone, points, error, bounds: box };
  COASTS.set(zone, result);
  return result;
}

function convexHull(points: readonly FootprintPoint[]): FootprintPoint[] {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const lower: FootprintPoint[] = [], upper: FootprintPoint[] = [];
  for (const p of ordered) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = ordered.length - 1; i >= 0; i--) {
    const p = ordered[i]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

/** A square Minkowski expansion contains the requested Euclidean error disk. */
function expanded(polygon: readonly FootprintPoint[], distance: number): FootprintPoint[] {
  if (distance <= EPS) return [...polygon];
  return convexHull(polygon.flatMap(p => [
    { x: p.x - distance, z: p.z - distance }, { x: p.x + distance, z: p.z - distance },
    { x: p.x + distance, z: p.z + distance }, { x: p.x - distance, z: p.z + distance },
  ]));
}

function insideConvex(p: FootprintPoint, polygon: readonly FootprintPoint[]): boolean {
  return polygon.every((a, i) => cross(a, polygon[(i + 1) % polygon.length]!, p) >= -EPS);
}
function insidePolygon(p: FootprintPoint, polygon: readonly FootprintPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function segmentsIntersect(a: FootprintPoint, b: FootprintPoint, c: FootprintPoint, d: FootprintPoint): boolean {
  if (Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x) || Math.max(c.x, d.x) + EPS < Math.min(a.x, b.x)
    || Math.max(a.z, b.z) + EPS < Math.min(c.z, d.z) || Math.max(c.z, d.z) + EPS < Math.min(a.z, b.z)) return false;
  return cross(a, b, c) * cross(a, b, d) <= EPS && cross(c, d, a) * cross(c, d, b) <= EPS;
}
function intersectsCoast(hull: readonly FootprintPoint[], shoreline: readonly FootprintPoint[]): boolean {
  // Either polygon can contain the other without any crossed edge.
  if (insidePolygon(hull[0]!, shoreline) || shoreline.some(p => insideConvex(p, hull))) return true;
  for (let i = 0; i < shoreline.length; i++) {
    const a = shoreline[i]!, b = shoreline[(i + 1) % shoreline.length]!;
    for (let j = 0; j < hull.length; j++) {
      if (segmentsIntersect(a, b, hull[j]!, hull[(j + 1) % hull.length]!)) return true;
    }
  }
  return false;
}

function contactForPolygon(
  polygon: readonly FootprintPoint[], zones: readonly Coast[], halfExtent: number, motionError = 0,
): ShipTerrainFootprintContact {
  const boundary = polygon.some(p => Math.abs(p.x) + motionError > halfExtent || Math.abs(p.z) + motionError > halfExtent);
  const box = bounds(polygon);
  box.minX -= motionError; box.maxX += motionError; box.minZ -= motionError; box.maxZ += motionError;
  const zoneIds: string[] = [];
  for (const zone of zones) {
    if (intersectsBounds(box, zone.bounds) && intersectsCoast(expanded(polygon, zone.error + motionError), zone.points)) {
      zoneIds.push(zone.zone.id);
    }
  }
  return boundary || zoneIds.length ? { blocked: true, boundary, zoneIds } : CLEAR;
}

function nearbyCoasts(map: Readonly<BattleMapDefinition>, draft: number, box: Bounds): Coast[] {
  const result: Coast[] = [];
  for (const zone of map.terrain) {
    if (!blocksDraft(zone, draft)) continue;
    const data = coast(zone);
    if (intersectsBounds(box, data.bounds)) result.push(data);
  }
  return result;
}

export function shipTerrainFootprintContact(
  source: MapSource, shipClassId: ShipClassId, pose: Readonly<ShipFootprintPose>,
): ShipTerrainFootprintContact {
  const map = mapDefinition(source), corners = shipFootprintCorners(shipClassId, pose);
  return contactForPolygon(corners, nearbyCoasts(map, shipDraftMeters(shipClassId), bounds(corners)), map.halfExtentMeters);
}

function clipHalfPlane(
  polygon: readonly FootprintPoint[], signedDistance: (point: FootprintPoint) => number,
): FootprintPoint[] {
  if (!polygon.length) return [];
  const result: FootprintPoint[] = [];
  let previous = polygon.at(-1)!, priorDistance = signedDistance(previous);
  for (const point of polygon) {
    const distance = signedDistance(point);
    if ((distance >= 0) !== (priorDistance >= 0)) {
      const t = priorDistance / (priorDistance - distance);
      result.push({ x: previous.x + (point.x - previous.x) * t, z: previous.z + (point.z - previous.z) * t });
    }
    if (distance >= 0) result.push(point);
    previous = point; priorDistance = distance;
  }
  return result;
}
function clipConvex(polygon: readonly FootprintPoint[], clip: readonly FootprintPoint[]): FootprintPoint[] {
  let result = [...polygon];
  for (let i = 0; i < clip.length && result.length; i++) {
    const a = clip[i]!, b = clip[(i + 1) % clip.length]!;
    result = clipHalfPlane(result, p => cross(a, b, p));
  }
  return result;
}
function area(polygon: readonly FootprintPoint[]): number {
  if (polygon.length < 3) return 0;
  // Shift to the first point to keep small overlap areas stable at kilometre coordinates.
  const origin = polygon[0]!;
  let result = 0;
  for (let i = 1; i + 1 < polygon.length; i++) result += cross(origin, polygon[i]!, polygon[i + 1]!);
  return Math.abs(result) * .5;
}
function zoneOverlap(polygon: readonly FootprintPoint[], zone: Coast, allowed?: readonly FootprintPoint[]): { area: number; subset: boolean } {
  let total = 0, subset = true;
  const center = { x: zone.zone.x, z: zone.zone.z };
  // Radial zones are star-shaped: the fan partitions the polygon without overlap.
  for (let i = 0; i < zone.points.length; i++) {
    const piece = clipConvex([center, zone.points[i]!, zone.points[(i + 1) % zone.points.length]!], polygon);
    total += area(piece);
    if (allowed && piece.some(p => !insideConvex(p, allowed))) subset = false;
  }
  return { area: total, subset };
}

function outwardStep(
  from: readonly FootprintPoint[], to: readonly FootprintPoint[], sweep: readonly FootprintPoint[],
  zones: readonly Coast[], halfExtent: number, rotationError: number,
): boolean {
  let improved = false;
  for (const zone of zones) {
    const before = expanded(from, zone.error), after = expanded(to, zone.error);
    const swept = expanded(sweep, zone.error + rotationError);
    if (!intersectsBounds(bounds(swept), zone.bounds)) continue;
    const prior = zoneOverlap(before, zone), next = zoneOverlap(after, zone);
    const envelope = zoneOverlap(swept, zone, before);
    // Per-zone nonincrease is necessary but not sufficient: every swept contact
    // must also remain inside the previously occupied, conservatively expanded hull.
    // Thus improving one shoal cannot license a new incursion into another lobe.
    if (!envelope.subset || next.area > prior.area + EPS) return false;
    improved ||= next.area < prior.area - EPS;
  }
  for (const axis of ["x", "z"] as const) for (const sign of [-1, 1]) {
    const distance = (p: FootprintPoint): number => sign * p[axis] - halfExtent;
    const prior = clipHalfPlane(from, distance), next = clipHalfPlane(to, distance);
    const envelope = clipHalfPlane(expanded(sweep, rotationError), distance);
    if (envelope.some(p => !insideConvex(p, from)) || area(next) > area(prior) + EPS) return false;
    improved ||= area(next) < area(prior) - EPS;
  }
  return improved;
}

/**
 * Constrain actual physical translation AND rotation; this does not steer or propel.
 * Each bounded substep encloses both endpoint OBBs plus the rotational chord error
 * R*dHeading^2/8. This is conservative coverage, not a claim of exact time of impact.
 * Large travel exhausts a fixed budget and returns the last certified pose rather
 * than skipping the untested remainder. Existing overlap is allowed only on small,
 * strictly outward steps with no newly occupied terrain region (per-zone checks).
 */
function constrainCommonPoseMotion(
  source: MapSource, shipClassId: ShipClassId,
  from: Readonly<ShipFootprintPose>, to: Readonly<ShipFootprintPose>,
): ShipTerrainMotion {
  const map = mapDefinition(source), dimensions = shipFootprintDimensions(shipClassId);
  const radius = Math.hypot(dimensions.halfLength, dimensions.halfBeam);
  const translation = Math.hypot(to.position.x - from.position.x, to.position.z - from.position.z);
  // Headings are unwrapped simulation values: a large turn must not become a zero sweep.
  const turn = to.heading - from.heading;
  const travel = translation + radius * Math.abs(turn);
  const poseAt = (fraction: number): ShipFootprintPose => ({ position: {
    x: from.position.x + (to.position.x - from.position.x) * fraction,
    z: from.position.z + (to.position.z - from.position.z) * fraction,
  }, heading: from.heading + turn * fraction });
  const motionBounds = {
    minX: Math.min(from.position.x, to.position.x) - radius, maxX: Math.max(from.position.x, to.position.x) + radius,
    minZ: Math.min(from.position.z, to.position.z) - radius, maxZ: Math.max(from.position.z, to.position.z) + radius,
  };
  const zones = nearbyCoasts(map, shipDraftMeters(shipClassId), motionBounds);
  const broadBoundary = motionBounds.minX < -map.halfExtentMeters || motionBounds.maxX > map.halfExtentMeters
    || motionBounds.minZ < -map.halfExtentMeters || motionBounds.maxZ > map.halfExtentMeters;
  // No polygon operations in normal open water, regardless of speed/dt.
  if (!zones.length && !broadBoundary) return {
    fraction: 1, position: { ...to.position }, heading: to.heading, blocked: false,
    startedOverlapping: false, exiting: false, budgetExhausted: false, contact: CLEAR,
  };
  let accepted = from, corners = shipFootprintCorners(shipClassId, from);
  let currentContact = contactForPolygon(corners, zones, map.halfExtentMeters);
  const startedOverlapping = currentContact.blocked;
  if (travel <= EPS) return {
    fraction: 1, position: { ...to.position }, heading: to.heading, blocked: false,
    startedOverlapping, exiting: false, budgetExhausted: false, contact: currentContact,
  };
  const requiredSteps = Math.max(1, Math.ceil(travel / MAX_CORNER_TRAVEL));
  let fraction = 0, exiting = false, blockingContact: ShipTerrainFootprintContact | undefined;
  const safeStep = (candidate: ShipFootprintPose): { safe: boolean; contact: ShipTerrainFootprintContact } => {
    const nextCorners = shipFootprintCorners(shipClassId, candidate);
    const envelope = convexHull([...corners, ...nextCorners]);
    const error = radius * (candidate.heading - accepted.heading) ** 2 / 8;
    const hit = contactForPolygon(envelope, zones, map.halfExtentMeters, error);
    if (!hit.blocked) return { safe: true, contact: hit };
    return { safe: currentContact.blocked && outwardStep(corners, nextCorners, envelope, zones, map.halfExtentMeters, error), contact: hit };
  };
  for (let index = 1; index <= Math.min(requiredSteps, MAX_SWEEP_STEPS); index++) {
    const nextFraction = index / requiredSteps, next = poseAt(nextFraction), result = safeStep(next);
    if (!result.safe) {
      blockingContact = result.contact;
      // Refine only the first rejected segment. Starting overlap is never nudged
      // through an obstruction by bisection: its proof must pass for the whole step.
      if (!currentContact.blocked) {
        let low = fraction, high = nextFraction;
        for (let iteration = 0; iteration < 8; iteration++) {
          const middle = (low + high) * .5;
          if (safeStep(poseAt(middle)).safe) low = middle; else high = middle;
        }
        fraction = low; accepted = poseAt(low); corners = shipFootprintCorners(shipClassId, accepted);
        currentContact = contactForPolygon(corners, zones, map.halfExtentMeters);
      }
      break;
    }
    exiting ||= currentContact.blocked;
    fraction = nextFraction; accepted = next; corners = shipFootprintCorners(shipClassId, accepted);
    currentContact = contactForPolygon(corners, zones, map.halfExtentMeters);
  }
  return {
    fraction, position: { ...accepted.position }, heading: accepted.heading, blocked: fraction < 1,
    startedOverlapping, exiting, budgetExhausted: fraction < 1 && !blockingContact,
    contact: currentContact, ...(blockingContact ? { blockingContact } : {}),
  };
}

/**
 * A legacy overlap can otherwise be pinned by the conservative rotation envelope.
 * If combined motion fails, separately certify ONLY its actual translation at the
 * old heading. This does not relax the overlap-subset proof or invent movement.
 * fraction describes accepted translation; rotationBlocked records the rejected yaw.
 */
export function constrainShipTerrainMotion(
  source: MapSource, shipClassId: ShipClassId,
  from: Readonly<ShipFootprintPose>, to: Readonly<ShipFootprintPose>,
): ShipTerrainMotion {
  const combined = constrainCommonPoseMotion(source, shipClassId, from, to);
  if (combined.startedOverlapping && combined.blocked && Math.abs(to.heading - from.heading) > EPS
    && Math.hypot(to.position.x - from.position.x, to.position.z - from.position.z) > EPS) {
    const translation = constrainCommonPoseMotion(source, shipClassId, from, { position: to.position, heading: from.heading });
    if (translation.exiting && !translation.blocked && translation.fraction === 1) {
      return { ...translation, rotationBlocked: true };
    }
  }
  return combined;
}
