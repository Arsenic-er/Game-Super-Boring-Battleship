import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { getShipClass, type ShipClassId } from "../ships/classes";
import { getMainBattery, mainBatteryMountLocalPosition } from "../ships/mainBatteries";
import type { PixelShipPalette } from "./shipMaterials";
import { HISTORICAL_HULL_STATIONS, HISTORICAL_SHIP_PROFILES, type HistoricalShipProfile } from "./historicalShipProfiles";

type Point = readonly [number, number, number];
type Surface = keyof PixelShipPalette;
interface Bucket { positions: number[]; indices: number[]; uvs: number[] }
export interface HistoricalHullFeature {
  kind: string; requestedZ: number; actualZ: number; width: number; depth: number; height: number;
  baseY?: number; topY?: number;
}
export interface HistoricalHullGeometry {
  bodyMeshes: Mesh[];
  staticMeshes: Mesh[];
  rudder: TransformNode;
  propellers: TransformNode[];
  features: HistoricalHullFeature[];
}

/** One pre-batched vertex buffer per existing palette material; no per-rivet Babylon meshes. */
class HullBuilder {
  private buckets = new Map<Surface, Bucket>();
  constructor(private scale: Point) {}

  face(surface: Surface, points: readonly Point[], outward: Point): void {
    const bucket = this.buckets.get(surface) ?? { positions: [], indices: [], uvs: [] };
    this.buckets.set(surface, bucket);
    for (let i = 1; i < points.length - 1; i++) {
      let a = points[0], b = points[i], c = points[i + 1];
      const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
      const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
      const normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
      if (Math.hypot(...normal) < 1e-8) continue;
      // Babylon's default left-handed winding is opposite the usual cross-product convention.
      if (normal[0]*outward[0] + normal[1]*outward[1] + normal[2]*outward[2] > 0) [b,c] = [c,b];
      const start = bucket.positions.length / 3;
      const ax=Math.abs(outward[0]),ay=Math.abs(outward[1]),az=Math.abs(outward[2]);
      for (const p of [a,b,c]) {
        bucket.positions.push(p[0]/this.scale[0], p[1]/this.scale[1], p[2]/this.scale[2]);
        // Continuous metre-space projection. No triangle-sized atlas decal or alternating mirroring.
        const u=ay>=ax&&ay>=az?p[0]:ax>=az?p[2]:p[0];
        const v=ay>=ax&&ay>=az?p[2]:p[1];
        bucket.uvs.push(.5+u/300,.5+v/300);
      }
      bucket.indices.push(start,start+1,start+2);
    }
  }

  loft(surface: Surface, lower: readonly Point[], upper: readonly Point[], center: Point, caps = true): void {
    for (let i = 0; i < lower.length; i++) {
      const j = (i+1)%lower.length;
      this.face(surface, [lower[i],upper[i],upper[j],lower[j]], [
        (lower[i][0]+lower[j][0])/2-center[0], 0, (lower[i][2]+lower[j][2])/2-center[2],
      ]);
    }
    if (caps) {
      this.face(surface, lower, [0,-1,0]);
      this.face(surface, upper, [0,1,0]);
    }
  }

  block(surface: Surface, x: number, y: number, z: number, width: number, height: number, depth: number, taper = .94, shape: "clipped" | "round" | "wedge" = "clipped"): void {
    const ring = (s: number, yy: number): Point[] => {
      if (shape === "round") return Array.from({length:12}, (_,i) => {
        const angle=i*Math.PI/6;
        return [x+Math.cos(angle)*width*s/2, yy, z+Math.sin(angle)*depth*s/2];
      });
      const w=width*s/2, d=depth*s/2, c=Math.min(w,d)*.22;
      return shape === "wedge"
        ? [[x-w,yy,z-d],[x+w,yy,z-d],[x+w,yy,z+d*.35],[x+w*.55,yy,z+d],[x-w*.55,yy,z+d],[x-w,yy,z+d*.35]]
        : [[x-w+c,yy,z-d],[x+w-c,yy,z-d],[x+w,yy,z-d+c],[x+w,yy,z+d-c],[x+w-c,yy,z+d],[x-w+c,yy,z+d],[x-w,yy,z+d-c],[x-w,yy,z-d+c]];
    };
    this.loft(surface,ring(1,y),ring(taper,y+height),[x,y,z]);
  }

