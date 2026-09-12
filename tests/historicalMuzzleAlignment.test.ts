import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState, gunMountElevation, gunMuzzleOrigins } from "../src/sim/simulation";
import type { InstalledEquipmentIds } from "../src/sim/types";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import { effectiveMainBattery, mainBatteryMuzzleOffset, MAIN_BATTERY_MAX_ELEVATION } from "../src/ships/mainBatteries";
import { createLoadoutEquipmentVisual } from "../src/render/loadoutEquipmentVisual";
import { resolveLoadoutVisualPlan } from "../src/render/loadoutVisualPlan";
import { createPixelShipPalette } from "../src/render/shipMaterials";

const classes: ShipClassId[] = ["fletcher", "j-class", "kagero", "type-1936a", "tashkent", "cleveland", "edinburgh", "nurnberg", "agano", "dido", "north-carolina", "king-george-v", "bismarck", "yamato", "richelieu"];
const engines: NullEngine[] = [];
afterEach(() => { for (const e of engines.splice(0)) e.dispose(); });
function fixture() {
  const engine = new NullEngine(); engines.push(engine); const scene = new Scene(engine);
  return { scene, parent: new TransformNode("metric-ship", scene), palette: createPixelShipPalette(scene, "metric", "ally") };
}
const slots = (): InstalledEquipmentIds => ({ mainGun: [], torpedo: [], antiAir: [], sideGun: [], depthCharge: [], magazine: [], engine: [], steering: [] });

describe("metre-frame weapon geometry agrees with simulation", () => {
  for (const shipClassId of classes) it(`${shipClassId}: actual open-muzzle vertices agree within one millimetre across headings and holes`, () => {
    const { scene, parent, palette } = fixture(), hull = getShipClass(shipClassId);
    for (const holes of [false, true]) {
      const installed = slots();
      installed.mainGun = Array.from({ length: hull.slotCounts.mainGun }, (_, index) =>
        holes && index === 1 ? null : `mainGun-${["common", "purple", "gold", "redGold"][index % 4]}`);
      const armament = { mainGunMounts: installed.mainGun.filter(Boolean).length, installedEquipment: installed, maxSpeedMultiplier: 1 };
      const ship = createInitialState(731, "sea-trials", "mk1-single", armament, undefined, shipClassId).ships[0]!;
      ship.position = { x: 117.25, y: 0, z: -831.5 };
      const visual = createLoadoutEquipmentVisual(scene, parent, `${shipClassId}-${holes}`, resolveLoadoutVisualPlan(shipClassId, installed), palette);
      parent.scaling.set(hull.renderScale.x, hull.renderScale.y, hull.renderScale.z);
      parent.position.set(ship.position.x, 0, ship.position.z);
      for (const heading of [0, .71, -1.33]) for (const yaw of [0, .83, Math.PI]) {
        ship.heading = heading; parent.rotation.set(0, heading, 0);
        ship.aimPoint = { x: ship.position.x + 1700, y: 120, z: ship.position.z + 1300 };
        ship.mainBatteryMounts.forEach((mount, index) => { mount.heading = heading + yaw + index * .17; });
        const expected = gunMuzzleOrigins(ship); let barrelIndex = 0;
        visual.turrets.forEach((turret, index) => {
          turret.rotation.y = ship.mainBatteryMounts[index]!.heading - ship.heading;
          const elevation = gunMountElevation(ship, index);
          expect(elevation).toBeGreaterThan(0); expect(elevation).toBeLessThanOrEqual(MAIN_BATTERY_MAX_ELEVATION);
          visual.gunCradles[index]!.rotation.x = -elevation;
          const frame = turret.parent as TransformNode;
          expect(frame.rotation.asArray()).toEqual([0, 0, 0]);
          expect(frame.scaling.asArray()).toEqual([1 / hull.renderScale.x, 1 / hull.renderScale.y, 1 / hull.renderScale.z]);
          expect(turret.position.asArray()).toEqual([0, 0, 0]);
        });
        for (const barrel of visual.gunBarrels) {
          // Read the actual first muzzle ring, not metadata or the simulation helper.
          const vertices = barrel.getVerticesData(VertexBuffer.PositionKind)!;
          let maxY = -Infinity;
          for (let i = 1; i < vertices.length; i += 3) maxY = Math.max(maxY, vertices[i]!);
          const tip = Vector3.TransformCoordinates(new Vector3(0, maxY, 0), barrel.computeWorldMatrix(true));
          const origin = expected[barrelIndex++]!;
          expect(Vector3.Distance(tip, new Vector3(origin.x, origin.y, origin.z))).toBeLessThan(.001);
          // The turret frame cancels all three parent scales, including after traverse/elevation.
          const wm = barrel.computeWorldMatrix(true);
          for (const axis of [Vector3.Right(), Vector3.Up(), Vector3.Forward()]) {
            expect(Vector3.TransformNormal(axis, wm).length()).toBeCloseTo(1, 5);
          }
        }
        expect(barrelIndex).toBe(expected.length);
      }
      visual.root.dispose(false, false);
    }
  });

  it("uses the declared metre width, length and spacing rather than capital hull scale", () => {
    const { scene, parent, palette } = fixture(), installed = slots(); installed.mainGun = ["mainGun-common"];
    const plan = resolveLoadoutVisualPlan("north-carolina", installed), hull = getShipClass("north-carolina");
    parent.scaling.set(hull.renderScale.x, hull.renderScale.y, hull.renderScale.z);
    const visual = createLoadoutEquipmentVisual(scene, parent, "nc-metres", plan, palette);
    const barrel = visual.gunBarrels[0]!, length = plan.mainGun[0]!.visual.barrelLength;
    const world = barrel.computeWorldMatrix(true);
    const rear = Vector3.TransformCoordinates(new Vector3(0, -length / 2, 0), world);
    const tip = Vector3.TransformCoordinates(new Vector3(0, length / 2, 0), world);
    expect(Vector3.Distance(tip, rear)).toBeCloseTo(length, 4);
    const adjacent = visual.gunBarrels[1]!;
    expect(Vector3.Distance(barrel.getAbsolutePosition(), adjacent.computeWorldMatrix(true).getTranslation())).toBeCloseTo(plan.mainGun[0]!.visual.barrelSpacing, 4);
  });

  it("bounds invalid and extreme aim elevation without recursive origin queries", () => {
    const ship = createInitialState(13, "sea-trials").ships[0]!;
    ship.aimPoint = { x: ship.position.x + 100, y: 5000, z: ship.position.z + 100 };
    expect(gunMountElevation(ship, 999)).toBe(0);
    expect(gunMountElevation(ship, 0)).toBeGreaterThanOrEqual(0);
    expect(gunMountElevation(ship, 0)).toBeLessThanOrEqual(MAIN_BATTERY_MAX_ELEVATION);
    const battery = effectiveMainBattery(ship), v = { ...battery.visual, barrelCount: battery.mounts[0]!.barrelCount };
    expect(mainBatteryMuzzleOffset(v, 0, 0).z).toBeCloseTo(v.barrelLength * .97 + 1.3);
    expect(gunMuzzleOrigins(ship).every(o => [o.x, o.y, o.z].every(Number.isFinite))).toBe(true);
  });
});
