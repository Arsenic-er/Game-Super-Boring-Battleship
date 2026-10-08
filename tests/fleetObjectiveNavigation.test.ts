import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { AI_TORPEDO, FIXED_STEP, OBJECTIVE } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { ControlCommand, FleetContactReport, FleetObjectiveAssignment, Observation, ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
const opposite = (team: Team): Team => team === "player" ? "enemy" : "player";
function fixture(team: Team = "player") {
  const state = createInitialState(9821, "battle");
  state.mapId = "open-sea-range";
  state.weatherId = "clear";
  state.airSquadrons = [];
  state.objective.center = { x: 0, y: 0, z: 0 };
  const self = createDeveloperShipState({
    id: "observer", team, shipClassId: "fletcher",
    position: { x: 0, y: 0, z: -2000 }, heading: 0, aiControlled: true,
    torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  const target = createDeveloperShipState({
    id: "target", team: opposite(team), shipClassId: "bismarck",
    position: { x: 9000, y: 0, z: 9000 }, heading: 0,
    torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  state.ships = [self, target];
  const at = (time = 0, duty: FleetObjectiveAssignment["duty"] = "capture",
    extra: Partial<Observation> = {}): Observation => {
    state.time = time;
    state.sensorSnapshots = {};
    return { ...observe(state, self.id), fleetObjective: {
      duty, urgent: true, assignedAt: time, stationIndex: 0,
    }, ...extra };
  };
  const report = (time: number): FleetContactReport => ({
    id: target.id, team: target.team, observedAt: time - 3, receivedAt: time,
    position: { x: -4000, y: 0, z: -6000 }, heading: 0, speedKnots: 18,
    rangeMeters: Math.hypot(4000, 4000), confidence: .6, estimatedHullRatio: .8,
    sourceShipId: "scout",
  });
  const capward = (command: ControlCommand) => {
    const bearing = Math.atan2(-self.position.x, -self.position.z);
    return Math.cos(command.aiDecision!.desiredHeading - bearing);
  };
  return { state, self, target, at, report, capward };
}

describe("objective navigation respects perception and safety", () => {
  it("an assigned capper ignores an opposite radio search waypoint without gaining firing authority", () => {
    const { at, report, capward } = fixture();
    const ai = new RuleBasedAi(81);
    for (const time of [3, 5.5, 8, 10.5]) {
      const input = at(time, "capture", { sharedContacts: [report(time)] });
      expect(input.contacts).toHaveLength(0);
      const command = ai.command(input);
      expect(capward(command)).toBeGreaterThan(.98);
      expect(command.aiDecision).toMatchObject({ phase: "securing", contactSource: "radio", objectiveDuty: "capture" });
      expect(command.perception?.mode).toBe("searching");
      expect(command.fire).toBe(false);
    }
  });

  it("old optical memory cannot redirect an assigned capper or revive its firing lock", () => {
    const { self, target, at, capward } = fixture();
    target.position = { x: 2700, y: 0, z: self.position.z };
    target.lastMainGunFiredAt = 0;
    const ai = new RuleBasedAi(82);
    for (const time of [0, 2.5, 5, 7.5]) {
      const input = at(time);
      expect(input.contacts.map(contact => contact.id)).toContain(target.id);
      ai.command(input);
    }
    target.position = { x: 9000, y: 0, z: 9000 };
    target.lastMainGunFiredAt = -100;
    for (const time of [10, 12.5, 15]) {
      const input = at(time);
      expect(input.contacts).toHaveLength(0);
      const command = ai.command(input);
      expect(capward(command)).toBeGreaterThan(.98);
      expect(command.aiDecision?.contactSource).toBe("memory");
      expect(command.perception?.mode).not.toBe("tracking");
      expect(command.fire).toBe(false);
    }
  });

  it("a fresh far local target behind the ship does not override its cap station", () => {
    const { target, at, capward } = fixture();
    target.position = { x: 0, y: 0, z: -6200 };
    target.lastMainGunFiredAt = 0;
    const input = at(0);
    expect(input.contacts.map(contact => contact.id)).toContain(target.id);
    expect(input.contacts[0]!.rangeMeters).toBeGreaterThan(3100);
    const command = new RuleBasedAi(83).command(input);
    expect(capward(command)).toBeGreaterThan(.98);
    expect(command.aiDecision?.contactSource).toBe("local");
    expect(command.perception?.mode).toBe("acquiring");
    expect(command.fire).toBe(false);
  });

  it("capital-ship formation following cannot override an assigned capper", () => {
    const { state, self, at, capward } = fixture();
    const capital = createDeveloperShipState({
      id: "capital", team: self.team, shipClassId: "bismarck",
      position: { x: 2500, y: 0, z: -4500 }, heading: Math.PI,
    });
    state.ships.push(capital);
    const input = at();
    expect(input.friendlies.map(ship => ship.id)).toContain(capital.id);
    const command = new RuleBasedAi(84).command(input);
    expect(capward(command)).toBeGreaterThan(.98);
    expect(command.aiDecision?.phase).toBe("securing");
  });

  it("support stations stay outside the capture circle instead of collecting every ship at its center", () => {
    const { self, at, capward } = fixture();
    self.position = { x: 0, y: 0, z: -700 };
    const command = new RuleBasedAi(85).command(at(0, "support"));
    expect(capward(command)).toBeLessThan(-.98);
    expect(command.aiDecision?.objectiveDuty).toBe("support");
    expect(command.aiDecision?.phase).not.toBe("securing");
  });

  it("a safely owned leading support ship holds its ring rather than chasing a distant radio report", () => {
    const { state, self, at, report } = fixture();
    state.objective.owner = self.team;
    state.objective.captureProgress = 1;
    state.objective.scores[self.team] = 1800;
    state.objective.scores[opposite(self.team)] = 900;
    self.position = { x: 0, y: 0, z: -1072.5 };
    const command = new RuleBasedAi(86).command(at(1150, "support", { sharedContacts: [report(1150)] }));
    expect(command.throttle).toBe(0);
    expect(command.aiDecision?.objectiveDuty).toBe("support");
    expect(command.aiDecision?.contactSource).toBe("radio");
    expect(command.fire).toBe(false);
  });

  it("uses bounded propulsion to separate from a stationary friend while holding a support station", () => {
    const { self, state, at } = fixture();
    self.position = { x: 0, y: 0, z: -1072.5 };
    self.speedKnots = 0;
    const friend = createDeveloperShipState({
      id: "nearby-friend", team: self.team, shipClassId: "fletcher",
      position: { x: self.position.x + 35, y: 0, z: self.position.z }, heading: 0,
    });
    friend.speedKnots = 0;
    state.ships.push(friend);
    const command = new RuleBasedAi(94).command(at(0, "support"));
    expect(command.aiDecision?.phase).toBe("evading");
    expect(command.aiDecision?.avoidanceReason).toContain(friend.id);
    expect(command.throttle).toBe(.25);
    expect(Math.sin(command.aiDecision!.desiredHeading)).toBeLessThan(-.99);
  });

  it("retreats from a genuine close-quarters local threat before following a cap order", () => {
    const { target, self, at, capward } = fixture();
    target.position = { x: 0, y: 0, z: self.position.z + 150 };
    const input = at();
    expect(input.contacts).toHaveLength(1);
    const command = new RuleBasedAi(87).command(input);
    expect(capward(command)).toBeLessThan(-.9);
    expect(command.throttle).toBeGreaterThan(0);
    expect(command.aiDecision?.phase).not.toBe("securing");
  });

  it("gives reacted-to incoming torpedoes priority over an urgent cap", () => {
    const { self, at } = fixture();
    const incomingTorpedoes = [{
      id: 1, position: { x: self.position.x, y: 0, z: self.position.z + 100 },
      velocity: { x: 20, y: 0, z: 0 }, distanceMeters: 100, armed: true,
      side: "port" as const, closingSpeedMetersPerSecond: 20,
      closestApproachMeters: 0, timeToClosestApproach: 5,
    }];
    const ai = new RuleBasedAi(88);
    ai.command(at(0, "capture", { incomingTorpedoes }));
    const command = ai.command(at(AI_TORPEDO.evasionReactionMaxSeconds + .5, "capture", { incomingTorpedoes }));
    expect(command.aiDecision?.phase).toBe("evading");
    expect(Math.abs(Math.sin(command.aiDecision!.desiredHeading))).toBeGreaterThan(.99);
    expect(command.throttle).toBe(1);
  });

  it("preserves bounded grounded-hull reverse recovery despite an urgent cap", () => {
    const { self, at } = fixture();
    self.navigationZone = "grounded";
    const command = new RuleBasedAi(89).command(at());
    expect(command.throttle).toBeLessThan(0);
    expect(command.throttle).toBeGreaterThanOrEqual(-.25);
  });

  it("respects heavy-damage retreat and damage-control priority instead of forcing a cap rush", () => {
    const { self, target, at, capward } = fixture();
    self.hull = self.maxHull * .2;
    self.recoverableHull = self.hull;
    self.smokeCharges = 0;
    self.flooding = 50;
    target.position = { x: 0, y: 0, z: 500 };
    target.lastMainGunFiredAt = 0;
    const input = at();
    expect(input.contacts).toHaveLength(1);
    const command = new RuleBasedAi(90).command(input);
    expect(command.aiDecision?.phase).toBe("withdrawing");
    expect(capward(command)).toBeLessThan(-.9);
    expect(command.throttle).toBeLessThanOrEqual(.52);
    expect(command.damageControlPriority).toBe("flood");
    expect(command.fire).toBe(false);
  });

  it("uses identical cap navigation for both teams under identical public geometry", () => {
    const run = (team: Team) => {
      const { at, report } = fixture(team);
      const command = new RuleBasedAi(91).command(at(1100, "capture", { sharedContacts: [report(1100)] }));
      return { heading: command.aiDecision?.desiredHeading, throttle: command.throttle,
        rudder: command.rudder, phase: command.aiDecision?.phase, fire: command.fire };
    };
    expect(run("player")).toEqual(run("enemy"));
  });

  it("ignores even an explicit capture assignment in sea trials", () => {
    const { state, at, report } = fixture();
    state.mode = "sea-trials";
    const input = at(3, "capture", { sharedContacts: [report(3)] });
    expect(input.gameMode).toBe("sea-trials");
    const command = new RuleBasedAi(92).command(input);
    expect(command.aiDecision?.objectiveDuty).toBeUndefined();
    expect(command.aiDecision?.phase).toBe("searching");
    expect(command.fire).toBe(false);
  });

  it("is unchanged when a hidden enemy moves elsewhere outside its local sensors", () => {
    const run = (x: number, z: number) => {
      const { target, at } = fixture();
      target.position = { x, y: 0, z };
      const input = at(1100);
      expect(input.contacts).toHaveLength(0);
      return new RuleBasedAi(93).command(input);
    };
    expect(run(9000, 9000)).toEqual(run(-9000, -9000));
  });
});

describe("production cap assignment and movement", () => {
  function fleet() {
    const first = fixture();
    const human = createDeveloperShipState({
      id: "human", team: first.self.team, shipClassId: "fletcher",
      position: { x: 0, y: 0, z: -600 }, heading: 0, aiControlled: true,
      torpedoLauncherMounts: 0, secondaryGunIds: [],
    });
    first.state.ships.push(human);
    return { ...first, human, session: new LocalBattleSession(first.state) };
  }

  it("an off-zone explicitly controlled human does not reserve the AI capture duty", () => {
    const { state, self, target, human, session } = fleet();
    for (const time of [0, 3, 8, 14]) {
      state.time = time;
      session.step(new Map([[human.id, idle(human)], [target.id, idle(target)]]));
      expect(human.throttle).toBe(0);
      expect(self.aiDecision?.objectiveDuty).toBe("capture");
      expect(self.aiDecision?.phase).toBe("securing");
    }
  });

  it("releases a reserved capture duty immediately when a human takes that ship over", () => {
    const { state, self, target, human, session } = fleet();
    session.step(new Map([[target.id, idle(target)]]));
    expect(human.aiDecision?.objectiveDuty).toBe("capture");
    expect(self.aiDecision?.objectiveDuty).toBe("support");
    state.time = 1;
    session.step(new Map([[human.id, idle(human)], [target.id, idle(target)]]));
    expect(self.aiDecision?.objectiveDuty).toBe("capture");
    expect(human.throttle).toBe(0);
  });

  it("resets duties with a new session state and clears them when switching to sea trials", () => {
    const first = fleet();
    first.session.step(new Map([[first.target.id, idle(first.target)]]));
    expect(first.human.aiDecision?.objectiveDuty).toBe("capture");
    const next = fleet();
    next.self.position = { x: 0, y: 0, z: -500 };
    next.human.position = { x: 0, y: 0, z: -2000 };
    first.session.reset(next.state);
    first.session.step(new Map([[next.target.id, idle(next.target)]]));
    expect(next.self.aiDecision?.objectiveDuty).toBe("capture");
    next.state.mode = "sea-trials";
    first.session.step(new Map([[next.target.id, idle(next.target)]]));
    expect(next.self.aiDecision?.objectiveDuty).toBeUndefined();
    expect(next.human.aiDecision?.objectiveDuty).toBeUndefined();
  });

  it("travels from 500m outside, slows down and stays in the circle through capture before releasing to support", () => {
    const { state, self, target } = fixture();
    self.position = { x: -state.objective.radius * .3, y: 0, z: -950 };
    self.previousPosition = { ...self.position };
    const session = new LocalBattleSession(state);
    let enteredAt: number | undefined, ownedAt: number | undefined;
    let exitedBeforeCapture = false, slowedBeforeCapture = false, grounded = false;
    for (let step = 0; step < 180 / FIXED_STEP; step++) {
      session.step(new Map([[target.id, idle(target)]]), FIXED_STEP);
      const distance = Math.hypot(self.position.x, self.position.z);
      if (distance <= state.objective.radius) enteredAt ??= state.time;
      if (enteredAt !== undefined && !ownedAt) {
        exitedBeforeCapture ||= distance > state.objective.radius;
        slowedBeforeCapture ||= self.throttle <= .24;
      }
      grounded ||= self.navigationZone === "grounded";
      if (state.objective.owner === self.team) ownedAt ??= state.time;
      if (ownedAt !== undefined && self.aiDecision?.objectiveDuty === "support") break;
    }
    expect(enteredAt).toBeDefined();
    expect(ownedAt).toBeDefined();
    expect(ownedAt!).toBeLessThanOrEqual(180);
    expect(ownedAt! - enteredAt!).toBeGreaterThanOrEqual(OBJECTIVE.captureSeconds - FIXED_STEP * 2);
    expect(exitedBeforeCapture).toBe(false);
    expect(slowedBeforeCapture).toBe(true);
    expect(grounded).toBe(false);
    expect(self.aiDecision?.objectiveDuty).toBe("support");
  }, 15_000);
});
