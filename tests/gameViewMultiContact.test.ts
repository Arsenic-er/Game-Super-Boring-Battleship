import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { GameView } from "../src/render/gameView";
import { WATER_RENDER } from "../src/render/environmentMaterials";
import { VISUAL_EQUIPMENT_CATEGORIES } from "../src/render/loadoutVisualPlan";
import { LoadoutVisualRegistry } from "../src/render/loadoutVisualRegistry";
import { createDeveloperShipState, createInitialState } from "../src/sim/simulation";
import type { BattleState, PlayerTargetView, ProjectileState, ShipState } from "../src/sim/types";

interface TestShipVisual {
  root: TransformNode;
  bodyMeshes: Mesh[];
  wakes: Mesh[];
  smokePuffs: Mesh[];
  fireFlames: Mesh[];
  colliders: Mesh[];
  bodyVisibility: number;
}
interface TestProjectileVisual { root: TransformNode; shell: Mesh; glow: Mesh }
interface SyncHarness {
  syncShips(state: BattleState, contactsById: ReadonlyMap<string, PlayerTargetView>, omniscient?: boolean): void;
  syncProjectiles(state: BattleState, contactsById: ReadonlyMap<string, PlayerTargetView>, omniscient?: boolean, serverFiltered?: boolean, observerShipId?: string): void;
}
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup(): {
  state: BattleState;
  ships: Map<string, TestShipVisual>;
  projectiles: Map<number, TestProjectileVisual>;
  syncProjectiles: (contacts?: PlayerTargetView[], omniscient?: boolean, serverFiltered?: boolean, observerShipId?: string) => void;
  sync: (contacts?: PlayerTargetView[], omniscient?: boolean) => void;
  ship: (id: string) => ShipState;
  visual: (id: string) => TestShipVisual;
} {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  cleanups.push(() => { scene.dispose(); engine.dispose(); });
  const ships = new Map<string, TestShipVisual>();
  const projectiles = new Map<number, TestProjectileVisual>();
  const state = createInitialState(913);
  state.ships = ["player", "ally", "enemy-a", "enemy-b", "enemy-c", "enemy-d", "enemy-unseen"]
    .map((id, index) => {
      const ship = createDeveloperShipState({
        id, team: index < 2 ? "player" : "enemy", shipClassId: "fletcher",
        position: { x: 3_000 + index * 100, y: 0, z: 7_000 + index * 200 },
        heading: .4 + index * .1,
      });
      ship.speedKnots = 20;
      ship.fireIntensity = 20;
      return ship;
    });
  state.mode = "battle";
  state.time = 12;
  const view = Object.create(GameView.prototype) as GameView;
  Object.assign(view, {
    ships, scene, aiming: false, debugColliders: false, quality: "low",
    projectileMeshes: projectiles, projectileTrails: new Map(), sharedEffectMaterials: new Map(),
    loadoutVisualRegistry: new LoadoutVisualRegistry(),
    oceanWater: { heightAt: () => WATER_RENDER.surfaceY },
    // Only model construction is replaced. Every assertion below exercises
    // GameView's actual per-ID presentation, position, outline and VFX logic.
    createShip: (ship: ShipState) => {
      const root = new TransformNode("test-root-" + ship.id, scene);
      const node = (name: string): TransformNode => {
        const result = new TransformNode(name + "-" + ship.id, scene);
        result.parent = root;
        return result;
      };
      const mesh = (name: string): Mesh => {
        const result = new Mesh(name + "-" + ship.id, scene);
        result.parent = root;
        return result;
      };
      // This identity-only fixture mirrors the renderer's creation contract;
      // unchanged loadouts must keep the same real Babylon nodes on resync.
      const armamentSignature = [
        ship.shipClassId, ship.developer?.enabled ? ship.developer.mainBatteryClassId : "standard",
        ship.mainGunId, ship.mainGunMounts, ship.torpedoId, ship.torpedoLauncherMounts,
        ...VISUAL_EQUIPMENT_CATEGORIES.map((category) =>
          ship.installedEquipment[category].map((id) => id ?? "_").join(",")),
      ].join(":");
      return {
        root, shipClassId: ship.shipClassId, armamentSignature,
        proceduralHullRoot: node("hull"), bodyMeshes: [mesh("body"), mesh("superstructure")],
        bodyVisibility: 1, turrets: [], gunCradles: [], gunBarrels: [], gunBarrelRestZ: [],
        torpedoLaunchers: [], secondaryTurrets: [], rudder: node("rudder"), propellers: [],
        wakes: [mesh("wake")], smokePuffs: [mesh("smoke")], fireFlames: [mesh("fire")],
        colliders: [mesh("collider")], ownedMaterials: [],
      };
    },
  });
  const renderer = view as unknown as SyncHarness;
  return {
    state, ships, projectiles,
    syncProjectiles: (contacts = [], omniscient = false, serverFiltered = false, observerShipId) =>
      renderer.syncProjectiles(state, new Map(contacts.map((contact) => [contact.id, contact])), omniscient, serverFiltered, observerShipId),
    sync: (contacts = [], omniscient = false) =>
      renderer.syncShips(state, new Map(contacts.map((contact) => [contact.id, contact])), omniscient),
    ship: (id) => state.ships.find((ship) => ship.id === id)!,
    visual: (id) => ships.get(id)!,
  };
}

