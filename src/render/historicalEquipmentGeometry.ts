import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { ShipClassId } from "../ships/classes";
import { mainBatteryBarrelRestZ, MAIN_BATTERY_CRADLE_HEIGHT, MAIN_BATTERY_CRADLE_FORWARD } from "../ships/mainBatteries";
import { createChamferedBox, type MainGunVisual } from "./shipGeometry";
import type { EquipmentVisualMount, InternalModuleVisualPlan, MainGunVisualMount, TorpedoVisualMount } from "./loadoutVisualPlan";
import type { PixelShipPalette } from "./shipMaterials";
import { historicalEquipmentProfile, historicalMainGunHousing, type HistoricalGunHousingProfile } from "./historicalEquipmentProfiles";

/** Parts are merged before parenting; exterior parents provide an undistorted metre frame. */
class StaticParts {
  private readonly parts: Mesh[] = [];
  private readonly labels: string[] = [];
  constructor(private scene: Scene, private name: string) {}
  private add(mesh: Mesh, label: string, material: Material, x: number, y: number, z: number): Mesh {
    mesh.position.set(x, y, z); mesh.material = material;
    this.parts.push(mesh); this.labels.push(label); return mesh;
  }
  box(label: string, w: number, h: number, d: number, x: number, y: number, z: number, material: Material): Mesh {
    return this.add(CreateBox(`${this.name}-${label}`, { width: w, height: h, depth: d }, this.scene), label, material, x, y, z);
  }
  house(label: string, w: number, h: number, d: number, x: number, y: number, z: number, material: Material, chamfer = .25, topScale = .88): Mesh {
    return this.add(createChamferedBox(this.scene, `${this.name}-${label}`, { width: w, height: h, depth: d, chamfer, topScale }), label, material, x, y, z);
  }
  gunhouse(profile: HistoricalGunHousingProfile, width: number, material: Material): Mesh {
    return this.add(createHistoricalGunhouse(this.scene, `${this.name}-armoured-gunhouse`, profile, width),
      "armoured-gunhouse", material, 0, 1.45, .35);
  }
  cylinder(label: string, diameter: number, length: number, x: number, y: number, z: number, material: Material,
    axis: "x" | "y" | "z" = "y", diameterTop = diameter): Mesh {
    const mesh = this.add(CreateCylinder(`${this.name}-${label}`, { diameterBottom: diameter, diameterTop, height: length, tessellation: 12 }, this.scene), label, material, x, y, z);
    if (axis === "x") mesh.rotation.z = Math.PI / 2;
    if (axis === "z") mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  finish(parent: TransformNode): void {
    const groups = new Map<Material, Mesh[]>();
    for (const mesh of this.parts) {
      const material = mesh.material!, group = groups.get(material) ?? [];
      group.push(mesh); groups.set(material, group);
    }
    let index = 0;
    for (const [material, meshes] of groups) {
      const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
      if (!merged) throw new Error(`Unable to merge ${this.name}`);
      merged.name = `${this.name}-static-${index++}`; merged.material = material; merged.parent = parent;
      merged.metadata = { historicalParts: [...this.labels] };
    }
    parent.metadata = { ...parent.metadata, historicalParts: [...this.labels] };
  }
}

/** Closed, flat-shaded shells: +Z is the gun face; aft walls need not mirror its slope. */
export function createHistoricalGunhouse(scene: Scene, name: string, profile: HistoricalGunHousingProfile, width: number): Mesh {
  if (!profile.silhouette) return createChamferedBox(scene, name, {
    width, height: profile.height, depth: profile.depth, chamfer: profile.chamfer, topScale: profile.topScale,
  });
  // [height fraction, width fraction, aft extent, forward extent, corner fraction].
  const sections: ReadonlyArray<readonly [number, number, number, number, number]> = profile.silhouette === "type-c-wedge"
    ? [[-.5, 1, -1, 1, .18], [-.04, 1, -1, 1, .18], [.5, .84, -.96, .26, .2]]
    : profile.silhouette === "mk38-box"
      ? [[-.5, 1, -1, 1, .14], [.12, 1, -1, .96, .14], [.5, .96, -.98, .47, .15]]
      : [[-.5, .88, -.88, .9, .3], [.04, 1, -1, .88, .3], [.33, .89, -.91, .57, .32], [.5, .67, -.73, .28, .34]];
  type Point = readonly [number, number, number];
  const rings: Point[][] = sections.map(([y, w, aft, fore, cut]) => {
    const x = width * w / 2, back = profile.depth * aft / 2, front = profile.depth * fore / 2;
    const c = Math.min(x * cut, (front - back) * .2);
    return [[-x+c,y*profile.height,back],[x-c,y*profile.height,back],[x,y*profile.height,back+c],
      [x,y*profile.height,front-c],[x-c,y*profile.height,front],[-x+c,y*profile.height,front],
      [-x,y*profile.height,front-c],[-x,y*profile.height,back+c]];
  });
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const face = (points: readonly Point[], outward: Point): void => {
    for (let i = 1; i < points.length - 1; ++i) {
      const a = points[0]!; let b = points[i]!, c = points[i+1]!;
      const ab = b.map((v,j) => v-a[j]!), ac = c.map((v,j) => v-a[j]!);
      const cross = [ab[1]!*ac[2]!-ab[2]!*ac[1]!, ab[2]!*ac[0]!-ab[0]!*ac[2]!, ab[0]!*ac[1]!-ab[1]!*ac[0]!];
      if (cross.reduce((sum,v,j) => sum+v*outward[j]!,0) > 0) [b,c] = [c,b];
      const start = positions.length/3;
      for (const point of [a,b,c]) {
        positions.push(...point);
        uvs.push(point[0]/width+.5, (Math.abs(outward[1]) > .5 ? point[2]/profile.depth : point[1]/profile.height)+.5);
      }
      indices.push(start,start+1,start+2);
    }
  };
  face(rings[0]!, [0,-1,0]); face(rings[rings.length-1]!, [0,1,0]);
  for (let r = 0; r < rings.length-1; ++r) for (let i = 0; i < 8; ++i) {
    const j = (i+1)%8, a = rings[r]!, b = rings[r+1]!;
    face([a[i]!,b[i]!,b[j]!,a[j]!], [(a[i]![0]+a[j]![0])/2,0,(a[i]![2]+a[j]![2])/2]);
  }
  const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions=positions; data.indices=indices; data.normals=normals; data.uvs=uvs;
  const mesh = new Mesh(name,scene); data.applyToMesh(mesh); mesh.metadata={silhouette:profile.silhouette};
  return mesh;
}

/** Stepped round tube with a recessed bore. Local +Y matches the former cylinder. */
function recoilBarrel(scene: Scene, name: string, length: number, diameter: number): Mesh {
  const r = diameter / 2, segments = 12;
  const rings: Array<[number, number]> = [[-length / 2, r * 1.5], [-length * .28, r * 1.5],
    [-length * .27, r * 1.15], [length * .32, r], [length * .5, r * .88],
    [length * .5, r * .58], [length * .5 - Math.min(.28, length * .04), r * .58]];
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (const [y, radius] of rings) for (let i = 0; i < segments; ++i) {
    const angle = i * Math.PI * 2 / segments;
    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius); uvs.push(i / segments, y / length + .5);
  }
  for (let ring = 0; ring < rings.length - 1; ++ring) for (let i = 0; i < segments; ++i) {
    const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
    indices.push(a, b, b + segments, a, b + segments, a + segments);
  }
  const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh);
  mesh.metadata = { geometry: "stepped-round-open-muzzle", muzzle: { x: 0, y: length / 2, z: 0 }, sourceLength: length };
  return mesh;
}

