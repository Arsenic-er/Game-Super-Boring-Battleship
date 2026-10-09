import { describe, expect, it } from "vitest";
import { FleetObjectiveCoordinator, objectiveIsUrgent } from "../src/controllers/fleetObjectiveCoordinator";
import { BATTLE_DURATION_SECONDS } from "../src/sim/config";
import { createInitialState, observe } from "../src/sim/simulation";
import { getShipClass } from "../src/ships/classes";
import type { FleetObjectiveAssignment, FriendlyShipObservation, Observation, ObjectiveObservation, ShipState, Team } from "../src/sim/types";

const base = observe(createInitialState(46177), "player");
const point = (z: number) => ({ x: 0, y: 0, z });
function observation(id: string, z = 1_000, time = 0, ship: Partial<ShipState> = {},
  objective: Partial<ObjectiveObservation> = {}): Observation {
  const classId = ship.shipClassId ?? "fletcher";
  const definition = getShipClass(classId);
  return { ...base, gameMode: "battle", time, contacts: [], friendlies: [], sharedContacts: [],
    self: { ...base.self, id, team: "player", position: point(z), hull: 1_000, maxHull: 1_000,
      shipClassId: classId, hullId: definition.hullId, ...ship },
    objective: { center: point(0), radius: 450, captureProgress: 0, contested: false,
      scores: { player: 0, enemy: 0 }, ...objective } };
}
function friendly(id: string, z: number, hullRatio = 1,
  shipClassId: FriendlyShipObservation["shipClassId"] = "fletcher"): FriendlyShipObservation {
  return { id, shipClassId, position: point(z), hullRatio, heading: 0, speedKnots: 0 };
}
const caps = (result: Map<string, FleetObjectiveAssignment>): string[] =>
  [...result].filter(([, value]) => value.duty === "capture").map(([id]) => id);
const advance = (items: Observation[], time: number): Observation[] => items.map(item => ({ ...item, time }));
function mirrored(item: Observation): Observation {
  return { ...item, self: { ...item.self, team: item.self.team === "player" ? "enemy" : "player",
    position: { ...item.self.position, x: -item.self.position.x, z: -item.self.position.z } },
    objective: { ...item.objective,
      center: { ...item.objective.center, x: -item.objective.center.x, z: -item.objective.center.z },
      captureProgress: -item.objective.captureProgress,
      owner: item.objective.owner && (item.objective.owner === "player" ? "enemy" : "player"),
      capturingTeam: item.objective.capturingTeam && (item.objective.capturingTeam === "player" ? "enemy" : "player"),
      scores: { player: item.objective.scores.enemy, enemy: item.objective.scores.player } } };
}

