import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyCollisionRisk, RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { AI_TORPEDO, FIXED_STEP } from "../src/sim/config";
import {
  createDeveloperShipState, createInitialState, mainBatteryMountCanBear, observe, stepSimulation,
} from "../src/sim/simulation";
import type { ControlCommand, ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});

function fixture(team: Team, visibleTarget = false) {
  const state = createInitialState(0x82171, "sea-trials");
  state.mapId = "open-sea-range";
  state.airSupport = "none";
  const self = createDeveloperShipState({
    id: "priority-self", team, shipClassId: "richelieu", position: { x: 0, y: 0, z: 0 },
    heading: 0, aiControlled: true, mainGunMounts: 2,
    torpedoLauncherMounts: 0, depthChargeMounts: 0, secondaryGunIds: [],
  });
  const target = createDeveloperShipState({
    id: "priority-target", team: team === "player" ? "enemy" : "player",
    shipClassId: "richelieu", position: { x: 0, y: 0, z: visibleTarget ? 1600 : 6000 },
    heading: 0, mainGunMounts: 0, torpedoLauncherMounts: 0, depthChargeMounts: 0,
    secondaryGunIds: [],
  });
  state.ships = [self, target];
  const ai = new RuleBasedAi(771);
  // Vitest's default spy calls through. This observes only the public call boundary.
  const navigation = vi.spyOn(AiNavigationRecovery.prototype, "command");
  const sample = () => {
    const input = observe(state, self.id);
    const previousCalls = navigation.mock.calls.length;
    const command = ai.command(input);
    expect(navigation.mock.calls.length).toBe(previousCalls + 1);
    const call = navigation.mock.calls.at(-1)!;
    expect(call[0]).toBe(state.mapId);
    expect(call[1]).toBe(self);
    expect(call[3]).toBe(state.time);
    return { input, command, interrupt: call[4] };
  };
  const advance = (command = idle(self)) => stepSimulation(state,
    new Map(state.ships.map(ship => [ship.id, ship.id === self.id ? command : idle(ship)])), FIXED_STEP);
  const advanceIdle = (seconds: number) => {
    for (let tick = 0; tick < Math.ceil(seconds / FIXED_STEP); ++tick) advance();
  };
  return { state, self, target, sample, advance, advanceIdle };
}

afterEach(() => vi.restoreAllMocks());