  spar(surface: Surface, from: Point, to: Point, radius: number, sides=6): void {
    const d=[to[0]-from[0],to[1]-from[1],to[2]-from[2]], length=Math.hypot(...d);
    if (length < 1e-6) return;
    const axis=d.map(v=>v/length);
    const ref=Math.abs(axis[1])<.9 ? [0,1,0] : [1,0,0];
    const cross=[axis[1]*ref[2]-axis[2]*ref[1],axis[2]*ref[0]-axis[0]*ref[2],axis[0]*ref[1]-axis[1]*ref[0]];
    const cr=Math.hypot(...cross), u=cross.map(v=>v/cr);
    const v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]];
    const ring=(center:Point):Point[]=>Array.from({length:sides},(_,i)=> {
      const angle=i*2*Math.PI/sides;
      return [center[0]+radius*(u[0]*Math.cos(angle)+v[0]*Math.sin(angle)),center[1]+radius*(u[1]*Math.cos(angle)+v[1]*Math.sin(angle)),center[2]+radius*(u[2]*Math.cos(angle)+v[2]*Math.sin(angle))];
    });
    const a=ring(from),b=ring(to);
    for(let i=0;i<sides;i++) {
      const j=(i+1)%sides;
      this.face(surface,[a[i],a[j],b[j],b[i]],[(a[i][0]+a[j][0])/2-from[0],(a[i][1]+a[j][1])/2-from[1],(a[i][2]+a[j][2])/2-from[2]]);
    }
    this.face(surface,a,[-axis[0],-axis[1],-axis[2]]);
    this.face(surface,b,[axis[0],axis[1],axis[2]]);
  }

  finish(scene: Scene,parent: TransformNode,name: string,palette:PixelShipPalette): Mesh[] {
    return [...this.buckets].map(([surface,bucket])=> {
      const mesh=new Mesh(`${name}-${surface}`,scene);
      const data=new VertexData(), normals:number[]=[];
      VertexData.ComputeNormals(bucket.positions,bucket.indices,normals);
      data.positions=bucket.positions; data.indices=bucket.indices; data.normals=normals; data.uvs=bucket.uvs;
      data.applyToMesh(mesh); mesh.material=palette[surface]; mesh.parent=parent; mesh.isPickable=false;
      mesh.metadata={historicalSurface:surface,staticHull:true};
      return mesh;
    });
  }
}

