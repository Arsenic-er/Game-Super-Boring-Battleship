import { describe, expect, it } from "vitest";
import { ObjectiveCaptureNavigator, type CaptureNavigationShip } from "../src/controllers/objectiveCaptureNavigation";

const objective = { center: { x: 90, y: 0, z: 175 }, radius: 450 };
const ship = (x = 3000, z = 2200): CaptureNavigationShip =>
  ({ shipClassId: "fletcher", position: { x, y: 0, z }, heading: 0 });

describe("capture progress route identity uses verified static geometry", () => {
  it("keeps a direct corridor identity across moving starts, heading, height and cache refresh", () => {
    const navigator = new ObjectiveCaptureNavigator();
    const own = ship(0, 2000);
    navigator.plan("open-sea-range", own, objective, 0, 0);
    const identity = navigator.progressRouteIdentity();
    expect(identity).toBeDefined();
    for (const time of [.5, 2, 4, 8, 12]) {
      const moving = { ...own, heading: time * .1, position: { x: -time, y: time * .01, z: 2000 - time * 20 } };
      expect(navigator.plan("open-sea-range", moving, objective, 0, time).mode).toBe("direct");
      expect(navigator.progressRouteIdentity()).toBe(identity);
      const cold = new ObjectiveCaptureNavigator();
      cold.plan("open-sea-range", moving, objective, 0, time);
      expect(cold.progressRouteIdentity()).toBe(identity);
    }
  });

  it("does not encode the starting projection while moving along a real island corridor", () => {
    const navigator = new ObjectiveCaptureNavigator(), own = ship(-2450, -2400);
    const first = navigator.plan("atoll-prototype", own, objective, 0, 0);
    expect(first.mode).toBe("waypoint");
    const identity = navigator.progressRouteIdentity();
    const dx = first.point!.x - own.position.x, dz = first.point!.z - own.position.z;
    const length = Math.hypot(dx, dz);
    for (const time of [.5, 2, 4, 6, 8]) {
      const moving = { ...own, heading: time, position: { x: own.position.x + dx / length * time * 10,
        y: time * .1, z: own.position.z + dz / length * time * 10 } };
      expect(navigator.plan("atoll-prototype", moving, objective, 0, time).mode).toBe("waypoint");
      expect(navigator.progressRouteIdentity()).toBe(identity);
      // At 20 m the cold planner can see a genuinely shorter attachment that
      // skips the first node. Only compare cold paths before that shortcut;
      // the active verified corridor must stay stable throughout every refresh.
      if (time < 1) {
        const cold = new ObjectiveCaptureNavigator();
        cold.plan("atoll-prototype", moving, objective, 0, time);
        expect(cold.progressRouteIdentity()).toBe(identity);
      }
    }
  });

  it.each([[-2450, -2400], [3000, 2200]])("retains the identity when the waypoint cursor and cached suffix advance (%s, %s)", (x, z) => {
    const navigator = new ObjectiveCaptureNavigator(), own = ship(x, z);
    const first = navigator.plan("atoll-prototype", own, objective, 0, 0);
    expect(first.mode).toBe("waypoint");
    const identity = navigator.progressRouteIdentity();
    const reached = { ...own, position: { ...first.point! } };
    const advanced = navigator.plan("atoll-prototype", reached, objective, 0, 1);
    expect(advanced.point).not.toEqual(first.point);
    expect(navigator.progressRouteIdentity()).toBe(identity);
    const refreshed = navigator.plan("atoll-prototype", reached, objective, 0, 2.1);
    expect(refreshed.point).toEqual(advanced.point);
    expect(navigator.progressRouteIdentity()).toBe(identity);
  });

  it("gives a genuinely shorter graph attachment its own identity, not the old high-water", () => {
    const own = ship(-2450, -2400), previous = new ObjectiveCaptureNavigator();
    const original = previous.plan("atoll-prototype", own, objective, 0, 0);
    const length = Math.hypot(original.point!.x - own.position.x, original.point!.z - own.position.z);
    const moved = { ...own, position: {
      x: own.position.x + (original.point!.x - own.position.x) / length * 20, y: 0,
      z: own.position.z + (original.point!.z - own.position.z) / length * 20,
    } };
    // A cold replanning now has a verified shortcut around the unvisited first
    // node. It is not the same polyline with a different start projection.
    const replanned = new ObjectiveCaptureNavigator();
    const shortcut = replanned.plan("atoll-prototype", moved, objective, 0, 2);
    expect(original.point).toMatchObject({ x: -3000, z: -2000 });
    expect(shortcut.point).toMatchObject({ x: -3000, z: -1000 });
    expect(replanned.progressRouteIdentity()).not.toBe(previous.progressRouteIdentity());
    const retained = previous.plan("atoll-prototype", moved, objective, 0, 2);
    expect(retained.point).toEqual(original.point);
  });

  it("distinguishes actual station / objective / map changes and clears on explicit reset", () => {
    const navigator = new ObjectiveCaptureNavigator(), own = ship();
    navigator.plan("open-sea-range", own, objective, 0, 0);
    const station0 = navigator.progressRouteIdentity();
    navigator.plan("open-sea-range", own, objective, 1, .1);
    const station1 = navigator.progressRouteIdentity();
    expect(station1).not.toBe(station0);
    const moved = { ...objective, center: { ...objective.center, x: 190 } };
    navigator.plan("open-sea-range", own, moved, 1, .2);
    const movedIdentity = navigator.progressRouteIdentity();
    expect(movedIdentity).not.toBe(station1);
    navigator.plan("atoll-prototype", own, moved, 1, .3);
    expect(navigator.progressRouteIdentity()).not.toBe(movedIdentity);
    navigator.reset();
    expect(navigator.progressRouteIdentity()).toBeUndefined();
  });

  it("never supplies a new progress identity for invalid or grounded navigation", () => {
    const navigator = new ObjectiveCaptureNavigator(), own = ship();
    navigator.plan("atoll-prototype", own, objective, 0, 0);
    expect(navigator.progressRouteIdentity()).toBeDefined();
    expect(navigator.remainingDistanceMeters("atoll-prototype", ship(1680, 1790), objective, 0, 4)).toBe(Infinity);
    expect(navigator.progressRouteIdentity()).toBeUndefined();
    expect(navigator.remainingDistanceMeters("atoll-prototype", own, objective, 0, NaN)).toBe(Infinity);
    expect(navigator.progressRouteIdentity()).toBeUndefined();
  });
});