export function createHistoricalMainGun(scene: Scene, parent: TransformNode, name: string,
  shipClassId: ShipClassId, mount: MainGunVisualMount, palette: PixelShipPalette): MainGunVisual {
  const profile = historicalMainGunHousing(shipClassId, mount.mainGunId), visual = mount.visual;
  const root = new TransformNode(`${name}-turret`, scene); root.parent = parent;
  root.metadata = { historicalProfile: profile.id, historicalName: profile.name, barrelCount: visual.barrelCount };
  const p = new StaticParts(scene, name), paint = palette.structure;
  // KGV's B mount gets a narrower twin housing, not a quad with two unused ports.
  const width = visual.houseWidth * (profile.pairedPorts && visual.barrelCount === 2 ? .76 : 1);
  p.cylinder("roller-path", visual.mountDiameter, .75, 0, -.04, 0, paint);
  p.cylinder("barbette", visual.mountDiameter * .84, 1.0, 0, .38, 0, paint);
  if (profile.shield === "open") {
    p.house("upright-front-shield", width, profile.height, .38, 0, 1.42, 2.0, paint, .18, .98);
    for (const side of [-1, 1]) p.box("side-shield", .22, 1.8, profile.depth, side * (width / 2 - .1), 1.25, .1, paint);
    p.box("shield-roof", width, .18, profile.depth * .6, 0, 2.55, .7, paint);
    p.cylinder("exposed-breech", .82, 1.8, 0, 1.45, -.35, paint, "z");
    p.box("gunner-platform", width * .95, .16, 4.4, 0, .3, -.4, paint);
  } else {
    p.gunhouse(profile, width, paint);
    if (!profile.silhouette && profile.roof === "stepped") p.house("raised-roof", width * .63, .38, profile.depth * .43, 0, 1.45 + profile.height / 2, -.55, paint, .18, .94);
    if (!profile.silhouette && profile.roof === "rounded") p.house("curved-roof-facets", width * .8, .42, profile.depth * .7, 0, 1.45 + profile.height / 2 - .02, .1, paint, Math.min(.7, width * .12), .72);
    for (const side of [-1, 1]) {
      p.house("sighting-hood", .48, .45, .9, side * width * .34, 1.45 + profile.height / 2, .7, paint, .1);
      p.box("rear-access", .65, 1.1, .13, side * width * .27, 1.1, .35 - profile.depth / 2 - .03, paint);
    }
    if (profile.pairedPorts && visual.barrelCount === 4) p.box("paired-gun-division", .2, .85, .42, 0, 1.7, .35 + profile.depth / 2, paint);
  }
  if (profile.rangefinder > 0) {
    p.cylinder("rangefinder-tube", .35, profile.rangefinder, 0, 1.7 + profile.height / 2, -.65, paint, "x");
    for (const side of [-1, 1]) p.house("rangefinder-end", .7, .65, .85, side * profile.rangefinder / 2, 1.7 + profile.height / 2, -.65, paint, .14);
  }
  p.finish(root);
  const cradle = new TransformNode(`${name}-gun-cradle`, scene);
  cradle.position.set(0, MAIN_BATTERY_CRADLE_HEIGHT, MAIN_BATTERY_CRADLE_FORWARD); cradle.parent = root;
  const barrelRestZ: number[] = [];
  const barrels = Array.from({ length: visual.barrelCount }, (_, index) => {
    const barrel = recoilBarrel(scene, `${name}-barrel-${index}`, visual.barrelLength, profile.barrelDiameter);
    const restZ = mainBatteryBarrelRestZ(visual);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set((index - (visual.barrelCount - 1) / 2) * visual.barrelSpacing, 0, restZ);
    barrel.material = palette.dark; barrel.parent = cradle; barrelRestZ.push(restZ); return barrel;
  });
  return { root, cradle, barrels, barrelRestZ };
}

