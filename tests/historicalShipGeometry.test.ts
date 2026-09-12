import { createHash } from "node:crypto";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { getShipClass, SHIP_CLASS_IDS } from "../src/ships/classes";
import { getMainBattery, mainBatteryMountLocalPosition } from "../src/ships/mainBatteries";
import { createHistoricalShipGeometry } from "../src/render/historicalShipGeometry";
import { HISTORICAL_HULL_STATIONS, HISTORICAL_SHIP_PROFILES } from "../src/render/historicalShipProfiles";
import { createProceduralShipHull } from "../src/render/shipHullVisual";
import type { PixelShipPalette } from "../src/render/shipMaterials";

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = Object.fromEntries(["hull","deck","structure","dark","accent"].map(key => [key,new StandardMaterial(key,scene)])) as unknown as PixelShipPalette;
  return {engine,scene,palette,dispose:()=>{scene.dispose();engine.dispose();}};
}

describe("historical ship silhouette profiles",()=> {
  it("covers precisely the 15 playable classes and preserves selected class eras",()=> {
    expect(Object.keys(HISTORICAL_SHIP_PROFILES).sort()).toEqual([...SHIP_CLASS_IDS].sort());
    expect(new Set(Object.values(HISTORICAL_SHIP_PROFILES).map(p=>JSON.stringify({...p,id:undefined,notes:undefined}))).size).toBe(15);
    for(const id of SHIP_CLASS_IDS) {
      const profile=HISTORICAL_SHIP_PROFILES[id];
      expect(profile.era).toBe(getShipClass(id).serviceYear);
      expect(profile.breadths).toHaveLength(HISTORICAL_HULL_STATIONS.length);
      expect(Math.max(...profile.breadths)).toBe(1);
      expect(profile.breadths.every(n=>Number.isFinite(n)&&n>0&&n<=1)).toBe(true);
    }
  });

  it("locks distinctive funnel, stern aviation and shaft-count fixtures",()=> {
    const expected = {
      fletcher:[2,"none",2],"j-class":[1,"none",2],kagero:[2,"none",2],"type-1936a":[2,"none",2],tashkent:[2,"none",2],
      cleveland:[2,"stern-pair",4],edinburgh:[2,"midships-cross",4],nurnberg:[2,"midships-single",3],agano:[1,"midships-single",4],dido:[2,"none",4],
      "north-carolina":[2,"stern-pair",4],"king-george-v":[2,"midships-cross",4],bismarck:[1,"midships-cross",3],yamato:[1,"stern-rails",4],richelieu:[1,"none",4],
    };
    for(const id of SHIP_CLASS_IDS) {
      const p=HISTORICAL_SHIP_PROFILES[id];
      expect([p.funnels.length,p.aviation,p.shafts],id).toEqual(expected[id]);
    }
  });
});

