import type { Material } from "@babylonjs/core/Materials/material";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { EquipmentDefinition, EquipmentRarity } from "../profile/equipmentCatalog";
import type { PixelShipPalette } from "./shipMaterials";

const rarityIndex: Record<EquipmentRarity, number> = {
  common: 0,
  purple: 1,
  gold: 2,
  redGold: 3,
};

function createBarrel(
  scene: Scene,
  parent: TransformNode,
  name: string,
  x: number,
  y: number,
  z: number,
  length: number,
  diameter: number,
  material: Material,
): void {
  const barrel = CreateCylinder(name, {
    height: length,
    diameter,
    tessellation: 8,
  }, scene);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(x, y, z + length / 2);
  barrel.material = material;
  barrel.parent = parent;
}

export function createSideGunMountVisual(
  scene: Scene,
  parent: TransformNode,
  name: string,
  rarity: EquipmentRarity,
  palette: PixelShipPalette,
): TransformNode {
  const variant = rarityIndex[rarity];
  const barrelCount = [2, 2, 2, 3][variant];
  const caliberScale = [0.82, 1, 1.12, 1.16][variant];
  const mount = new TransformNode(name, scene);
  mount.parent = parent;
  const base = CreateCylinder(`${name}-base`, {
    height: 0.8 * caliberScale,
    diameter: 2.4 * caliberScale,
    tessellation: 8,
  }, scene);
  base.material = palette.dark;
  base.parent = mount;
  const house = CreateBox(`${name}-house`, {
    width: 2.3 * caliberScale,
    height: 1.15 * caliberScale,
    depth: 2.1 * caliberScale,
  }, scene);
  house.position.y = 0.72 * caliberScale;
  house.material = palette.structure;
  house.parent = mount;
  for (let index = 0; index < barrelCount; index += 1) {
    const offset = (index - (barrelCount - 1) / 2) * 0.48 * caliberScale;
    createBarrel(scene, mount, `${name}-barrel-${index}`, offset, 0.95 * caliberScale, 0.65, 3.8 + variant * 0.45, 0.2 + variant * 0.025, palette.dark);
  }
  return mount;
}

function createSideGun(
  scene: Scene,
  root: TransformNode,
  rarity: EquipmentRarity,
  palette: PixelShipPalette,
): void {
  for (const side of [-1, 1]) {
    const mount = createSideGunMountVisual(scene, root, `dock-side-gun-${side}`, rarity, palette);
    mount.position.set(side * 5.1, 6.8, 1.5);
    mount.rotation.y = side * Math.PI / 2;
  }
}

export function createAntiAirMountVisual(
  scene: Scene,
  parent: TransformNode,
  name: string,
  rarity: EquipmentRarity,
  palette: PixelShipPalette,
): TransformNode {
  const variant = rarityIndex[rarity];
  const barrelCount = [1, 8, 2, 4][variant];
  const mount = new TransformNode(name, scene);
  mount.parent = parent;
  const base = CreateCylinder(`${name}-base`, {
    height: 0.55,
    diameter: 1.4 + variant * 0.18,
    tessellation: 8,
  }, scene);
  base.material = palette.dark;
  base.parent = mount;
  for (let index = 0; index < barrelCount; index += 1) {
    const columns = variant === 1 ? 4 : Math.min(2, barrelCount);
    const row = Math.floor(index / columns);
    const column = index % columns;
    createBarrel(scene, mount, `${name}-barrel-${index}`, (column - (columns - 1) / 2) * 0.24, 0.65 + row * 0.22, 0.2, 2.3 + variant * 0.22, 0.09, palette.accent);
  }
  if (variant === 3) {
    const director = CreateCylinder(`${name}-director`, { height: 0.75, diameter: 0.9, tessellation: 8 }, scene);
    director.position.set(1.1, 0.8, -0.5);
    director.material = palette.structure;
    director.parent = mount;
  }
  return mount;
}

function createAntiAir(
  scene: Scene,
  root: TransformNode,
  rarity: EquipmentRarity,
  palette: PixelShipPalette,
): void {
  for (const [mountIndex, z] of [-7, 8].entries()) {
    const mount = createAntiAirMountVisual(scene, root, `dock-aa-${mountIndex}`, rarity, palette);
    mount.position.set(mountIndex ? 4.1 : -4.1, 8.2, z);
    mount.rotation.y = mountIndex ? -0.45 : 0.45;
  }
}

