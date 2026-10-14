import { afterEach, describe, expect, it, vi } from "vitest";
import { FleetObjectiveCoordinator, MAX_CAPTURE_PROGRESS_ROUTES } from "../src/controllers/fleetObjectiveCoordinator";
import { ObjectiveCaptureNavigator } from "../src/controllers/objectiveCaptureNavigation";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { Observation, Team } from "../src/sim/types";

const base = observe(createInitialState(8173), "player");
function actor(id: string, x: number, z: number, team: Team,
  mapId: Observation["mapId"] = "open-sea-range"): Observation {
  const self = createDeveloperShipState({ id, team, shipClassId: "fletcher",
    position: { x, y: 0, z }, heading: 0, mainGunMounts: 1,
    torpedoLauncherMounts: 0, secondaryGunIds: [], depthChargeMounts: 0 });
  return { ...base, self, time: 0, mapId, gameMode: "battle", contacts: [],
    friendlies: [], sharedContacts: [], objective: {
      center: { x: 0, y: 0, z: 0 }, radius: 450, contested: false,
      captureProgress: 0, scores: { player: 0, enemy: 0 },
    } };
}
const at = (input: Observation, time: number, x = input.self.position.x,
  z = input.self.position.z): Observation => ({ ...input, time,
    self: { ...input.self, position: { x, y: input.self.position.y, z } } });
const cappers = (result: ReturnType<FleetObjectiveCoordinator["update"]>): string[] =>
  [...result].filter(([, assignment]) => assignment.duty === "capture").map(([id]) => id);

function mockRoutes(sample: (ship: Parameters<ObjectiveCaptureNavigator["remainingDistanceMeters"]>[1], time: number, station: 0 | 1) => { remaining: number; identity?: string }): void {
  const identities = new WeakMap<ObjectiveCaptureNavigator, string | undefined>();
  vi.spyOn(ObjectiveCaptureNavigator.prototype, "remainingDistanceMeters").mockImplementation(function (this: ObjectiveCaptureNavigator, _map, ship, _objective, station, time) {
    const result = sample(ship, time, station);
    identities.set(this, result.identity);
    return result.remaining;
  });
  vi.spyOn(ObjectiveCaptureNavigator.prototype, "progressRouteIdentity").mockImplementation(function (this: ObjectiveCaptureNavigator) { return identities.get(this); });
}

afterEach(() => vi.restoreAllMocks());

