import { describe, expect, it } from "vitest";
import { friendlyCollisionRisk, RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { FriendlyShipObservation, Observation, Team } from "../src/sim/types";

function fixture(team: Team = "player", shipClassId: "fletcher" | "cleveland" = "fletcher") {
  const state = createInitialState(71013, "sea-trials");
  state.mapId = "open-sea-range";
  const self = createDeveloperShipState({
    id: "self", team, shipClassId, position: { x: 0, y: 0, z: 0 }, heading: 0,
    torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  state.ships = [self];
  return { state, self, input: observe(state, self.id) };
}
const ally = (id: string, x: number, z: number): FriendlyShipObservation => ({
  id, shipClassId: "north-carolina", position: { x, y: 0, z }, heading: 0, speedKnots: 0, hullRatio: 1,
});
const command = (input: Observation, friendlies: readonly FriendlyShipObservation[]) =>
  new RuleBasedAi(103).command({ ...input, friendlies });
function acquired(input: Observation, friendlies: readonly FriendlyShipObservation[]) {
  const ai = new RuleBasedAi(103);
  let result = ai.command({ ...input, friendlies, time: 0 });
  for (let time = 1; time <= 20; time++) {
    result = ai.command({ ...input, friendlies, time,
      contacts: input.contacts.map(contact => ({ ...contact, observedAt: time })) });
  }
  return result;
}

describe("friendly observation ordering does not change AI intent", () => {
  for (const team of ["player", "enemy"] as const) {
    for (const shipClassId of ["fletcher", "cleveland"] as const) {
      it(`${team} ${shipClassId} chooses its nearest live capital ship rather than the first entry`, () => {
        const { input } = fixture(team, shipClassId);
        const near = ally("z-near", 1000, 500), far = ally("a-far", -2500, 800);
        const expected = command(input, [near]);
        expect(command(input, [far, near])).toEqual(expected);
        expect(command(input, [near, far])).toEqual(expected);
        expect(expected.aiDecision?.phase).toBe("forming");
        expect(expected.aiDecision?.role).toBe(shipClassId === "fletcher" ? "screen" : "escort");
      });

      it(`${team} ${shipClassId} breaks equal anchor distances by stable ID`, () => {
        const { input } = fixture(team, shipClassId);
        const left = ally("a-port", -2000, 0), right = ally("z-starboard", 2000, 0);
        expect(command(input, [right, left])).toEqual(command(input, [left]));
        expect(command(input, [left, right])).toEqual(command(input, [left]));
      });

      it(`${team} ${shipClassId} keeps an acquired local target ahead of capital-ship formation`, () => {
        const { input } = fixture(team, shipClassId);
        const targetInput: Observation = { ...input, contacts: [{
          id: "visible-target", team: team === "player" ? "enemy" : "player", observedAt: 0,
          position: { x: 1400, y: 0, z: 1400 }, heading: 0, speedKnots: 0,
          rangeMeters: Math.hypot(1400, 1400), confidence: 1, estimatedHullRatio: 1,
        }] };
        const friends = [ally("a", -2500, 0), ally("z", 2400, 0)];
        const expected = acquired(targetInput, []);
        expect(expected.perception?.mode).toBe("tracking");
        expect(expected.aiDecision?.targetId).toBe("visible-target");
        expect(acquired(targetInput, friends)).toEqual(expected);
        expect(acquired(targetInput, [...friends].reverse())).toEqual(expected);
      });

      it(`${team} ${shipClassId} keeps capture assignment ahead of capital-ship formation`, () => {
        const { input } = fixture(team, shipClassId);
        const captureInput: Observation = { ...input, gameMode: "battle",
          objective: { ...input.objective, center: { x: 0, y: 0, z: 2000 }, owner: undefined },
          fleetObjective: { duty: "capture", urgent: false, assignedAt: 0, stationIndex: 0 } };
        const near = ally("near", 1000, 500), far = ally("far", -2500, 800);
        const expected = command(captureInput, []);
        expect(expected.aiDecision?.objectiveDuty).toBe("capture");
        expect(expected.aiDecision?.phase).toBe("securing");
        expect(command(captureInput, [far, near])).toEqual(expected);
        expect(command(captureInput, [near, far])).toEqual(expected);
      });

      it(`${team} ${shipClassId} preserves torpedo evasion before formation`, () => {
        const { input } = fixture(team, shipClassId);
        const evasionInput: Observation = { ...input, incomingTorpedoes: [{
          id: 1, armed: true, side: "port", closingSpeedMetersPerSecond: 10, position: { x: 0, y: -1, z: 300 },
          velocity: { x: 10, y: 0, z: 10 }, distanceMeters: 300,
          timeToClosestApproach: 12, closestApproachMeters: 20,
        }] };
        const friends = [ally("near", 1000, 500), ally("far", -2500, 800)];
        const expected = acquired(evasionInput, []);
        expect(expected.aiDecision?.phase).toBe("evading");
        expect(expected.throttle).toBe(1);
        expect(acquired(evasionInput, friends)).toEqual(expected);
        expect(acquired(evasionInput, [...friends].reverse())).toEqual(expected);
      });
    }

    it(`${team} ignores dead, non-finite and self entries for both formation and collision selection`, () => {
      const { input, self } = fixture(team);
      const valid = ally("live", 1000, 500);
      const invalid: FriendlyShipObservation[] = [
        { ...ally("dead", -50, 0), hullRatio: 0 },
        { ...ally("negative-health", -50, 0), hullRatio: -1 },
        { ...ally("unknown-health", -50, 0), hullRatio: NaN },
        { ...ally("bad-heading", -50, 0), heading: NaN },
        { ...ally("bad-speed", -50, 0), speedKnots: Infinity },
        { ...ally("bad-x", -50, 0), position: { x: NaN, y: 0, z: 0 } },
        { ...ally("bad-y", -50, 0), position: { x: -50, y: Infinity, z: 0 } },
        { ...ally("bad-z", -50, 0), position: { x: -50, y: 0, z: -Infinity } },
        ally("self", -50, 0),
      ];
      const expected = command(input, [valid]);
      expect(command(input, [...invalid, valid])).toEqual(expected);
      expect(command(input, [valid, ...invalid].reverse())).toEqual(expected);
      expect(friendlyCollisionRisk(self, invalid)).toBeUndefined();
    });

    it(`${team} breaks equal collision CPA by time before ID`, () => {
      const { input, self } = fixture(team);
      const soon = { ...ally("z-soon", 40, -200), speedKnots: 20 };
      const later = { ...ally("a-later", -40, -400), speedKnots: 20 };
      const expected = friendlyCollisionRisk(self, [soon])!;
      expect(expected.closestApproachMeters).toBe(40);
      expect(friendlyCollisionRisk(self, [later])!.closestApproachMeters).toBe(40);
      expect(expected.timeToClosestApproach).toBeLessThan(friendlyCollisionRisk(self, [later])!.timeToClosestApproach);
      expect(friendlyCollisionRisk(self, [later, soon])).toEqual(expected);
      expect(friendlyCollisionRisk(self, [soon, later])).toEqual(expected);
      expect(command(input, [later, soon])).toEqual(command(input, [soon, later]));
    });

    it(`${team} breaks equal collision CPA and time by stable ID without changing safety priority`, () => {
      const { input, self } = fixture(team);
      const left = ally("a-port", -50, 0), right = ally("z-starboard", 50, 0);
      const expected = friendlyCollisionRisk(self, [left])!;
      expect(friendlyCollisionRisk(self, [right, left])).toEqual(expected);
      expect(friendlyCollisionRisk(self, [left, right])).toEqual(expected);
      const result = command(input, [right, left]);
      expect(result).toEqual(command(input, [left, right]));
      expect(result.aiDecision?.phase).toBe("evading");
      expect(result.aiDecision?.avoidanceReason).toContain(left.id);
      expect(result.aiDecision?.desiredHeading).toBeCloseTo(Math.PI / 2);
    });
  }

  it("still gives a genuinely smaller collision CPA priority over earlier arrival", () => {
    const { self } = fixture();
    const smaller = { ...ally("z-smaller", 30, -400), speedKnots: 20 };
    const earlier = { ...ally("a-earlier", -50, -200), speedKnots: 20 };
    expect(friendlyCollisionRisk(self, [earlier, smaller])?.friendlyId).toBe("z-smaller");
    expect(friendlyCollisionRisk(self, [smaller, earlier])?.friendlyId).toBe("z-smaller");
  });

  it("neither sorts the caller's array nor changes friendly records", () => {
    const { input } = fixture();
    const friends = [ally("z", 2000, 0), ally("a", -2000, 0)];
    const before = structuredClone(friends);
    friends.forEach(friend => { Object.freeze(friend.position); Object.freeze(friend); });
    Object.freeze(friends);
    command(input, friends);
    friendlyCollisionRisk(input.self, friends);
    expect(friends).toEqual(before);
  });
});