describe("AI recovery interruption is wired from actual public emergencies", () => {
  for (const team of ["player", "enemy"] as const) {
    it(`${team}: ordinary navigation passes false and does not grant fire authority without a local track`, () => {
      const specimen = fixture(team);
      const { state, self, target, sample, advance, advanceIdle } = specimen;
      const hidden = sample();
      expect(hidden.input.contacts).toHaveLength(0);
      expect(hidden.interrupt).toBe(false);
      expect(hidden.command.fire).toBe(false);

      target.position.z = 1600;
      target.previousPosition = { ...target.position };
      advanceIdle(.6); // Let the real sensor sample, rather than injecting a contact.
      let acquired = false, requestedFire = false;
      for (let tick = 0; tick < 40 / FIXED_STEP; ++tick) {
        const { input, command, interrupt } = sample();
        expect(interrupt).toBe(false);
        if (command.perception?.mode !== "tracking") expect(command.fire).toBe(false);
        acquired ||= command.perception?.mode === "tracking";
        if (command.fire) {
          expect(input.contacts.some(contact => contact.id === target.id)).toBe(true);
          expect(command.perception?.mode).toBe("tracking");
          expect(command.aiDecision?.contactSource).toBe("local");
          expect(self.mainBatteryMounts.some(mount =>
            mainBatteryMountCanBear(self, mount.mountIndex, command.aimPoint))).toBe(true);
          requestedFire = true;
          break;
        }
        advance(command);
      }
      expect(acquired).toBe(true);
      expect(requestedFire).toBe(true);

      state.ships = [self];
      advanceIdle(.6);
      const lost = sample();
      expect(lost.input.contacts).toHaveLength(0);
      expect(lost.interrupt).toBe(false);
      expect(lost.command.fire).toBe(false);
    });

    it(`${team}: a genuinely observed close ally interrupts recovery, then clears when the ally leaves`, () => {
      const { state, self, sample, advanceIdle } = fixture(team);
      expect(sample().interrupt).toBe(false);
      const ally = createDeveloperShipState({
        id: "priority-ally", team, shipClassId: "fletcher", position: { x: 80, y: 0, z: 0 },
        heading: 0, mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [],
      });
      state.ships.push(ally);
      const collision = sample();
      expect(collision.input.friendlies.some(friend => friend.id === ally.id)).toBe(true);
      expect(friendlyCollisionRisk(self, collision.input.friendlies)?.friendlyId).toBe(ally.id);
      expect(collision.interrupt).toBe(true);
      expect(collision.command.aiDecision?.phase).toBe("evading");
      expect(collision.command.aiDecision?.avoidanceReason).toContain(ally.id);
      expect(collision.input.contacts).toHaveLength(0);
      expect(collision.command.fire).toBe(false);

      state.ships = state.ships.filter(ship => ship.id !== ally.id);
      advanceIdle(.6);
      const clear = sample();
      expect(friendlyCollisionRisk(self, clear.input.friendlies)).toBeUndefined();
      expect(clear.interrupt).toBe(false);
      expect(clear.command.aiDecision?.phase).not.toBe("evading");
      expect(clear.command.fire).toBe(false);
    });

    it(`${team}: a real incoming torpedo interrupts only after the existing reaction delay and clears afterward`, () => {
      const { state, self, target, sample, advance, advanceIdle } = fixture(team);
      expect(sample().interrupt).toBe(false);
      state.projectiles.push({
        id: 918, ownerId: target.id, team: target.team, kind: "torpedo",
        position: { x: self.position.x + 500, y: -1, z: self.position.z },
        previousPosition: { x: self.position.x + 500, y: -1, z: self.position.z },
        velocity: { x: -20, y: 0, z: 0 }, damage: 100, age: 10,
        distanceTravelled: 300, armingDistance: 120, maximumRange: 5000, detectionRange: 700,
      });
      const start = state.time;
      let firstInterrupt: number | undefined;
      for (let tick = 0; tick <= (AI_TORPEDO.evasionReactionMaxSeconds + .6) / FIXED_STEP; ++tick) {
        const { input, command, interrupt } = sample();
        expect(input.incomingTorpedoes.some(threat => threat.id === 918)).toBe(true);
        expect(input.contacts).toHaveLength(0);
        expect(command.fire).toBe(false);
        if (state.time - start < AI_TORPEDO.evasionReactionMinSeconds - 1e-6) {
          expect(interrupt).toBe(false);
          expect(command.aiDecision?.phase).not.toBe("evading");
        }
        if (command.aiDecision?.phase === "evading") {
          firstInterrupt ??= state.time - start;
          expect(interrupt).toBe(true);
          expect(command.throttle).toBe(1);
        } else expect(interrupt).toBe(false);
        advance();
      }
      expect(firstInterrupt).toBeDefined();
      expect(firstInterrupt!).toBeGreaterThanOrEqual(AI_TORPEDO.evasionReactionMinSeconds - 1e-6);
      expect(firstInterrupt!).toBeLessThanOrEqual(AI_TORPEDO.evasionReactionMaxSeconds + FIXED_STEP);

      state.projectiles = state.projectiles.filter(projectile => projectile.id !== 918);
      advanceIdle(.6);
      const clear = sample();
      expect(clear.input.incomingTorpedoes).toHaveLength(0);
      expect(clear.interrupt).toBe(false);
      expect(clear.command.aiDecision?.phase).not.toBe("evading");
      expect(clear.command.fire).toBe(false);
    });

    it(`${team}: severe real hull damage interrupts for withdrawal without overriding main-gun concealment permission`, () => {
      const { self, sample, advance, advanceIdle } = fixture(team, true);
      let acquired = false;
      for (let tick = 0; tick < 12 / FIXED_STEP; ++tick) {
        const healthy = sample();
        expect(healthy.interrupt).toBe(false);
        if (healthy.command.perception?.mode === "tracking") { acquired = true; break; }
        advance();
      }
      expect(acquired).toBe(true);
      self.hull = self.maxHull * .2;
      self.recoverableHull = self.hull;
      const damaged = sample();
      expect(damaged.input.contacts.length).toBeGreaterThan(0);
      expect(damaged.interrupt).toBe(true);
      expect(damaged.command.aiDecision?.phase).toBe("withdrawing");
      expect(damaged.command.throttle).toBeLessThanOrEqual(.52);
      expect(damaged.command.fire).toBe(false);

      self.hull = self.maxHull;
      self.recoverableHull = self.maxHull;
      advanceIdle(.6);
      const restored = sample();
      expect(restored.interrupt).toBe(false);
      expect(restored.command.aiDecision?.phase).not.toBe("withdrawing");
    });
  }
});
