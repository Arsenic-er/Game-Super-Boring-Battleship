import { afterEach, describe, expect, it, vi } from "vitest";
import { FleetObjectiveCoordinator } from "../src/controllers/fleetObjectiveCoordinator";
import { ObjectiveCaptureNavigator } from "../src/controllers/objectiveCaptureNavigation";
import { battleMapDefinition } from "../src/maps/atollMap";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { Observation, Team } from "../src/sim/types";

const base = observe(createInitialState(8173), "player");
function item(id: string, x: number, z: number, time = 0, team: Team = "player",
  mapId: Observation["mapId"] = "atoll-prototype"): Observation {
  const self = createDeveloperShipState({ id, team, shipClassId: "fletcher",
    position: { x, y: 0, z }, heading: 0, mainGunMounts: 1,
    torpedoLauncherMounts: 0, secondaryGunIds: [], depthChargeMounts: 0 });
  return { ...base, self, time, mapId, gameMode: "battle", contacts: [], friendlies: [], sharedContacts: [],
    objective: { center: { x: 0, y: 0, z: 0 }, radius: 450, contested: false,
      captureProgress: 0, scores: { player: 0, enemy: 0 } } };
}
const at = (input: Observation, time: number): Observation => ({ ...input, time });
const captureIds = (result: ReturnType<FleetObjectiveCoordinator["update"]>) =>
  [...result].filter(([, duty]) => duty.duty === "capture").map(([id]) => id);
const route = (input: Observation, station: 0 | 1 = 0) =>
  new ObjectiveCaptureNavigator().remainingDistanceMeters(input.mapId, input.self, input.objective, station, input.time);
afterEach(() => vi.restoreAllMocks());

