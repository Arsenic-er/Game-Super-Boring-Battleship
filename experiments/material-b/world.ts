/** B-lab world units are metres; this module has no rendering dependencies. */
export const LAB_ISLANDS = [
  { x: 80, z: 600, rx: 300, rz: 220, height: 130, seed: 19 },
  { x: -900, z: 1850, rx: 340, rz: 250, height: 220, seed: 47 },
  { x: 1100, z: 2450, rx: 520, rz: 360, height: 260, seed: 83 },
] as const;
export type LabIsland = (typeof LAB_ISLANDS)[number];
export const DEPTH_BOUNDS = { minX: -2400, minZ: -1200, size: 6000 } as const;
const TAU = Math.PI * 2;
function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}
const rotation = (island: LabIsland) => ((island.seed % 11) - 5) * .08;
/** Asymmetric coastline, independent of textures and animation time. */
function coastRadius(island: LabIsland, angle: number): number {
  const phase = (island.seed * .731) % TAU;
  return 1 + .095 * Math.sin(angle * 3 + phase)
    + .055 * Math.cos(angle * 5 - phase * .7)
    + .028 * Math.sin(angle * 9 + phase * .3)
    + .055 * Math.cos(angle - phase);
}
/** Exact contour used to build zero-height shoreline rings. */
export function islandContourPoint(island: LabIsland, angle: number, radial = 1) {
  const radius = coastRadius(island, angle) * radial;
  const lx = Math.cos(angle) * radius * island.rx;
  const lz = Math.sin(angle) * radius * island.rz;
  const turn = rotation(island), c = Math.cos(turn), s = Math.sin(turn);
  return { x: island.x + lx * c - lz * s, z: island.z + lx * s + lz * c };
}
function gaussian(x: number, z: number, cx: number, cz: number,
  sx: number, sz: number, angle: number): number {
  const dx = x - cx, dz = z - cz;
  const u = (dx * Math.cos(angle) + dz * Math.sin(angle)) / sx;
  const v = (-dx * Math.sin(angle) + dz * Math.cos(angle)) / sz;
  return Math.exp(-1.5 * (u * u + v * v));
}
function islandHeight(island: LabIsland, x: number, z: number): number {
  const dx = x - island.x, dz = z - island.z;
  const turn = rotation(island), c = Math.cos(turn), s = Math.sin(turn);
  const u = (dx * c + dz * s) / island.rx;
  const v = (-dx * s + dz * c) / island.rz;
  if (Math.abs(u) > 2 || Math.abs(v) > 2) return -60;
  const radius = Math.hypot(u, v) / coastRadius(island, Math.atan2(v, u));
  if (radius >= 1) return -60 * smoothstep(0, .6, radius - 1);
  const inland = 1 - radius;
  const phase = island.seed * .17;
  // Offset summits, elongated secondary ridge and a low seaward shoulder.
  const main = gaussian(u, v, -.23, .17, .45, .30, -.38) * .90;
  const secondary = gaussian(u, v, .34, -.06, .36, .25, .52) * .60;
  const shoulder = gaussian(u, v, -.43, -.37, .30, .23, .2) * .33;
  const folds = Math.sin(u * 13 + v * 7 + phase)
    * Math.sin(v * 10 - u * 4 + phase) * .026;
  const ridge = .085 + main + secondary + shoulder + folds;
  return 5.5 * smoothstep(0, .21, inland)
    + island.height * smoothstep(.055, .34, inland) * Math.max(.025, ridge);
}
/**
 * Shared deterministic height for terrain vertices and water depth mask.
 * Coastline / sea level = 0; open sea = -60. Shelves use a max-union.
 * Both sides of the coastline are C1 continuous; the exact shore is a mesh ring.
 */
export function sampleGroundHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return -60;
  let height = -60;
  for (const island of LAB_ISLANDS) height = Math.max(height, islandHeight(island, x, z));
  return height;
}