export function createHistoricalTorpedoLauncher(scene: Scene, parent: TransformNode, name: string,
  mount: TorpedoVisualMount, palette: PixelShipPalette): TransformNode {
  const profile = historicalEquipmentProfile(mount.equipmentId), count = profile.barrels;
  const root = new TransformNode(`${name}-torpedo-launcher`, scene); root.parent = parent;
  root.metadata = { historicalProfile: profile.layout, barrelCount: count };
  const p = new StaticParts(scene, name), heavy = mount.torpedoId === "type-93-mod-3";
  const diameter = heavy ? .92 : .82, spacing = heavy ? 1.22 : 1.08, width = count * spacing + .45;
  p.cylinder("training-ring", width, .55, 0, .04, 0, palette.structure);
  for (const z of [-2.1, 2.1]) p.box("tube-saddle", width, .52, .48, 0, .7, z, palette.structure);
  for (let i = 0; i < count; ++i) {
    const x = (i - (count - 1) / 2) * spacing;
    p.cylinder("launch-tube", diameter, 7.2, x, 1.05, .25, palette.dark, "z");
    for (const z of [-2.8, -.7, 2.4]) p.cylinder("reinforcing-collar", diameter * 1.15, .14, x, 1.05, z, palette.structure, "z");
    p.cylinder("breech-door", diameter * 1.12, .18, x, 1.05, -3.42, palette.structure, "z");
    p.cylinder("muzzle-ring", diameter * 1.08, .12, x, 1.05, 3.8, palette.structure, "z");
  }
  p.cylinder("train-sight-pedestal", .25, 1.6, 0, 1.95, -.65, palette.structure);
  p.cylinder("sight-crossbar", .2, .85, 0, 2.7, -.65, palette.dark, "x");
  if (heavy) {
    p.box("splinter-shield-roof", width + .25, .22, 4.5, 0, 1.85, -.55, palette.structure);
    for (const side of [-1, 1]) p.house("splinter-shield-side", .22, 1.55, 4.6, side * width / 2, 1.15, -.55, palette.structure, .05);
  } else if (mount.torpedoId === "g7a-t1") {
    p.house("central-control-hood", 1.2, .8, 1.7, 0, 2.05, -.7, palette.structure);
  } else if (mount.torpedoId === "mk-15-mod-3") {
    p.box("operator-walkway", width, .13, .95, 0, .7, -3.5, palette.structure);
    p.house("train-drive", 1, .7, 1.4, width / 2, .55, -.75, palette.structure);
  }
  p.finish(root); return root;
}

