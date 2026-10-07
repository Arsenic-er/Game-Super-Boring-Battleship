import { describe, expect, it } from "vitest";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState) => ({
  throttle: 0, rudder: 0, aimPoint: { ...ship.aimPoint }, fire: false,
});

function fixture(team: Team = "player", twoTargets = false) {
  const state = createInitialState(834);
  state.mapId = "open-sea-range";
  state.weatherId = "clear";
  state.airSquadrons = [];
  const observer = createDeveloperShipState({
    id: "observer", team, shipClassId: "fletcher",
    position: { x: 0, y: 0, z: 0 }, heading: 0, aiControlled: true,
    torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  const opponent: Team = team === "player" ? "enemy" : "player";
  const target = (id: string, x: number) => createDeveloperShipState({
    id, team: opponent, shipClassId: "fletcher",
    position: { x, y: 0, z: 0 }, heading: 0, aiControlled: false,
    torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  const a = target("A", 3_100), b = target("B", -3_100);
  state.ships = twoTargets ? [observer, a, b] : [observer, a];
  // At this range a destroyer is locally detected through gun bloom, not
  // passive optical range. Changing bloom invalidates the real sensor cache.
  a.lastMainGunFiredAt = 0;
  const session = new LocalBattleSession(state);
  const step = (time: number) => {
    state.time = time;
    const visible = observe(state, observer.id).contacts;
    const output = session.step(new Map(state.ships.filter(ship => ship.id !== observer.id)
      .map(ship => [ship.id, idle(ship)])), FIXED_STEP);
    return { visible, shots: output.shots.filter(shot => shot.ownerId === observer.id) };
  };
  return { state, observer, a, b, session, step };
}

describe("production optical loss and reacquisition", () => {
  for (const team of ["player", "enemy"] as const) {
    it(`does not regain ${team} firing authority when gun bloom returns inside the same scan`, () => {
      const { observer, a, step } = fixture(team);
      for (const time of [0, 2.5, 5, 7.5]) {
        expect(step(time).visible.map(({ id }) => id)).toEqual(["A"]);
      }
      expect(observer.perception?.mode).toBe("tracking");
      a.lastMainGunFiredAt = -100;
      expect(step(7.6).visible).toHaveLength(0);
      expect(observer.perception?.mode).toBe("lost");
      expect(observer.aiDecision?.fireIntent).toBe(false);
      a.lastMainGunFiredAt = 7.7;
      for (const time of [7.7, 7.8, 8, 9, 9.9]) {
        const { visible, shots } = step(time);
        expect(visible[0]?.observedAt).toBe(7.5);
        expect(observer.aiDecision?.targetId).toBe("A");
        expect(observer.perception?.mode).toBe("acquiring");
        expect(observer.aiDecision?.fireIntent).toBe(false);
        expect(shots).toHaveLength(0);
      }
      expect(step(10).visible[0]?.observedAt).toBe(10);
      expect(observer.perception?.mode).toBe("acquiring");
      expect(observer.aiDecision?.fireIntent).toBe(false);
      expect(step(12.5).visible[0]?.observedAt).toBe(12.5);
      expect(observer.perception?.mode).toBe("tracking");
    });
  }

  it("remembers an identified ship across an alternative target without lending either lock", () => {
    const { observer, a, b, step } = fixture("player", true);
    for (const time of [0, 2.5, 5, 7.5]) step(time);
    expect(observer.perception?.mode).toBe("tracking");
    a.lastMainGunFiredAt = -100;
    b.lastMainGunFiredAt = 8;
    for (const time of [8, 10]) {
      expect(step(time).visible.map(({ id }) => id)).toEqual(["B"]);
      expect(observer.aiDecision?.targetId).toBe("B");
      expect(observer.perception?.mode).toBe("acquiring");
      expect(observer.aiDecision?.fireIntent).toBe(false);
    }
    a.lastMainGunFiredAt = 10.1;
    b.lastMainGunFiredAt = -100;
    expect(step(10.1).visible.map(({ id }) => id)).toEqual(["A"]);
    expect(observer.perception?.mode).toBe("acquiring");
    expect(observer.aiDecision?.fireIntent).toBe(false);
    step(12.5);
    expect(observer.aiDecision?.targetId).toBe("A");
    expect(observer.perception?.mode).toBe("tracking");
  });

  it("expires identity memory and clears it after production session reset", () => {
    const first = fixture();
    for (const time of [0, 2.5, 5, 7.5]) first.step(time);
    first.a.lastMainGunFiredAt = -100;
    first.step(10);
    first.step(35);
    expect(first.observer.perception?.mode).toBe("unaware");
    first.a.lastMainGunFiredAt = 40;
    for (const time of [40, 42.5, 45]) {
      first.step(time);
      expect(first.observer.perception?.mode).toBe("acquiring");
      expect(first.observer.aiDecision?.fireIntent).toBe(false);
    }
    first.step(47.5);
    expect(first.observer.perception?.mode).toBe("tracking");

    const next = fixture();
    first.session.reset(next.state);
    for (const time of [0, 2.5, 5, 7.5]) {
      next.state.time = time;
      first.session.step(new Map([[next.a.id, idle(next.a)]]), FIXED_STEP);
      expect(next.observer.perception?.mode).toBe(time < 7.5 ? "acquiring" : "tracking");
      if (time < 7.5) expect(next.observer.aiDecision?.fireIntent).toBe(false);
    }
  });

  it("uses only dead reckoning while the lost target changes its hidden position", () => {
    const first = fixture(), second = fixture();
    for (const time of [0, 2.5, 5, 7.5]) { first.step(time); second.step(time); }
    first.a.lastMainGunFiredAt = -100;
    second.a.lastMainGunFiredAt = -100;
    first.a.position = { x: 12_000, y: 0, z: 9_000 };
    second.a.position = { x: -9_000, y: 0, z: -12_000 };
    for (const time of [10, 12.5, 15, 20]) {
      expect(first.step(time).visible).toHaveLength(0);
      expect(second.step(time).visible).toHaveLength(0);
      expect(first.observer.perception).toEqual(second.observer.perception);
      expect(first.observer.aiDecision).toEqual(second.observer.aiDecision);
      expect(first.observer.aiDecision?.fireIntent).toBe(false);
      expect(first.observer.aimPoint).toEqual(second.observer.aimPoint);
    }
  });
});
