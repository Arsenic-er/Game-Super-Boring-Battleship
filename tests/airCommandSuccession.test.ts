import { describe, expect, it } from "vitest";
import { planAirCommandSuccession } from "../src/sim/airCommandSuccession";
import { createAirSquadronState } from "../src/sim/airOperations";
import { createDeveloperShipState } from "../src/sim/simulation";
import type { AirSquadronPhase, AirSquadronState, ShipState, Team } from "../src/sim/types";

const other = (team: Team): Team => team === "player" ? "enemy" : "player";
const ship = (id: string, team: Team, x = 0, z = 0): ShipState => createDeveloperShipState({
  id, team, shipClassId: "fletcher", position: { x, y: 0, z }, aiControlled: true,
});
const squadron = (id: string, owner: ShipState, x = 0, z = 0): AirSquadronState => {
  const air = createAirSquadronState({ id, controllerId: owner.id, team: owner.team,
    role: "fighter", position: { x, y: 180, z }, heading: .3,
    recoverySource: { kind: "mapEdge", position: { x: 500, y: 80, z: -5200 } },
  });
  air.phase = "patrolling";
  air.order = { squadronId: id, kind: "patrolArea", issuedAt: 12,
    area: { center: { x: 100, y: 200, z: 400 }, radius: 300 } };
  air.ammoRemaining = 2; air.fuelRemainingSeconds = 77; air.cohesion = .7;
  return air;
};
function fixture(team: Team = "player") {
  const owner = ship("old-owner", team, -1000);
  const near = ship("near", team, 900), far = ship("far", team, 0);
  const airSquadrons = [squadron("z", owner, 0), squadron("a", owner, 1000), squadron("m", owner, 2000)];
  return { owner, near, far, state: { ships: [owner, near, far], airSquadrons },
    eligible: new Set([near.id, far.id]) };
}

