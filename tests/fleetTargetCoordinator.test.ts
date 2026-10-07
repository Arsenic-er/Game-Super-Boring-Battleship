import { afterEach, describe, expect, it, vi } from "vitest";
import { FleetTargetCoordinator } from "../src/controllers/fleetTargetCoordinator";
import { SENSOR } from "../src/sim/config";
import { createInitialState, observe } from "../src/sim/simulation";
import * as batteries from "../src/ships/mainBatteries";
import type { FleetTargetAssignment, Observation, SensorContact, ShipState, Team } from "../src/sim/types";

const base = observe(createInitialState(1616), "player");
function contact(id: string, rangeMeters = 2_200, time = 0,
  patch: Partial<SensorContact> = {}): SensorContact {
  return { id, team: "enemy", observedAt: time, position: { x: 0, y: 0, z: rangeMeters },
    heading: 0, speedKnots: 18, rangeMeters, confidence: .9, estimatedHullRatio: .9, ...patch };
}
function observation(id: string, contacts: readonly SensorContact[], time = 0,
  patch: Partial<ShipState> = {}): Observation {
  return { ...base, self: { ...base.self, id, ...patch }, time, contacts,
    friendlies: [], sharedContacts: [] };
}
function fleet(time = 0): Observation[] {
  return ["ally-a", "ally-b", "ally-c"].map(id =>
    observation(id, [contact("A", 2_200, time), contact("B", 2_250, time)], time));
}
const entries = (assignments: ReadonlyMap<string, FleetTargetAssignment>) => [...assignments.entries()];
afterEach(() => vi.restoreAllMocks());

