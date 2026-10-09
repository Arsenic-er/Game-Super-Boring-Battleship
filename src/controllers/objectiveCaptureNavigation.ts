import {
  battleMapDefinition, firstNavigationHazard, shipDraftMeters, terrainNavigationAt,
  type BattleMapDefinition, type BattleMapId,
} from "../maps/atollMap";
import { getShipClass } from "../ships/classes";
import type { ObjectiveObservation, ShipState, Vec3 } from "../sim/types";

export type CaptureNavigationShip = Readonly<Pick<ShipState, "position" | "heading" | "shipClassId">>;
export type CaptureNavigationObjective = Readonly<Pick<ObjectiveObservation, "center" | "radius">>;

export interface ObjectiveCapturePlan {
  mode: "direct" | "waypoint" | "in-zone" | "recovery";
  point?: Vec3;
  /** A waypoint is a transit marker, not a place to stop permanently. */
  arrivalRadiusMeters: number;
}

export const CAPTURE_NAVIGATION = {
  planningIntervalSeconds: 2,
  cachedCorridorMeters: 40,
  underKeelReserveMeters: 1,
  finalArrivalRadiusMeters: 95,
  gridWidth: 11,
  maximumNodes: 121,
  maximumEdges: 420,
  maximumAttachmentsPerEnd: 16,
  maximumAttachmentDistanceMeters: 3000,
  maximumCachedGraphs: 16,
} as const;

type GeometrySnapshot = { revision: number; extent: number; terrain: string };
const geometrySnapshots = new WeakMap<BattleMapDefinition, GeometrySnapshot>();
let nextGeometryRevision = 1;
type Graph = { points: Vec3[]; edges: Array<Array<{ index: number; distance: number }>> };
const graphs = new Map<string, Graph>();

/** Also useful after an editor reload; normal immutable terrain reuses these graphs. */
export function clearObjectiveCaptureGraphCache(): void { graphs.clear(); }

/**
 * Exact geometry comparison invalidates caches even for an in-place editor
 * change. This bounded static-map serialization performs no terrain sweeps.
 */
function geometryRevision(map: BattleMapDefinition): number {
  const terrain = JSON.stringify(map.terrain);
  const previous = geometrySnapshots.get(map);
  if (previous && previous.extent === map.halfExtentMeters && previous.terrain === terrain) return previous.revision;
  const revision = nextGeometryRevision++;
  geometrySnapshots.set(map, { revision, extent: map.halfExtentMeters, terrain });
  return revision;
}

const finitePoint = (point: Readonly<Vec3>): boolean =>
  [point.x, point.y, point.z].every(Number.isFinite);
const distance = (a: Readonly<Vec3>, b: Readonly<Vec3>): number =>
  Math.hypot(a.x - b.x, a.z - b.z);
const copy = (point: Readonly<Vec3>): Vec3 => ({ x: point.x, y: point.y, z: point.z });
const inCorridor = (point: Readonly<Vec3>, from: Readonly<Vec3>, to: Readonly<Vec3>, margin: number): boolean => {
  const dx = to.x - from.x, dz = to.z - from.z, squared = dx * dx + dz * dz;
  const fraction = squared > 1e-9 ? Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.z - from.z) * dz) / squared)) : 0;
  return Math.hypot(point.x - from.x - dx * fraction, point.z - from.z - dz * fraction) <= margin + 1e-7;
};
type RouteCache = {
  context: string; time: number; points: Vec3[]; index: number; legStart: Vec3; margin: number;
};

/**
 * Sparse static navigation graph plus short-lived own-ship route state.
 * No hostile contacts, live enemy positions, or public occupant counts are read.
 */
export class ObjectiveCaptureNavigator {
  private cached?: RouteCache;
  reset(): void { this.cached = undefined; }