describe("pure aircraft command succession", () => {
  for (const team of ["player", "enemy"] as const) {
    it.each(["removed", "sunk", "changed-team"] as const)(
      team + " transfers a %s controller's surviving command group to its nearest eligible AI", reason => {
        const { state, owner, near, eligible } = fixture(team);
        if (reason === "removed") state.ships = state.ships.filter(s => s !== owner);
        if (reason === "sunk") owner.hull = 0;
        if (reason === "changed-team") owner.team = other(team);
        const before = structuredClone(state);
        expect(planAirCommandSuccession(state, eligible)).toEqual(["a", "m", "z"].map(id => ({
          squadronId: id, previousControllerId: owner.id, controllerId: near.id,
        })));
        expect(state).toEqual(before);
      },
    );

    it(team + " never takes squadrons from a living human-controlled or disabled same-team owner", () => {
      const { state, owner, eligible } = fixture(team);
      owner.aiControlled = false;
      owner.modules.engine.health = 0; owner.modules.steering.health = 0;
      expect(eligible.has(owner.id)).toBe(false);
      expect(planAirCommandSuccession(state, eligible)).toEqual([]);
    });
  }

  it("uses authoritative eligibility rather than requiring the legacy AI flag", () => {
    const { state, owner, near } = fixture();
    owner.hull = 0; near.aiControlled = false;
    expect(planAirCommandSuccession(state, new Set([near.id])).every(p => p.controllerId === near.id)).toBe(true);
    expect(planAirCommandSuccession(state, new Set([near.id]))).toHaveLength(3);
    expect(planAirCommandSuccession(state, new Set())).toEqual([]);
    expect(planAirCommandSuccession(state, new Set(["missing-ship"])) ).toEqual([]);
  });

  it("excludes dead, enemy, test, unauthorized and invalid-position candidates", () => {
    const { state, owner, near, far } = fixture();
    owner.hull = 0; near.isTestTarget = true; far.hull = 0;
    const hostile = ship("hostile", "enemy", 1000);
    const manual = ship("manual", "player", 1000);
    const invalid = ship("invalid", "player", NaN);
    const eligible = new Set([near.id, far.id, hostile.id, invalid.id]);
    state.ships.push(hostile, manual, invalid);
    const before = structuredClone(state);
    expect(planAirCommandSuccession(state, eligible)).toEqual([]);
    expect(state).toEqual(before);
  });

  it("keeps grouped assignment nearest rather than balancing existing squadron counts", () => {
    const { state, owner, near, eligible } = fixture();
    owner.hull = 0;
    state.airSquadrons.push(...Array.from({ length: 8 }, (_, i) => squadron("existing-" + i, near)));
    const changes = planAirCommandSuccession(state, eligible);
    expect(changes).toHaveLength(3);
    expect(changes.every(change => change.controllerId === near.id)).toBe(true);
  });

  it("is identical under either roster reversal, exact-distance ties and team-label swapping", () => {
    const owner = ship("old", "player"); owner.hull = 0;
    const a = ship("a-choice", "player", -500), b = ship("b-choice", "player", 500);
    const state = { ships: [owner, b, a], airSquadrons: [squadron("z", owner, -200), squadron("a", owner, 200)] };
    const eligible = new Set([a.id, b.id]);
    const expected = planAirCommandSuccession(state, eligible);
    expect(expected.every(change => change.controllerId === a.id)).toBe(true);
    for (const swapLabels of [false, true]) for (const reverseShips of [false, true]) for (const reverseAir of [false, true]) {
      const transformed = structuredClone(state);
      if (reverseShips) transformed.ships.reverse();
      if (reverseAir) transformed.airSquadrons.reverse();
      if (swapLabels) {
        for (const s of transformed.ships) s.team = other(s.team);
        for (const air of transformed.airSquadrons) air.team = other(air.team);
      }
      expect(planAirCommandSuccession(transformed, eligible)).toEqual(expected);
    }
  });

  it("separates both teams even when they share a missing controller ID", () => {
    const playerOwner = ship("missing", "player"), enemyOwner = ship("missing", "enemy");
    const a = ship("a", "player"), b = ship("b", "enemy");
    const state = { ships: [a, b], airSquadrons: [squadron("p-air", playerOwner), squadron("e-air", enemyOwner)] };
    expect(planAirCommandSuccession(state, new Set([a.id, b.id]))).toEqual([
      { squadronId: "e-air", previousControllerId: "missing", controllerId: "b" },
      { squadronId: "p-air", previousControllerId: "missing", controllerId: "a" },
    ]);
  });

  it("does not keep switching a valid successor when a closer ship arrives or control becomes human", () => {
    const { state, owner, near, far, eligible } = fixture(); owner.hull = 0;
    for (const change of planAirCommandSuccession(state, eligible)) {
      state.airSquadrons.find(air => air.id === change.squadronId)!.controllerId = change.controllerId;
    }
    far.position.x = 1000; near.position.x = 5000;
    expect(planAirCommandSuccession(state, eligible)).toEqual([]);
    eligible.delete(near.id); near.aiControlled = false;
    expect(planAirCommandSuccession(state, eligible)).toEqual([]);
    near.hull = 0;
    expect(planAirCommandSuccession(state, eligible).every(change => change.controllerId === far.id)).toBe(true);
    expect(planAirCommandSuccession(state, eligible)).toHaveLength(3);
  });

  it("does not transfer destroyed, empty or zero-health aircraft and never fabricates replacements", () => {
    const { state, owner, eligible } = fixture(); owner.hull = 0;
    state.airSquadrons[0]!.phase = "destroyed";
    state.airSquadrons[1]!.aircraftOperational = 0;
    state.airSquadrons[2]!.airframeHealth = 0;
    const before = structuredClone(state);
    expect(planAirCommandSuccession(state, eligible)).toEqual([]);
    expect(state).toEqual(before);
  });

  it.each(["ready", "launching", "outbound", "attackRun", "returning", "landing", "rearming"] as AirSquadronPhase[])(
    "preserves all %s aircraft state, including its independent recovery source", phase => {
      const { state, owner, eligible } = fixture(); owner.hull = 0;
      state.airSquadrons = [state.airSquadrons[0]!];
      const air = state.airSquadrons[0]!; air.phase = phase;
      air.recoverySource = { kind: "carrier", shipId: owner.id };
      air.resumeOrder = structuredClone(air.order);
      const before = structuredClone(state);
      const changes = planAirCommandSuccession(state, eligible);
      expect(changes).toHaveLength(1);
      expect(Object.keys(changes[0]!).sort()).toEqual(["controllerId", "previousControllerId", "squadronId"]);
      expect(state).toEqual(before);
      expect(air.recoverySource).toEqual({ kind: "carrier", shipId: owner.id });
    },
  );

  it("keeps an invalid-position group intact instead of guessing or splitting its successor", () => {
    const { state, owner, eligible } = fixture(); owner.hull = 0;
    state.airSquadrons[0]!.position.x = NaN;
    const before = structuredClone(state);
    expect(planAirCommandSuccession(state, eligible)).toEqual([]);
    expect(state).toEqual(before);
  });
});
