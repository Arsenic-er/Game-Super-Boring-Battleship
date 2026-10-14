import { describe, expect, it } from "vitest";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP } from "../src/sim/config";
import type { BattleState, ShipState } from "../src/sim/types";
import { createFleetCalibration, fleetCalibrationStateHash } from "./helpers/fleetCalibration";
import { FleetPacingMetrics, hasEstimatedFiringOpportunity } from "./helpers/fleetPacingMetrics";

function state(): BattleState {
  return createFleetCalibration({ teamSize: 5, seed: 0x71501, weather: "sea-fog" });
}
function localTrack(ship: ShipState): void {
  ship.aiDecision = { role: "screen", phase: "engaging", desiredHeading: ship.heading,
    throttle: 0, fireIntent: false, contactSource: "local", targetId: "unresolved-contact",
    objectiveDuty: "support" };
  ship.perception = { mode: "tracking", confidence: .8,
    estimatedPosition: { ...ship.position, z: ship.position.z + 1200 } };
  ship.mainBatteryMounts.forEach(mount => { mount.reloadRemaining = 0; });
}
const shot = (id: string) => ({ ownerId: id, kind: "shell" as const, weaponSource: "mainGun" as const });

describe("read-only fleet pacing telemetry", () => {
  it("counts alive time through the sinking interval, then freezes shot inactivity for a dead ship", () => {
    const s = state(), ship = s.ships[0]!, meter = new FleetPacingMetrics(s);
    localTrack(ship);
    s.time = 10; meter.update(s, []);
    s.time = 15; meter.update(s, [shot(ship.id), shot(ship.id)]);
    ship.hull = 0;
    s.time = 20; meter.update(s, []);
    s.time = 30; meter.update(s, []);
    const row = meter.report().ships[0]!;
    expect(row).toMatchObject({ aliveSeconds: 20, mainGunShots: 2, lastShotSeconds: 15,
      lastShotAliveSeconds: 15, secondsAliveSinceLastShot: 5, longestNoShotSeconds: 15,
      shotInactivityFraction: .25, captureDutySeconds: 0, supportDutySeconds: 20 });
  });

  it("reports absence of contact without declaring that every ship must shoot", () => {
    const s = state(), meter = new FleetPacingMetrics(s);
    s.time = 100; meter.update(s, []);
    expect(meter.report().ships[0]).toMatchObject({ aliveSeconds: 100,
      localContactSeconds: 0, estimatedFiringOpportunitySeconds: 0, mainGunShots: 0,
      longestNoShotSeconds: 100, secondsAliveSinceLastShot: 100, shotInactivityFraction: 1 });
  });

  it("separates acquiring, local tracking, radio and memory instead of consulting the target entity", () => {
    const s = state(), ship = s.ships[0]!, meter = new FleetPacingMetrics(s);
    localTrack(ship);
    expect(s.ships.some(other => other.id === ship.aiDecision!.targetId)).toBe(false);
    ship.perception!.mode = "acquiring";
    s.time = 2; meter.update(s, []);
    ship.perception!.mode = "tracking"; ship.aiDecision!.fireIntent = true;
    s.time = 5; meter.update(s, []);
    ship.aiDecision!.contactSource = "radio";
    s.time = 9; meter.update(s, []);
    ship.aiDecision!.contactSource = "memory"; ship.aiDecision!.fireIntent = false;
    s.time = 12; meter.update(s, []);
    expect(meter.report().ships[0]).toMatchObject({ localContactSeconds: 5,
      estimatedFiringOpportunitySeconds: 3, fireIntentSeconds: 7 });
  });

  it("keeps the firing-opportunity estimate bounded by own gun state and estimated range", () => {
    const s = state(), ship = s.ships[0]!;
    localTrack(ship);
    expect(hasEstimatedFiringOpportunity(ship)).toBe(true);
    ship.mainBatteryMounts.forEach(mount => { mount.reloadRemaining = 3; });
    expect(hasEstimatedFiringOpportunity(ship)).toBe(false);
    ship.mainBatteryMounts[0]!.reloadRemaining = 0;
    ship.mainBatteryMounts[0]!.health = 0;
    expect(hasEstimatedFiringOpportunity(ship)).toBe(false);
    ship.mainBatteryMounts[0]!.health = 100;
    ship.modules.gun.health = 0;
    expect(hasEstimatedFiringOpportunity(ship)).toBe(false);
    ship.modules.gun.health = ship.modules.gun.maxHealth;
    ship.perception!.estimatedPosition!.z = ship.position.z + 100_000;
    expect(hasEstimatedFiringOpportunity(ship)).toBe(false);
    ship.perception!.estimatedPosition!.z = ship.position.z;
    expect(hasEstimatedFiringOpportunity(ship)).toBe(false);
    ship.perception!.estimatedPosition!.z = NaN;
    expect(hasEstimatedFiringOpportunity(ship)).toBe(false);
    ship.perception!.estimatedPosition!.z = ship.position.z + 1200;
    ship.mainGunMounts = 0;
    ship.installedEquipment.mainGun.fill(null);
    expect(hasEstimatedFiringOpportunity(ship)).toBe(false);
  });

  it("does not let secondary, torpedo or aircraft weapons reset the main-gun clock", () => {
    const s = state(), ship = s.ships[0]!, meter = new FleetPacingMetrics(s);
    s.time = 10; meter.update(s, [
      { ownerId: ship.id, kind: "shell", weaponSource: "secondary" },
      { ownerId: ship.id, kind: "torpedo", weaponSource: "mainGun" },
      { ownerId: ship.id, kind: "shell", weaponSource: "aircraft" },
      shot("unknown-entity"),
    ]);
    expect(meter.report().ships[0]).toMatchObject({ mainGunShots: 0,
      lastShotSeconds: null, secondsAliveSinceLastShot: 10, longestNoShotSeconds: 10 });
  });

  it("splits capture and support duties and groups by team, weather and hull type", () => {
    const s = state(), ship = s.ships[0]!, meter = new FleetPacingMetrics(s);
    localTrack(ship);
    ship.aiDecision!.objectiveDuty = "capture";
    s.time = 3; meter.update(s, []);
    ship.aiDecision!.objectiveDuty = "support";
    s.time = 8; meter.update(s, [shot(ship.id)]);
    const report = meter.report();
    expect(report.ships[0]).toMatchObject({ captureDutySeconds: 3, supportDutySeconds: 5 });
    const group = report.groups.find(item => item.team === ship.team && item.hullId === ship.hullId)!;
    const members = s.ships.filter(item => item.team === ship.team && item.hullId === ship.hullId);
    expect(group).toMatchObject({ weather: "sea-fog", shipCount: members.length,
      aliveSeconds: members.length * 8, captureDutySeconds: 3, supportDutySeconds: 5,
      mainGunShots: 1, shipsWithoutMainGunFire: members.length - 1 });
  });

  it("samples 900 and 1050 second milestones once, including fixed-step roundoff", () => {
    const s = state(), meter = new FleetPacingMetrics(s);
    s.time = 899; meter.update(s, []);
    expect(meter.report().milestones).toEqual([]);
    s.time = 900 - 1e-8; s.objective.scores.player = 321;
    s.ships[0]!.hull = 0; meter.update(s, []);
    s.time = 900 + FIXED_STEP; meter.update(s, []);
    s.time = 1050; s.objective.scores.enemy = 456; meter.update(s, []);
    const milestones = meter.report().milestones;
    expect(milestones).toHaveLength(2);
    expect(milestones[0]).toMatchObject({ scheduledSeconds: 900, sampledSeconds: 900,
      teams: { player: { score: 321, aliveShips: 4 }, enemy: { aliveShips: 5 } } });
    expect(milestones[1]).toMatchObject({ scheduledSeconds: 1050,
      teams: { enemy: { score: 456, aliveShips: 5 } } });
    s.objective.scores.player = 0;
    expect(meter.report().milestones[0]!.teams.player.score).toBe(321);
  });

  it("does not invent a future milestone after an early battle end", () => {
    const s = state(), meter = new FleetPacingMetrics(s);
    s.time = 899; s.status = "player-won"; meter.update(s, []);
    for (let i = 0; i < 120; ++i) meter.update(s, []);
    s.time = 1100; meter.update(s, []);
    expect(meter.report().milestones).toEqual([]);
    expect(meter.report().ships[0]!.aliveSeconds).toBe(899);
  });

  it("makes duplicate ticks idempotent and rejects backwards time without altering counters", () => {
    const s = state(), meter = new FleetPacingMetrics(s);
    s.time = 2; meter.update(s, [shot(s.ships[0]!.id)]);
    const original = meter.report();
    meter.update(s, [shot(s.ships[0]!.id)]);
    expect(meter.report()).toEqual(original);
    s.time = 1;
    expect(() => meter.update(s, [])).toThrow("monotonic");
    expect(meter.report()).toEqual(original);
  });

  it("returns detached report objects", () => {
    const s = state(), meter = new FleetPacingMetrics(s);
    s.time = 900; meter.update(s, []);
    const original = meter.report(), modified = meter.report();
    modified.ships[0]!.aliveSeconds = -99;
    modified.groups[0]!.mainGunShots = -99;
    modified.milestones[0]!.teams.player.score = -99;
    expect(meter.report()).toEqual(original);
  });

  it("never mutates authoritative state or changes exact simulation results", () => {
    const tracked = state(), plain = state(), meter = new FleetPacingMetrics(tracked);
    const sessions = [new LocalBattleSession(tracked), new LocalBattleSession(plain)];
    for (let tick = 0; tick < 120; ++tick) {
      const output = sessions[0]!.step(new Map(), FIXED_STEP);
      sessions[1]!.step(new Map(), FIXED_STEP);
      const before = fleetCalibrationStateHash(tracked);
      meter.update(tracked, output.shots); meter.report();
      expect(fleetCalibrationStateHash(tracked)).toBe(before);
    }
    expect(fleetCalibrationStateHash(tracked)).toBe(fleetCalibrationStateHash(plain));
  });
});