describe("route-aware capture assignment and sustained progress", () => {
  for (const team of ["player", "enemy"] as const) {
    it(`${team} chooses reachable terrain route instead of closer recovery-only hull`, () => {
      const trapped = item("near", -400, 800, 0, team), reachable = item("far", -800, 0, 0, team);
      for (const input of [trapped, reachable]) input.objective = {
        ...input.objective, center: { ...base.objective.center },
      };
      expect(route(trapped)).toBe(Infinity);
      expect(route(reachable)).toBeLessThan(900);
      const toCenter = (input: Observation) => Math.hypot(
        input.self.position.x - input.objective.center.x, input.self.position.z - input.objective.center.z);
      expect(toCenter(trapped)).toBeLessThan(toCenter(reachable));
      expect(captureIds(new FleetObjectiveCoordinator().update([trapped, reachable], 0))).toEqual(["far"]);
    });

    it(`${team} ranks a real detour by full route length rather than straight distance`, () => {
      const detour = item("a-detour", -400, 1200, 0, team);
      const direct = item("b-direct", 0, 1600, 0, team);
      expect(Math.hypot(detour.self.position.x, detour.self.position.z)).toBeLessThan(1600);
      expect(route(detour)).toBeGreaterThan(2400);
      expect(route(direct)).toBeLessThan(route(detour));
      expect(captureIds(new FleetObjectiveCoordinator().update([detour, direct], 0))).toEqual(["b-direct"]);
    });

    it(`${team} hands a stationary duty off after sixty seconds and applies a finite retry cooldown`, () => {
      const coordinator = new FleetObjectiveCoordinator();
      const a = item("a", 0, 800, 0, team, "open-sea-range");
      const b = item("b", 0, 1900, 0, team, "open-sea-range");
      for (let time = 0; time < 60; ++time) {
        expect(captureIds(coordinator.update([at(a, time), at(b, time)], time))).toEqual(["a"]);
      }
      expect(captureIds(coordinator.update([at(a, 60), at(b, 60)], 60))).toEqual(["b"]);
      for (let time = 61; time < 120; ++time) {
        expect(captureIds(coordinator.update([at(a, time), at(b, time)], time))).toEqual(["b"]);
      }
      // Both have actually stalled for a full window; retry is finite rather than
      // permanently excluding the first hull. This is not rapid rank oscillation.
      expect(captureIds(coordinator.update([at(a, 120), at(b, 120)], 120))).toEqual(["a"]);
    });
  }

  it("counts actual route progress while a safe waypoint takes the hull farther from the objective", () => {
    const coordinator = new FleetObjectiveCoordinator();
    const moving = item("a", -2450, -2400), alternative = item("b", 0, -5500);
    const plan = new ObjectiveCaptureNavigator().plan(moving.mapId, moving.self, moving.objective, 0, 0);
    expect(plan.mode).toBe("waypoint");
    const start = { ...moving.self.position };
    const dx = plan.point!.x - start.x, dz = plan.point!.z - start.z, length = Math.hypot(dx, dz);
    const initialDistance = route(moving);
    let previous = initialDistance;
    for (let time = 0; time <= 64; time += 4) {
      const meters = time / 4 * 25;
      const current = { ...moving, time, self: { ...moving.self, position: {
        x: start.x + dx / length * meters, y: 0, z: start.z + dz / length * meters } } };
      if (time === 4) {
        expect(Math.hypot(current.self.position.x, current.self.position.z)).toBeGreaterThan(Math.hypot(start.x, start.z));
      }
      const remaining = route(current);
      expect(remaining).toBeLessThanOrEqual(previous + 1e-6);
      previous = remaining;
      expect(captureIds(coordinator.update([current, at(alternative, time)], time))).toEqual(["a"]);
    }
    expect(previous).toBeLessThan(initialDistance - 350);
  });

  it("keeps a single recovery duty when every alternative is unavailable", () => {
    const coordinator = new FleetObjectiveCoordinator();
    const a = item("a", -400, 800), b = item("b", -350, 800);
    expect(route(a)).toBe(Infinity); expect(route(b)).toBe(Infinity);
    const first = captureIds(coordinator.update([a, b], 0));
    expect(first).toHaveLength(1);
    for (const time of [60, 120, 240]) {
      expect(captureIds(coordinator.update([at(a, time), at(b, time)], time))).toEqual(first);
    }
    const solo = new FleetObjectiveCoordinator();
    for (const time of [0, 60, 120]) expect(captureIds(solo.update([at(a, time)], time))).toEqual(["a"]);
  });

  it("never discards a healthy in-zone participant because its propulsion is destroyed", () => {
    const a = item("a", 0, 100), b = item("b", -800, 0);
    a.self.modules.engine.health = 0; a.self.modules.steering.health = 0;
    const coordinator = new FleetObjectiveCoordinator();
    for (const time of [0, 60, 120]) {
      expect(captureIds(coordinator.update([at(a, time), at(b, time)], time))).toEqual(["a"]);
    }
  });

  it("uses a coarse bounded route cadence, never invokes route planning from sort comparisons", () => {
    const coordinator = new FleetObjectiveCoordinator();
    const routeCall = vi.spyOn(ObjectiveCaptureNavigator.prototype, "remainingDistanceMeters");
    const candidates = Array.from({ length: 80 }, (_, i) => item(String(i).padStart(3, "0"), 0, 1000 + i, 0, "player", "open-sea-range"));
    expect(coordinator.update(candidates, 0).size).toBe(64);
    expect(routeCall).toHaveBeenCalledTimes(128);
    for (let frame = 1; frame < 240; ++frame) {
      const time = frame / 60;
      coordinator.update(candidates.map(input => at(input, time)), time);
    }
    expect(routeCall).toHaveBeenCalledTimes(128);
    coordinator.update(candidates.map(input => at(input, 4)), 4);
    expect(routeCall).toHaveBeenCalledTimes(256);
    coordinator.update([], 4.1);
    const privateState = coordinator as unknown as { routes: Map<unknown, unknown>; geometry: Map<unknown, unknown> };
    expect(privateState.routes.size).toBe(0); expect(privateState.geometry.size).toBe(0);
    coordinator.update([at(candidates[0]!, 4.2)], 4.2);
    expect(routeCall).toHaveBeenCalledTimes(258);
  });

  it.each(["map", "objective", "team", "class", "rewind", "reset", "removal"] as const)(
    "clears prior no-progress and cooldown state on %s lifecycle change", change => {
      const coordinator = new FleetObjectiveCoordinator();
      let a = item("a", 0, 800, 0, "player", "open-sea-range");
      let b = item("b", 0, 1900, 0, "player", "open-sea-range");
      coordinator.update([a, b], 0);
      expect(captureIds(coordinator.update([at(a, 60), at(b, 60)], 60))).toEqual(["b"]);
      let time = 61;
      if (change === "map") { a = { ...a, mapId: "atoll-prototype" }; b = { ...b, mapId: "atoll-prototype" }; }
      if (change === "objective") for (const input of [a, b]) input.objective = { ...input.objective, radius: 460 };
      if (change === "team") for (const input of [a, b]) input.self = { ...input.self, team: "enemy" };
      if (change === "class") {
        a.self = { ...a.self, shipClassId: "j-class" };
        b.self = { ...b.self, shipClassId: "j-class" };
      }
      if (change === "rewind") time = 0;
      if (change === "reset") coordinator.reset();
      if (change === "removal") coordinator.update([], 60.1);
      expect(captureIds(coordinator.update([at(a, time), at(b, time)], time))).toEqual(["a"]);
    });

  it("invalidates mutable map geometry at its coarse cadence without retaining stale progress", () => {
    const coordinator = new FleetObjectiveCoordinator(), map = battleMapDefinition("open-sea-range");
    const a = item("a", 0, 800, 0, "player", "open-sea-range"), b = item("b", 0, 1900, 0, "player", "open-sea-range");
    const extent = map.halfExtentMeters;
    try {
      coordinator.update([a, b], 0);
      expect(captureIds(coordinator.update([at(a, 60), at(b, 60)], 60))).toEqual(["b"]);
      map.halfExtentMeters += 1;
      expect(captureIds(coordinator.update([at(a, 64), at(b, 64)], 64))).toEqual(["a"]);
    } finally { map.halfExtentMeters = extent; }
  });

  it("assigns the reachable station and matches crossed station availability", () => {
    // Synthetic route costs isolate assignment matching, not geometry validity.
    vi.spyOn(ObjectiveCaptureNavigator.prototype, "remainingDistanceMeters").mockImplementation((_map, ship, _objective, station) =>
      ship.position.x < 0 ? station === 1 ? 500 : Infinity : station === 0 ? 600 : Infinity);
    const left = item("a", -1000, 0), right = item("b", 1000, 0);
    expect(new FleetObjectiveCoordinator().update([left], 0).get("a")?.stationIndex).toBe(1);
    for (const input of [left, right]) input.objective = { ...input.objective, contested: true };
    const result = new FleetObjectiveCoordinator().update([left, right], 0);
    expect(result.get("a")?.stationIndex).toBe(1); expect(result.get("b")?.stationIndex).toBe(0);
  });

  it("does not let alternating finite station costs exchange duties and reset the stall clock", () => {
    // Stable positions plus changing planner costs must not fabricate physical progress.
    vi.spyOn(ObjectiveCaptureNavigator.prototype, "remainingDistanceMeters").mockImplementation((_map, ship, _objective, station, time) => {
      const swapped = Math.floor(time / 4) % 2 === 1;
      if (ship.position.z > 2500) return 3000;
      const preferred = (ship.position.x < 0) === (station === 0);
      return 1000 + (preferred !== swapped ? 0 : 1);
    });
    const a = item("a", -1000, 1000), b = item("b", 1000, 1000), replacement = item("c", 0, 3000);
    for (const input of [a, b, replacement]) input.objective = { ...input.objective, contested: true };
    const coordinator = new FleetObjectiveCoordinator();
    const initial = coordinator.update([a, b, replacement], 0);
    for (let time = 4; time < 60; time += 4) {
      const result = coordinator.update([at(a, time), at(b, time), at(replacement, time)], time);
      expect(result.get("a")?.stationIndex).toBe(initial.get("a")?.stationIndex);
      expect(result.get("b")?.stationIndex).toBe(initial.get("b")?.stationIndex);
    }
    expect(captureIds(coordinator.update([at(a, 60), at(b, 60), at(replacement, 60)], 60))).toContain("c");
  });
  it("accepts real displacement along a newly longer route without resetting grace just for replanning", () => {
    // Controlled route lengths isolate a legitimate replan from the terrain
    // planner. Positions really change; this is not a geometry-validity test.
    // The fixture explicitly supplies evidence of a different verified route;
    // a cost increase alone is indistinguishable from physical backtracking.
    const identities = new WeakMap<ObjectiveCaptureNavigator, string>();
    vi.spyOn(ObjectiveCaptureNavigator.prototype, "remainingDistanceMeters").mockImplementation(function (this: ObjectiveCaptureNavigator, _map, ship, _objective, station, time) {
      identities.set(this, station + ":" + (time === 0 ? "direct" : "new-detour"));
      return ship.position.z < 5000 ? time === 0 ? 1000 : 3000 - (time - 4) * 25 : 6000;
    });
    vi.spyOn(ObjectiveCaptureNavigator.prototype, "progressRouteIdentity").mockImplementation(function (this: ObjectiveCaptureNavigator) { return identities.get(this); });
    const a = item("a", 0, 1000), b = item("b", 0, 6000);
    const coordinator = new FleetObjectiveCoordinator();
    for (let time = 0; time <= 64; time += 4) {
      const moving = { ...a, time, self: { ...a.self, position: { x: 0, y: 0, z: 1000 + time * 25 } } };
      expect(captureIds(coordinator.update([moving, at(b, time)], time))).toEqual(["a"]);
    }
  });

  it("does not count large route-cost oscillations as progress for a stationary hull", () => {
    vi.spyOn(ObjectiveCaptureNavigator.prototype, "remainingDistanceMeters").mockImplementation((_map, ship, _objective, _station, time) =>
      ship.position.z < 5000 ? Math.floor(time / 4) % 2 === 0 ? 1000 : 3000 : 6000);
    const a = item("a", 0, 1000), b = item("b", 0, 6000);
    const coordinator = new FleetObjectiveCoordinator();
    for (let time = 0; time < 60; time += 4) {
      expect(captureIds(coordinator.update([at(a, time), at(b, time)], time))).toEqual(["a"]);
    }
    expect(captureIds(coordinator.update([at(a, 60), at(b, 60)], 60))).toEqual(["b"]);
  });

  it("hands off the compatible stalled member rather than consuming its replacement on the other station", () => {
    vi.spyOn(ObjectiveCaptureNavigator.prototype, "remainingDistanceMeters").mockImplementation((_map, ship, _objective, station) => {
      if (ship.position.x < 0) return station === 1 ? 500 : Infinity;
      return station === 0 ? ship.position.x > 0 ? 600 : 900 : Infinity;
    });
    const a = item("a", -1000, 1000), b = item("b", 1000, 1000), c = item("c", 0, 3000);
    for (const input of [a, b, c]) input.objective = { ...input.objective, contested: true };
    const coordinator = new FleetObjectiveCoordinator();
    expect(captureIds(coordinator.update([a, b, c], 0))).toEqual(["a", "b"]);
    for (const time of [60, 61, 64, 119]) {
      const result = coordinator.update([at(c, time), at(b, time), at(a, time)], time);
      expect(captureIds(result)).toEqual(["a", "c"]);
      expect(result.get("a")?.stationIndex).toBe(1);
      expect(result.get("c")?.stationIndex).toBe(0);
    }
  });

});