export function createHistoricalShipGeometry(scene: Scene, root: TransformNode, name: string, shipClassId: ShipClassId, palette: PixelShipPalette): HistoricalHullGeometry {
  const hull=getShipClass(shipClassId), profile=HISTORICAL_SHIP_PROFILES[shipClassId];
  const scale:Point=[hull.renderScale.x,hull.renderScale.y,hull.renderScale.z];
  const b=new HullBuilder(scale), features:HistoricalHullFeature[]=[];
  const deckY=4.65*scale[1], draft=1.75*scale[1], length=hull.length, beam=hull.beam;
  const battery=getMainBattery(shipClassId,"mk1-single",hull.slotCounts.mainGun);
  const hardpoints=battery.mounts.map(m=> {
    const p=mainBatteryMountLocalPosition(m);
    return {z:p.z*scale[2], x:p.x*scale[0], y:p.y*scale[1], radius:Math.max(1.5,battery.visual.mountDiameter*.53)};
  });
  // Preserve simulation-owned guns. Bounded repositioning is explicit in feature metadata for QA.
  const clearZ=(requested:number,depth:number,kind:string):number=> {
    const avoidsBuildings=kind==="bridge"||kind.startsWith("funnel");
    const safe=(z:number)=>Math.abs(z)+depth/2<length*.44
      && hardpoints.every(p=>Math.abs(z-p.z)>p.radius+depth/2+.3)
      && (!avoidsBuildings||features.every(f=>(f.kind!=="bridge"&&!f.kind.startsWith("funnel"))||Math.abs(z-f.actualZ)>(depth+f.depth)/2+.4));
    if(safe(requested))return requested;
    for(let offset=.5;offset<=length*.13;offset+=.5) for(const sign of [-1,1]) if(safe(requested+offset*sign)) return requested+offset*sign;
    return requested;
  };
  const feature=(kind:string,z:number,width:number,depth:number,height:number,protect=true):number=> {
    const actualZ=protect?clearZ(z,depth,kind):z;
    features.push({kind,requestedZ:z,actualZ,width,depth,height}); return actualZ;
  };

  // Individually authored waterlines, crowned deck, flare, underwater chine and closed end caps.
  const rings:Point[][]=HISTORICAL_HULL_STATIONS.map((fraction,i)=> {
    const width=profile.breadths[i]*beam/2, z=fraction*length;
    const forward=Math.max(0,(fraction-.17)/.33);
    const sheer=profile.sheer*forward*forward;
    const forecastle=fraction>profile.forecastleEnd && profile.forecastleEnd>-.4 ? .55*scale[1] : 0;
    const y=deckY+sheer+forecastle;
    const sternLift=profile.stern==="transom"?.65:profile.stern==="round"?.38:.20;
    const keel=-draft*(sternLift+(1-sternLift)*Math.sin((fraction+.5)*Math.PI));
    const bowRetreat=forward**5*(profile.bow==="atlantic"?2.5:profile.bow==="clipper"?1.8:.9);
    return [[-width,y,z],[-width*.97,.75*scale[1],z-bowRetreat],[-width*.69,keel*.78,z-bowRetreat],[-width*.24,keel,z-bowRetreat],
      [width*.24,keel,z-bowRetreat],[width*.69,keel*.78,z-bowRetreat],[width*.97,.75*scale[1],z-bowRetreat],[width,y,z]];
  });
  for(let i=0;i<rings.length-1;i++) {
    const a=rings[i],c=rings[i+1];
    for(let side=0;side<7;side++) {
      const center:Point=[(a[side][0]+a[side+1][0])/2,(a[side][1]+a[side+1][1])/2-draft*.15,0];
      b.face("hull",[a[side],c[side],c[side+1],a[side+1]],center);
    }
    const ac:Point=[0,a[0][1]+.1*scale[1],a[0][2]], cc:Point=[0,c[0][1]+.1*scale[1],c[0][2]];
    b.face("deck",[a[0],c[0],cc,ac],[0,1,0]);
    b.face("deck",[ac,cc,c[7],a[7]],[0,1,0]);
    for(const side of [0,7]) {
      const sign=side===0?-1:1;
      const p=a[side],q=c[side];
      b.face("dark",[[p[0]*.965,.62*scale[1],p[2]],[q[0]*.965,.62*scale[1],q[2]],[q[0]*.947,.3*scale[1],q[2]],[p[0]*.947,.3*scale[1],p[2]]],[sign,0,0]);
      // Continuous sheer strake, not a floating rectangular slab.
      b.face("structure",[p,q,[q[0],q[1]-.18*scale[1],q[2]],[p[0],p[1]-.18*scale[1],p[2]]],[sign,0,0]);
    }
  }
  for(const index of [0,rings.length-1]) {
    const ring=rings[index],outward:Point=[0,0,index===0?-1:1];
    b.face("hull",ring,outward);
    b.face("deck",[ring[0],ring[7],[0,ring[0][1]+.1*scale[1],ring[0][2]]],outward);
  }
  for(const [index,hardpoint] of hardpoints.entries()) {
    // Structural barbette remains when its equipment slot is empty.
    const next=rings.findIndex(r=>r[0][2]>=hardpoint.z),before=Math.max(0,next-1);
    const a=rings[before][0],c=rings[next][0],t=(hardpoint.z-a[2])/(c[2]-a[2]);
    const surfaceY=a[1]+(c[1]-a[1])*t+.1*scale[1];
    const baseY=surfaceY-.08,topY=hardpoint.y-.2,height=topY-baseY,width=hardpoint.radius*1.62;
    if(height<=0) throw new Error(`${shipClassId} main barbette ${index} would intersect its gun pivot`);
    b.block("structure",hardpoint.x,baseY,hardpoint.z,width,height,width,.93,"round");
    features.push({kind:`barbette-${index}`,requestedZ:hardpoint.z,actualZ:hardpoint.z,width,depth:width,height,baseY,topY});
  }

  // Forecastle break and deck-edge fittings keep long hulls from becoming unbroken boxes.
  if(profile.forecastleEnd>-.4) b.block("structure",0,deckY-.15,profile.forecastleEnd*length,beam*.76,.68*scale[1],.8,1);
  const deckhouseLength=length*(hull.hullId==="destroyer"?.14:.26);
  b.block("structure",0,deckY,-length*.025,beam*.52,.85*scale[1],deckhouseLength,.94);
  b.block("deck",0,deckY+.84*scale[1],-length*.025,beam*.49,.1*scale[1],deckhouseLength*.99,1);

  buildBridge(b,profile,deckY,scale,feature);
  for(const [index,funnel] of profile.funnels.entries()) {
    const base=deckY+1.05*scale[1], top=base+funnel.height, aft=-Math.tan(funnel.rake*Math.PI/180)*funnel.height;
    // Protect the entire raked casing AND its wider foot, not merely the nominal upright section.
    const minZ=Math.min(-funnel.depth*.625,aft-funnel.depth*.495);
    const maxZ=Math.max(funnel.depth*.625,aft+funnel.depth*.495);
    const centerOffset=(minZ+maxZ)/2;
    const z=feature(`funnel-${index}`,funnel.z*length+centerOffset,funnel.width*1.28,maxZ-minZ,funnel.height+1.05*scale[1])-centerOffset;
    const ring=(y:number,dz:number,s:number):Point[]=>Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6)*funnel.width*s/2,y,z+dz+Math.sin(i*Math.PI/6)*funnel.depth*s/2]);
    b.loft("structure",ring(base,0,1),ring(top-.9,aft,.91),[0,base,z],false);
    b.loft("dark",ring(top-.9,aft,.94),ring(top,aft,.99),[0,base,z+aft],false);
    const lip=ring(top,aft,.99),inner=ring(top,aft,.73),bottom=ring(top-1.4,aft,.73);
    for(let j=0;j<12;j++) {
      const k=(j+1)%12;
      b.face("dark",[lip[j],lip[k],inner[k],inner[j]],[0,1,0]);
      b.face("dark",[inner[j],inner[k],bottom[k],bottom[j]],[-inner[j][0],0,z+aft-inner[j][2]]);
    }
    b.face("dark",bottom,[0,1,0]);
    // Steam pipes and intake trunks are shaped, inclined and remain part of the static batch.
    for(const side of [-1,1]) b.spar("accent",[side*funnel.width*.52,base,z-funnel.depth*.22],[side*funnel.width*.45,top-.8,z+aft-funnel.depth*.22],.13);
    b.block("structure",0,deckY,z,funnel.width*1.28,.95*scale[1],funnel.depth*1.25,.9);
  }
  for(const [index,mast] of profile.masts.entries()) {
    const z=feature(`mast-${index}`,mast.z*length,beam*.25,1,mast.height), y=deckY+.8*scale[1];
    const tip:Point=[0,y+mast.height,z-Math.tan(mast.rake*Math.PI/180)*mast.height];
    b.spar("dark",[0,y,z],tip,hull.hullId==="battleship"?.35:.19);
    if(mast.tripod) for(const side of [-1,1]) b.spar("structure",[side*beam*.14,y,z-length*.018],[0,tip[1]-.23*mast.height,tip[2]+.1],hull.hullId==="battleship"?.3:.15);
    for(const fraction of [.65,.84]) {
      const yy=y+mast.height*fraction, zz=z+(tip[2]-z)*fraction, half=beam*(fraction===.65?.24:.16);
      b.spar("dark",[-half,yy,zz],[half,yy,zz],.11);
      b.spar("dark",[-half,yy,zz],[0,yy+mast.height*.06,zz],.065);
      b.spar("dark",[half,yy,zz],[0,yy+mast.height*.06,zz],.065);
    }
  }
  buildAviation(b,profile,deckY,length,beam,scale[1],feature);

  // Open working decks, boat cradles/davits and rows of scuttles, not weapons baked into the hull.
  for(const side of [-1,1]) {
    for(let index=0;index<(hull.hullId==="destroyer"?2:3);index++) {
      const z=(-.055+index*.055)*length, x=side*beam*.34, y=deckY+1.0*scale[1];
      b.block("dark",x,y-.15,z,beam*.095,.45,length*.042,.7,"round");
      b.block("deck",x,y+.05,z,beam*.074,.15,length*.033,.94,"round");
      for(const end of [-1,1]) {
        b.spar("structure",[x,y-.5,z+end*length*.016],[x-side*beam*.04,y+1.4,z+end*length*.016],.12);
        b.spar("structure",[x-side*beam*.04,y+1.4,z+end*length*.016],[x,y+1.5,z+end*length*.016],.12);
      }
    }
    for(let index=0;index<20;index++) {
      const z=(-.30+index*.027)*length, fraction=z/length;
      const station=HISTORICAL_HULL_STATIONS.findIndex(f=>f>=fraction), before=Math.max(0,station-1);
      const t=(fraction-HISTORICAL_HULL_STATIONS[before])/(HISTORICAL_HULL_STATIONS[station]-HISTORICAL_HULL_STATIONS[before]);
      const x=side*beam*.501*(profile.breadths[before]+(profile.breadths[station]-profile.breadths[before])*t);
      const yy=deckY-.75*scale[1], size=Math.min(.35,beam*.018);
      b.face("dark",[[x,yy-size,z-size],[x,yy+size,z-size],[x,yy+size,z+size],[x,yy-size,z+size]],[side,0,0]);
    }
    // Limited bow/stern rail segments have real stanchions but do not create hundreds of meshes.
    for(const end of [-1,1]) for(let index=0;index<4;index++) {
      const i=end<0?index+1:8+index, a=rings[i][side<0?0:7], c=rings[i+1][side<0?0:7];
      b.spar("accent",[a[0]*.96,a[1]+.7,a[2]],[c[0]*.96,c[1]+.7,c[2]],.055);
      b.spar("accent",[a[0]*.96,a[1],a[2]],[a[0]*.96,a[1]+.72,a[2]],.055);
    }
  }
  for(const side of [-1,1]) for(const z of [length*.40,-length*.43]) {
    b.block("dark",side*beam*.15,deckY+.28,z,.65,.6,1.1,1);
    b.spar("accent",[side*beam*.15-.5,deckY+.72,z],[side*beam*.15+.5,deckY+.72,z],.12);
  }
  const staticMeshes=b.finish(scene,root,`${name}-historical-static`,palette);
  const {rudder,propellers,meshes:motionMeshes}=buildMotion(scene,root,name,palette,profile,scale,beam);
  root.metadata={...root.metadata,historicalShipClassId:shipClassId,era:profile.era,features,staticMeshCount:staticMeshes.length};
  return {bodyMeshes:[...staticMeshes,...motionMeshes],staticMeshes,rudder,propellers,features};
}

