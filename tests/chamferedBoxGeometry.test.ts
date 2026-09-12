import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { createChamferedBox } from "../src/render/shipGeometry";
import { createHistoricalGunhouse } from "../src/render/historicalEquipmentGeometry";
import { HISTORICAL_DESTROYER_GUN_HOUSINGS } from "../src/render/historicalEquipmentProfiles";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
function scene() { const engine = new NullEngine(); engines.push(engine); return new Scene(engine); }

function expectClosedOutward(mesh: Mesh): void {
  const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const indices = mesh.getIndices()!, edges = new Map<string, number[]>();
  const key = (index: number): string => [p[index*3]!, p[index*3+1]!, p[index*3+2]!].map(v => v.toFixed(5)).join(",");
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i]!,indices[i+1]!,indices[i+2]!];
    const a = tri.map(index => [p[index*3]!,p[index*3+1]!,p[index*3+2]!]);
    const ab = a[1]!.map((v,j) => v-a[0]![j]!), ac = a[2]!.map((v,j) => v-a[0]![j]!);
    const cross = [ab[1]!*ac[2]!-ab[2]!*ac[1]!,ab[2]!*ac[0]!-ab[0]!*ac[2]!,ab[0]!*ac[1]!-ab[1]!*ac[0]!];
    expect(Math.hypot(...cross)).toBeGreaterThan(1e-6);
    // Babylon LH normal is the NEGATIVE of the usual triangle cross product.
    const center = [0,1,2].map(j => a.reduce((sum,v) => sum+v[j]!,0)/3);
    expect(cross.reduce((sum,v,j) => sum-v*center[j]!,0)).toBeGreaterThan(1e-6);
    volume -= a[0]!.reduce((sum,v,j) => sum+v*cross[j]!,0)/6;
    for (let j = 0; j < 3; ++j) {
      const from = key(tri[j]!), to = key(tri[(j+1)%3]!);
      const edge = from<to ? `${from}|${to}` : `${to}|${from}`;
      const list = edges.get(edge) ?? []; list.push(from<to ? 1 : -1); edges.set(edge,list);
      const index = tri[j]!*3;
      expect([0,1,2].reduce((sum,k) => sum+p[index+k]!*n[index+k]!,0)).toBeGreaterThan(1e-6);
    }
  }
  expect(volume).toBeGreaterThan(0);
  for (const uses of edges.values()) { expect(uses).toHaveLength(2); expect(uses[0]!+uses[1]!).toBe(0); }
}

describe("closed left-handed naval housings", () => {
  it.each([
    { width:4, height:3, depth:6 },
    { width:10, height:3, depth:7, chamfer:1.5, topScale:.68 },
    { width:1.5, height:1.2, depth:.13, chamfer:.18, topScale:.72 },
    { width:5, height:2.5, depth:4, chamfer:0, topScale:1 },
  ])("has outward normals, visible caps and closed welded edges for %j", spec => {
    expectClosedOutward(createChamferedBox(scene(),"house",spec));
  });

  it("gives each DD twin a distinct closed front/rear section, not a shared dome", () => {
    const s = scene(), fingerprints = new Set<string>();
    for (const id of ["mk2-twin","mk3-twin","mk4-twin"] as const) {
      const profile = HISTORICAL_DESTROYER_GUN_HOUSINGS[id];
      const mesh = createHistoricalGunhouse(s,id,profile,4.5);
      expectClosedOutward(mesh);
      const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      fingerprints.add(JSON.stringify(p.map((v,i) => +(v/(i%3===1 ? profile.height : i%3===2 ? profile.depth : 4.5)).toFixed(4))));
      const roofZ: number[] = [];
      for (let i=0;i<p.length;i+=3) if (Math.abs(p[i+1]!-profile.height/2)<1e-5) roofZ.push(p[i+2]!/profile.depth);
      // Forward face slopes back substantially, but aft face retains its rear extent.
      expect(Math.max(...roofZ)).toBeLessThan(.25);
      expect(Math.min(...roofZ)).toBeLessThan(-.35);
    }
    expect(fingerprints.size).toBe(3);
  });
});