  plan(
    mapId: BattleMapId, ship: CaptureNavigationShip, objective: CaptureNavigationObjective,
    stationIndex: 0 | 1, time: number,
  ): ObjectiveCapturePlan {
    const recovery: ObjectiveCapturePlan = { mode: "recovery", arrivalRadiusMeters: 95 };
    if (!finitePoint(ship.position) || !finitePoint(objective.center) || !Number.isFinite(ship.heading)
      || !Number.isFinite(objective.radius) || objective.radius <= 0
      || !Number.isFinite(time) || time < 0 || (stationIndex !== 0 && stationIndex !== 1)) {
      this.reset();
      return recovery;
    }
    const hull = getShipClass(ship.shipClassId);
    const routePadding = Math.max(hull.beam * .6 + 12, hull.length * .18);
    const waypointRadius = Math.max(90, Math.min(150, hull.length * .55));
    const graphMargin = waypointRadius + CAPTURE_NAVIGATION.cachedCorridorMeters;
    const nodePadding = Math.max(routePadding + graphMargin, hull.length * .5 + waypointRadius);
    const draft = shipDraftMeters(ship.shipClassId) + CAPTURE_NAVIGATION.underKeelReserveMeters;
    const map = battleMapDefinition(mapId);
    const revision = geometryRevision(map);
    const goal = { x: objective.center.x + (stationIndex === 1 ? 1 : -1) * objective.radius * .3,
      y: ship.position.y, z: objective.center.z };
    const context = JSON.stringify([revision, mapId, ship.shipClassId, objective.center.x,
      objective.center.y, objective.center.z, objective.radius, stationIndex]);
    const inside = distance(ship.position, objective.center) <= objective.radius;
    const previous = this.cached;
    const output = (route: RouteCache): ObjectiveCapturePlan => {
      if (!route.points.length) return recovery;
      if (inside) return { mode: "in-zone", point: copy(goal), arrivalRadiusMeters: 95 };
      while (route.index < route.points.length - 1
        && distance(ship.position, route.points[route.index]!) <= waypointRadius) {
        route.legStart = copy(route.points[route.index]!);
        route.index += 1;
        route.margin = graphMargin;
      }
      const point = route.points[route.index]!;
      if (!inCorridor(ship.position, route.legStart, point, route.margin)) return recovery;
      return { mode: route.index === route.points.length - 1 ? "direct" : "waypoint",
        point: copy(point), arrivalRadiusMeters: route.index === route.points.length - 1 ? 95 : waypointRadius };
    };
    // Hard cadence: drifting out of a verified corridor yields no fake point,
    // and never turns a 60 Hz update into a new graph/attachment search.
    if (previous?.context === context && time >= previous.time
      && time - previous.time < CAPTURE_NAVIGATION.planningIntervalSeconds) return output(previous);

    const finish = (points: readonly Vec3[], margin = 0): ObjectiveCapturePlan => {
      const route: RouteCache = { context, time, points: points.map(copy), index: 0,
        legStart: copy(ship.position), margin };
      this.cached = route;
      return output(route);
    };
    const clearPoint = (point: Readonly<Vec3>, padding: number): boolean =>
      Math.abs(point.x) + padding < map.halfExtentMeters && Math.abs(point.z) + padding < map.halfExtentMeters
      && (mapId === "open-sea-range" || (terrainNavigationAt(mapId, point.x, point.z, draft).kind !== "grounded"
        && !firstNavigationHazard(mapId, point, point, draft, padding)));
    if (!clearPoint(ship.position, routePadding) || !clearPoint(goal, routePadding)) return finish([]);
    if (inside) return finish([goal], CAPTURE_NAVIGATION.cachedCorridorMeters);
    const clearRoute = (from: Readonly<Vec3>, to: Readonly<Vec3>, margin: number): boolean =>
      mapId === "open-sea-range" || !firstNavigationHazard(mapId, from, to, draft, routePadding + margin);
    const startMargin = (point: Readonly<Vec3>): number | undefined => {
      for (const margin of [CAPTURE_NAVIGATION.cachedCorridorMeters, 20, 10, 0]) {
        if (clearRoute(ship.position, point, margin)) return margin;
      }
      return undefined;
    };
    const directMargin = startMargin(goal);
    if (directMargin !== undefined) return finish([goal], directMargin);
    // Preserve a valid route's next leg when steering around an island. Its
    // remaining static legs were already checked against this geometry revision.
    if (previous?.context === context && time >= previous.time && previous.points.length) {
      const rest = previous.points.slice(previous.index);
      while (rest.length > 1 && distance(ship.position, rest[0]!) <= waypointRadius) rest.shift();
      const margin = startMargin(rest[0]!);
      if (margin !== undefined) return finish(rest, margin);
    }

    const graphKey = JSON.stringify([revision, mapId, ship.shipClassId, draft, routePadding, nodePadding]);
    let graph = graphs.get(graphKey);
    if (graph) {
      graphs.delete(graphKey);
      graphs.set(graphKey, graph);
    } else {
      const points: Vec3[] = [];
      const indices = new Map<string, number>();
      const extent = map.halfExtentMeters - Math.min(1000, map.halfExtentMeters * .2);
      const step = extent * 2 / (CAPTURE_NAVIGATION.gridWidth - 1);
      for (let z = 0; z < CAPTURE_NAVIGATION.gridWidth; ++z) for (let x = 0; x < CAPTURE_NAVIGATION.gridWidth; ++x) {
        const point = { x: -extent + x * step, y: 0, z: -extent + z * step };
        if (!clearPoint(point, nodePadding)) continue;
        indices.set(x + ":" + z, points.length);
        points.push(point);
      }
      const edges: Graph["edges"] = points.map(() => []);
      for (let z = 0; z < CAPTURE_NAVIGATION.gridWidth; ++z) for (let x = 0; x < CAPTURE_NAVIGATION.gridWidth; ++x) {
        const from = indices.get(x + ":" + z);
        if (from === undefined) continue;
        for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
          const to = indices.get((x + dx) + ":" + (z + dz));
          if (to === undefined || !clearRoute(points[from]!, points[to]!, graphMargin)) continue;
          const length = distance(points[from]!, points[to]!);
          edges[from]!.push({ index: to, distance: length });
          edges[to]!.push({ index: from, distance: length });
        }
      }
      graph = { points, edges };
      graphs.set(graphKey, graph);
      while (graphs.size > CAPTURE_NAVIGATION.maximumCachedGraphs) graphs.delete(graphs.keys().next().value!);
    }
    const nearest = (point: Readonly<Vec3>): Array<{ index: number; distance: number }> =>
      graph!.points.map((node, index) => ({ index, distance: distance(point, node) }))
        .filter(item => item.distance <= CAPTURE_NAVIGATION.maximumAttachmentDistanceMeters)
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .slice(0, CAPTURE_NAVIGATION.maximumAttachmentsPerEnd);
    const starts = nearest(ship.position).flatMap(item => {
      const margin = startMargin(graph!.points[item.index]!);
      return margin === undefined ? [] : [{ ...item, margin }];
    });
    const ends = nearest(goal).filter(item => clearRoute(graph!.points[item.index]!, goal, graphMargin));
    if (!starts.length || !ends.length) return finish([]);