const target = (id: string, changes: Partial<PlayerTargetView> = {}): PlayerTargetView => ({
  id, team: "enemy", live: true, mode: "tracking", confidence: .8,
  lastObservedAt: 10, position: { x: 50, y: 0, z: 150 }, heading: 1.2,
  speedKnots: 20, rangeMeters: 200, estimatedHullRatio: .9, ...changes,
});
const sampleContacts = (): PlayerTargetView[] => [
  target("enemy-a"),
  target("enemy-b", { position: { x: 250, y: 0, z: 450 }, heading: 1.4 }),
  target("enemy-c", { mode: "acquiring", confidence: .5, position: { x: -50, y: 0, z: 80 } }),
  target("enemy-d", { live: false, mode: "lost", confidence: .6, position: { x: 800, y: 0, z: 900 }, heading: 2.2 }),
];
const expectFull = (visual: TestShipVisual): void => {
  expect(visual.root.isEnabled()).toBe(true);
  expect(visual.bodyMeshes.every((mesh) => mesh.visibility === 1 && !mesh.renderOutline)).toBe(true);
};
const expectSilhouette = (visual: TestShipVisual, confidence: number): void => {
  expect(visual.root.isEnabled()).toBe(true);
  for (const mesh of visual.bodyMeshes) {
    expect(mesh.visibility).toBeCloseTo(.025 + confidence * .055);
    expect(mesh.renderOutline).toBe(true);
  }
  expect([...visual.wakes, ...visual.smokePuffs, ...visual.fireFlames, ...visual.colliders]
    .every((mesh) => mesh.visibility === 0)).toBe(true);
};