export function createDepthChargeMountVisual(
  scene: Scene,
  parent: TransformNode,
  name: string,
  rarity: EquipmentRarity,
  palette: PixelShipPalette,
): TransformNode {
  const variant = rarityIndex[rarity];
  const forwardThrower = variant === 3;
  const mount = new TransformNode(name, scene);
  mount.parent = parent;
  if (forwardThrower) {
    for (let index = 0; index < 12; index += 1) {
      const row = Math.floor(index / 4);
      const column = index % 4;
      createBarrel(scene, mount, `${name}-hedgehog-${index}`, (column - 1.5) * 0.58, row * 0.35, 0, 2.2, 0.16, palette.accent);
    }
    return mount;
  }
  const chargeCount = 3 + variant * 2;
  for (let index = 0; index < chargeCount; index += 1) {
    const charge = CreateCylinder(`${name}-charge-${index}`, {
      height: 1.15,
      diameter: 0.72 + variant * 0.06,
      tessellation: 8,
    }, scene);
    charge.rotation.z = Math.PI / 2;
    charge.position.set((index % 2 ? 1 : -1) * (1.1 + Math.floor(index / 2) * 0.78), 0.35, -Math.floor(index / 4) * 1.1);
    charge.material = index % 2 ? palette.dark : palette.accent;
    charge.parent = mount;
  }
  if (variant > 0) {
    for (const side of [-1, 1]) createBarrel(scene, mount, `${name}-projector-${side}`, side * 2.1, 0.7, 0, 2.5 + variant * 0.4, 0.22, palette.dark);
  }
  return mount;
}

function createDepthCharge(
  scene: Scene,
  root: TransformNode,
  rarity: EquipmentRarity,
  palette: PixelShipPalette,
): void {
  const mount = createDepthChargeMountVisual(scene, root, "dock-depth-charge-mount", rarity, palette);
  mount.position.set(0, 5.4, rarity === "redGold" ? 27 : -43);
}

function createInternalModule(
  scene: Scene,
  root: TransformNode,
  item: EquipmentDefinition,
  variant: number,
  moduleMaterial: Material,
  palette: PixelShipPalette,
): void {
  const positions = {
    magazine: { x: 0, y: 3.7, z: 24, width: 5.2, height: 2.7, depth: 8.5 },
    engine: { x: 0, y: 2.1, z: -10, width: 7.4, height: 3.4, depth: 16 },
    steering: { x: 0, y: 2.2, z: -43, width: 5.6, height: 2.5, depth: 7 },
  } as const;
  const spec = positions[item.category as keyof typeof positions];
  const chamber = CreateBox(`dock-${item.category}-cutaway`, {
    width: spec.width + variant * 0.35,
    height: spec.height,
    depth: spec.depth,
  }, scene);
  chamber.position.set(spec.x, spec.y, spec.z);
  chamber.material = moduleMaterial;
  chamber.parent = root;
  const count = 3 + variant;
  for (let index = 0; index < count; index += 1) {
    const detail = CreateCylinder(`dock-${item.category}-detail-${index}`, {
      height: item.category === "magazine" ? 2.2 : 1.5,
      diameter: item.category === "steering" ? 0.7 : 1.1,
      tessellation: 8,
    }, scene);
    detail.rotation.z = item.category === "engine" ? Math.PI / 2 : 0;
    detail.position.set((index - (count - 1) / 2) * 1.05, spec.y, spec.z);
    detail.material = index % 2 ? palette.accent : palette.dark;
    detail.parent = root;
  }
}

export function createDockEquipmentPreviewVisual(
  scene: Scene,
  parent: TransformNode,
  item: EquipmentDefinition,
  palette: PixelShipPalette,
  moduleMaterial: Material,
): TransformNode {
  const root = new TransformNode(`dock-equipment-preview-${item.id}`, scene);
  root.parent = parent;
  const variant = rarityIndex[item.rarity];
  if (item.category === "sideGun") createSideGun(scene, root, item.rarity, palette);
  else if (item.category === "antiAir") createAntiAir(scene, root, item.rarity, palette);
  else if (item.category === "depthCharge") createDepthCharge(scene, root, item.rarity, palette);
  else if (item.category === "magazine" || item.category === "engine" || item.category === "steering") {
    createInternalModule(scene, root, item, variant, moduleMaterial, palette);
  }
  return root;
}
