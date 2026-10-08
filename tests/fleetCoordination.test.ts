import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { SENSOR, FIXED_STEP } from "../src/sim/config";
import { PlayerPerceptionTracker } from "../src/sim/playerPerception";
import { createInitialState, observe } from "../src/sim/simulation";
import { spawnDeveloperShip } from "../src/sim/developerSandbox";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { replicationViewFor } from "../src/net/replicationView";
import { validateRemoteCommand } from "../src/net/protocol";
import type { FleetContactReport, Observation, SensorContact, ShipState } from "../src/sim/types";

function fixture(): Observation {
  const state = createInitialState(810);
  state.mapId = "open-sea-range";
  state.ships[0]!.position = { x: 0, y: 0, z: 0 };
  // Isolate radio search from battle-objective duties; firing restrictions are unchanged.
  return { ...observe(state, "player"), gameMode: "sea-trials", contacts: [], friendlies: [], time: 0 };
}
function contact(id: string, time: number, x = 0, z = 1800): SensorContact {
  return { id, team: "enemy", observedAt: time, position: { x, y: 0, z },
    heading: 0, speedKnots: 18, rangeMeters: Math.hypot(x, z),
    confidence: 0.9, estimatedHullRatio: 0.8 };
}
function radio(time: number, id = "radio-target"): FleetContactReport {
  return { ...contact(id, time - 3), sourceShipId: "scout", receivedAt: time };
}
const idle = (ship: Readonly<ShipState>) => ({
  throttle: 0, rudder: 0, aimPoint: { ...ship.aimPoint }, fire: false,
});

describe("fleet optical locks and radio search", () => {
  it("reacquires a different target inside the same scan instead of inheriting its lock", () => {
    const base = fixture(), ai = new RuleBasedAi(77);
    let result;
    for (const time of [0, 2.5, 5, 7.5]) {
      result = ai.command({ ...base, time, contacts: [contact("A", time)] });
    }
    expect(result?.perception?.mode).toBe("tracking");
    const switched = { ...base, time: 7.6, contacts: [contact("B", 7.5)] };
    result = ai.command(switched);
    expect(result.perception?.mode).toBe("acquiring");
    expect(result.aiDecision?.targetId).toBe("B");
    expect(result.fire).toBe(false);
    for (let n = 0; n < 30; n++) {
      result = ai.command({ ...switched, time: 7.6 + n * .01 });
      expect(result.perception?.mode).toBe("acquiring");
      expect(result.fire).toBe(false);
    }
    for (const time of [10, 12.5]) {
      result = ai.command({ ...base, time, contacts: [contact("B", time)] });
      expect(result.perception?.mode).toBe("acquiring");
      expect(result.fire).toBe(false);
    }
    result = ai.command({ ...base, time: 15, contacts: [contact("B", 15)] });
    expect(result.perception?.mode).toBe("tracking");
  });

  it("also resets the player optical lock for a same-timestamp target switch", () => {
    const base = fixture(), tracker = new PlayerPerceptionTracker();
    for (const time of [0, 2.5, 5]) {
      tracker.update({ ...base, time, contacts: [contact("A", time)] });
    }
    const switched = { ...base, time: 5.1, contacts: [contact("B", 5)] };
    expect(tracker.update(switched)?.mode).toBe("acquiring");
    expect(tracker.update(switched)?.mode).toBe("acquiring");
    expect(tracker.update({ ...base, time: 7.5, contacts: [contact("B", 7.5)] })?.mode).toBe("acquiring");
    expect(tracker.update({ ...base, time: 10, contacts: [contact("B", 10)] })?.mode).toBe("tracking");
  });

  it("uses radio for search only even across many optical acquisition intervals", () => {
    const base = fixture(), ai = new RuleBasedAi(77);
    for (let time = 3; time < 60; time += 2.5) {
      const command = ai.command({ ...base, time, sharedContacts: [radio(time)] });
      expect(command.aiDecision?.contactSource).toBe("radio");
      expect(command.aiDecision?.phase).toBe("searching");
      expect(command.aiDecision?.reportSourceId).toBe("scout");
      expect(command.aiDecision?.reportAgeSeconds).toBe(3);
      expect(command.perception?.mode).toBe("searching");
      expect(command.fire).toBe(false);
      expect(command.weaponSlot).toBe("mainGun");
    }
  });

  it("radio does not prime acquisition and never overrides a live local contact", () => {
    const base = fixture(), ai = new RuleBasedAi(12);
    for (const time of [3, 5.5, 8]) ai.command({ ...base, time, sharedContacts: [radio(time)] });
    for (let sample = 0; sample < SENSOR.aiAcquisitionSamples; sample++) {
      const time = 10 + sample * 2.5;
      const command = ai.command({ ...base, time, contacts: [contact("local", time)],
        sharedContacts: [{ ...radio(time), estimatedHullRatio: 0, rangeMeters: 100 }] });
      expect(command.aiDecision?.targetId).toBe("local");
      expect(command.aiDecision?.contactSource).toBe("local");
      expect(command.perception?.mode).toBe(sample < 3 ? "acquiring" : "tracking");
      if (sample < 3) expect(command.fire).toBe(false);
    }
  });

  it("fresh radio can update lost-track navigation but cannot reactivate weapons", () => {
    const base = fixture(), ai = new RuleBasedAi(18);
    for (const time of [0, 2.5, 5, 7.5]) {
      ai.command({ ...base, time, contacts: [contact("A", time)] });
    }
    const report = { ...radio(13, "A"), position: { x: 2000, y: 0, z: 0 } };
    const command = ai.command({ ...base, time: 13, sharedContacts: [report] });
    expect(command.aiDecision?.contactSource).toBe("radio");
    expect(command.aiDecision?.phase).toBe("searching");
    expect(command.perception?.estimatedPosition).toEqual(report.position);
    expect(command.fire).toBe(false);
  });

  it("does not create enduring optical memory from a radio-only target", () => {
    const base = fixture(), ai = new RuleBasedAi(18);
    ai.command({ ...base, time: 3, sharedContacts: [radio(3)] });
    const command = ai.command({ ...base, time: 20, sharedContacts: [] });
    expect(command.aiDecision?.targetId).toBeUndefined();
    expect(command.perception?.mode).toBe("unaware");
    expect(command.fire).toBe(false);
  });
});

