import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import { validateRemoteCommand } from "../src/net/protocol";
import type { Observation, SensorContact, ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState) => ({ throttle: 0, rudder: 0, aimPoint: { ...ship.aimPoint }, fire: false });
function fixture(twoSided = false) {
  const state = createInitialState(831);
  state.mapId = "open-sea-range";
  state.airSquadrons = [];
  state.ships = (["player", "enemy"] as const).flatMap((team) =>
    [-300, 0, 300].map((x, index) => createDeveloperShipState({
      id: team + "-" + index, team, shipClassId: "fletcher",
      position: { x, y: 0, z: team === "player" ? 0 : 1_100 },
      heading: team === "player" ? 0 : Math.PI,
      aiControlled: twoSided || team === "player",
    })));
  return { state, session: new LocalBattleSession(state) };
}
const assignments = (ships: ShipState[], team: Team = "player") => new Map(ships
  .filter((ship) => ship.team === team)
  .map((ship) => [ship.id, ship.aiDecision?.targetId]));
const sample = (id: string, time: number, x = 0): SensorContact => ({
  id, team: "enemy", position: { x, y: 0, z: 1_300 }, heading: 0, speedKnots: 10,
  observedAt: time, rangeMeters: Math.hypot(x, 1_300), confidence: .9, estimatedHullRatio: .8,
});
function baseObservation(): Observation {
  const { state } = fixture();
  return { ...observe(state, "player-0"), contacts: [], friendlies: [], time: 0 };
}

describe("fleet target allocation in the authoritative session", () => {
  it("distributes comparable local targets and preserves the assignments through optical acquisition", () => {
    const { state, session } = fixture();
    let first: Map<string, string | undefined> | undefined;
    for (const time of [0, 2.5, 5, 7.5, 10, 12.5, 15]) {
      state.time = time;
      state.sensorSnapshots = {};
      const localIds = new Map(state.ships.filter((ship) => ship.team === "player")
        .map((ship) => [ship.id, observe(state, ship.id).contacts.map(({ id }) => id)]));
      session.step(new Map(), FIXED_STEP);
      const current = assignments(state.ships);
      expect(new Set(current.values()).size).toBeGreaterThanOrEqual(2);
      if (!first) first = current;
      else expect(current).toEqual(first);
      for (const ship of state.ships.filter((ship) => ship.team === "player")) {
        expect(localIds.get(ship.id)).toContain(ship.aiDecision?.targetId);
        expect(ship.aiDecision?.coordinatedTarget).toBe(true);
        expect(ship.aiDecision?.friendlyTargetLoad).toBeGreaterThanOrEqual(1);
        if (time < 7.5) {
          expect(ship.perception?.mode).toBe("acquiring");
          expect(ship.aiDecision?.fireIntent).toBe(false);
        } else expect(ship.perception?.mode).toBe("tracking");
      }
    }
  });

  it("keeps both teams coordinated while selecting only opposing local contacts", () => {
    const { state, session } = fixture(true);
    session.step(new Map());
    for (const team of ["player", "enemy"] as const) {
      const selected = assignments(state.ships, team);
      expect(new Set(selected.values()).size).toBeGreaterThanOrEqual(2);
      for (const [shipId, targetId] of selected) {
        expect(targetId?.startsWith(team === "player" ? "enemy-" : "player-")).toBe(true);
        expect(state.ships.find(({ id }) => id === shipId)?.aiDecision?.coordinatedTarget).toBe(true);
      }
    }
  });

  it("does not depend on authoritative ship iteration order", () => {
    const normal = fixture(true), reversed = fixture(true);
    reversed.state.ships.reverse();
    normal.session.step(new Map());
    reversed.session.step(new Map());
    for (const team of ["player", "enemy"] as const)
      expect(assignments(reversed.state.ships, team)).toEqual(assignments(normal.state.ships, team));
  });

  it("allows focus fire when only one local target remains", () => {
    const { state, session } = fixture();
    state.ships = state.ships.filter((ship) => ship.team === "player" || ship.id === "enemy-0");
    session.step(new Map());
    for (const ship of state.ships.filter((ship) => ship.team === "player")) {
      expect(ship.aiDecision?.targetId).toBe("enemy-0");
      expect(ship.aiDecision?.friendlyTargetLoad).toBe(3);
    }
  });

  it("releases human-controlled reservations immediately without replacing human input", () => {
    const { state, session } = fixture();
    state.ships = state.ships.filter((ship) => ship.team === "player" || ship.id === "enemy-0");
    session.step(new Map());
    const player = state.ships.find(({ id }) => id === "player-0")!;
    state.time += .1;
    session.step(new Map([[player.id, { ...idle(player), throttle: .25, rudder: -.4 }]]));
    expect(player.throttle).toBe(.25);
    expect(player.aiDecision).toBeUndefined();
    for (const ship of state.ships.filter((ship) => ship.team === "player" && ship.id !== player.id)) {
      expect(ship.aiDecision?.friendlyTargetLoad).toBe(2);
    }
  });

  it("resets coordination and optical locks when a new battle reuses ship IDs", () => {
    const { state, session } = fixture();
    for (const time of [0, 2.5, 5, 7.5]) {
      state.time = time; state.sensorSnapshots = {}; session.step(new Map());
    }
    expect(state.ships[0]!.perception?.mode).toBe("tracking");
    const next = fixture().state;
    session.reset(next);
    session.step(new Map());
    expect(next.ships[0]!.perception?.mode).toBe("acquiring");
    expect(next.ships[0]!.aiDecision?.fireIntent).toBe(false);
  });
});

