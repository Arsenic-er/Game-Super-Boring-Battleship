import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AircraftPaint } from "./historicalAircraftProfiles";

export type AircraftPoint = readonly [number, number, number];
type Paint = AircraftPaint | ((point: AircraftPoint) => AircraftPaint);
export const addPoint = (a: AircraftPoint, b: AircraftPoint): AircraftPoint => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scalePoint = (a: AircraftPoint, n: number): AircraftPoint => [a[0] * n, a[1] * n, a[2] * n];
const subtract = (a: AircraftPoint, b: AircraftPoint): AircraftPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: AircraftPoint, b: AircraftPoint): AircraftPoint => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: AircraftPoint, b: AircraftPoint): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: AircraftPoint): AircraftPoint => scalePoint(a, 1 / Math.max(1e-10, Math.hypot(...a)));
const average = (points: readonly AircraftPoint[]): AircraftPoint => scalePoint(points.reduce<AircraftPoint>(addPoint, [0, 0, 0]), 1 / points.length);

/** Query the actual triangulated surface, not an approximate bilinear airfoil. */
export function aircraftSurfaceYAt(positions: ArrayLike<number>, indices: ArrayLike<number>, x: number, z: number, range: readonly [number, number]): number | undefined {
  let height: number | undefined;
  for (let i = range[0]; i < range[1]; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const bx = positions[b] - positions[a], bz = positions[b + 2] - positions[a + 2];
    const cx = positions[c] - positions[a], cz = positions[c + 2] - positions[a + 2];
    const dx = x - positions[a], dz = z - positions[a + 2], determinant = bx * cz - cx * bz;
    if (Math.abs(determinant) < 1e-10) continue;
    const u = (dx * cz - cx * dz) / determinant, v = (bx * dz - dx * bz) / determinant;
    if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
    const y = positions[a + 1] + u * (positions[b + 1] - positions[a + 1]) + v * (positions[c + 1] - positions[a + 1]);
    height = height === undefined ? y : Math.max(height, y);
  }
  return height;
}