    const costs = graph.points.map(() => Infinity);
    const visited = graph.points.map(() => false);
    const predecessor = graph.points.map(() => -1);
    const firstMargin = graph.points.map(() => 0);
    for (const start of starts) { costs[start.index] = start.distance; firstMargin[start.index] = start.margin; }
    for (let iteration = 0; iteration < graph.points.length; ++iteration) {
      let current = -1;
      for (let index = 0; index < costs.length; ++index) {
        if (!visited[index] && Number.isFinite(costs[index]) && (current < 0 || costs[index]! < costs[current]!)) current = index;
      }
      if (current < 0) break;
      visited[current] = true;
      for (const edge of graph.edges[current]!) {
        const cost = costs[current]! + edge.distance;
        if (cost >= costs[edge.index]!) continue;
        costs[edge.index] = cost;
        predecessor[edge.index] = current;
        firstMargin[edge.index] = firstMargin[current]!;
      }
    }
    const reached = ends.filter(item => Number.isFinite(costs[item.index]))
      .sort((a, b) => costs[a.index]! + a.distance - costs[b.index]! - b.distance || a.index - b.index)[0];
    if (!reached) return finish([]);
    const path: Vec3[] = [copy(goal)];
    let index = reached.index;
    while (index >= 0 && path.length <= CAPTURE_NAVIGATION.maximumNodes + 1) {
      path.unshift({ ...graph.points[index]!, y: ship.position.y });
      index = predecessor[index]!;
    }
    if (index >= 0) return finish([]);
    return finish(path, firstMargin[reached.index]!);
  }
}