describe("capture progress distinguishes useful travel from repeated backtracking", () => {
  for (const team of ["player", "enemy"] as const) {
    it(team + ": hands a stationary incumbent to a reachable reserve after the stall window", () => {
      const incumbent = actor("incumbent", 0, 800, team);
      const reserve = actor("reserve", 0, 1900, team);
      const coordinator = new FleetObjectiveCoordinator();
      for (let time = 0; time < 60; time += 4) {
        expect(cappers(coordinator.update([at(incumbent, time), at(reserve, time)], time)))
          .toEqual([incumbent.self.id]);
      }
      expect(cappers(coordinator.update([at(incumbent, 60), at(reserve, 60)], 60)))
        .toEqual([reserve.self.id]);
    });

    it(team + ": does not let returning to the same two water positions renew capture progress forever", () => {
      const incumbent = actor("incumbent", 0, 800, team);
      const reserve = actor("reserve", 0, 1900, team);
      const coordinator = new FleetObjectiveCoordinator();
      let handoffAt: number | undefined;
      // Real open-water routes are recomputed from changing positions; there is
      // no mocked path cost, hidden target, damage, equipment or score change.
      // This isolates the assignment policy, not acceleration/turning physics.
      for (let time = 0; time <= 128; time += 4) {
        const z = Math.floor(time / 4) % 2 === 0 ? 800 : 900;
        const result = coordinator.update([at(incumbent, time, 0, z), at(reserve, time)], time);
        expect(z).toBeGreaterThan(incumbent.objective.radius);
        if (result.get(reserve.self.id)?.duty === "capture") handoffAt ??= time;
      }
      expect(handoffAt, "A 100 m repeated backtrack made no net capture progress for 128 seconds")
        .toBeDefined();
      expect(handoffAt).toBeLessThanOrEqual(68);
    });

    it(team + ": does not count a three-position loop as a sequence of new checkpoints", () => {
      const incumbent = actor("incumbent", 0, 800, team);
      const reserve = actor("reserve", 0, 1900, team);
      const coordinator = new FleetObjectiveCoordinator();
      const positions = [800, 900, 850, 900, 800];
      let handoffAt: number | undefined;
      for (let time = 0; time <= 128; time += 4) {
        const z = positions[Math.floor(time / 4) % positions.length]!;
        const result = coordinator.update([at(incumbent, time, 0, z), at(reserve, time)], time);
        if (result.get(reserve.self.id)?.duty === "capture") handoffAt ??= time;
      }
      expect(handoffAt, "Revisiting 800 / 850 / 900 m must not keep renewing the stall window")
        .toBeDefined();
      expect(handoffAt).toBeLessThanOrEqual(68);
    });

    it(team + ": retains an incumbent making sustained one-way progress on real routes", () => {
      const incumbent = actor("incumbent", 0, 2000, team);
      const reserve = actor("reserve", 0, 5000, team);
      const coordinator = new FleetObjectiveCoordinator();
      for (let time = 0; time <= 128; time += 4) {
        const moving = at(incumbent, time, 0, 2000 - time * 6);
        expect(cappers(coordinator.update([moving, at(reserve, time)], time)))
          .toEqual([incumbent.self.id]);
      }
    });

    it(team + ": recognizes real island-route progress even when straight distance to A initially increases", () => {
      const incumbent = actor("incumbent", -2450, -2400, team, "atoll-prototype");
      const reserve = actor("reserve", 0, -5500, team, "atoll-prototype");
      const navigator = new ObjectiveCaptureNavigator();
      const plan = navigator.plan(incumbent.mapId, incumbent.self, incumbent.objective, 0, 0);
      expect(plan.mode).toBe("waypoint");
      expect(plan.point).toBeDefined();
      const start = incumbent.self.position;
      const dx = plan.point!.x - start.x, dz = plan.point!.z - start.z;
      const length = Math.hypot(dx, dz);
      const coordinator = new FleetObjectiveCoordinator();
      let previousRemaining = Infinity;
      for (let time = 0; time <= 64; time += 4) {
        const traveled = time / 4 * 25;
        const moving = at(incumbent, time, start.x + dx / length * traveled,
          start.z + dz / length * traveled);
        if (time === 4) expect(Math.hypot(moving.self.position.x, moving.self.position.z))
          .toBeGreaterThan(Math.hypot(start.x, start.z));
        const remaining = navigator.remainingDistanceMeters(moving.mapId, moving.self,
          moving.objective, 0, time);
        expect(remaining).toBeLessThanOrEqual(previousRemaining + 1e-6);
        previousRemaining = remaining;
        expect(cappers(coordinator.update([moving, at(reserve, time)], time)))
          .toEqual([incumbent.self.id]);
      }
    });

    it(team + ": allows genuine travel on a newly longer detour without granting grace to the replan itself", () => {
      // Controlled costs isolate route replacement: the hull really changes
      // position and then reduces the new cost for longer than the stall window.
      // A global minimum remaining-distance scalar would reject this valid case.
      mockRoutes((ship, time, station) => ({
        remaining: ship.position.z < 5000 ? time === 0 ? 1000 : 3000 - (time - 4) * 25 : 6000,
        identity: station + ":" + (time === 0 ? "direct" : "new-detour"),
      }));
      const incumbent = actor("incumbent", 0, 1000, team);
      const reserve = actor("reserve", 0, 6000, team);
      const coordinator = new FleetObjectiveCoordinator();
      for (let time = 0; time <= 64; time += 4) {
        expect(cappers(coordinator.update([
          at(incumbent, time, 0, 1000 + time * 25), at(reserve, time),
        ], time))).toEqual([incumbent.self.id]);
      }
    });
    it(team + ": remembers route A high-water when a B detour returns to A", () => {
      mockRoutes((ship, time, station) => ({
        remaining: ship.position.z > 5000 ? 6000 : time < 4 ? 800
          : time < 20 ? 3000 - (time - 4) * 10 : time === 20 ? 1000 : 900,
        identity: station + ":" + (time >= 4 && time < 20 ? "B" : "A"),
      }));
      const incumbent = actor("incumbent", 0, 1000, team);
      const reserve = actor("reserve", 0, 6000, team);
      const coordinator = new FleetObjectiveCoordinator();
      let handoffAt: number | undefined;
      for (let time = 0; time <= 80; time += 4) {
        const result = coordinator.update([at(incumbent, time, 0, 1000 + time * 5), at(reserve, time)], time);
        if (result.get("reserve")?.duty === "capture") handoffAt ??= time;
      }
      // B really advanced through t=16, but revisiting A at costs 1000 / 900
      // cannot beat its earlier 800. Re-basing A would wrongly delay handoff.
      expect(handoffAt).toBe(76);
    });

    it(team + ": bounds identity memory without eviction or abandoning the only eligible ship", () => {
      let currentIdentity = "A", remaining = 600;
      mockRoutes((ship, _time, station) => ({
        remaining: ship.position.z > 5000 ? 6000 : remaining,
        identity: station + ":" + currentIdentity,
      }));
      const incumbent = actor("incumbent", 0, 1000, team);
      const reserve = actor("reserve", 0, 6000, team);
      const coordinator = new FleetObjectiveCoordinator();
      const progress = () => (coordinator as unknown as { routes: Map<string, { progress?: { at: number; routes: Map<string, unknown> } }> }).routes.get("incumbent")!.progress!;
      expect(cappers(coordinator.update([incumbent], 0))).toEqual(["incumbent"]);
      for (let index = 1; index <= MAX_CAPTURE_PROGRESS_ROUTES + 8; index++) {
        currentIdentity = "detour-" + index; remaining = 1000;
        expect(cappers(coordinator.update([at(incumbent, index * 4, 0, 1000 + index)], index * 4))).toEqual(["incumbent"]);
      }
      expect(progress().routes.size).toBe(MAX_CAPTURE_PROGRESS_ROUTES);
      expect(progress().routes.has("0:A")).toBe(true);
      expect(progress().at).toBe(0);
      const time = (MAX_CAPTURE_PROGRESS_ROUTES + 9) * 4;
      // The same unfamiliar identity remains unrecorded at capacity. A short
      // decrease on it must not provide grace through cache-eviction churn.
      remaining = 950;
      expect(cappers(coordinator.update([at(incumbent, time, 0, 1500)], time))).toEqual(["incumbent"]);
      expect(progress().at).toBe(0);
      currentIdentity = "A"; remaining = 800;
      coordinator.update([at(incumbent, time + 4, 0, 1600)], time + 4);
      remaining = 750;
      expect(cappers(coordinator.update([at(incumbent, time + 8, 0, 1700), at(reserve, time + 8)], time + 8))).toEqual(["reserve"]);
      // No permanent blacklist: after a fresh battle the same hull may make
      // ordinary progress and keep its duty for longer than the stall window.
      coordinator.reset(); currentIdentity = "new-battle"; remaining = 1000;
      for (let freshTime = 0; freshTime <= 80; freshTime += 4) {
        remaining = 1000 - freshTime * 5;
        expect(cappers(coordinator.update([at(incumbent, freshTime, 0, 1000 - freshTime * 5), at(reserve, freshTime)], freshTime))).toEqual(["incumbent"]);
      }
      expect(progress().routes.size).toBe(1);
      expect(progress().at).toBe(80);
    });
  }
});