export function createHistoricalAuxiliary(scene: Scene, parent: TransformNode, name: string,
  mount: EquipmentVisualMount, palette: PixelShipPalette, deckBelowMount?: number): TransformNode {
  const profile = historicalEquipmentProfile(mount.equipmentId);
  const root = new TransformNode(name, scene); root.parent = parent;
  root.metadata = { historicalProfile: profile.layout, barrelCount: profile.barrels };
  const p = new StaticParts(scene, name), steel = palette.structure, dark = palette.dark;
  if (deckBelowMount !== undefined && deckBelowMount > .4 && (mount.category === "sideGun" || mount.category === "antiAir")) {
    const sideGun = mount.category === "sideGun", singleAA = profile.barrels === 1;
    const diameter = sideGun ? 3.45 : singleAA ? 2 : profile.barrels === 8 ? 4.5 : 4.2;
    const base = -deckBelowMount, top = -.28, height = top-base;
    // Circular plinths stay visually stationary as a secondary turret traverses.
    p.cylinder("deck-connected-pedestal", sideGun ? 2.65 : singleAA ? .72 : 1.3, height, 0, (base+top)/2, 0, steel,
      "y", sideGun ? 2.3 : singleAA ? .62 : 1.12);
    p.cylinder("supported-mount-platform", diameter, .2, 0, -.24, 0, steel);
    p.cylinder("pedestal-deck-foot", sideGun ? 3 : singleAA ? 1.1 : 1.7, .18, 0, base+.09, 0, steel);
    root.metadata = { ...root.metadata, supportBaseY: base, supportPlatformTopY: -.14 };
  }
  if (mount.category === "sideGun") {
    const open = profile.layout === "sk-c33-open-twin", broad = profile.layout === "mk16-enclosed-triple";
    const w = open ? 2.7 : broad ? 3.35 : 2.9, h = open ? 1.2 : 1.7;
    p.cylinder("training-base", w, .5, 0, .05, 0, steel);
    if (open) {
      p.house("front-splinter-shield", w, h, .32, 0, .9, 1, steel, .12, .75);
      for (const side of [-1, 1]) p.box("side-splinter-shield", .13, h, 1.7, side * w / 2, .9, .25, steel);
      p.cylinder("exposed-cradle", .6, 1.8, 0, .95, 0, dark, "x");
    } else {
      p.house("enclosed-secondary-turret", w, h, broad ? 3.2 : 2.7, 0, .85, .15, steel,
        profile.layout === "sk-c28-enclosed-twin" ? .65 : .4, profile.layout === "qf525-enclosed-twin" ? .73 : .85);
      p.house("roof-sight", .62, .28, .7, w * .25, 1.8, -.35, steel, .12);
    }
    for (let i = 0; i < profile.barrels; ++i) {
      const x = (i - (profile.barrels - 1) / 2) * .57;
      p.cylinder("round-secondary-barrel", broad ? .24 : .21, open ? 3.6 : 4.7, x, .95, 2.5, dark, "z", .16);
      p.cylinder("recoil-sleeve", .37, 1, x, .95, .9, steel, "z");
    }
  } else if (mount.category === "antiAir") {
    const oerlikon = profile.barrels === 1, pom = profile.barrels === 8;
    p.cylinder("aa-pedestal", oerlikon ? .75 : pom ? 2.7 : 2.15, .55, 0, .12, 0, steel);
    if (oerlikon) {
      p.cylinder("pedestal-column", .34, 1, 0, .65, 0, steel);
      p.house("oerlikon-shield", 1.5, 1.2, .13, 0, 1.1, .35, steel, .18, .72);
      p.cylinder("sixty-round-drum", .57, .3, 0, 1.72, -.25, dark, "x");
      p.box("shoulder-rest", .8, .15, .65, 0, 1.15, -.9, steel);
    } else {
      p.box("crew-platform", pom ? 3.7 : 3.1, .2, 2.75, 0, .45, -.3, steel);
      for (const side of [-1, 1]) {
        p.box("loader-seat", .55, .12, .55, side * 1.2, .93, -.75, steel);
        p.box(pom ? "belt-feed-box" : "ready-use-clips", .56, .62, 1, side * (pom ? 1.55 : 1), 1.02, .25, steel);
      }
      if (!pom) p.house("bofors-front-shield", 2.85, .85, .16, 0, .98, .95, steel, .18, .8);
    }
    for (let i = 0; i < profile.barrels; ++i) {
      const cols = pom ? 4 : profile.barrels, row = Math.floor(i / cols), col = i % cols;
      const x = (col - (cols - 1) / 2) * (pom ? .55 : .48), y = (oerlikon ? 1.35 : 1.1) + row * .42;
      p.cylinder("round-aa-barrel", oerlikon ? .09 : .13, pom ? 2.6 : 3.15, x, y, 1.35, dark, "z", oerlikon ? .07 : .1);
      p.box("gun-receiver", .28, .3, 1.1, x, y, -.3, dark);
      if (pom) p.cylinder("conical-flash-hider", .2, .35, x, y, 2.8, dark, "z", .32);
      if (!oerlikon && !pom) p.box("top-loading-chute", .22, .6, .42, x, y + .38, -.35, steel);
    }
    if (profile.layout === "bofors-quad-director") {
      p.cylinder("mk51-director-post", .48, 1.35, 1.7, .7, -1.1, steel);
      p.house("mk51-director-head", .8, .55, .8, 1.7, 1.4, -1.1, steel, .18);
      p.cylinder("director-optics", .18, 1, 1.7, 1.5, -1.1, dark, "x");
    }
  } else if (mount.category === "depthCharge") {
    if (profile.layout === "hedgehog-24-spigots") {
      p.house("hedgehog-rocking-bed", 3.35, .7, 3.15, 0, .25, 0, steel, .25);
      // Visible historical spigots do not add simulated projectiles.
      for (let i = 0; i < 24; ++i) {
        const x = (i % 6 - 2.5) * .45, z = (Math.floor(i / 6) - 1.5) * .7;
        const spigot = p.cylinder("hedgehog-spigot", .15, 1.3, x, 1.1, z, dark);
        spigot.rotation.x = .48 + z * .07;
        const bomb = p.cylinder("hedgehog-projectile", .26, .75, x, 1.65, z + .2, steel, "y", .12);
        bomb.rotation.x = spigot.rotation.x;
      }
    } else if (profile.layout === "mk-vii-stern-rails") {
      for (const x of [-.8, .8]) {
        p.box("stern-release-rail", .16, .32, 4.8, x, .2, 0, steel);
        for (const z of [-1.9, 1.9]) p.box("rail-upright", .17, 1.2, .17, x, .65, z, steel);
      }
      for (const z of [-1.45, 0, 1.45]) p.cylinder("mk-vii-depth-charge", .9, 1.4, 0, .85, z, dark, "x");
      p.box("release-gate", 1.7, .15, .2, 0, 1.2, -2.1, steel);
    } else {
      const kGun = profile.layout === "mk6-k-gun";
      p.cylinder("thrower-base", 1.2, .4, 0, .18, 0, steel);
      p.cylinder("projector-column", .52, 1.4, 0, .8, 0, steel);
      for (const side of kGun ? [1] : [-1, 1]) {
        const arm = p.cylinder(kGun ? "k-gun-spigot" : "y-thrower-arm", .3, 1.65, side * .62, 1.4, 0, dark);
        arm.rotation.z = -side * .85;
        p.cylinder("loaded-depth-charge", .95, 1.15, side * 1.12, 1.8, 0, steel, "z");
      }
      for (const z of [-1.7, -2.8]) p.cylinder("ready-depth-charge", .95, 1.15, -.8, .5, z, dark, "x");
    }
  } else throw new Error(`Not an external auxiliary: ${mount.category}`);
  p.finish(root); return root;
}