function radioScenario() {
  const state = createInitialState(827, "battle");
  state.mapId = "open-sea-range";
  const scout = state.ships.find(s => s.id === "player")!;
  const enemy = state.ships.find(s => s.id === "enemy")!;
  const ally = spawnDeveloperShip(state, "player", "cleveland")!;
  scout.position = { x: 0, y: 0, z: 0 };
  enemy.position = { x: 0, y: 0, z: 1200 };
  ally.position = { x: 0, y: 0, z: -6000 };
  ally.aiControlled = true;
  for (const ship of state.ships) { ship.speedKnots = 0; ship.throttle = 0; }
  state.sensorSnapshots = {};
  return { state, scout, enemy, ally, session: new LocalBattleSession(state) };
}

describe("authoritative fleet report integration", () => {
  it("a human scout informs AI after delay without exposing it to the player's local sensors", () => {
    const { state, scout, enemy, ally, session } = radioScenario();
    const commands = new Map([[scout.id, { ...idle(scout), throttle: .6 }]]);
    session.step(commands);
    expect(scout.throttle).toBe(.6);
    expect(ally.aiDecision?.targetId).toBeUndefined();
    state.time = 2.99;
    session.step(commands);
    expect(ally.aiDecision?.targetId).toBeUndefined();
    state.time = 3;
    session.step(commands);
    expect(ally.aiDecision?.targetId).toBe(enemy.id);
    expect(ally.aiDecision?.contactSource).toBe("radio");
    expect(ally.aiDecision?.fireIntent).toBe(false);
    expect(ally.perception?.mode).toBe("searching");
    expect(observe(state, ally.id).contacts).toHaveLength(0);
    const snapshot = replicationViewFor(state, ally.id, 4, 0);
    expect(snapshot.contacts).toHaveLength(0);
  });

  it("reset discards delayed packets even if a new battle reuses ship ids", () => {
    const first = radioScenario();
    first.session.step(new Map([[first.scout.id, idle(first.scout)]]));
    const next = radioScenario();
    next.enemy.position = { x: 30000, y: 0, z: 30000 };
    next.state.sensorSnapshots = {};
    first.session.reset(next.state);
    next.state.time = 4;
    first.session.step(new Map([[next.scout.id, idle(next.scout)]]));
    expect(next.ally.aiDecision?.targetId).toBeUndefined();
    expect(next.ally.aiDecision?.contactSource).not.toBe("radio");
  });

  it("removing the reporting scout cancels in-flight reports", () => {
    const { state, scout, ally, session } = radioScenario();
    session.step(new Map([[scout.id, idle(scout)]]));
    state.ships = state.ships.filter(s => s.id !== scout.id);
    state.time = 4;
    session.step(new Map());
    expect(ally.aiDecision?.targetId).toBeUndefined();
  });

  it("has the same radio guidance when ship iteration order is reversed", () => {
    const run = (reverse: boolean) => {
      const { state, scout, ally, session } = radioScenario();
      if (reverse) state.ships.reverse();
      for (const time of [0, 3]) {
        state.time = time;
        session.step(new Map([[scout.id, idle(scout)]]), FIXED_STEP);
      }
      return { target: ally.aiDecision?.targetId, source: ally.aiDecision?.reportSourceId,
        mode: ally.perception?.mode, fire: ally.aiDecision?.fireIntent };
    };
    expect(run(true)).toEqual(run(false));
    expect(run(false).mode).toBe("searching");
  });

  it("does not accept remote attempts to inject radio or AI authority", () => {
    const base = fixture();
    for (const extra of [
      { sharedContacts: [radio(3)] },
      { perception: { mode: "tracking", confidence: 1 } },
      { aiDecision: { fireIntent: true } },
    ]) {
      const result = validateRemoteCommand({ ...idle(base.self), ...extra });
      expect(result).toBeUndefined();
    }
  });
});
