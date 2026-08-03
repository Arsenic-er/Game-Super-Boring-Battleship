import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createChamferedBox, createDestroyerHull } from "../src/render/shipGeometry";

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

  it("builds an opaque, closed foredeck with upward-facing top normals", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode("root", scene);
    const hullMaterial = new StandardMaterial("hull-material", scene);
    const deckMaterial = new StandardMaterial("deck-material", scene);
    deckMaterial.alpha = 1;
    deckMaterial.transparencyMode = Material.MATERIAL_OPAQUE;
    const result = createDestroyerHull(scene, root, {
      name: "test-ship",
      length: 112,
      beam: 11,
      hullMaterial,
      deckMaterial,
    });
    const positions = result.deck.getVerticesData(VertexBuffer.PositionKind) ?? [];
    const normals = result.deck.getVerticesData(VertexBuffer.NormalKind) ?? [];
    const indices = result.deck.getIndices() ?? [];
    expect(result.deck.material).toBe(deckMaterial);
    expect(deckMaterial.alpha).toBe(1);
    expect(deckMaterial.needAlphaBlending()).toBe(false);
    expect(positions.length / 3).toBe(52);
    expect(indices.length % 3).toBe(0);
    expect([...positions, ...normals].every(Number.isFinite)).toBe(true);
    expect(indices.every((index) => (
      Number.isInteger(index) && index >= 0 && index < positions.length / 3
    ))).toBe(true);
    for (let index = 0; index < indices.length; index += 3) {
      const a = (indices[index] ?? 0) * 3;
      const b = (indices[index + 1] ?? 0) * 3;
      const c = (indices[index + 2] ?? 0) * 3;
      const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
      const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      expect(Math.hypot(...cross)).toBeGreaterThan(1e-6);
    }
    for (let station = 0; station < 13; station += 1) {
      expect(normals[station * 12 + 1]).toBeGreaterThan(0);
      expect(normals[station * 12 + 4]).toBeGreaterThan(0);
    }
    const bowTopLeft = (13 - 1) * 12;
    const bowTopRight = bowTopLeft + 3;
    expect(positions[bowTopLeft + 2]).toBeCloseTo(56);
    expect(positions[bowTopRight + 2]).toBeCloseTo(56);
    expect(positions[bowTopLeft]).toBeLessThan(0);
    expect(positions[bowTopRight]).toBeGreaterThan(0);
    root.dispose(false, true);
    scene.dispose();
    engine.dispose();
  });
});