/** Dock inspection only: battle ships never allocate interior meshes. */
export function createHistoricalInternalEquipment(scene: Scene, parent: TransformNode, name: string,
  module: InternalModuleVisualPlan, palette: PixelShipPalette): TransformNode {
  const profile = historicalEquipmentProfile(module.equipmentId), layout = profile.layout;
  const root = new TransformNode(name, scene); root.parent = parent;
  root.position.set(module.position.x, module.position.y, module.position.z);
  root.metadata = { historicalProfile: layout, equipmentId: module.equipmentId, category: module.category, slotIndex: module.slotIndex, inspectionOnly: true };
  const p = new StaticParts(scene, name), steel = palette.structure, dark = palette.dark;
  const { width: w, height: h, depth: d } = module.bounds;
  p.box("machinery-bed", w, .12, d, 0, -h / 2, 0, dark);
  if (module.category === "magazine") {
    const dual = layout === "mk38-dual-feed" || layout === "flash-tight-flooding";
    for (const x of dual ? [-.8, .8] : [0]) {
      p.house("ammunition-hoist-trunk", .62, h * .95, .85, x, 0, 0, steel, .1);
      p.box("feed-conveyor", .6, .2, d * .7, x, -.5, 0, dark);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 5; ++i) {
      const z = (i - 2) * d / 6;
      p.cylinder("stowed-projectile", .38, h * .58, side * w * .34, -.22, z, steel, "y", .1);
      p.box("shell-rack", .68, .14, .65, side * w * .34, -.92, z, dark);
      if (layout === "cased-ammunition-chain") p.cylinder("separate-cartridge-case", .3, .7, side * w * .2, -.65, z, dark);
    }
    if (layout === "flash-tight-flooding") {
      p.box("flash-tight-bulkhead", w, h * .7, .15, 0, -.2, d * .32, steel);
      for (const x of [-w * .42, w * .42]) p.cylinder("flooding-main", .13, d * .9, x, h * .35, 0, dark, "z");
    }
  } else if (module.category === "engine") {
    // All four catalogue plants are steam turbines; no invented diesel conversion.
    const ge = layout === "ge-geared-turbines", kampon = layout === "kampon-geared-turbines";
    const boiler = layout === "wagner-deschimag-steam";
    for (const side of [-1, 1]) {
      const x = side * w * .23;
      p.cylinder("low-pressure-turbine-casing", w * .25, d * .34, x, -.12, -d * .06, steel, "z");
      p.cylinder("high-pressure-turbine-casing", w * .16, d * .25, x, -.23, d * .26, steel, "z");
      p.cylinder("reduction-gear-case", w * .31, d * .17, x, -.1, -d * .34, steel, "z");
      p.cylinder("propulsion-shaft", .15, d * .16, x, -.1, -d * .43, dark, "z");
      for (const z of [-d * .16, 0, d * .14]) p.box("casing-flange", w * .29, .14, .12, x, h * .18, z, dark);
      p.cylinder("steam-supply-main", .18, d * .64, x + side * w * .14, h * .22, 0, dark, "z");
      if (ge) p.cylinder("cruising-turbine", .8, d * .23, x * .58, h * .23, d * .18, steel, "z");
      if (kampon) p.house("outboard-auxiliary", .7, .7, d * .22, x + side * .8, -.3, d * .2, steel, .15);
    }
    if (boiler) {
      p.house("boiler-casing", w * .75, h * .76, d * .2, 0, .05, d * .36, steel, .3);
      p.cylinder("high-pressure-steam-drum", .8, w * .65, 0, h * .4, d * .36, dark, "x");
    }
  } else {
    const dual = layout !== "single-rudder-ram", circuits = layout === "dual-circuit-ram" || layout === "gearing-electrohydraulic";
    p.cylinder("rudder-stock", .55, h * .9, 0, 0, .2, steel);
    p.box("tiller-crosshead", w * .63, .3, .5, 0, .2, .2, dark);
    for (const side of dual ? [-1, 1] : [1]) {
      p.cylinder("hydraulic-ram-cylinder", .6, w * .36, side * w * .25, .15, .2, steel, "x");
      p.cylinder("polished-ram-rod", .22, w * .38, side * w * .14, .15, .2, dark, "x");
      p.cylinder("electric-pump-motor", .65, 1, side * w * .27, -.4, -d * .31, steel, "z");
      p.cylinder("hydraulic-pressure-line", .1, d * .5, side * w * .3, -.15, -d * .04, dark, "z");
    }
    p.house("oil-reservoir", w * .45, .65, .9, 0, -.45, d * .32, steel, .15);
    if (circuits) {
      p.house("control-valve-bank", 1.2, .8, .65, 0, .12, -d * .3, steel, .12);
      for (const x of [-.4, 0, .4]) p.cylinder("pressure-accumulator", .24, .85, x, .5, -d * .31, dark);
    }
  }
  p.finish(root); return root;
}