function buildBridge(b:HullBuilder,p:HistoricalShipProfile,deckY:number,scale:Point,feature:(kind:string,z:number,w:number,d:number,h:number)=>number):void {
  const length=getShipClass(p.id).length, form=p.bridge.form, spec=p.bridge;
  const z=feature("bridge",spec.z*length,spec.width*1.10,spec.depth,spec.height);
  const base=deckY+.9*scale[1];
  const w=spec.width,d=spec.depth,h=spec.height;
  const platform=(yy:number,ww:number,dd:number,zz=z)=>b.block("deck",0,base+yy,zz,ww,.22*scale[1],dd,1);
  const glass=(yy:number,ww:number,zz:number)=> {
    // Individual panes separated by structural mullions, not one broad black stripe.
    for(let i=0;i<7;i++) b.block("dark",(i-3)*ww/7,base+yy,zz,ww/9,Math.min(.9,h*.07),.10,1);
  };
  if(form==="round"||form==="leader") {
    // Early Fletcher rounded wheelhouse vs Tashkent's long streamlined leader bridge.
    b.block("structure",0,base,z,w*.91,h*.70,d,form==="leader"?.82:.98,"round");
    b.block("structure",0,base+h*.70,z-d*.13,w*.56,h*.30,d*.48,.96,"round");
    platform(h*.69,w*1.10,d*.88,z+d*.025);
    glass(h*.52,w*.75,z+d*.42);
    for(const side of [-1,1]) b.block("structure",side*w*.46,base+h*.70,z+d*.11,w*.24,.65,d*.5,1);
  } else if(form==="pagoda") {
    // One continuous tapered column with non-monotonic cantilever observation galleries.
    b.block("structure",0,base,z-d*.08,w*.43,h,d*.52,.80,"wedge");
    const galleries=[[.16,.84,.78,.02],[.34,1.05,.62,.06],[.53,.80,.67,.02],[.71,.97,.46,.09],[.87,.56,.39,.04]];
    for(const [f,ww,dd,dz] of galleries) {
      platform(h*f,w*ww,d*dd,z+d*dz);
      b.block("structure",0,base+h*f,z+d*dz,w*ww*.57,h*.065,d*dd*.61,.97,"wedge");
    }
    glass(h*.73,w*.53,z+d*.32);
    for(const side of [-1,1]) b.spar("structure",[side*w*.18,base,z],[side*w*.35,base+h*.7,z+d*.09],.38);
  } else if(form==="french"||form==="tower") {
    // Continuous tower masts: NC slender column, Nurnberg compact tower, Richelieu massive faceted core.
    const french=form==="french", mainWidth=french?w*.69:w*.43;
    b.block("structure",0,base,z-d*.10,mainWidth,h,d*(french?.62:.50),french?.89:.78,french?"wedge":"clipped");
    b.block("structure",0,base+h*.22,z+d*.10,w,h*.20,d*.76,.96);
    platform(h*.42,w*1.03,d*.78,z+d*.06);
    glass(h*.34,w*.82,z+d*.47);
    platform(h*.69,w*.67,d*.52,z-d*.08);
    if(french) { platform(h*.87,w*.79,d*.40,z-d*.1); b.block("structure",0,base+h*.72,z-d*.20,w*.46,h*.27,d*.32,.92); }
  } else if(form==="wedge") {
    // German armoured forward conning body with separate aft tower and broad bridge wings.
    b.block("structure",0,base,z+d*.20,w*.52,h*.43,d*.43,.96,"round");
    b.block("structure",0,base,z-d*.17,w*.47,h,d*.53,.83,"wedge");
    b.block("structure",0,base+h*.38,z,w*.90,h*.20,d*.85,.98,"wedge");
    platform(h*.58,w*1.05,d*.90);
    glass(h*.47,w*.57,z+d*.38);
    platform(h*.82,w*.60,d*.51,z-d*.12);
  } else if(form==="enclosed") {
    // Japanese enclosed bridge, front vertical face, aft support trunk, thin side galleries.
    b.block("structure",0,base,z,w*.76,h*.76,d,.92,"wedge");
    b.block("structure",0,base+h*.65,z-d*.13,w*.45,h*.35,d*.5,.86,"wedge");
    platform(h*.43,w*1.03,d*.70,z+d*.12); platform(h*.77,w*.93,d*.89);
    glass(h*.61,w*.64,z+d*.44);
  } else {
    // British box bridges / US cruiser pilot houses have a wide navigation room on an aft tower.
    const town=form==="town", american=form==="cruiser";
    b.block("structure",0,base,z-d*.13,w*(town?.61:.52),h,d*.61,.97);
    b.block("structure",0,base+h*.33,z+d*.12,w,h*.25,d*.70,.98,american?"round":"clipped");
    platform(h*.58,w*1.06,d*.88,z+d*.04);
    glass(h*.47,w*.80,z+d*.46);
    for(const side of [-1,1]) b.block("structure",side*w*.47,base+h*.59,z+d*.09,w*.22,.72,d*.64,1);
    platform(h*.86,w*.65,d*.50,z-d*.15);
    if(town) for(const side of [-1,1]) b.block("structure",side*w*.28,base+h*.62,z-d*.2,w*.19,h*.31,d*.23,.88);
  }
  const top=base+spec.height;
  b.block("structure",0,top,z,spec.width*.3,1.5*scale[1],spec.depth*.30,.78,"round");
  b.spar("dark",[-spec.width*.42,top+1.1*scale[1],z],[spec.width*.42,top+1.1*scale[1],z],.3*scale[1]);
}