/** An original vertex-only modeller. No temporary scene meshes or per-part materials. */
export class AircraftMeshBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  private vertex(p: AircraftPoint, paint: Paint): number {
    const index = this.positions.length / 3;
    this.positions.push(...p);
    this.colors.push(...(typeof paint === "function" ? paint(p) : paint), 1);
    return index;
  }

  private triangle(a: number, b: number, c: number, outward: AircraftPoint): void {
    const point = (i: number): AircraftPoint => [this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]];
    const normal = cross(subtract(point(b), point(a)), subtract(point(c), point(a)));
    if (dot(normal, normal) < 1e-16) return;
    // Babylon's default left-handed ComputeNormals expects clockwise outside faces.
    this.indices.push(a, ...(dot(normal, outward) <= 0 ? [b, c] : [c, b]));
  }

  /** Connect arbitrary closed cross sections; elliptical airframes and airfoil wings share this. */
  loft(rings: readonly (readonly AircraftPoint[])[], centers: readonly AircraftPoint[], paint: Paint, capped = true): void {
    const rows = rings.map((ring) => ring.map((p) => this.vertex(p, paint)));
    for (let i = 0; i < rings.length - 1; i += 1) {
      for (let j = 0; j < rings[i].length; j += 1) {
        const k = (j + 1) % rings[i].length;
        const outward = subtract(average([rings[i][j], rings[i][k], rings[i + 1][j], rings[i + 1][k]]), average([centers[i], centers[i + 1]]));
        this.triangle(rows[i][j], rows[i][k], rows[i + 1][k], outward);
        this.triangle(rows[i][j], rows[i + 1][k], rows[i + 1][j], outward);
      }
    }
    if (!capped) return;
    for (const [i, adjacent] of [[0, 1], [rings.length - 1, rings.length - 2]]) {
      const center = this.vertex(average(rings[i]), paint);
      const outward = subtract(centers[i], centers[adjacent]);
      // Duplicate the cap rim so flat end normals do not soften the surface of the loft.
      const rim = rings[i].map((p) => this.vertex(p, paint));
      for (let j = 0; j < rim.length; j += 1) this.triangle(center, rim[j], rim[(j + 1) % rim.length], outward);
    }
  }

  ellipseStations(stations: readonly (readonly [number, number, number, number])[], paint: Paint, segments = 14, x = 0): void {
    const centers = stations.map<AircraftPoint>(([z, , , y]) => [x, y, z]);
    const rings = stations.map(([z, rx, ry, y]) => Array.from({ length: segments }, (_, i): AircraftPoint => {
      const angle = i * Math.PI * 2 / segments;
      return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry, z];
    }));
    this.loft(rings, centers, paint);
  }

  rod(from: AircraftPoint, to: AircraftPoint, radius: number, paint: Paint, segments = 6): void {
    const axis = normalize(subtract(to, from));
    const u = normalize(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const v = cross(axis, u);
    const rings = [from, to].map((center) => Array.from({ length: segments }, (_, i) => {
      const angle = i * Math.PI * 2 / segments;
      return addPoint(center, addPoint(scalePoint(u, radius * Math.cos(angle)), scalePoint(v, radius * Math.sin(angle))));
    }));
    this.loft(rings, [from, to], paint);
  }

  /** A thin solid, used for fins, tail surfaces, blade airfoils and landing-gear fairings. */
  prism(outline: readonly AircraftPoint[], extrusion: AircraftPoint, paint: Paint): void {
    const midpoint = average(outline);
    const rings = [-0.5, 0.5].map((side) => outline.map((point) => addPoint(point, scalePoint(extrusion, side))));
    this.loft(rings, [-0.5, 0.5].map((side) => addPoint(midpoint, scalePoint(extrusion, side))), paint);
  }

  disc(center: AircraftPoint, radius: number, paint: Paint, segments = 14): void {
    // Horizontal markings are tiny opaque painted polygons in the same draw call as the wing.
    const middle = this.vertex(center, paint);
    const rim = Array.from({ length: segments }, (_, i) => this.vertex([center[0] + radius * Math.cos(i * Math.PI * 2 / segments), center[1], center[2] + radius * Math.sin(i * Math.PI * 2 / segments)], paint));
    for (let i = 0; i < segments; i += 1) this.triangle(middle, rim[i], rim[(i + 1) % segments], [0, 1, 0]);
  }

  /** Clip each painted sector against the real upper-wing triangles so decals cannot cut through a cambered wing. */
  surfaceDecal(outline: readonly AircraftPoint[], surface: readonly [number, number], paint: Paint, offset: number): void {
    const center = average(outline);
    const signedDistance = (a: AircraftPoint, b: AircraftPoint, p: AircraftPoint) => (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
    const vertexPoint = (index: number): AircraftPoint => [this.positions[index * 3], this.positions[index * 3 + 1], this.positions[index * 3 + 2]];
    for (let i = surface[0]; i < surface[1]; i += 3) {
      const triangle = [vertexPoint(this.indices[i]), vertexPoint(this.indices[i + 1]), vertexPoint(this.indices[i + 2])];
      const area = signedDistance(triangle[0], triangle[1], triangle[2]);
      // With our left-handed winding, an upper skin has positive XZ area.
      if (area < 1e-10) continue;
      for (let sector = 0; sector < outline.length; sector += 1) {
        let polygon: AircraftPoint[] = [center, outline[sector], outline[(sector + 1) % outline.length]];
        for (let edge = 0; edge < 3 && polygon.length; edge += 1) {
          const a = triangle[edge], b = triangle[(edge + 1) % 3], clipped: AircraftPoint[] = [];
          for (let j = 0; j < polygon.length; j += 1) {
            const p = polygon[j], q = polygon[(j + 1) % polygon.length];
            const dp = signedDistance(a, b, p), dq = signedDistance(a, b, q);
            if (dp >= -1e-10) clipped.push(p);
            if ((dp >= 0) !== (dq >= 0)) {
              const t = dp / (dp - dq);
              clipped.push([p[0] + t * (q[0] - p[0]), 0, p[2] + t * (q[2] - p[2])]);
            }
          }
          polygon = clipped;
        }
        if (polygon.length < 3) continue;
        const projected = polygon.map((p) => {
          const y = aircraftSurfaceYAt(this.positions, this.indices, p[0], p[2], [i, i + 3]);
          if (y === undefined) throw Error("Unable to project aircraft marking onto its wing triangle");
          return this.vertex([p[0], y + offset, p[2]], paint);
        });
        for (let j = 1; j < projected.length - 1; j += 1) this.triangle(projected[0], projected[j], projected[j + 1], [0, 1, 0]);
      }
    }
  }

  createMesh(scene: Scene, name: string, extra?: AircraftMeshBuilder): Mesh {
    const mesh = new Mesh(name, scene);
    const positions = [...this.positions, ...(extra?.positions ?? [])];
    const indices = [...this.indices, ...(extra?.indices.map((index) => index + this.positions.length / 3) ?? [])];
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.colors = [...this.colors, ...(extra?.colors ?? [])];
    data.normals = [];
    VertexData.ComputeNormals(positions, indices, data.normals);
    data.applyToMesh(mesh, false);
    mesh.releaseSubMeshes();
    new SubMesh(0, 0, this.positions.length / 3, 0, this.indices.length, mesh);
    if (extra) new SubMesh(1, this.positions.length / 3, extra.positions.length / 3, this.indices.length, extra.indices.length, mesh);
    mesh.isPickable = false;
    return mesh;
  }
}
