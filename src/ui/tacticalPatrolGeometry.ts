import { AIR_NAVIGATION } from "../sim/airOperations";
import type { Vec3 } from "../sim/types";

export interface NorthUpProjection {
  centerX: number;
  centerY: number;
  scale: number;
  worldCenterX?: number;
  worldCenterZ?: number;
}

export function northUpMapToWorld(
  point: Readonly<{ x: number; y: number }>,
  projection: Readonly<NorthUpProjection>,
): Vec3 {
  return {
    x: (projection.worldCenterX ?? 0)
      + (point.x - projection.centerX) / projection.scale,
    y: 180,
    z: (projection.worldCenterZ ?? 0)
      + (projection.centerY - point.y) / projection.scale,
  };
}

export function clampPatrolRadius(radius: number): number {
  return Math.min(
    AIR_NAVIGATION.patrolRadiusMaxMeters,
    Math.max(AIR_NAVIGATION.patrolRadiusMinMeters, radius),
  );
}

export interface PatrolDragGeometry {
  area: { center: Vec3; radius: number };
  preview: { left: number; top: number; width: number; height: number };
}

/** Drag endpoints define a diameter; the clamped world area also drives its preview. */
export function patrolAreaFromDrag(
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
  projection: Readonly<NorthUpProjection>,
): PatrolDragGeometry | undefined {
  if (projection.scale <= 0 || ![
    start.x, start.y, end.x, end.y, projection.centerX, projection.centerY,
    projection.scale, projection.worldCenterX ?? 0, projection.worldCenterZ ?? 0,
  ].every(Number.isFinite)) return undefined;
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const center = northUpMapToWorld(midpoint, projection);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.z)
    || Math.abs(center.x) > AIR_NAVIGATION.mapHalfExtentMeters
    || Math.abs(center.z) > AIR_NAVIGATION.mapHalfExtentMeters) return undefined;
  const radius = clampPatrolRadius(
    Math.hypot(end.x - start.x, end.y - start.y) / (2 * projection.scale),
  );
  const radiusPixels = radius * projection.scale;
  return {
    area: { center, radius },
    preview: {
      left: midpoint.x - radiusPixels,
      top: midpoint.y - radiusPixels,
      width: radiusPixels * 2,
      height: radiusPixels * 2,
    },
  };
}
