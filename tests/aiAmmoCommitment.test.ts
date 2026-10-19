import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import { FIXED_STEP, SENSOR } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, mainBatteryMountCanBear, observe, stepSimulation } from "../src/sim/simulation";
import type { AmmoType, ControlCommand, Observation, SensorContact, Team } from "../src/sim/types";

function fixture(team: Team) {
  const state = createInitialState(77, "sea-trials");
  state.mapId = "open-sea-range"; state.airSupport = "none"; state.airSquadrons = [];
  const ship = createDeveloperShipState({ id: "slow-battery", team, shipClassId: "richelieu",
    position: { x: 0, y: 0, z: 0 }, heading: 0, aiControlled: true,
    torpedoLauncherMounts: 0, secondaryGunIds: [] });
  state.ships = [ship];
  // Keep sea trials alive when the isolated gunner belongs to the enemy team.
  if (team === "enemy") state.ships.push(createDeveloperShipState({ id: "status-marker", team: "player",
    shipClassId: "fletcher", position: { x: -5500, y: 0, z: -5500 }, heading: 0,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] }));
  const base = observe(state, ship.id);
  return { state, ship, base };
}

/**
 * Public contact stimuli isolate ammunition policy timing. Changes of range
 * and broadside are deliberate test inputs, not claimed physical trajectories
 * or a complete optical-sensor replay. No private AI timers/state, fire flags,
 * movement outputs, mount reloads or ammo counts are injected.
 */
function run(team: Team, changing: "aspect" | "range") {
  const { state, ship, base } = fixture(team), ai = new RuleBasedAi(77);
  const events: Array<{ time: number; command?: AmmoType; loaded: AmmoType; pending?: AmmoType; reload: number }> = [];
  let shells = 0, fireIntentSeconds = 0, trackingSeconds = 0, pendingCancellations = 0;
  let firstShot: number | null = null, firstSwitchAt: number | null = null, previousAmmo: AmmoType | undefined;
  const shellTypes: AmmoType[] = [];
  for (let tick = 0; tick < 120 / FIXED_STEP; ++tick) {
    const phase = Math.floor(state.time / 20) % 2;
    const range = changing === "range" && phase ? 3300 : 2500;
    const bearing = ship.heading;
    const contact: SensorContact = {
      id: "maneuvering-contact", team: team === "player" ? "enemy" : "player",
      observedAt: Math.floor(state.time / SENSOR.observationIntervalSeconds) * SENSOR.observationIntervalSeconds,
      position: { x: ship.position.x + Math.sin(bearing) * range, y: 0, z: ship.position.z + Math.cos(bearing) * range },
      heading: bearing + (changing === "aspect" && phase ? 0 : Math.PI / 2), speedKnots: 0,
      rangeMeters: range, confidence: 1, estimatedHullRatio: 1,
    };
    const observation: Observation = { ...base, self: ship, time: state.time,
      contacts: [contact], friendlies: [], sharedContacts: [] };
    const command = ai.command(observation);
    if (command.perception?.mode === "tracking") {
      trackingSeconds += FIXED_STEP;
      expect(ship.mainBatteryMounts.some(mount => mainBatteryMountCanBear(ship, mount.mountIndex, command.aimPoint))).toBe(true);
    }
    if (command.fire) fireIntentSeconds += FIXED_STEP;
    if (ship.pendingAmmoType && ship.reloadRemaining > 0 && command.ammoType === ship.ammoType) {
      ++pendingCancellations;
    }
    if (firstSwitchAt === null && command.ammoType === "ap" && ship.ammoType === "he") firstSwitchAt = state.time;
    if (command.ammoType !== previousAmmo) {
      events.push({ time: state.time, command: command.ammoType, loaded: ship.ammoType,
        pending: ship.pendingAmmoType, reload: ship.reloadRemaining });
      previousAmmo = command.ammoType;
    }
    // Real simulation consumes the COMPLETE AI command, including navigation.
    stepSimulation(state, new Map([[ship.id, command]]), FIXED_STEP);
    const shots = state.shots.filter(shot => shot.ownerId === ship.id && shot.weaponSource === "mainGun");
    if (shots.length) { if (firstShot === null) firstShot = state.time; shells += shots.length;
      for (const shot of shots) if (shot.ammoType) shellTypes.push(shot.ammoType); }
  }
  expect(effectiveMainBattery(ship).reloadSeconds).toBe(40);
  expect(ship.performance.reloadMultiplier).toBe(1);
  expect(ship.developer?.enabled ?? false).toBe(false);
  expect(state.status).toBe("running");
  const result = { team, changing, shells, firstShot, firstSwitchAt, shellTypes, fireIntentSeconds, trackingSeconds, pendingCancellations, events };
  if (process.env.AMMO_COMMITMENT_REPORT === "1") console.log("AMMO_COMMITMENT", JSON.stringify(result));
  return result;
}

