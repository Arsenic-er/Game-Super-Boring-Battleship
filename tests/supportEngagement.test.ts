import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { supportMaySearchKnownContact, supportStationRadius } from "../src/controllers/supportEngagement";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { ControlCommand, FleetContactReport, Observation, ShipState, Team } from "../src/sim/types";
import type { WeatherId } from "../src/sim/weather";

const idle = (ship: ShipState): ControlCommand => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } });
function fixture(weather: WeatherId = "clear", team: Team = "player") {
  const state = createInitialState(867123, "battle");
  state.mapId = "open-sea-range"; state.weatherId = weather; state.airSquadrons = [];
  state.objective.center = { x: 0, y: 0, z: 0 };
  const self = createDeveloperShipState({ id: "support", team, shipClassId: "richelieu",
    position: { x: 0, y: 0, z: -2372.5 }, heading: 0, aiControlled: true,
    secondaryGunIds: [], torpedoLauncherMounts: 0 });
  const enemy = createDeveloperShipState({ id: "target", team: team === "player" ? "enemy" : "player",
    shipClassId: "bismarck", position: { x: 9000, y: 0, z: 9000 }, heading: 0,
    secondaryGunIds: [], torpedoLauncherMounts: 0 });
  for (const ship of [self, enemy]) { ship.speedKnots = 0; ship.throttle = 0; }
  state.ships = [self, enemy];
  const input = (time = 3): Observation => {
    state.time = time; state.sensorSnapshots = {};
    return { ...observe(state, self.id), fleetObjective: { duty: "support", urgent: false, assignedAt: time } };
  };
  const report = (time = 3): FleetContactReport => ({
    id: enemy.id, team: enemy.team, sourceShipId: "scout", observedAt: time - 3, receivedAt: time,
    position: { x: 1000, y: 0, z: -1300 }, heading: 0, speedKnots: 0,
    rangeMeters: 1466, confidence: .8, estimatedHullRatio: 1,
  });
  return { state, self, enemy, input, report };
}
describe("weather-aware support engagement", () => {
  it.each([["clear", 2372.5], ["rain-squall", 1250.95], ["sea-fog", 850]] as const)(
    "%s shortens only the support station using public weather", (weather, expected) => {
      const { input } = fixture(weather);
      expect(supportStationRadius(input(), 3650, 4950)).toBeCloseTo(expected, 4);
      expect(supportStationRadius(input(), 1650, 3100)).toBeGreaterThanOrEqual(850);
    });
  it("old observations retain the clear-weather station", () => {
    const { input } = fixture("sea-fog");
    expect(supportStationRadius({ ...input(), weatherId: undefined }, 3650, 4950)).toBe(2372.5);
  });
  it.each(["rain-squall", "sea-fog"] as const)("does not park at the clear-weather ring in %s", weather => {
    const { input } = fixture(weather);
    const command = new RuleBasedAi(11).command(input());
    expect(command.throttle).toBeGreaterThan(0);
    expect(Math.cos(command.aiDecision!.desiredHeading)).toBeGreaterThan(.99);
    expect(command.fire).toBe(false);
  });
  it.each(["clear", "rain-squall", "sea-fog"] as const)("cannot infer hidden targets from %s world positions", weather => {
    const commands = [9000, -9000].map(coordinate => {
      const { input, enemy } = fixture(weather);
      enemy.position = { x: coordinate, y: 0, z: coordinate };
      const observation = input();
      expect(observation.contacts).toHaveLength(0);
      return new RuleBasedAi(12).command(observation);
    });
    expect(commands[0]).toEqual(commands[1]);
  });
  it("searches a legitimate flank report instead of idling but never acquires it optically", () => {
    const { input, report } = fixture();
    const ai = new RuleBasedAi(13);
    for (const time of [3, 5.5, 8, 10.5, 13]) {
      const command = ai.command({ ...input(time), sharedContacts: [report(time)] });
      expect(command.throttle).toBeGreaterThan(.5);
      expect(Math.sin(command.aiDecision!.desiredHeading)).toBeGreaterThan(.4);
      expect(command.aiDecision?.contactSource).toBe("radio");
      expect(command.perception?.mode).toBe("searching");
      expect(command.fire).toBe(false);
    }
  });
  it.each(["center", "opposite", "outside-leash"] as const)("does not chase a %s report through or away from its cap", where => {
    const { input, report } = fixture(); const known = report();
    known.position = where === "center" ? { x: 0, y: 0, z: 0 }
      : where === "opposite" ? { x: 0, y: 0, z: 1200 } : { x: 5000, y: 0, z: -2300 };
    expect(supportMaySearchKnownContact(input(), 2372.5, known, known)).toBe(false);
    const command = new RuleBasedAi(14).command({ ...input(), sharedContacts: [known] });
    expect(command.throttle).toBe(0);
    expect(command.fire).toBe(false);
  });
  it.each(["too-early", "expired", "future-sample", "future-received", "friendly", "nan", "bad-confidence"] as const)(
    "rejects %s reports as search authority", kind => {
      const { input, report } = fixture(); const known = report(30);
      if (kind === "too-early") known.observedAt = 29;
      if (kind === "expired") known.observedAt = 14.9;
      if (kind === "future-sample") known.observedAt = 31;
      if (kind === "future-received") known.receivedAt = 31;
      if (kind === "friendly") known.team = "player";
      if (kind === "nan") known.position.x = NaN;
      if (kind === "bad-confidence") known.confidence = Infinity;
      expect(supportMaySearchKnownContact(input(30), 2372.5, known, known)).toBe(false);
    });
  it("expires radio by observation time rather than refreshing it through receipt time", () => {
    const { input, report } = fixture(); const known = report(3);
    expect(supportMaySearchKnownContact(input(14.999), 2372.5, known, known)).toBe(true);
    expect(supportMaySearchKnownContact(input(15), 2372.5, known, known)).toBe(false);
    expect(supportMaySearchKnownContact(input(15.01), 2372.5, known, known)).toBe(false);
    expect(supportMaySearchKnownContact(input(24), 2372.5, known, undefined)).toBe(true);
    expect(supportMaySearchKnownContact(input(24.01), 2372.5, known, undefined)).toBe(false);
  });
  it("does not abandon an uncontested leading objective for a remote flank report", () => {
    const { state, input, report } = fixture();
    state.objective.owner = "player"; state.objective.captureProgress = 1;
    state.objective.scores.player = 1500; state.objective.scores.enemy = 800;
    const command = new RuleBasedAi(15).command({ ...input(), sharedContacts: [report()] });
    expect(command.throttle).toBe(0); expect(command.fire).toBe(false);
  });
  it("keeps both team labels and ship IDs out of support search geometry", () => {
    const command = (team: Team, id: string) => {
      const { input, report, self } = fixture("sea-fog", team);
      self.id = id; self.position.z = -1500;
      const result = new RuleBasedAi(16).command({ ...input(), sharedContacts: [report()] });
      return { throttle: result.throttle, rudder: result.rudder, heading: result.aiDecision?.desiredHeading, fire: result.fire };
    };
    expect(command("player", "alpha")).toEqual(command("enemy", "omega"));
  });

  it("stops a report pursuit at its own support leash", () => {
    const { input, report, self } = fixture(); self.position.z = -3500;
    const known = report();
    expect(supportMaySearchKnownContact(input(), 2372.5, known, known)).toBe(false);
  });
  it("prioritizes a real local acquisition over a different radio report", () => {
    const { input, report, enemy, self } = fixture();
    enemy.position = { x: 1600, y: 0, z: self.position.z };
    const other = { ...report(), id: "another-ship" };
    const ai = new RuleBasedAi(18);
    for (const time of [0, 2.5, 5, 7.5]) {
      const command = ai.command({ ...input(time), sharedContacts: [{ ...other, observedAt: time - 3, receivedAt: time }] });
      expect(command.aiDecision?.targetId).toBe(enemy.id);
      expect(command.aiDecision?.contactSource).toBe("local");
      expect(command.perception?.mode).toBe(time < 7.5 ? "acquiring" : "tracking");
      if (time < 7.5) expect(command.fire).toBe(false);
    }
  });
  it("returns to its support ring after optical search memory expires", () => {
    const { input, enemy, self } = fixture();
    enemy.position = { x: 1600, y: 0, z: self.position.z };
    const ai = new RuleBasedAi(19);
    for (const time of [0, 2.5, 5, 7.5]) ai.command(input(time));
    enemy.position = { x: 9000, y: 0, z: 9000 };
    const searching = ai.command(input(10));
    expect(searching.aiDecision?.contactSource).toBe("memory");
    expect(searching.throttle).toBeGreaterThan(.5);
    expect(searching.fire).toBe(false);
    const expired = ai.command(input(32));
    expect(expired.aiDecision?.targetId).toBeUndefined();
    expect(expired.throttle).toBe(0);
    expect(expired.fire).toBe(false);
  });

  it("preserves heavy-damage withdrawal rather than forcing report pursuit", () => {
    const { input, report, self } = fixture(); self.hull = self.maxHull * .2;
    const command = new RuleBasedAi(17).command({ ...input(), sharedContacts: [report()] });
    expect(command.aiDecision?.phase).toBe("withdrawing");
    expect(command.throttle).toBeLessThanOrEqual(.52);
    expect(command.fire).toBe(false);
  });
});

