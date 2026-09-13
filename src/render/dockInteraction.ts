import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Ray } from "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Culling/ray";
import type { Scene } from "@babylonjs/core/scene";
import type { Node } from "@babylonjs/core/node";
import type { EquipmentCategory } from "../profile/equipmentCatalog";
import type { DockActualVisual } from "./dockLoadoutRenderer";
import { VISUAL_EQUIPMENT_CATEGORIES } from "./loadoutVisualPlan";

export interface DockComponentHover {
  category: EquipmentCategory;
  slotIndex: number;
  equipmentId: string;
  /** CSS pixels relative to the canvas's top-left corner. */
  canvasX: number;
  canvasY: number;
  internal: boolean;
}
export interface DockBounds {
  minimum: Readonly<{ x: number; y: number; z: number }>;
  maximum: Readonly<{ x: number; y: number; z: number }>;
  /** Actual visible geometry, cached once per completed loadout; absent means box fallback. */
  points?: readonly Readonly<{ x: number; y: number; z: number }>[];
}
export interface DockOrbitPose { alpha: number; beta: number; radius: number }
export const DOCK_DEFAULT_ORBIT = { alpha: .55, beta: 1.30, radius: 158 } as const;
export const DOCK_ORBIT_LIMITS = { minimumBeta: .45, maximumBeta: 1.4 } as const;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;

/** Fit actual projected geometry and recenter its perspective silhouette.
 * A global box invents mast-height corners at the bow/stern and can make long ships
 * unnecessarily small. Horizontal/vertical constraints instead share a screen-space
 * centre, so the near bow does not force unused padding beside the distant stern. */
export function dockFraming(bounds: DockBounds, aspect: number,
  alpha: number = DOCK_DEFAULT_ORBIT.alpha, beta: number = DOCK_DEFAULT_ORBIT.beta, fov = .8):
  { radius: number; target: { x: number; y: number; z: number } } {
  const center = {
    x: (bounds.minimum.x + bounds.maximum.x) / 2,
    y: (bounds.minimum.y + bounds.maximum.y) / 2,
    z: (bounds.minimum.z + bounds.maximum.z) / 2,
  };
  const tanY = Math.tan(clamp(finite(fov, .8), .2, 1.8) / 2), tanX = tanY * clamp(finite(aspect, 1), .25, 8);
  const horizontal = tanX * .84, vertical = tanY * .9;
  const right = { x: -Math.sin(alpha), y: 0, z: Math.cos(alpha) };
  const up = { x: -Math.cos(alpha) * Math.cos(beta), y: Math.sin(beta), z: -Math.sin(alpha) * Math.cos(beta) };
  const towardCamera = { x: Math.cos(alpha) * Math.sin(beta), y: Math.cos(beta), z: Math.sin(alpha) * Math.sin(beta) };
  const points = bounds.points?.length ? bounds.points : [bounds.minimum.x, bounds.maximum.x].flatMap(x =>
    [bounds.minimum.y, bounds.maximum.y].flatMap(y => [bounds.minimum.z, bounds.maximum.z].map(z => ({ x, y, z }))));
  let left = -Infinity, rightEdge = Infinity, bottom = -Infinity, top = Infinity, nearest = -Infinity;
  for (const point of points) {
    const dx = point.x - center.x, dy = point.y - center.y, dz = point.z - center.z;
    const x = right.x * dx + right.z * dz;
    const y = up.x * dx + up.y * dy + up.z * dz;
    const depth = towardCamera.x * dx + towardCamera.y * dy + towardCamera.z * dz;
    if (![x, y, depth].every(Number.isFinite)) continue;
    left = Math.max(left, x + horizontal * depth);
    rightEdge = Math.min(rightEdge, x - horizontal * depth);
    bottom = Math.max(bottom, y + vertical * depth);
    top = Math.min(top, y - vertical * depth);
    nearest = Math.max(nearest, depth);
  }
  const radius = finite(Math.max(1, nearest + 1, (left - rightEdge) / (2 * horizontal),
    (bottom - top) / (2 * vertical)) * 1.01, 158);
  const shiftX = finite((left + rightEdge) / 2, 0), shiftY = finite((bottom + top) / 2, 0);
  return { radius, target: {
    x: center.x + right.x * shiftX + up.x * shiftY,
    y: center.y + up.y * shiftY,
    z: center.z + right.z * shiftX + up.z * shiftY,
  } };
}