describe("coordinated choice retains local firing authority", () => {
  it("uses assigned local contact, but never skips acquisition or inherits another target's lock", () => {
    const base = baseObservation(), ai = new RuleBasedAi(71);
    const fleetTarget = { targetId: "B", assignedAt: 0, role: "screen" as const, friendlyAssignedCount: 2 };
    let command;
    for (const time of [0, 2.5, 5, 7.5]) {
      command = ai.command({ ...base, time, contacts: [sample("A", time), sample("B", time, 300)], fleetTarget });
      expect(command.aiDecision?.targetId).toBe("B");
      expect(command.aiDecision?.coordinatedTarget).toBe(true);
      if (time < 7.5) expect(command.fire).toBe(false);
    }
    expect(command?.perception?.mode).toBe("tracking");
    const switched = ai.command({ ...base, time: 7.6, contacts: [sample("A", 7.5), sample("B", 7.5, 300)],
      fleetTarget: { ...fleetTarget, targetId: "A", assignedAt: 7.6 } });
    expect(switched.aiDecision?.targetId).toBe("A");
    expect(switched.perception?.mode).toBe("acquiring");
    expect(switched.fire).toBe(false);
  });

  it("rejects unseen and future assignments without turning radio hints into firing contacts", () => {
    const base = baseObservation(), ai = new RuleBasedAi(73);
    for (const time of [3, 5.5, 8, 10.5, 13]) {
      const fleetTarget = { targetId: "radio-only", assignedAt: 0, role: "screen" as const, friendlyAssignedCount: 2 };
      const command = ai.command({ ...base, time, contacts: [], fleetTarget,
        sharedContacts: [{ ...sample("radio-only", time - 3), sourceShipId: "scout", receivedAt: time }] });
      expect(command.perception?.mode).toBe("searching");
      expect(command.aiDecision?.coordinatedTarget).toBe(false);
      expect(command.fire).toBe(false);
    }
    for (const [targetId, assignedAt] of [
      ["B", 50], ["B", -1], ["B", Number.NaN], ["not-local", 0],
    ] as const) {
      const command = ai.command({ ...base, time: 15,
        contacts: [sample("A", 15), sample("B", 15, 500)],
        fleetTarget: { targetId, assignedAt, role: "screen", friendlyAssignedCount: 2 } });
      expect(command.aiDecision?.targetId).toBe("A");
      expect(command.aiDecision?.coordinatedTarget).toBe(false);
      expect(command.aiDecision?.friendlyTargetLoad).toBeUndefined();
    }
  });

  it("does not accept network commands that inject fleet assignment authority", () => {
    const base = baseObservation();
    const command = { ...idle(base.self as ShipState),
      fleetTarget: { targetId: "enemy", assignedAt: 0, role: "screen", friendlyAssignedCount: 1 } };
    expect(validateRemoteCommand(command)).toBeUndefined();
  });
});