function buildAviation(b:HullBuilder,p:HistoricalShipProfile,deckY:number,length:number,beam:number,scaleY:number,feature:(kind:string,z:number,w:number,d:number,h:number,protect?:boolean)=>number):void {
  if(p.aviation==="none")return;
  const z=feature("aviation",p.aviationZ*length,beam*.65,length*.07,3*scaleY,false), y=deckY+.6*scaleY;
  const cross=p.aviation==="midships-cross", pair=p.aviation==="stern-pair"||p.aviation==="stern-rails";
  if(cross) for(const side of [-1,1]) b.block("structure",side*beam*.24,y,z+length*.038,beam*.30,2.2*scaleY,length*.05,.98);
  else if(pair) b.block("dark",0,deckY+.03,z,beam*.38,.12,length*.067,1);
  const rails=pair?[-1,1]:[0];
  for(const side of rails) {
    const x=side*beam*.30, zz=z+(side===0?0:side*length*.008);
    const start:Point=cross?[-beam*.43,y+1.4,zz]:[x,y+1.4,zz-length*.036];
    const end:Point=cross?[beam*.43,y+1.4,zz]:[x+side*beam*.10,y+1.4,zz+length*.036];
    for(const offset of [-.38,.38]) b.spar("structure",[start[0]+(cross?0:offset),start[1],start[2]+(cross?offset:0)],[end[0]+(cross?0:offset),end[1],end[2]+(cross?offset:0)],.18);
    for(let i=0;i<=6;i++) {
      const t=i/6, q:Point=[start[0]+(end[0]-start[0])*t,y+1.4,start[2]+(end[2]-start[2])*t];
      b.spar("dark",[q[0]-(cross?0:.5),q[1],q[2]-(cross?.5:0)],[q[0]+(cross?0:.5),q[1],q[2]+(cross?.5:0)],.10);
    }
  }
  const cx=pair?0:beam*.31, cz=z-length*.03;
  const head:Point=[cx,y+5.5*scaleY,cz], tip:Point=[cx+beam*.22,y+4.1*scaleY,cz-length*.026];
  b.spar("structure",[cx,y,cz],head,.36*scaleY);
  b.spar("structure",head,tip,.20*scaleY);
  b.spar("dark",[cx,y+2.2*scaleY,cz],tip,.13*scaleY);
  b.spar("dark",tip,[tip[0],y+1.1,tip[2]],.05);
}