export function dockFramingRadius(bounds: DockBounds, aspect: number,
  alpha: number = DOCK_DEFAULT_ORBIT.alpha, beta: number = DOCK_DEFAULT_ORBIT.beta, fov = .8): number {
  return dockFraming(bounds, aspect, alpha, beta, fov).radius;
}

/** One time-based damping stage; input does not mutate the rendered camera directly. */
export class DockOrbitMotion {
  readonly pose: DockOrbitPose;
  private target: DockOrbitPose;
  private framingRadius = 158;
  private minimumRadius = 118;
  private maximumRadius = 360;

  constructor(initial: DockOrbitPose = DOCK_DEFAULT_ORBIT) {
    this.pose = { alpha: finite(initial.alpha, DOCK_DEFAULT_ORBIT.alpha),
      beta: clamp(finite(initial.beta, DOCK_DEFAULT_ORBIT.beta), .45, 1.4),
      radius: clamp(finite(initial.radius, 158), this.minimumRadius, this.maximumRadius) };
    this.target = { ...this.pose };
  }
  get zoomRatio(): number { return this.target.radius / this.framingRadius; }
  setFraming(radius: number, resetZoom = false): void {
    radius = Math.max(1, finite(radius, this.framingRadius));
    const ratio = resetZoom ? 1 : this.zoomRatio;
    if (!resetZoom) this.pose.radius *= radius / this.framingRadius;
    this.framingRadius = radius;
    this.setRadiusLimits(radius * .62, radius * 2.4);
    this.setRadius(radius * ratio);
  }
  setRadiusLimits(minimum: number, maximum: number): void {
    this.minimumRadius = Math.max(1, finite(minimum, this.minimumRadius));
    this.maximumRadius = Math.max(this.minimumRadius, finite(maximum, this.maximumRadius));
    this.pose.radius = clamp(this.pose.radius, this.minimumRadius, this.maximumRadius);
    this.target.radius = clamp(this.target.radius, this.minimumRadius, this.maximumRadius);
  }
  setRadius(radius: number): void {
    this.target.radius = clamp(finite(radius, this.target.radius), this.minimumRadius, this.maximumRadius);
  }
  rotate(deltaX: number, deltaY: number): void {
    this.target.alpha -= clamp(finite(deltaX, 0), -1_000, 1_000) * .005;
    this.target.beta = clamp(this.target.beta - clamp(finite(deltaY, 0), -1_000, 1_000) * .004,
      DOCK_ORBIT_LIMITS.minimumBeta, DOCK_ORBIT_LIMITS.maximumBeta);
  }
  zoom(pixelDelta: number): void {
    this.setRadius(this.target.radius * Math.exp(clamp(finite(pixelDelta, 0), -1_000, 1_000) * .0015));
  }
  get moving(): boolean {
    return Math.abs(this.target.alpha - this.pose.alpha) > .0001
      || Math.abs(this.target.beta - this.pose.beta) > .0001
      || Math.abs(this.target.radius - this.pose.radius) > .01;
  }
  step(seconds: number): Readonly<DockOrbitPose> {
    const blend = 1 - Math.exp(-12 * clamp(finite(seconds, 0), 0, .1));
    for (const key of ["alpha", "beta", "radius"] as const) this.pose[key] += (this.target[key] - this.pose[key]) * blend;
    if (!this.moving) Object.assign(this.pose, this.target);
    // Preserve the accumulated drag direction while avoiding unbounded angles.
    if (Math.abs(this.pose.alpha) > Math.PI * 100) {
      const turns = Math.trunc(this.pose.alpha / (Math.PI * 2)) * Math.PI * 2;
      this.pose.alpha -= turns; this.target.alpha -= turns;
    }
    return this.pose;
  }
}

