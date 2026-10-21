import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyCollisionRisk, RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { AI_TORPEDO, FIXED_STEP, SENSOR } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState): ControlCommand => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } });
function fixture(team: Team) {
  const state = createInitialState(0x821211, "sea-trials");
  state.mapId = "open-sea-range";
  state.airSupport = "none";
  state.airSquadrons = [];
  const self = createDeveloperShipState({ id: "withdrawal-self", team, shipClassId: "edinburgh",
    position: { x: 0, y: 0, z: 0 }, heading: 0, aiControlled: true,
    torpedoLauncherMounts: 0, depthChargeMounts: 0, secondaryGunIds: [] });
  const otherTeam = team === "player" ? "enemy" : "player";
  const targets = ["a", "b"].map((suffix, index) => createDeveloperShipState({
    id: "withdrawal-target-" + suffix, team: otherTeam, shipClassId: "edinburgh",
    position: { x: 5600, y: 0, z: 5600 - index * 300 }, heading: 0,
    mainGunMounts: 0, torpedoLauncherMounts: 0, depthChargeMounts: 0, secondaryGunIds: [],
  }));
  state.ships = [self, ...targets];
  const ai = new RuleBasedAi(7121);
  const navigation = vi.spyOn(AiNavigationRecovery.prototype, "command"); // Real call-through.
  const sample = () => {
    const input = observe(state, self.id), calls = navigation.mock.calls.length;
    const command = ai.command(input);
    expect(navigation.mock.calls.length).toBe(calls + 1);
    const call = navigation.mock.calls.at(-1)!;
    expect(call[1]).toBe(self);
    expect(call[3]).toBe(state.time);
    return { input, command, interrupt: call[4] };
  };
  const advance = (seconds = FIXED_STEP) => {
    for (let tick = 0; tick < Math.ceil(seconds / FIXED_STEP); ++tick) {
      stepSimulation(state, new Map(state.ships.map(ship => [ship.id, idle(ship)])), FIXED_STEP);
    }
  };
  const damage = () => { self.hull = self.maxHull * .2; self.recoverableHull = self.hull; };
  const show = (index: number | undefined) => {
    for (const [i, ship] of targets.entries()) {
      ship.position = i === index ? { x: 0, y: 0, z: 1800 } : { x: 5600, y: 0, z: 5600 - i * 300 };
      ship.previousPosition = { ...ship.position };
    }
    advance(SENSOR.observationIntervalSeconds + FIXED_STEP);
  };
  return { state, self, targets, sample, advance, damage, show };
}

afterEach(() => vi.restoreAllMocks());

