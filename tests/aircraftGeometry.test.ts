import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createAirSquadronGeometry } from "../src/render/aircraftGeometry";

describe("low-cost aircraft geometry", () => {
  it.each([
    "fighter",
    "diveBomber",
    "torpedoBomber",
  ] as const)("creates and disposes a shared %s formation", (role) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const visual = createAirSquadronGeometry(
      scene,
      `geometry-${role}`,
      "player",
      role,
      6,
    );
    expect(visual.planes).toHaveLength(6);
    expect(visual.planes.every(({ body }) =>
      body.getBoundingInfo().boundingBox.extendSize.length() > 0)).toBe(true);
    expect(scene.meshes.length).toBeLessThanOrEqual(19);
    visual.root.dispose(false, true);
    scene.dispose();
    engine.dispose();
  });
});