function buildMotion(scene:Scene,parent:TransformNode,name:string,palette:PixelShipPalette,p:HistoricalShipProfile,scale:Point,beam:number):{rudder:TransformNode;propellers:TransformNode[];meshes:Mesh[]} {
  // Cancel inherited stretch BEFORE animated rotations, keeping a spinning propeller circular.
  const metric=new TransformNode(`${name}-motion-metric`,scene); metric.parent=parent;
  metric.scaling.set(1/scale[0],1/scale[1],1/scale[2]);
  const rudder=new TransformNode(`${name}-rudder-pivot`,scene); rudder.parent=metric;
  rudder.position.set(0,-.6*scale[1],-51.5*scale[2]);
  const rb=new HullBuilder([1,1,1]); rb.block("dark",0,-1.7*scale[1],.5*scale[2],.4*scale[0],2.8*scale[1],2.8*scale[2],.82);
  const meshes=rb.finish(scene,rudder,`${name}-rudder`,palette);
  const propellers=Array.from({length:p.shafts},(_,i)=> {
    const side=p.shafts===3?(i-1)*.16:(i-(p.shafts-1)/2)*.14;
    const root=new TransformNode(`${name}-propeller-${i}`,scene); root.parent=metric;
    root.position.set(side*beam,-.6*scale[1],(-49.5+(Math.abs(side)>.15?2:0))*scale[2]);
    const pb=new HullBuilder([1,1,1]), radius=Math.min(beam*.10,2.7);
    pb.spar("dark",[0,0,-.4],[0,0,1.0],radius*.18,8);
    for(let blade=0;blade<4;blade++) {
      const a=blade*Math.PI/2, c=Math.cos(a),s=Math.sin(a);
      const pts:Point[]=[[.08,.1,-.08],[radius*.8,.1,-.02],[radius,.4,.12],[radius*.3,.4,.18]].map(q=>[q[0]*c-q[1]*s,q[0]*s+q[1]*c,q[2]]);
      const back:Point[]=pts.map(q=>[q[0],q[1],q[2]-.12]);
      pb.face("accent",pts,[0,0,1]); pb.face("accent",back,[0,0,-1]);
      for(let j=0;j<4;j++) {
        const k=(j+1)%4,mid:Point=[(pts[j][0]+pts[k][0])/2-radius*.5*c,(pts[j][1]+pts[k][1])/2-radius*.5*s,0];
        pb.face("accent",[pts[j],pts[k],back[k],back[j]],mid);
      }
    }
    meshes.push(...pb.finish(scene,root,`${name}-propeller-${i}`,palette)); return root;
  });
  return {rudder,propellers,meshes};
}
