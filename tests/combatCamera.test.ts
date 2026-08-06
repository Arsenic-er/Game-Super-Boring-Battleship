import { describe, expect, it } from "vitest";
import {
  aimingCameraPlan,
  cameraPointerMoveAllowed,
  cameraTransitionValue,
  observationCameraPlan,
} from "../src/render/combatCamera";
import { SHIP_CLASSES } from "../src/ships/classes";

describe("aiming camera placement", () => {
  it.each(Object.values(SHIP_CLASSES).flatMap((shipClass) => [
    [shipClass.id, shipClass, 0, 0, 0.28],
    [shipClass.id, shipClass, Math.PI / 2, 0, 1.08],
    [shipClass.id, shipClass, 0.7, 1.2, Math.PI / 2],
    [shipClass.id, shipClass, -1.1, 0.35, 1.86],
  ] as const))("keeps %s outside its hull at varied view angles", (
    _id,
    shipClass,
    cameraAlpha,
    heading,
    beta,
  ) => {
    const plan = aimingCameraPlan({
      length: shipClass.length,
      beam: shipClass.beam,
      deckHeight: shipClass.deckHeight,
      renderScaleY: shipClass.renderScale.y,
      heading,
      cameraAlpha,
      beta,
    });
    const cameraAlongAim = plan.focusDistance - plan.radius * Math.sin(beta);
    expect(cameraAlongAim).toBeGreaterThanOrEqual(
      plan.hullProjection + plan.clearance - 1e-6,
    );
    expect(plan.targetHeight + plan.radius * Math.cos(beta)).toBeGreaterThan(
      shipClass.deckHeight,
    );
    expect(Number.isFinite(plan.focusDistance)).toBe(true);
    expect(plan.radius).toBeGreaterThan(0);
    expect(plan.fov).toBeGreaterThan(0);
  });

  it("snaps the first aiming frame to the safe radius", () => {
    expect(cameraTransitionValue(205, 92, true)).toBe(92);
    expect(cameraTransitionValue(205, 92, false)).toBeCloseTo(189.18);
  });

  it("keeps observation perspective consistent across hull lengths", () => {
    const ratios = Object.values(SHIP_CLASSES).map((shipClass) => {
      const plan = observationCameraPlan(shipClass.length);
      expect(plan.fov).toBeCloseTo(0.68);
      expect(plan.radius).toBeGreaterThan(shipClass.length);
      expect(plan.radius).toBeLessThanOrEqual(650);
      return plan.radius / shipClass.length;
    });
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(1.12);
  });

  it("blocks background camera motion while developer tools own the pointer", () => {
    expect(cameraPointerMoveAllowed(false, "mouse")).toBe(false);
    expect(cameraPointerMoveAllowed(false, "")).toBe(false);
    expect(cameraPointerMoveAllowed(true, "touch")).toBe(false);
    expect(cameraPointerMoveAllowed(true, "mouse")).toBe(true);
  });
});
