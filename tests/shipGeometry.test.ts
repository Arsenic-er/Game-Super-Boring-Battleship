import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createChamferedBox } from "../src/render/shipGeometry";

describe("naval deckhouse geometry", () => {
  it("uses clipped corners and sloped walls instead of an axis-aligned box", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = createChamferedBox(scene, "test-deckhouse", {
      width: 8,
      height: 4,
      depth: 10,
      topScale: 0.8,
    });
    expect(mesh.getTotalVertices()).toBeGreaterThan(8);
    const bounds = mesh.getBoundingInfo().boundingBox;
    expect(bounds.maximum.x - bounds.minimum.x).toBeCloseTo(8);
    expect(bounds.maximum.z - bounds.minimum.z).toBeCloseTo(10);
    mesh.dispose();
    scene.dispose();
    engine.dispose();
  });
});