describe("public objective deadlines", () => {
  it("does not rush at opening but treats late tied and losing games as urgent", () => {
    expect(objectiveIsUrgent(observation("a"))).toBe(false);
    expect(objectiveIsUrgent(observation("a", 1_000, BATTLE_DURATION_SECONDS - 45))).toBe(true);
    expect(objectiveIsUrgent(observation("a", 1_000, 950, {}, { scores: { player: 100, enemy: 800 } }))).toBe(true);
    expect(objectiveIsUrgent(observation("a", 1_000, 1_190, {}, { scores: { player: 800, enemy: 100 } }))).toBe(false);
  });

  it("uses a full fifty-second flip from opponent ownership, not a single capture interval", () => {
    const neutral = observation("a", 0, BATTLE_DURATION_SECONDS - 70);
    const enemy = { ...neutral, objective: { ...neutral.objective, owner: "enemy" as Team, captureProgress: -1 } };
    expect(objectiveIsUrgent(neutral)).toBe(false); // 25s capture + 30s buffer.
    expect(objectiveIsUrgent(enemy)).toBe(true); // 50s flip, plus opposition score during neutralization.
  });

  it("accounts for opposing projected score victory even while own score is higher", () => {
    const item = observation("a", 1_000, 400, {}, { owner: "enemy", captureProgress: -1,
      scores: { player: 1_990, enemy: 1_950 } });
    expect(objectiveIsUrgent(item)).toBe(true);
    expect(objectiveIsUrgent({ ...item, objective: { ...item.objective,
      scores: { player: 1_500, enemy: 1_000 } } })).toBe(false);
  });

  it("anticipates a public-score overtake before time expires, but protects a sufficient lead", () => {
    const threatened = observation("a", 1_000, BATTLE_DURATION_SECONDS - 80, {}, {
      owner: "enemy", captureProgress: -1, scores: { player: 1_020, enemy: 1_000 },
    });
    expect(objectiveIsUrgent(threatened)).toBe(true);
    expect(objectiveIsUrgent(mirrored(threatened))).toBe(true);
    const safe = { ...threatened, objective: { ...threatened.objective,
      scores: { player: 1_300, enemy: 1_000 },
    } };
    expect(objectiveIsUrgent(safe)).toBe(false);
    expect(objectiveIsUrgent(mirrored(safe))).toBe(false);
  });

  it("subtracts an existing lead before estimating the recovery-scoring deadline", () => {
    const stillTime = observation("a", 0, BATTLE_DURATION_SECONDS - 95, {}, {
      owner: "enemy", captureProgress: -1, scores: { player: 1_100, enemy: 1_000 },
    });
    // The opposing 25s neutralization income is covered by the existing lead.
    // No additional 25s catch-up period should be invented on top of the flip.
    expect(objectiveIsUrgent(stillTime)).toBe(false);
    expect(objectiveIsUrgent({ ...stillTime, time: BATTLE_DURATION_SECONDS - 70 })).toBe(true);
  });

  it("uses own travel distance and real class speed rather than current stopped speed alone", () => {
    const close = observation("a", 0, 1_100);
    const distant = observation("a", 3_000, 1_100);
    expect(objectiveIsUrgent(close)).toBe(false);
    expect(objectiveIsUrgent(distant)).toBe(true);
    const cruising = { ...distant, self: { ...distant.self, speedKnots: 35 } };
    expect(objectiveIsUrgent(cruising)).toBe(true);
    expect(objectiveIsUrgent(observation("a", 3_000, 0))).toBe(false);
    const damaged = observation("a", 1_000, 1_000);
    damaged.self = { ...damaged.self, modules: { ...damaged.self.modules,
      engine: { ...damaged.self.modules.engine, health: 0 } } };
    expect(objectiveIsUrgent(damaged)).toBe(true);
  });

  it("is team-symmetric and leaves safely owned empty objectives alone", () => {
    const item = observation("a", 1_700, 950, {}, { owner: "enemy", captureProgress: -.7,
      scores: { player: 200, enemy: 600 } });
    expect(objectiveIsUrgent(mirrored(item))).toBe(objectiveIsUrgent(item));
    expect(objectiveIsUrgent(observation("a", 1_000, 1_199, {}, {
      owner: "player", captureProgress: 1, scores: { player: 0, enemy: 1_999 },
    }))).toBe(false);
    expect(objectiveIsUrgent({ ...item, gameMode: "sea-trials" })).toBe(false);
  });
});