describe("GameView fleet contact presentation", () => {
  it("simultaneously renders multiple confirmed, acquiring, ghost and unseen ships by their own IDs", () => {
    const harness = setup();
    harness.sync(sampleContacts());
    expectFull(harness.visual("player"));
    expectFull(harness.visual("ally"));
    expectFull(harness.visual("enemy-a"));
    expectFull(harness.visual("enemy-b"));
    expectSilhouette(harness.visual("enemy-c"), .5);
    expectSilhouette(harness.visual("enemy-d"), .6);
    expect(harness.visual("enemy-unseen").root.isEnabled()).toBe(false);
    expect(harness.visual("enemy-c").bodyMeshes[0]!.outlineColor.asArray()).not
      .toEqual(harness.visual("enemy-d").bodyMeshes[0]!.outlineColor.asArray());
  });

  it("uses each local tracking pose rather than exact authoritative enemy positions", () => {
    const harness = setup();
    const contacts = sampleContacts();
    harness.sync(contacts);
    for (const contact of contacts) {
      const root = harness.visual(contact.id).root;
      expect(root.position.x).toBe(contact.position.x);
      expect(root.position.z).toBe(contact.position.z);
      expect(root.rotation.y).toBe(contact.heading);
      expect(root.position.x).not.toBe(harness.ship(contact.id).position.x);
    }
  });

  it("keeps a ghost at its estimated position and heading after the hidden authoritative ship teleports", () => {
    const harness = setup();
    const contact = target("enemy-d", { live: false, mode: "searching", confidence: .4 });
    harness.sync([contact]);
    const visual = harness.visual("enemy-d");
    const initialPosition = visual.root.position.clone();
    const initialRotation = visual.root.rotation.clone();
    const ship = harness.ship("enemy-d");
    ship.position = { x: -90_000, y: -30, z: 50_000 };
    ship.heading = -2.5;
    ship.hull = 0;
    ship.fireIntensity = 100;
    ship.speedKnots = 70;
    harness.state.time += 1;
    harness.sync([contact]);
    expect(harness.visual("enemy-d")).toBe(visual);
    expect(visual.root.isDisposed()).toBe(false);
    expect(visual.root.position.asArray()).toEqual(initialPosition.asArray());
    expect(visual.root.rotation.asArray()).toEqual(initialRotation.asArray());
    expectSilhouette(visual, .4);
  });

  it("does not hide unrelated contacts or recreate visuals when input ordering changes", () => {
    const harness = setup();
    const contacts = sampleContacts();
    harness.sync(contacts);
    const original = new Map(harness.ships);
    harness.sync([...contacts].reverse());
    for (const contact of contacts) {
      const visual = harness.visual(contact.id);
      expect(visual).toBe(original.get(contact.id));
      expect(visual.root.isEnabled()).toBe(true);
      expect(visual.root.isDisposed()).toBe(false);
    }
    expectFull(harness.visual("enemy-a"));
    expectFull(harness.visual("enemy-b"));
    expectSilhouette(harness.visual("enemy-c"), .5);
    expectSilhouette(harness.visual("enemy-d"), .6);
  });

  it("updates one lost or absent contact without hiding the other confirmed enemy", () => {
    const harness = setup();
    harness.sync([target("enemy-a"), target("enemy-b")]);
    harness.sync([target("enemy-a", { live: false, mode: "lost" }), target("enemy-b")]);
    expectSilhouette(harness.visual("enemy-a"), .8);
    expectFull(harness.visual("enemy-b"));
    harness.sync([target("enemy-b")]);
    expect(harness.visual("enemy-a").root.isEnabled()).toBe(false);
    expectFull(harness.visual("enemy-b"));
  });

  it("restores solid visibility, outlines and VFX independently after reacquisition", () => {
    const harness = setup();
    harness.sync([
      target("enemy-a", { live: false, mode: "lost" }),
      target("enemy-b", { mode: "acquiring" }),
    ]);
    harness.sync([target("enemy-a"), target("enemy-b", { mode: "acquiring" })]);
    const reacquired = harness.visual("enemy-a");
    expectFull(reacquired);
    expect(reacquired.wakes[0]!.visibility).toBeGreaterThan(0);
    expect(reacquired.smokePuffs[0]!.visibility).toBeGreaterThan(0);
    expect(reacquired.fireFlames[0]!.visibility).toBeGreaterThan(0);
    expectSilhouette(harness.visual("enemy-b"), .8);
  });

  it("hides all unobserved enemies while preserving friendly truth without any selected target", () => {
    const harness = setup();
    harness.sync();
    for (const ship of harness.state.ships) {
      expect(harness.visual(ship.id).root.isEnabled()).toBe(ship.team === "player");
    }
    for (const id of ["player", "ally"]) {
      const root = harness.visual(id).root;
      expect(root.position.x).toBe(harness.ship(id).position.x);
      expect(root.position.z).toBe(harness.ship(id).position.z);
      expect(root.rotation.y).toBe(harness.ship(id).heading);
    }
  });

  it("ignores a faded contact without suppressing other usable contacts", () => {
    const harness = setup();
    harness.sync([target("enemy-a", { confidence: .01 }), target("enemy-b")]);
    expect(harness.visual("enemy-a").root.isEnabled()).toBe(false);
    expectFull(harness.visual("enemy-b"));
  });

  it("keeps sea-trials ships fully visible at authoritative poses regardless of stale or absent contacts", () => {
    const harness = setup();
    harness.state.mode = "sea-trials";
    harness.sync(sampleContacts());
    for (const ship of harness.state.ships) {
      const visual = harness.visual(ship.id);
      expectFull(visual);
      expect(visual.root.position.x).toBe(ship.position.x);
      expect(visual.root.position.z).toBe(ship.position.z);
      expect(visual.root.rotation.y).toBe(ship.heading);
    }
  });

  it("keeps developer omniscient view on truth and hides destroyed entities", () => {
    const harness = setup();
    harness.ship("enemy-unseen").hull = 0;
    harness.sync(sampleContacts(), true);
    for (const ship of harness.state.ships.filter((ship) => ship.hull > 0)) {
      const visual = harness.visual(ship.id);
      expectFull(visual);
      expect(visual.root.position.x).toBe(ship.position.x);
      expect(visual.root.position.z).toBe(ship.position.z);
      expect(visual.root.rotation.y).toBe(ship.heading);
    }
    expect(harness.visual("enemy-unseen").root.isEnabled()).toBe(false);
  });

  it("honors the player developer flag without requiring explicit omniscient camera options", () => {
    const harness = setup();
    harness.ship("player").developer = {
      enabled: true, unrestrictedWeapons: true, infiniteAmmunition: true,
      instantReload: true, speedMultiplier: 1,
    };
    harness.sync(sampleContacts());
    for (const ship of harness.state.ships) {
      const visual = harness.visual(ship.id);
      expectFull(visual);
      expect(visual.root.position.x).toBe(ship.position.x);
      expect(visual.root.rotation.y).toBe(ship.heading);
    }
  });
});