describe("original batched historical hull geometry",()=> {
  for(const id of SHIP_CLASS_IDS) it(`${id}: finite, correctly wound and within the static geometry budget`,()=> {
    const f=fixture();
    try {
      const root=new TransformNode(id,f.scene),hull=getShipClass(id);
      root.scaling.set(hull.renderScale.x,hull.renderScale.y,hull.renderScale.z);
      const result=createHistoricalShipGeometry(f.scene,root,id,id,f.palette);
      if(process.env.HULL_GEOMETRY_REPORT==="1") console.log("HULL_METRICS "+JSON.stringify({id,staticMeshes:result.staticMeshes.length,staticTriangles:result.staticMeshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),allHullTriangles:result.bodyMeshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),allHullMeshes:result.bodyMeshes.length,adjustments:result.features.filter(f=>Math.abs(f.actualZ-f.requestedZ)>.01).map(f=>({kind:f.kind,offset:Number((f.actualZ-f.requestedZ).toFixed(2))}))}));
      expect(result.staticMeshes.length).toBeLessThan(12);
      expect(result.staticMeshes.length).toBeLessThanOrEqual(5);
      expect(result.staticMeshes.reduce((n,m)=>n+m.getTotalIndices()/3,0)).toBeLessThan(15000);
      expect(result.propellers).toHaveLength(HISTORICAL_SHIP_PROFILES[id].shafts);
      expect(result.features.filter(f=>f.kind.startsWith("funnel"))).toHaveLength(HISTORICAL_SHIP_PROFILES[id].funnels.length);
      for(const mesh of result.bodyMeshes) {
        const positions=mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const normals=mesh.getVerticesData(VertexBuffer.NormalKind)!;
        const uvs=mesh.getVerticesData(VertexBuffer.UVKind)!;
        const indices=mesh.getIndices()!;
        expect([...positions,...normals,...uvs].every(Number.isFinite)).toBe(true);
        expect(normals).toHaveLength(positions.length);
        expect(uvs).toHaveLength(positions.length/3*2);
        expect(indices.length%3).toBe(0);
        for(let i=0;i<indices.length;i+=3) {
          const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
          expect(Math.max(a,b,c)).toBeLessThan(positions.length);
          const ab=[positions[b]-positions[a],positions[b+1]-positions[a+1],positions[b+2]-positions[a+2]];
          const ac=[positions[c]-positions[a],positions[c+1]-positions[a+1],positions[c+2]-positions[a+2]];
          const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
          const area=Math.hypot(...cross);
          expect(area).toBeGreaterThan(1e-9);
          // LH winding must agree with the generated normal; no reversed/zero normals.
          expect(-(cross[0]*normals[a]+cross[1]*normals[a+1]+cross[2]*normals[a+2])/area).toBeGreaterThan(.99);
        }
        expect(mesh.material).toBeDefined();
        expect(mesh.material!.backFaceCulling).toBe(true);
      }
      const shell=result.staticMeshes.find(m=>m.metadata.historicalSurface==="hull")!;
      const shellPositions=shell.getVerticesData(VertexBuffer.PositionKind)!,shellNormals=shell.getVerticesData(VertexBuffer.NormalKind)!;
      const sideVertices=(HISTORICAL_HULL_STATIONS.length-1)*7*6;
      for(let vertex=0;vertex<sideVertices;vertex++) {
        const band=Math.floor(vertex/6)%7;
        if(band===3) expect(shellNormals[vertex*3+1],`${id} keel underside`).toBeLessThan(0);
        else expect(shellNormals[vertex*3]*(band<3?-1:1),`${id} outward side band ${band}`).toBeGreaterThan(0);
      }
      // Raked bow caps cross the centreline: their outward direction is +Z, not each vertex's X sign.
      // Each 8-point cap is six triangles, first stern (-Z), then bow (+Z).
      expect(shellPositions.length/3).toBe(sideVertices+36);
      for(let vertex=sideVertices;vertex<shellPositions.length/3;vertex++) {
        expect(shellNormals[vertex*3+2]*(vertex<sideVertices+18?-1:1),`${id} outward end cap`).toBeGreaterThan(0);
      }
      // The hull's crowned deck faces are emitted first in the deck batch (four triangles/station).
      const deckNormals=result.staticMeshes.find(m=>m.metadata.historicalSurface==="deck")!.getVerticesData(VertexBuffer.NormalKind)!;
      for(let vertex=0;vertex<(HISTORICAL_HULL_STATIONS.length-1)*12;vertex++) expect(deckNormals[vertex*3+1]).toBeGreaterThan(0);
      shell.computeWorldMatrix(true);
      const bounds=shell.getBoundingInfo().boundingBox;
      expect(bounds.maximumWorld.x-bounds.minimumWorld.x).toBeCloseTo(hull.beam,4);
      expect(bounds.maximumWorld.z-bounds.minimumWorld.z).toBeCloseTo(hull.length,4);
      const buildings=result.features.filter(f=>f.kind==="bridge"||f.kind.startsWith("funnel"));
      for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++) {
        expect(Math.abs(buildings[i].actualZ-buildings[j].actualZ),`${id} ${buildings[i].kind}/${buildings[j].kind}`).toBeGreaterThan((buildings[i].depth+buildings[j].depth)/2);
      }
      const battery=getMainBattery(id,"mk1-single",hull.slotCounts.mainGun);
      const barbettes=result.features.filter(f=>f.kind.startsWith("barbette-"));
      expect(barbettes).toHaveLength(battery.mounts.length);
      for(const [index,mount] of battery.mounts.entries()) {
        const point=mainBatteryMountLocalPosition(mount),profile=HISTORICAL_SHIP_PROFILES[id];
        const fraction=point.z/112,forward=Math.max(0,(fraction-.17)/.33);
        const forecastle=fraction>profile.forecastleEnd&&profile.forecastleEnd>-.4?.55*hull.renderScale.y:0;
        const deckTop=4.75*hull.renderScale.y+profile.sheer*forward*forward+forecastle;
        expect(point.y*hull.renderScale.y-deckTop,`${id} main mount base above crowned deck`).toBeGreaterThan(0);
        const support=barbettes[index];
        expect(support.actualZ).toBeCloseTo(point.z*hull.renderScale.z,6);
        expect(support.topY).toBeCloseTo(point.y*hull.renderScale.y-.2,6);
        expect(support.height).toBeGreaterThan(0);
        expect(support.topY!-support.baseY!).toBeCloseTo(support.height,6);
        expect(support.width/battery.visual.mountDiameter).toBeGreaterThanOrEqual(.8);
        expect(support.width/battery.visual.mountDiameter).toBeLessThanOrEqual(1);
      }
      for(const feature of buildings)for(const mount of battery.mounts) {
        const point=mainBatteryMountLocalPosition(mount);
        const radius=Math.max(1.5,battery.visual.mountDiameter*.53);
        expect(Math.abs(feature.actualZ-point.z*hull.renderScale.z),`${id} ${feature.kind}/main hardpoint`).toBeGreaterThan(radius+feature.depth/2);
      }
    } finally {f.dispose();}
  });

  it("produces different mesh geometry for all classes, not only different names",()=> {
    const f=fixture();
    try {
      const hashes=new Set<string>();
      for(const id of SHIP_CLASS_IDS) {
        const root=new TransformNode(id,f.scene);
        const result=createHistoricalShipGeometry(f.scene,root,id,id,f.palette);
        hashes.add(createHash("sha256").update(JSON.stringify(result.staticMeshes.map(m=>m.getVerticesData(VertexBuffer.PositionKind)))).digest("hex"));
        root.dispose(false,false);
      }
      expect(hashes.size).toBe(15);
    } finally {f.dispose();}
  });

  it("retains the public hull API, animated rudder/propellers and shared-material ownership",()=> {
    const f=fixture();
    try {
      const parent=new TransformNode("parent",f.scene),hull=getShipClass("fletcher");
      parent.scaling.set(hull.renderScale.x,hull.renderScale.y,hull.renderScale.z);
      const count=f.scene.meshes.length;
      const visual=createProceduralShipHull(f.scene,parent,"api","fletcher",f.palette);
      expect(visual.root.parent).toBe(parent);
      expect(visual.bodyMeshes).toHaveLength(visual.root.getChildMeshes(false).length);
      const blade=visual.rudder.getChildMeshes()[0];
      const local=Vector3.FromArray(blade.getVerticesData(VertexBuffer.PositionKind)!,0);
      const before=Vector3.TransformCoordinates(local,blade.computeWorldMatrix(true));
      visual.rudder.rotation.y=.4;
      const after=Vector3.TransformCoordinates(local,blade.computeWorldMatrix(true));
      expect(Vector3.Distance(before,after)).toBeGreaterThan(.01);
      visual.root.dispose(false,false);
      expect(f.scene.meshes).toHaveLength(count);
      expect(f.scene.materials).toContain(f.palette.hull);
      expect(parent.isDisposed()).toBe(false);
    } finally {f.dispose();}
  });

  it("keeps a propeller blade's world-space radius constant while rotating under the nonuniform hull scale",()=> {
    const f=fixture();
    try {
      const parent=new TransformNode("scaled",f.scene),hull=getShipClass("yamato");
      parent.scaling.set(hull.renderScale.x,hull.renderScale.y,hull.renderScale.z);
      const visual=createProceduralShipHull(f.scene,parent,"metric-motion","yamato",f.palette);
      const propeller=visual.propellers[0],blade=propeller.getChildMeshes().find(m=>m.material===f.palette.accent)!;
      const point=Vector3.FromArray(blade.getVerticesData(VertexBuffer.PositionKind)!,3);
      const distances=[];
      for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI]) {
        propeller.rotation.z=angle;
        const world=Vector3.TransformCoordinates(point,blade.computeWorldMatrix(true));
        const center=Vector3.TransformCoordinates(Vector3.Zero(),propeller.computeWorldMatrix(true));
        distances.push(Vector3.Distance(world,center));
      }
      expect(Math.max(...distances)-Math.min(...distances)).toBeLessThan(1e-5);
    } finally {f.dispose();}
  });
});