describe("bounded friendly cap assignments", () => {
  it("reserves one healthy capper, two for contested or opposing capture, never the whole fleet", () => {
    const items = Array.from({ length: 8 }, (_, index) => observation("ship-" + index, 1_000 + index * 100));
    expect(caps(new FleetObjectiveCoordinator().update(items, 0))).toEqual(["ship-0"]);
    for (const patch of [{ contested: true }, { capturingTeam: "enemy" as Team }]) {
      const result = new FleetObjectiveCoordinator().update(items.map(item => ({
        ...item, objective: { ...item.objective, ...patch },
      })), 0);
      expect(caps(result)).toEqual(["ship-0", "ship-1"]);
      expect(result.get("ship-0")?.stationIndex).toBe(0);
      expect(result.get("ship-1")?.stationIndex).toBe(1);
    }
    expect(caps(new FleetObjectiveCoordinator().update(advance(items, 1_199), 1_199))).toHaveLength(2);
  });

  it("does not reserve healthy humans outside the zone, but counts already-present human help", () => {
    const item = observation("ai", 1_000);
    item.friendlies = [friendly("human", 900)];
    const coordinator = new FleetObjectiveCoordinator();
    expect(caps(coordinator.update([item], 0))).toEqual(["ai"]);
    const inZone = { ...item, time: .1, friendlies: [friendly("human", 200)] };
    expect(caps(coordinator.update([inZone], .1))).toEqual([]);
    expect(coordinator.update([inZone], .1).has("human")).toBe(false);
    const unhealthy = { ...inZone, time: .2, friendlies: [friendly("human", 200, .2)] };
    expect(caps(coordinator.update([unhealthy], .2))).toEqual(["ai"]);
  });

  it("counts each healthy in-zone human only once, and still sends help under contest", () => {
    const items = [observation("a"), observation("b", 1_200)].map(item => ({ ...item,
      friendlies: [friendly("human", 100), friendly("human", 100)],
      objective: { ...item.objective, contested: true } }));
    expect(caps(new FleetObjectiveCoordinator().update(items, 0))).toEqual(["a"]);
    for (const item of items) item.friendlies = [friendly("human-1", 100), friendly("human-2", 200)];
    expect(caps(new FleetObjectiveCoordinator().update(items, 0))).toEqual([]);
  });

  it("does not double-count an eligible AI in friendly navigation reports", () => {
    const a = observation("a", 100);
    const b = observation("b", 900);
    a.friendlies = [friendly("b", 900)];
    b.friendlies = [friendly("a", 100)];
    expect(caps(new FleetObjectiveCoordinator().update([a, b], 0))).toEqual(["a"]);
  });

  it("prioritizes presence and applies bounded class bias rather than always choosing destroyers", () => {
    const dd = observation("dd", 1_500);
    const cl = observation("cl", 1_200, 0, { shipClassId: "cleveland" });
    const bb = observation("bb", 1_000, 0, { shipClassId: "bismarck" });
    expect(caps(new FleetObjectiveCoordinator().update([bb, cl, dd], 0))).toEqual(["dd"]);
    expect(caps(new FleetObjectiveCoordinator().update([{ ...dd, self: { ...dd.self, position: point(3_000) } }, cl, bb], 0)))
      .toEqual(["cl"]);
    const inside = { ...bb, self: { ...bb.self, position: point(400) } };
    expect(caps(new FleetObjectiveCoordinator().update([dd, cl, inside], 0))).toEqual(["bb"]);
  });

  it("uses class-specific health floors inclusively and immediately releases a newly unhealthy capper", () => {
    for (const [shipClassId, ratio] of [["fletcher", .36], ["cleveland", .31], ["bismarck", .27]] as const) {
      const coordinator = new FleetObjectiveCoordinator();
      const item = observation("a", 1_000, 0, { shipClassId, hull: ratio * 1_000 });
      expect(caps(coordinator.update([item], 0))).toEqual(["a"]);
      expect(caps(coordinator.update([{ ...item, time: .1, self: { ...item.self, hull: ratio * 1_000 - 1 } }], .1))).toEqual([]);
    }
  });

  for (const module of ["engine", "steering"] as const) {
    it(`immediately reassigns an off-zone capper when its ${module} is destroyed`, () => {
      const coordinator = new FleetObjectiveCoordinator();
      const a = observation("a", 900), b = observation("b", 1_200);
      expect(caps(coordinator.update([a, b], 0))).toEqual(["a"]);
      const disabled = { ...a, time: .1, self: { ...a.self, modules: { ...a.self.modules,
        [module]: { ...a.self.modules[module], health: 0 },
      } } };
      // Neither the one-second update cadence nor the twelve-second reservation delays handoff.
      const result = coordinator.update([disabled, { ...b, time: .1 }], .1);
      expect(caps(result)).toEqual(["b"]);
      expect(result.get("a")?.duty).toBe("support");
      expect(caps(new FleetObjectiveCoordinator().update([disabled], .1))).toEqual([]);
    });

    it(`keeps an in-zone ship with destroyed ${module} until it drifts outside`, () => {
      const a = observation("a", 450);
      a.self = { ...a.self, modules: { ...a.self.modules,
        [module]: { ...a.self.modules[module], health: 0 },
      } };
      const b = observation("b", 900);
      const coordinator = new FleetObjectiveCoordinator();
      expect(caps(coordinator.update([a, b], 0))).toEqual(["a"]);
      const outside = { ...a, time: .1, self: { ...a.self, position: point(450.01) } };
      expect(caps(coordinator.update([outside, { ...b, time: .1 }], .1))).toEqual(["b"]);
    });

    it(`allows a repaired ${module} back into the capture pool without preempting a valid duty`, () => {
      const a = observation("a", 900), b = observation("b", 1_200);
      const disabled = { ...a, self: { ...a.self, modules: { ...a.self.modules,
        [module]: { ...a.self.modules[module], health: 0 },
      } } };
      const coordinator = new FleetObjectiveCoordinator();
      expect(caps(coordinator.update([disabled, b], 0))).toEqual(["b"]);
      const repaired = { ...a, time: .1 };
      expect(caps(coordinator.update([repaired, { ...b, time: .1 }], .1))).toEqual(["b"]);
      expect(caps(coordinator.update(advance([repaired, b], 12), 12))).toEqual(["a"]);
      // With no alternative capper, recovery becomes usable immediately.
      const solo = new FleetObjectiveCoordinator();
      expect(caps(solo.update([disabled], 0))).toEqual([]);
      expect(caps(solo.update([repaired], .1))).toEqual(["a"]);
    });
  }

  it("preserves team symmetry for disabled capture candidates", () => {
    const a = observation("a", 900);
    a.self = { ...a.self, modules: { ...a.self.modules,
      steering: { ...a.self.modules.steering, health: 0 },
    } };
    const b = observation("b", 1_200);
    expect(caps(new FleetObjectiveCoordinator().update([a, b], 0))).toEqual(["b"]);
    expect(caps(new FleetObjectiveCoordinator().update([a, b].map(mirrored), 0))).toEqual(["b"]);
  });

  it("holds valid duties for twelve seconds and then reconsiders distance changes", () => {
    const coordinator = new FleetObjectiveCoordinator();
    coordinator.update([observation("a", 1_000), observation("b", 1_200)], 0);
    const moved = [observation("a", 1_300, 1), observation("b", 900, 1)];
    expect(caps(coordinator.update(moved, 1))).toEqual(["a"]);
    expect(caps(coordinator.update(advance(moved, 11), 11))).toEqual(["a"]);
    expect(caps(coordinator.update(advance(moved, 12), 12))).toEqual(["b"]);
    expect(coordinator.update(advance(moved, 12), 12).get("b")?.assignedAt).toBe(12);
  });

  it("renews advice timestamps without extending the private twelve-second duty hold", () => {
    const coordinator = new FleetObjectiveCoordinator();
    coordinator.update([observation("a", 1_000), observation("b", 1_200)], 0);
    for (const time of [.1, 1, 3, 6, 11]) {
      const result = coordinator.update([observation("a", 1_300, time), observation("b", 900, time)], time);
      expect(result.get("a")).toMatchObject({ duty: "capture", assignedAt: time });
      expect(result.get("b")).toMatchObject({ duty: "support", assignedAt: time });
    }
    expect(caps(coordinator.update([observation("a", 1_300, 12), observation("b", 900, 12)], 12))).toEqual(["b"]);
  });

  it("invalidates death, takeover omission and team changes before the cadence", () => {
    const coordinator = new FleetObjectiveCoordinator();
    const items = [observation("a", 1_000), observation("b", 1_200)];
    coordinator.update(items, 0);
    const afterDeath = advance(items, .1);
    afterDeath[0] = { ...afterDeath[0]!, self: { ...afterDeath[0]!.self, hull: 0 } };
    expect(caps(coordinator.update(afterDeath, .1))).toEqual(["b"]);
    expect(coordinator.update([observation("a", 900, .2)], .2).has("b")).toBe(false);
    const changed = observation("a", 900, .3, { team: "enemy" });
    expect(coordinator.update([changed], .3).get("a")?.assignedAt).toBe(.3);
  });

  it("invalidates secure ownership immediately and keeps an owned empty zone unreserved", () => {
    const coordinator = new FleetObjectiveCoordinator();
    const item = observation("a");
    coordinator.update([item], 0);
    const secured = { ...item, time: .1, objective: { ...item.objective,
      owner: "player" as Team, captureProgress: 1 } };
    expect(caps(coordinator.update([secured], .1))).toEqual([]);
    expect(caps(coordinator.update([{ ...secured, time: .2, objective: {
      ...secured.objective, capturingTeam: "enemy" as Team,
    } }], .2))).toEqual(["a"]);
  });

  it("preserves output order, stations and team symmetry independently of input order", () => {
    const items = ["a", "b", "c"].map(id => observation(id, 1_000, 0, {}, { contested: true }));
    const expected = [...new FleetObjectiveCoordinator().update(items, 0)];
    expect([...new FleetObjectiveCoordinator().update(items.slice().reverse(), 0)]).toEqual(expected);
    expect([...new FleetObjectiveCoordinator().update(items.map(mirrored).reverse(), 0)]).toEqual(expected);
    const red = items.map(item => ({ ...mirrored(item), self: { ...mirrored(item).self, id: "red-" + item.self.id } }));
    expect(caps(new FleetObjectiveCoordinator().update([...items, ...red], 0)))
      .toEqual(["a", "b", "red-a", "red-b"]);
  });

  it("does not read hostile contacts, radio reports or hidden objective occupants", () => {
    const item = observation("a");
    Object.defineProperty(item, "contacts", { get: () => { throw new Error("hostile contact read"); } });
    Object.defineProperty(item, "sharedContacts", { get: () => { throw new Error("radio read"); } });
    Object.defineProperty(item.objective, "occupants", { get: () => { throw new Error("hidden occupant read"); } });
    expect(objectiveIsUrgent(item)).toBe(false);
    expect(caps(new FleetObjectiveCoordinator().update([item], 0))).toEqual(["a"]);
  });

  it("never mutates frozen input and returns defensive assignment copies", () => {
    const item = structuredClone(observation("a"));
    const freeze = (value: unknown): void => {
      if (value && typeof value === "object") {
        for (const nested of Object.values(value)) freeze(nested);
        Object.freeze(value);
      }
    };
    freeze(item);
    const coordinator = new FleetObjectiveCoordinator();
    const result = coordinator.update(Object.freeze([item]), 0);
    result.get("a")!.duty = "support";
    result.clear();
    expect(caps(coordinator.update([item], 0))).toEqual(["a"]);
    coordinator.reset();
    expect(coordinator.update([observation("a", 1_000, 10)], 10).get("a")?.assignedAt).toBe(10);
    expect(coordinator.update([item], 0).get("a")?.assignedAt).toBe(0);
  });

  it("caps retained debug observers and excludes test targets or sea trials", () => {
    const items = Array.from({ length: 80 }, (_, index) => observation("ship-" + String(index).padStart(2, "0")));
    const forward = new FleetObjectiveCoordinator().update(items, 0);
    expect(forward.size).toBe(64);
    expect([...new FleetObjectiveCoordinator().update(items.reverse(), 0)]).toEqual([...forward]);
    expect(new FleetObjectiveCoordinator().update([observation("dummy", 1_000, 0, { isTestTarget: true })], 0).size).toBe(0);
    expect(new FleetObjectiveCoordinator().update([{ ...observation("a"), gameMode: "sea-trials" }], 0).size).toBe(0);
    expect(new FleetObjectiveCoordinator().update([observation("a")], NaN).size).toBe(0);
  });
});