/** Deadline accumulation keeps an approximately 60 FPS cadence on 60/120/144 Hz displays. */
export class DockRenderCadence {
  private activeUntil = -Infinity;
  private nextFrame = 0;
  private interval = 0;
  request(now: number, duration = 900): void {
    if (!Number.isFinite(now)) return;
    if (now >= this.activeUntil) this.nextFrame = Math.min(this.nextFrame, now);
    this.activeUntil = Math.max(this.activeUntil, now + duration);
  }
  takeFrame(now: number, visible: boolean, moving = false): boolean {
    if (!visible || !Number.isFinite(now)) { this.nextFrame = 0; this.interval = 0; return false; }
    const interval = moving || now < this.activeUntil ? 1_000 / 60 : 1_000 / 8;
    if (interval !== this.interval) { this.nextFrame = Math.min(this.nextFrame, now); this.interval = interval; }
    if (now + .75 < this.nextFrame) return false;
    this.nextFrame = now - this.nextFrame > interval ? now + interval : this.nextFrame + interval;
    return true;
  }
}

function componentOwner(node: Node, actual: DockActualVisual): Omit<DockComponentHover, "canvasX" | "canvasY" | "internal"> | undefined {
  for (let current: Node | null = node; current && current !== actual.root; current = current.parent) {
    const meta = current.metadata as Partial<DockComponentHover> | null;
    if (!meta || !VISUAL_EQUIPMENT_CATEGORIES.includes(meta.category as EquipmentCategory)
      || !Number.isInteger(meta.slotIndex) || (meta.slotIndex ?? -1) < 0 || typeof meta.equipmentId !== "string") continue;
    const category = meta.category as EquipmentCategory, slotIndex = meta.slotIndex!;
    // Validate against the actual installed plan, retaining holes and per-slot IDs.
    if (actual.plan.slots[category][slotIndex]?.equipmentId === meta.equipmentId)
      return { category, slotIndex, equipmentId: meta.equipmentId };
  }
  return undefined;
}

/** Pick the closest visible surface, including the hull as an occluder. Inspection
 * ghosts are outside actual.root and cannot replace an installed component's identity. */
export function pickDockComponent(scene: Scene, actual: DockActualVisual, ray: Ray,
  canvasX: number, canvasY: number): DockComponentHover | undefined {
  if (![canvasX, canvasY].every(Number.isFinite) || !actual.root.isEnabled()) return undefined;
  const picked = scene.pickWithRay(ray, (mesh) => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0
    && mesh.getTotalVertices() > 0 && mesh.isDescendantOf(actual.root), false);
  if (!picked?.hit || !picked.pickedMesh || !picked.pickedPoint) return undefined;
  const owner = componentOwner(picked.pickedMesh, actual);
  if (owner) return { ...owner, canvasX, canvasY, internal: false };
  const localPoint = Vector3.TransformCoordinates(picked.pickedPoint, actual.root.computeWorldMatrix(true).clone().invert());
  // A compartment is discoverable from its nearby hull skin, not from a permanent
  // screen-space label or a distant mast. Bounds remain in the real hull-local frame.
  let best: { score: number; hover: DockComponentHover } | undefined;
  for (const module of actual.plan.internalModules) {
    const dx = Math.abs(localPoint.x - module.position.x), dy = Math.abs(localPoint.y - module.position.y);
    const dz = Math.abs(localPoint.z - module.position.z);
    if (dx > module.bounds.width / 2 + 2 || dy > module.bounds.height / 2 + 2.5
      || dz > module.bounds.depth / 2 + 2) continue;
    const score = dx / (module.bounds.width / 2 + 2) + dz / (module.bounds.depth / 2 + 2);
    if (!best || score < best.score) best = { score, hover: {
      category: module.category, slotIndex: module.slotIndex, equipmentId: module.equipmentId,
      canvasX, canvasY, internal: true,
    } };
  }
  return best?.hover;
}

export class DockHoverState {
  private value?: DockComponentHover;
  private callback?: (hover: DockComponentHover | undefined) => void;
  get current(): DockComponentHover | undefined { return this.value && { ...this.value }; }
  subscribe(callback?: (hover: DockComponentHover | undefined) => void): void {
    this.callback = callback; callback?.(this.current);
  }
  update(value?: DockComponentHover, dragging = false): void {
    const next = dragging ? undefined : value;
    const previous = this.value;
    if ((!previous && !next) || (previous && next && previous.category === next.category
      && previous.slotIndex === next.slotIndex && previous.equipmentId === next.equipmentId
      && previous.internal === next.internal && Math.abs(previous.canvasX - next.canvasX) < .5
      && Math.abs(previous.canvasY - next.canvasY) < .5)) return;
    this.value = next && { ...next };
    this.callback?.(this.current);
  }
}