describe("withdrawal invalidates a recovery intent only when it actually changes", () => {
  for (const team of ["player", "enemy"] as const) {
    it(team + ": sustained damage without a known target is one interruption; recovery and re-injury reset it", () => {
      const { self, sample, advance, damage } = fixture(team);
      expect(sample().interrupt).toBe(false);
      damage();
      const first = sample();
      expect(first.input.contacts).toHaveLength(0);
      expect(first.command.aiDecision?.targetId).toBeUndefined();
      expect(first.interrupt).toBe(true);
      for (let tick = 0; tick < 40; ++tick) {
        advance();
        const steady = sample();
        expect(steady.interrupt).toBe(false);
        expect(steady.command.aiDecision?.phase).toBe("withdrawing");
        expect(steady.command.throttle).toBeLessThanOrEqual(.52);
        expect(steady.command.fire).toBe(false);
      }
      self.hull = self.maxHull; self.recoverableHull = self.maxHull;
      expect(sample().interrupt).toBe(false);
      damage();
      expect(sample().interrupt).toBe(true);
      expect(sample().interrupt).toBe(false);
    });

    it(team + ": acquisition, true target switch, expiry and reacquisition invalidate once without granting fire", () => {
      const { targets, sample, advance, damage, show } = fixture(team);
      damage();
      expect(sample().interrupt).toBe(true);
      expect(sample().interrupt).toBe(false);
      const expectThreat = (index: number, changed: boolean) => {
        const result = sample();
        expect(result.input.contacts.some(c => c.id === targets[index]!.id)).toBe(true);
        expect(result.command.aiDecision?.targetId).toBe(targets[index]!.id);
        expect(result.interrupt).toBe(changed);
        expect(result.command.aiDecision?.phase).toBe("withdrawing");
        expect(result.command.throttle).toBeLessThanOrEqual(.52);
        expect(result.command.fire).toBe(false);
        return result;
      };
      show(0); expectThreat(0, true);
      // Same identity while the real optical director acquires fresh samples.
      let acquired = false;
      for (let tick = 0; tick < 12 / FIXED_STEP; ++tick) {
        const steady = expectThreat(0, false);
        acquired ||= steady.command.perception?.mode === "tracking";
        advance();
      }
      expect(acquired).toBe(true);
      show(1); expectThreat(1, true); expectThreat(1, false);
      show(undefined);
      const lostOptics = sample();
      expect(lostOptics.input.contacts).toHaveLength(0);
      expect(lostOptics.command.aiDecision?.targetId).toBe(targets[1]!.id);
      expect(lostOptics.interrupt).toBe(false); // Same known threat remains in bounded memory.
      expect(lostOptics.command.fire).toBe(false);
      advance(SENSOR.memorySeconds + SENSOR.observationIntervalSeconds);
      const expired = sample();
      expect(expired.command.aiDecision?.targetId).toBeUndefined();
      expect(expired.interrupt).toBe(true);
      expect(expired.command.fire).toBe(false);
      expect(sample().interrupt).toBe(false);
      show(1); expectThreat(1, true); expectThreat(1, false);
    });

    it(team + ": an observed collision risk keeps interrupting every frame during withdrawal", () => {
      const { state, self, sample, advance, damage } = fixture(team);
      damage(); expect(sample().interrupt).toBe(true); expect(sample().interrupt).toBe(false);
      const ally = createDeveloperShipState({ id: "withdrawal-ally", team, shipClassId: "fletcher",
        position: { x: 80, y: 0, z: 0 }, heading: 0, mainGunMounts: 0,
        torpedoLauncherMounts: 0, secondaryGunIds: [] });
      state.ships.push(ally);
      for (let tick = 0; tick < 40; ++tick) {
        const danger = sample();
        expect(friendlyCollisionRisk(self, danger.input.friendlies)?.friendlyId).toBe(ally.id);
        expect(danger.interrupt).toBe(true);
        expect(danger.command.aiDecision?.phase).toBe("evading");
        expect(danger.command.fire).toBe(false);
        advance();
      }
      state.ships = state.ships.filter(ship => ship.id !== ally.id);
      advance(SENSOR.observationIntervalSeconds + FIXED_STEP);
      expect(sample().interrupt).toBe(false);
    });

    it(team + ": a real torpedo keeps priority after its reaction delay, then releases to the same withdrawal", () => {
      const { state, targets, sample, advance, damage } = fixture(team);
      damage(); expect(sample().interrupt).toBe(true); expect(sample().interrupt).toBe(false);
      state.projectiles.push({ id: 81211, ownerId: targets[0]!.id, team: targets[0]!.team, kind: "torpedo",
        position: { x: 500, y: -1, z: 0 }, previousPosition: { x: 500, y: -1, z: 0 },
        velocity: { x: -20, y: 0, z: 0 }, damage: 100, age: 10,
        distanceTravelled: 300, armingDistance: 120, maximumRange: 5000, detectionRange: 700 });
      const start = state.time;
      let firstReaction: number | undefined, reactingFrames = 0;
      for (let tick = 0; tick < (AI_TORPEDO.evasionReactionMaxSeconds + 1) / FIXED_STEP; ++tick) {
        const result = sample();
        expect(result.input.incomingTorpedoes.some(t => t.id === 81211)).toBe(true);
        expect(result.command.fire).toBe(false);
        if (result.command.aiDecision?.phase === "evading") {
          firstReaction ??= state.time - start; ++reactingFrames;
          expect(result.interrupt).toBe(true);
        } else expect(result.interrupt).toBe(false);
        // The existing damaged-ship speed cap stays in force even during evasion.
        expect(result.command.throttle).toBeLessThanOrEqual(.52);
        advance();
      }
      expect(firstReaction).toBeGreaterThanOrEqual(AI_TORPEDO.evasionReactionMinSeconds - 1e-6);
      expect(firstReaction).toBeLessThanOrEqual(AI_TORPEDO.evasionReactionMaxSeconds + FIXED_STEP);
      expect(reactingFrames).toBeGreaterThan(30);
      state.projectiles = state.projectiles.filter(p => p.id !== 81211);
      advance(SENSOR.observationIntervalSeconds + FIXED_STEP);
      expect(sample().interrupt).toBe(false);
    });
  }
});
