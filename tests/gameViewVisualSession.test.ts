import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GameView } from "../src/render/gameView";
import { LoadoutVisualRegistry } from "../src/render/loadoutVisualRegistry";
import { createDeveloperShipState } from "../src/sim/simulation";

describe("GameView visual session boundary", () => {
  for (const scope of ["reward-battle", "lan-match", "sea-trials"]) it(`disposes prior render roots and clears ${scope} when the next session reuses player`, () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode("old-player-root", scene);
    const externalHullRoot = new TransformNode("old-external-root", scene); externalHullRoot.parent = root;
    const material = new StandardMaterial("old-player-owned", scene);
    const contactRoot = new TransformNode("old-contact", scene);
    const registry = new LoadoutVisualRegistry();
    const ships = new Map([["player", { root, externalHullRoot, ownedMaterials: [material] }]]);
    const contacts = new Map([["old-contact", { root: contactRoot }]]);
    // Exercise the actual public lifecycle methods without requiring browser WebGL setup.
    const view = Object.create(GameView.prototype) as GameView;
    Object.assign(view, { ships, contactVisuals: contacts, loadoutVisualRegistry: registry });
    const ship = createDeveloperShipState({ id: "player", team: "player", shipClassId: "fletcher", position: { x: 0, y: 0, z: 0 } });
    registry.begin(scope);
    const old = registry.register(scope, ship.id, ship.shipClassId, ship.installedEquipment);
    ship.installedEquipment.mainGun[0] = "mainGun-redGold";
    view.beginVisualSession(`${scope}-next`, [ship]);
    expect(root.isDisposed()).toBe(true);
    expect(externalHullRoot.isDisposed()).toBe(true);
    expect(contactRoot.isDisposed()).toBe(true);
    expect(scene.materials).not.toContain(material);
    expect(ships.size).toBe(0);
    expect(contacts.size).toBe(0);
    expect(registry.get(scope, "player")).toBeUndefined();
    expect(registry.get(`${scope}-next`, "player")?.signature).not.toBe(old.signature);
    view.endVisualSession();
    expect(registry.sessionScope).toBeUndefined();
    expect(registry.size).toBe(0);
    scene.dispose(); engine.dispose();
  });
});