const shell = (id: number, ownerId: string, x: number): ProjectileState => ({
  id, ownerId, team: "enemy", kind: "shell", ammoType: "he",
  position: { x, y: 30, z: 0 }, previousPosition: { x: x - 10, y: 30, z: 0 },
  velocity: { x: 200, y: 0, z: 0 }, damage: 50, age: 1,
});

describe("GameView projectile perception observer", () => {
  it("uses the surviving observed ship for nearby shells and does not retain the sunk original origin", () => {
    const harness = setup();
    harness.ship("player").position = { x: 0, y: 0, z: 0 };
    harness.ship("player").hull = 0;
    harness.ship("ally").position = { x: 5_000, y: 0, z: 0 };
    harness.state.projectiles = [shell(1, "enemy-a", 5_900)];
    harness.syncProjectiles([], false, false, "ally");
    const visible = harness.projectiles.get(1)!;
    expect(visible.root.position.x).toBe(5_900);

    harness.syncProjectiles([], false, false, "player");
    expect(harness.projectiles.size).toBe(0);
    expect(visible.root.isDisposed()).toBe(true);

    // If no explicit observer was supplied, the first living friendly is used.
    harness.syncProjectiles();
    expect(harness.projectiles.has(1)).toBe(true);
  });

  it("gates distant shells by each owning ship's contact and retains both visible owners", () => {
    const harness = setup();
    harness.ship("player").position = { x: 0, y: 0, z: 0 };
    harness.state.projectiles = [shell(1, "enemy-a", 9_000), shell(2, "enemy-b", 9_100)];
    harness.syncProjectiles([
      target("enemy-a"),
      target("enemy-b", { live: false, mode: "searching" }),
    ], false, false, "player");
    expect([...harness.projectiles.keys()]).toEqual([1]);

    harness.syncProjectiles([target("enemy-a"), target("enemy-b")], false, false, "player");
    const roots = [...harness.projectiles.values()].map(({ root }) => root);
    expect([...harness.projectiles.keys()]).toEqual([1, 2]);
    harness.syncProjectiles([target("enemy-b"), target("enemy-a")], false, false, "player");
    expect([...harness.projectiles.values()].map(({ root }) => root)).toEqual(roots);
    harness.syncProjectiles([target("enemy-b")], false, false, "player");
    expect([...harness.projectiles.keys()]).toEqual([2]);
    expect(roots[0]!.isDisposed()).toBe(true);
    expect(roots[1]!.isDisposed()).toBe(false);
  });

  it.each(["server-filtered", "developer"] as const)
  ("preserves the %s visibility bypass without local target contacts", (mode) => {
    const harness = setup();
    harness.ship("player").position = { x: 0, y: 0, z: 0 };
    harness.state.projectiles = [shell(1, "enemy-a", 9_000), shell(2, "enemy-b", 9_100)];
    harness.syncProjectiles([], mode === "developer", mode === "server-filtered", "player");
    expect([...harness.projectiles.keys()]).toEqual([1, 2]);
    harness.syncProjectiles([], false, false, "player");
    expect(harness.projectiles.size).toBe(0);
  });
});