describe("AI ammunition commitment for slow batteries", () => {
  for (const team of ["player", "enemy"] as const) for (const changing of ["aspect", "range"] as const) {
    it(team + " completes a usable slow reload despite repeated target " + changing + " changes", () => {
      const result = run(team, changing);
      expect(result.trackingSeconds).toBeGreaterThan(112);
      expect(result.fireIntentSeconds).toBeGreaterThan(10);
      expect(result.shells, "valid tracking and fire windows must produce actual shells, not endless cancelled reloads").toBeGreaterThan(0);
      expect(result.pendingCancellations, "finish the current shell change before reconsidering it").toBe(0);
      expect(result.shellTypes).toContain("ap");
      expect(result.firstSwitchAt).not.toBeNull();
      expect(result.firstShot!).toBeGreaterThanOrEqual(result.firstSwitchAt! + 40 - FIXED_STEP * 2);
    }, 15000);
  }
});

type Specimen = ReturnType<typeof fixture>;
type Stimulus = { range?: number; broadside?: boolean; astern?: boolean; id?: string };
function stimulus(specimen: Specimen, target?: Stimulus): Observation {
  const { state, ship, base } = specimen;
  const bearing = ship.heading + (target?.astern ? Math.PI : 0), range = target?.range ?? 2500;
  const contacts: SensorContact[] = target ? [{
    id: target.id ?? "public-track", team: ship.team === "player" ? "enemy" : "player",
    observedAt: Math.floor(state.time / SENSOR.observationIntervalSeconds) * SENSOR.observationIntervalSeconds,
    position: { x: ship.position.x + Math.sin(bearing) * range, y: 0,
      z: ship.position.z + Math.cos(bearing) * range },
    heading: bearing + (target.broadside ? Math.PI / 2 : 0), speedKnots: 0,
    rangeMeters: range, confidence: 1, estimatedHullRatio: 1,
  }] : [];
  return { ...base, self: ship, time: state.time, contacts, friendlies: [], sharedContacts: [] };
}
function tick(specimen: Specimen, ai: RuleBasedAi, target?: Stimulus) {
  const command = ai.command(stimulus(specimen, target));
  stepSimulation(specimen.state, new Map([[specimen.ship.id, command]]), FIXED_STEP);
  const shots = specimen.state.shots.filter(shot => shot.ownerId === specimen.ship.id && shot.weaponSource === "mainGun");
  return { command, shots };
}
function idleInput(specimen: Specimen, ammoType: AmmoType): ControlCommand {
  return { throttle: 0, rudder: 0, fire: false, ammoType,
    aimPoint: { x: specimen.ship.position.x, y: 3, z: specimen.ship.position.z + 2500 } };
}
function finishChangeWithoutContact(specimen: Specimen, ai: RuleBasedAi) {
  for (let tickIndex = 0; tickIndex < 10 / FIXED_STEP && !specimen.ship.pendingAmmoType; ++tickIndex) {
    tick(specimen, ai, { broadside: true });
  }
  expect(specimen.ship.pendingAmmoType).toBe("ap");
  const started = specimen.state.time;
  while (specimen.state.time - started < 41) {
    const { command, shots } = tick(specimen, ai);
    expect(command.ammoType).toBe("ap");
    expect(command.fire).toBe(false);
    expect(shots).toHaveLength(0);
  }
  expect(specimen.ship.pendingAmmoType).toBeUndefined();
  expect(specimen.ship.ammoType).toBe("ap");
}

