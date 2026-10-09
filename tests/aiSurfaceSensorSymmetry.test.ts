import { describe, expect, it } from "vitest";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { createAirSquadronState } from "../src/sim/airOperations";
import { FIXED_STEP, SENSOR } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";
import type { AircraftRole, BattleState } from "../src/sim/types";
import { createFleetCalibration } from "./helpers/fleetCalibration";

function smallSurfaceBattle() {
  const state = createInitialState(0x5f001, "battle");
  state.mapId = "open-sea-range";
  state.airSupport = "none";
  state.ships = (["player", "enemy"] as const).map((team, index) => createDeveloperShipState({
    id: index ? "sensor-b" : "sensor-a", team, shipClassId: "fletcher",
    position: { x: 0, y: 0, z: index ? 700 : -700 }, heading: index ? Math.PI : 0,
    aiControlled: true, countsForVictory: true, mainGunMounts: 1,
    torpedoLauncherMounts: 0, depthChargeMounts: 0, antiAirMounts: 0, secondaryGunIds: [],
  }));
  return state;
}

function readyEnemySquadron(state: BattleState, role: AircraftRole) {
  const owner = state.ships.find(ship => ship.team === "enemy")!;
  return createAirSquadronState({
    id: "enemy-air-" + role, controllerId: owner.id, team: owner.team, role,
    position: { x: 0, y: 180, z: 2000 }, heading: Math.PI,
    recoverySource: { kind: "mapEdge", position: { x: 0, y: 180, z: 5500 } }, now: state.time,
  });
}

/** Exact label permutation only; deliberately no rounding, pose mirroring or ID rewriting. */
function normalizeSwappedLabels(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map(item => normalizeSwappedLabels(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([field, item]) => [
      field === "player" ? "enemy" : field === "enemy" ? "player" : field,
      normalizeSwappedLabels(item, field),
    ]));
  }
  if (key === "captureProgress" && typeof value === "number") return -value || 0;
  if (value === "player") return "enemy";
  if (value === "enemy") return "player";
  if (value === "player-won") return "enemy-won";
  if (value === "enemy-won") return "player-won";
  return value;
}

describe("surface sensors do not gain enemy-only observation ticks from unused aviation", () => {
  it("does not create any cold-start surface snapshot when no subsystem requested one", () => {
    const state = smallSurfaceBattle();
    expect(state.sensorSnapshots).toEqual({});
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.sensorSnapshots).toEqual({});
    expect(state.airSquadrons).toHaveLength(0);
  });

  it("keeps both session observations in the same pre-step sensor interval", () => {
    const state = smallSurfaceBattle();
    state.time = SENSOR.observationIntervalSeconds - FIXED_STEP / 2;
    const session = new LocalBattleSession(state);
    session.step(new Map(), FIXED_STEP);
    expect(state.time).toBeGreaterThan(SENSOR.observationIntervalSeconds);
    for (const ship of state.ships) {
      expect(ship.aiDecision).toBeDefined();
      expect(state.sensorSnapshots[ship.id].sampleIndex).toBe(0);
      expect(state.sensorSnapshots[ship.id].contacts).toHaveLength(1);
      expect(state.sensorSnapshots[ship.id].contacts[0].observedAt).toBe(0);
    }
    // The next common session batch advances both sides together.
    session.step(new Map(), FIXED_STEP);
    for (const ship of state.ships) expect(state.sensorSnapshots[ship.id].sampleIndex).toBe(1);
  });

  it("still launches a fighter guard without taking an unnecessary surface sighting", () => {
    const state = smallSurfaceBattle();
    const fighter = readyEnemySquadron(state, "fighter");
    state.airSquadrons = [fighter];
    stepSimulation(state, new Map(), FIXED_STEP);
    const current = state.airSquadrons[0];
    expect(current.phase).toBe("launching");
    expect(current.order).toMatchObject({
      kind: "defendShip", targetIds: ["sensor-b"], selectedWeapon: "machineGun",
    });
    expect(state.airEvents).toContainEqual(expect.objectContaining({
      kind: "orderAccepted", squadronId: fighter.id, orderKind: "defendShip",
    }));
    expect(state.sensorSnapshots).toEqual({});
  });

  it("does not observe for an enemy squadron that is unavailable for a fresh automatic order", () => {
    const state = smallSurfaceBattle();
    const bomber = readyEnemySquadron(state, "diveBomber");
    bomber.phase = "rearming";
    state.airSquadrons = [bomber];
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.airSquadrons[0].phase).toBe("rearming");
    expect(state.airSquadrons[0].order).toBeUndefined();
    expect(state.sensorSnapshots).toEqual({});
  });

  it.each([
    ["diveBomber", "heBomb"],
    ["torpedoBomber", "aerialTorpedo"],
  ] as const)("preserves real enemy %s strike orders against an actually sensed target", (role, weapon) => {
    const state = smallSurfaceBattle();
    const bomber = readyEnemySquadron(state, role);
    state.airSquadrons = [bomber];
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.sensorSnapshots["sensor-b"].contacts.map(contact => contact.id)).toContain("sensor-a");
    expect(state.airSquadrons[0].phase).toBe("launching");
    expect(state.airSquadrons[0].order).toMatchObject({
      kind: "strikeShip", targetIds: ["sensor-a"], selectedWeapon: weapon,
    });
    expect(state.airEvents).toContainEqual(expect.objectContaining({
      kind: "orderAccepted", squadronId: bomber.id, orderKind: "strikeShip",
    }));
  });

  for (const teamSize of [5, 7] as const) {
    it(`${teamSize}v${teamSize} production sessions retain identical real trajectories when only team labels change`, () => {
      const options = { teamSize, seed: teamSize === 5 ? 0x71501 : 0x71701 };
      const ordinary = createFleetCalibration(options);
      const swapped = createFleetCalibration({ ...options, swapTeamLabels: true });
      expect(normalizeSwappedLabels(swapped)).toEqual(ordinary);
      const a = new LocalBattleSession(ordinary), b = new LocalBattleSession(swapped);
      for (let tick = 0; tick < 80 / FIXED_STEP; ++tick) {
        // No human proxy, injected contacts, altered clocks or seeded controller overrides.
        a.step(new Map(), FIXED_STEP);
        b.step(new Map(), FIXED_STEP);
        if (tick % 150 === 0) {
          // Inspect actual state too, not merely the sensor-cache bookkeeping
          // that exposed the first discrepancy in the old implementation.
          const { sensorSnapshots: _a, ...actualA } = ordinary;
          const { sensorSnapshots: _b, ...actualB } = swapped;
          expect(normalizeSwappedLabels(actualB), `real state at ${ordinary.time}s`).toEqual(actualA);
        }
      }
      expect(ordinary.ships.some(ship => ship.aiDecision?.targetId)).toBe(true);
      expect(ordinary.ships.every(ship => ship.aiDecision?.objectiveDuty)).toBe(true);
      expect(ordinary.airSquadrons).toHaveLength(0);
      // Include all caches, ordnance, clocks, RNG and objective bookkeeping in
      // the final exact comparison. Team is the only semantic permutation.
      expect(normalizeSwappedLabels(swapped)).toEqual(ordinary);
    }, 30_000);
  }
});