describe("bounded local-only fleet target coordinator", () => {
  it("distributes three allies over two comparable locally observed contacts", () => {
    const result = new FleetTargetCoordinator().update(fleet(), 0);
    const counts = new Map<string, number>();
    for (const assignment of result.values()) counts.set(assignment.targetId,
      (counts.get(assignment.targetId) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([1, 2]);
    for (const assignment of result.values()) {
      expect(assignment.friendlyAssignedCount).toBe(counts.get(assignment.targetId));
      expect(assignment.role).toBe("screen");
      expect(assignment.assignedAt).toBe(0);
    }
  });

  it("allows every ally to focus a single target and an especially damaged target", () => {
    const coordinator = new FleetTargetCoordinator();
    const single = fleet().map(item => ({ ...item, contacts: [contact("only")] }));
    expect([...coordinator.update(single, 0).values()].map(item => item.targetId)).toEqual(["only", "only", "only"]);
    coordinator.reset();
    const damaged = fleet().map(item => ({ ...item, contacts: [
      contact("wounded", 2_200, 0, { estimatedHullRatio: .01 }),
      contact("healthy", 2_200, 0, { estimatedHullRatio: 1 }),
    ] }));
    expect([...coordinator.update(damaged, 0).values()].map(item => item.targetId)).toEqual(["wounded", "wounded", "wounded"]);
  });

  it("isolates friendly occupancy by team", () => {
    const blue = fleet();
    const red = fleet().map(item => ({ ...item, self: { ...item.self, id: "red-" + item.self.id, team: "enemy" as Team },
      contacts: item.contacts.map(target => ({ ...target, team: "player" as Team })) }));
    const expected = new FleetTargetCoordinator().update(blue, 0);
    const both = new FleetTargetCoordinator().update([...red, ...blue], 0);
    for (const [id, assignment] of expected) expect(both.get(id)).toEqual(assignment);
    for (const assignment of both.values()) expect(assignment.friendlyAssignedCount).toBeLessThanOrEqual(2);
  });

  it("is invariant to observer/contact order and mirrored teams and positions", () => {
    const original = fleet();
    const reversed = original.slice().reverse().map(item => ({ ...item, contacts: item.contacts.slice().reverse() }));
    const mirrored = reversed.map(item => ({ ...item, self: { ...item.self, team: "enemy" as Team,
      position: { x: -item.self.position.x, y: item.self.position.y, z: -item.self.position.z } },
      contacts: item.contacts.map(target => ({ ...target, team: "player" as Team,
        position: { x: -target.position.x, y: target.position.y, z: -target.position.z },
        heading: target.heading + Math.PI })) }));
    const expected = entries(new FleetTargetCoordinator().update(original, 0));
    expect(entries(new FleetTargetCoordinator().update(reversed, 0))).toEqual(expected);
    expect(entries(new FleetTargetCoordinator().update(mirrored, 0))).toEqual(expected);
  });

  it("never lends a target from another observer or a radio-only report", () => {
    const radioOnly = { ...observation("radio-only", []), sharedContacts: [
      { ...contact("radio"), sourceShipId: "scout", receivedAt: 0 },
    ] };
    const local = observation("scout", [contact("local")]);
    const other = observation("other", [contact("other-local")]);
    const result = new FleetTargetCoordinator().update([radioOnly, local, other], 0);
    expect(result.has("radio-only")).toBe(false);
    expect(result.get("scout")?.targetId).toBe("local");
    expect(result.get("other")?.targetId).toBe("other-local");
    expect(new FleetTargetCoordinator().update([], 0).size).toBe(0);
  });

  it("holds acquisition through noisy scans and remains stable after the hold expires", () => {
    const coordinator = new FleetTargetCoordinator();
    const initial = entries(coordinator.update(fleet(), 0));
    for (let time = 2.5; time <= 60; time += 2.5) {
      const noisy = fleet(time).map(item => ({ ...item, contacts: [
        contact("B", time % 5 ? 2_170 : 2_280, time),
        contact("A", time % 5 ? 2_280 : 2_170, time),
      ] }));
      expect(entries(coordinator.update(noisy.slice().reverse(), time))).toEqual(initial);
    }
  });

  it("holds for ten seconds even if another comparable target becomes moderately better", () => {
    const coordinator = new FleetTargetCoordinator();
    expect(coordinator.update([observation("self", [contact("A"), contact("B", 2_600)])], 0)
      .get("self")?.targetId).toBe("A");
    for (const time of [2.5, 5, 7.5]) {
      expect(coordinator.update([observation("self", [
        contact("A", 2_700, time), contact("B", 2_200, time),
      ], time)], time).get("self")?.targetId).toBe("A");
    }
    expect(coordinator.update([observation("self", [contact("A", 2_700, 10), contact("B", 2_200, 10)], 10)], 10)
      .get("self")).toMatchObject({ targetId: "B", assignedAt: 10 });
  });

  it("releases a lost target immediately, even between scheduled decisions", () => {
    const coordinator = new FleetTargetCoordinator();
    coordinator.update([observation("self", [contact("A"), contact("B", 2_400)])], 0);
    const result = coordinator.update([observation("self", [contact("B", 2_400, .1)], .1)], .1);
    expect(result.get("self")).toMatchObject({ targetId: "B", assignedAt: .1 });
  });

  it("switches immediately to a close self-defense threat without forcing near-target jitter", () => {
    const coordinator = new FleetTargetCoordinator();
    coordinator.update([observation("self", [contact("A"), contact("B", 2_400)])], 0);
    expect(coordinator.update([observation("self", [contact("A", 2_200, .1), contact("B", 500, .1)], .1)], .1)
      .get("self")?.targetId).toBe("B");
    expect(coordinator.update([observation("self", [contact("A", 450, .2), contact("B", 500, .2)], .2)], .2)
      .get("self")).toMatchObject({ targetId: "B", assignedAt: .1 });
  });

  it("breaks hold for a severely inferior target or a target outside actual equipped gun range", () => {
    const coordinator = new FleetTargetCoordinator();
    coordinator.update([observation("self", [contact("A"), contact("B", 2_500)])], 0);
    const result = coordinator.update([observation("self", [
      contact("A", 4_700, 2.5), contact("B", 2_400, 2.5),
    ], 2.5)], 2.5);
    expect(result.get("self")?.targetId).toBe("B");
  });

  it("uses own hull role and actual historical battery override, not enemy class assumptions", () => {
    const targets = [contact("near", 2_700, 0, { estimatedHullRatio: .95 }),
      contact("far", 3_700, 0, { estimatedHullRatio: .05 })];
    const screen = observation("screen", targets);
    const line = observation("line", targets, 0, { hullId: "battleship", shipClassId: "bismarck" });
    expect(new FleetTargetCoordinator().update([screen], 0).get("screen")?.targetId).toBe("near");
    expect(new FleetTargetCoordinator().update([line], 0).get("line")).toMatchObject({ targetId: "far", role: "line" });
    const rangeTargets = [contact("near", 3_500, 0, { estimatedHullRatio: 1 }),
      contact("far", 4_100, 0, { estimatedHullRatio: 0 })];
    const standard = observation("self", rangeTargets, 0, { shipClassId: "fletcher" });
    const upgraded = { ...standard, self: { ...standard.self, developer: {
      enabled: true, unrestrictedWeapons: false, infiniteAmmunition: false, instantReload: false,
      speedMultiplier: 1, mainBatteryClassId: "yamato" as const,
    } } };
    expect(new FleetTargetCoordinator().update([standard], 0).get("self")?.targetId).toBe("near");
    expect(new FleetTargetCoordinator().update([upgraded], 0).get("self")?.targetId).toBe("far");
  });

  it("drops death, human takeover omission and old-team claims immediately", () => {
    const coordinator = new FleetTargetCoordinator();
    const initial = fleet().map(item => ({ ...item, contacts: [contact("only")] }));
    coordinator.update(initial, 0);
    const survivor = { ...initial[0]!, time: .1 };
    const dead = { ...initial[1]!, self: { ...initial[1]!.self, hull: 0 }, time: .1 };
    const result = coordinator.update([survivor, dead], .1); // Third AI is now human-controlled.
    expect(result.size).toBe(1);
    expect(result.get(survivor.self.id)?.friendlyAssignedCount).toBe(1);
    const changedTeam = { ...survivor, self: { ...survivor.self, team: "enemy" as Team }, time: .2 };
    expect(coordinator.update([changedTeam], .2).size).toBe(0);
  });

  it("invalidates observer equipment and contact topology without waiting for the next interval", () => {
    const battery = vi.spyOn(batteries, "effectiveMainBattery");
    const coordinator = new FleetTargetCoordinator();
    const first = observation("self", [contact("A")]);
    coordinator.update([first], 0);
    const changed = { ...first, time: .1, self: { ...first.self, mainGunMounts: first.self.mainGunMounts + 1 } };
    expect(coordinator.update([changed], .1).get("self")?.assignedAt).toBe(.1);
    expect(battery).toHaveBeenCalledTimes(2);
    expect(coordinator.update([{ ...changed, time: .2, contacts: [] }], .2).size).toBe(0);
  });

  it("does not sort or resolve batteries again during valid cached ticks", () => {
    const battery = vi.spyOn(batteries, "effectiveMainBattery");
    const coordinator = new FleetTargetCoordinator();
    coordinator.update(fleet(), 0);
    expect(battery).toHaveBeenCalledTimes(3);
    const sort = vi.spyOn(Array.prototype, "sort");
    for (const time of [.1, .2, .3, .4]) coordinator.update(fleet().map(item => ({ ...item, time })), time);
    expect(battery).toHaveBeenCalledTimes(3);
    expect(sort).not.toHaveBeenCalled();
  });

  it("caps retained observers and local candidates independently of input order", () => {
    const contacts = Array.from({ length: 80 }, (_, i) => contact("target-" + String(i).padStart(2, "0")));
    const many = Array.from({ length: 80 }, (_, i) => observation("ship-" + String(i).padStart(2, "0"), contacts));
    const coordinator = new FleetTargetCoordinator();
    const result = coordinator.update(many, 0);
    expect(result.size).toBe(64);
    const retained = (coordinator as unknown as { observers: Map<string, { contactIds: Set<string> }> }).observers;
    expect([...retained.values()].every(item => item.contactIds.size === 64)).toBe(true);
    expect(entries(new FleetTargetCoordinator().update(many.slice().reverse().map(item =>
      ({ ...item, contacts: item.contacts.slice().reverse() })), 0))).toEqual(entries(result));
  });

  it("chooses duplicate samples deterministically and rejects ambiguous duplicate observers", () => {
    const duplicates = [contact("A", 2_200, 1), contact("A", 8_000, 0), contact("B", 3_000, 1)];
    const input = observation("self", duplicates, 1);
    const expected = entries(new FleetTargetCoordinator().update([input], 1));
    expect(expected[0]?.[1].targetId).toBe("A");
    expect(entries(new FleetTargetCoordinator().update([{ ...input, contacts: duplicates.slice().reverse() }], 1))).toEqual(expected);
    expect(new FleetTargetCoordinator().update([input, { ...input }], 1).size).toBe(0);
  });

  it("rejects malformed, future, stale, friendly and self contacts", () => {
    const invalid: Partial<SensorContact>[] = [
      { observedAt: 11 }, { observedAt: 7.4 }, { observedAt: NaN },
      { rangeMeters: Infinity }, { rangeMeters: -1 }, { heading: NaN },
      { speedKnots: NaN }, { confidence: 0 }, { confidence: 1.1 },
      { estimatedHullRatio: NaN }, { estimatedHullRatio: -1 }, { estimatedHullRatio: 1.1 },
      { position: { x: NaN, y: 0, z: 0 } }, { team: "player" }, { id: "self" }, { id: "" },
    ];
    for (const patch of invalid) {
      const result = new FleetTargetCoordinator().update([observation("self", [
        contact("invalid", 2_200, 10, patch),
      ], 10)], 10);
      expect(result.size, JSON.stringify(patch)).toBe(0);
    }
    const stale = new FleetTargetCoordinator();
    stale.update([observation("self", [contact("A")])], 0);
    expect(stale.update([observation("self", [contact("A")], SENSOR.observationIntervalSeconds + .01)],
      SENSOR.observationIntervalSeconds + .01).size).toBe(0);
  });

  it("clears on invalid/backwards time and explicit reset without retaining old hold state", () => {
    const coordinator = new FleetTargetCoordinator();
    const input = observation("self", [contact("A", 2_200, 10)], 10);
    coordinator.update([input], 10);
    expect(coordinator.update([observation("self", [contact("B")])], 0).get("self"))
      .toMatchObject({ targetId: "B", assignedAt: 0 });
    for (const time of [NaN, Infinity, -1]) {
      expect(coordinator.update([input], time).size).toBe(0);
      expect(coordinator.update([input], 10).get("self")?.assignedAt).toBe(10);
    }
    coordinator.reset();
    expect(coordinator.update([], 10).size).toBe(0);
    for (const badTime of [NaN, Infinity, 11, 0]) {
      expect(coordinator.update([{ ...input, time: badTime }], 10).size).toBe(0);
    }
  });

  it("keeps six allies balanced and stable instead of saturating occupancy after two claims", () => {
    const coordinator = new FleetTargetCoordinator();
    const six = (time: number, onlyA = false) => Array.from({ length: 6 }, (_, i) =>
      observation("ally-" + i, onlyA ? [contact("A", 2_200, time)] : [
        contact("A", 2_200, time), contact("B", 2_200, time),
      ], time));
    const counts = (result: ReadonlyMap<string, FleetTargetAssignment>) => {
      const targets = [...result.values()].map(item => item.targetId);
      return [targets.filter(id => id === "A").length, targets.filter(id => id === "B").length];
    };
    expect(counts(coordinator.update(six(0), 0))).toEqual([3, 3]);
    const stable = entries(coordinator.update(six(2.5), 2.5));
    for (const time of [5, 7.5, 10, 12.5, 15, 17.5]) {
      expect(entries(coordinator.update(six(time).slice().reverse(), time))).toEqual(stable);
    }
    coordinator.reset();
    expect(counts(coordinator.update(six(0, true), 0))).toEqual([6, 0]);
    for (const time of [2.5, 5, 7.5]) {
      expect(counts(coordinator.update(six(time), time))).toEqual([6, 0]);
    }
    expect(counts(coordinator.update(six(10), 10))).toEqual([3, 3]);
    const balanced = entries(coordinator.update(six(12.5), 12.5));
    for (const time of [15, 17.5, 20, 22.5, 25]) {
      expect(entries(coordinator.update(six(time), time))).toEqual(balanced);
    }
  });

  it("retains a close threat and only in-range target beyond the contact capacity", () => {
    const coordinator = new FleetTargetCoordinator();
    const far = Array.from({ length: 80 }, (_, i) => contact("A-" + i, 5_000, 0));
    const close = contact("Z-close", 500, 0);
    expect(coordinator.update([observation("self", [...far, close])], 0).get("self")?.targetId).toBe("Z-close");
    coordinator.reset();
    const inRange = contact("Z-in-range", 2_000, 0);
    expect(coordinator.update([observation("self", [...far, inRange])], 0).get("self")?.targetId).toBe("Z-in-range");
  });

  it("uses the same deterministic strongest-valid-sample rank for overflow and duplicates", () => {
    const contacts = Array.from({ length: 80 }, (_, i) => contact("A-" + i, 3_000 + i, 1));
    contacts.push(contact("Z-duplicate", 700, 0), contact("Z-duplicate", 6_000, 1));
    const expected = entries(new FleetTargetCoordinator().update([observation("self", contacts, 1)], 1));
    expect(expected[0]?.[1].targetId).toBe("Z-duplicate");
    expect(entries(new FleetTargetCoordinator().update([
      observation("self", contacts.slice().reverse(), 1),
    ], 1))).toEqual(expected);
  });

  it("accepts finite signed speeds for ships reversing astern", () => {
    expect(new FleetTargetCoordinator().update([
      observation("self", [contact("reversing", 2_000, 0, { speedKnots: -8 })]),
    ], 0).get("self")?.targetId).toBe("reversing");
  });

  it("does not break acquisition on tiny sample noise at the equipped range boundary", () => {
    const coordinator = new FleetTargetCoordinator();
    for (let time = 0; time <= 20; time += 2.5) {
      const offset = time % 5 ? 1 : -1;
      expect(coordinator.update([observation("self", [
        contact("A", 3_850 + offset, time), contact("B", 3_850 - offset, time),
      ], time, { shipClassId: "fletcher" })], time).get("self"))
        .toMatchObject({ targetId: "A", assignedAt: 0 });
    }
  });

  it("returns detached maps and assignments so caller mutations cannot poison claims", () => {
    const coordinator = new FleetTargetCoordinator();
    const input = fleet();
    const result = coordinator.update(input, 0) as Map<string, FleetTargetAssignment>;
    const expected = entries(result).map(([id, value]) => [id, { ...value }]);
    result.get("ally-a")!.targetId = "injected";
    result.get("ally-b")!.friendlyAssignedCount = 999;
    result.clear();
    expect(entries(coordinator.update(input, .1))).toEqual(expected);
    const mutableContact = input[0]!.contacts[0]! as SensorContact;
    mutableContact.id = "mutated-input";
    const refreshed = coordinator.update(input, .2);
    expect(input[0]!.contacts.some(target => target.id === refreshed.get("ally-a")?.targetId)).toBe(true);
  });
});