describe("AI ammunition commitment respects actual outcomes and public ownership changes", () => {
  it("retains the in-flight shell change when a different locally tracked target is acquired", () => {
    const specimen = fixture("player"), ai = new RuleBasedAi(77);
    let actualAP = false, trackedReplacement = false;
    for (let index = 0; index < 100 / FIXED_STEP; ++index) {
      const replace = specimen.state.time >= 12;
      const pending = specimen.ship.pendingAmmoType;
      const { command, shots } = tick(specimen, ai, { id: replace ? "replacement-target" : "original-target",
        broadside: !replace });
      if (pending === "ap" || (replace && specimen.ship.ammoType === "ap" && !actualAP)) {
        expect(command.ammoType).toBe("ap");
      }
      trackedReplacement ||= command.aiDecision?.targetId === "replacement-target"
        && command.perception?.mode === "tracking";
      actualAP ||= shots.some(shot => shot.ammoType === "ap");
    }
    expect(trackedReplacement).toBe(true);
    expect(actualAP).toBe(true);
  });

  it("finishes a genuine equipment-slowed reload without reducing its duration", () => {
    const specimen = fixture("player"), ai = new RuleBasedAi(77);
    specimen.ship.performance.reloadMultiplier = 1.2;
    let firstRequest: number | null = null, firstAP: number | null = null;
    for (let index = 0; index < 110 / FIXED_STEP; ++index) {
      const before = specimen.state.time;
      const { command, shots } = tick(specimen, ai, { broadside: before < 10 });
      if (command.ammoType === "ap") firstRequest ??= before;
      if (shots.some(shot => shot.ammoType === "ap")) firstAP ??= specimen.state.time;
    }
    expect(firstRequest).not.toBeNull();
    expect(firstAP).not.toBeNull();
    expect(firstAP!).toBeGreaterThanOrEqual(firstRequest! + 48 - FIXED_STEP * 2);
    expect(effectiveMainBattery(specimen.ship).reloadSeconds).toBe(40);
    expect(specimen.ship.performance.reloadMultiplier).toBe(1.2);
  });

  it("keeps completed AP through closed fire windows, then permits a new choice after an actual AP salvo", () => {
    const specimen = fixture("player"), ai = new RuleBasedAi(77);
    let firstAP: number | null = null, afterShotHE = false, loadedWithoutWindow = 0;
    for (let index = 0; index < 110 / FIXED_STEP; ++index) {
      const before = specimen.ship.lastMainGunFiredAt;
      const loadedReady = specimen.ship.ammoType === "ap" && !specimen.ship.pendingAmmoType;
      const { command, shots } = tick(specimen, ai, { broadside: specimen.state.time < 10 });
      if (loadedReady && firstAP === null) {
        expect(command.ammoType).toBe("ap");
        if (!command.fire) loadedWithoutWindow += FIXED_STEP;
      }
      if (shots.some(shot => shot.ammoType === "ap")) firstAP ??= specimen.state.time;
      if (firstAP !== null && before !== undefined && command.ammoType === "he") afterShotHE = true;
    }
    expect(loadedWithoutWindow).toBeGreaterThan(0);
    expect(firstAP).not.toBeNull();
    expect(afterShotHE).toBe(true);
  });

  for (const obstruction of ["arc", "destroyed-gun"] as const) {
    it("does not acknowledge an unfired shell after " + obstruction + " blocks a valid track", () => {
      const specimen = fixture("player"), ai = new RuleBasedAi(77);
      finishChangeWithoutContact(specimen, ai);
      if (obstruction === "destroyed-gun") specimen.ship.modules.gun.health = 0;
      let fireIntentSeconds = 0;
      for (let index = 0; index < 30 / FIXED_STEP; ++index) {
        const { command, shots } = tick(specimen, ai, { astern: obstruction === "arc" });
        expect(command.ammoType).toBe("ap");
        expect(shots).toHaveLength(0);
        if (command.fire) fireIntentSeconds += FIXED_STEP;
      }
      if (obstruction === "destroyed-gun") expect(fireIntentSeconds).toBeGreaterThan(0);
      else expect(fireIntentSeconds).toBe(0);
      specimen.ship.modules.gun.health = specimen.ship.modules.gun.maxHealth;
      let actualAP = false;
      for (let index = 0; index < 45 / FIXED_STEP; ++index) {
        const { command, shots } = tick(specimen, ai, {});
        if (!actualAP) expect(command.ammoType).toBe("ap");
        actualAP ||= shots.some(shot => shot.ammoType === "ap");
      }
      expect(actualAP).toBe(true);
    });
  }

  it("adopts loaded AP on takeover and respects a later human pending change and cancellation", () => {
    const specimen = fixture("player");
    specimen.ship.ammoType = "ap"; // Public saved/handed-over state, not an AI-private field.
    const ai = new RuleBasedAi(77);
    expect(ai.command(stimulus(specimen)).ammoType).toBe("ap");
    stepSimulation(specimen.state, new Map([[specimen.ship.id, idleInput(specimen, "he")]]), FIXED_STEP);
    expect(specimen.ship.pendingAmmoType).toBe("he");
    expect(tick(specimen, ai).command.ammoType).toBe("he");
    stepSimulation(specimen.state, new Map([[specimen.ship.id, idleInput(specimen, "ap")]]), FIXED_STEP);
    expect(specimen.ship.pendingAmmoType).toBeUndefined();
    expect(tick(specimen, ai).command.ammoType).toBe("ap");
    // A human can finish another change while the same AI instance is inactive.
    for (let index = 0; index < 41 / FIXED_STEP; ++index) {
      stepSimulation(specimen.state, new Map([[specimen.ship.id, idleInput(specimen, "he")]]), FIXED_STEP);
    }
    expect(specimen.ship.ammoType).toBe("he");
    expect(tick(specimen, ai).command.ammoType).toBe("he");
  });

  it("does not acknowledge an old-HE partial-turret salvo while AP remains pending", () => {
    const specimen = fixture("player"), ai = new RuleBasedAi(77);
    // Public serialized battery state: one old-ammo turret is ready before its
    // partner. This characterizes ownership bookkeeping, not switch duration.
    specimen.ship.pendingAmmoType = "ap";
    specimen.ship.mainBatteryMounts[0]!.reloadRemaining = 0;
    specimen.ship.mainBatteryMounts[1]!.reloadRemaining = 10;
    specimen.ship.reloadRemaining = 10;
    expect(ai.command(stimulus(specimen)).ammoType).toBe("ap");
    stepSimulation(specimen.state, new Map([[specimen.ship.id, {
      ...idleInput(specimen, "ap"), fire: true,
    }]]), FIXED_STEP);
    expect(specimen.state.shots.filter(shot => shot.weaponSource === "mainGun").map(shot => shot.ammoType))
      .toEqual(["he", "he", "he", "he"]);
    expect(specimen.ship.pendingAmmoType).toBe("ap");
    for (let index = 0; index < 41 / FIXED_STEP; ++index) tick(specimen, ai);
    expect(specimen.ship.ammoType).toBe("ap");
    let actualAP = false;
    for (let index = 0; index < 35 / FIXED_STEP; ++index) {
      const { command, shots } = tick(specimen, ai, {});
      if (!actualAP) expect(command.ammoType).toBe("ap");
      actualAP ||= shots.some(shot => shot.ammoType === "ap");
    }
    expect(actualAP).toBe(true);
  });

  it("acknowledges a real new-AP salvo on the exact frame that pending AP completes", () => {
    const specimen = fixture("player"), ai = new RuleBasedAi(77);
    specimen.ship.pendingAmmoType = "ap";
    for (const mount of specimen.ship.mainBatteryMounts) mount.reloadRemaining = 8;
    specimen.ship.reloadRemaining = 8;
    let simultaneousCommitAndShot = false, choseHEAfter = false;
    for (let index = 0; index < 50 / FIXED_STEP; ++index) {
      const wasPending = specimen.ship.pendingAmmoType === "ap";
      const { command, shots } = tick(specimen, ai, {});
      if (wasPending && specimen.ship.ammoType === "ap" && shots.some(shot => shot.ammoType === "ap")) {
        simultaneousCommitAndShot = true;
      }
      if (simultaneousCommitAndShot && command.ammoType === "he") choseHEAfter = true;
    }
    expect(simultaneousCommitAndShot).toBe(true);
    expect(choseHEAfter).toBe(true);
  });
});