describe("production support ships leave weather-blind parking and fire", () => {
  it.each(["clear", "rain-squall", "sea-fog"] as const)("%s obtains its own firing track in a real session", weather => {
    const { state, self, enemy } = fixture(weather);
    enemy.position = { x: 0, y: 0, z: 600 };
    const scout = createDeveloperShipState({ id: "human-scout", team: self.team, shipClassId: "fletcher",
      position: { x: 0, y: 0, z: 0 }, heading: 0, secondaryGunIds: [], torpedoLauncherMounts: 0 });
    scout.speedKnots = 0; scout.throttle = 0;
    state.ships.push(scout);
    const session = new LocalBattleSession(state);
    let fired = 0; let firstShot = Infinity; let optical = false; let support = false;
    for (let tick = 0; tick < 360 / FIXED_STEP && state.status === "running" && !fired; tick++) {
      const output = session.step(new Map([[scout.id, idle(scout)], [enemy.id, idle(enemy)]]), FIXED_STEP);
      support ||= self.aiDecision?.objectiveDuty === "support";
      optical ||= self.aiDecision?.contactSource === "local" && self.perception?.mode === "tracking";
      fired += output.shots.filter(shot => shot.ownerId === self.id && shot.kind === "shell" && shot.weaponSource === "mainGun").length;
      if (fired) firstShot = state.time;
    }
    expect(support).toBe(true);
    expect(optical, JSON.stringify({ position: self.position, perception: self.perception, decision: self.aiDecision })).toBe(true);
    expect(fired).toBeGreaterThan(0);
    expect(firstShot).toBeLessThan(360);
    expect(Math.hypot(self.position.x, self.position.z)).toBeGreaterThan(state.objective.radius);
  }, 30_000);
});
