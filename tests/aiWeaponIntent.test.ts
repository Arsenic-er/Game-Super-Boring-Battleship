import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { FIXED_STEP, GUN, SENSOR, TORPEDO } from "../src/sim/config";
import { createInitialState, observe, stepSimulation, torpedoLaunchSolution } from "../src/sim/simulation";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import type { ShipClassId } from "../src/ships/classes";
import type { MainGunId } from "../src/ships/components";
import type { BattleState, ControlCommand, Observation, SensorContact, Team } from "../src/sim/types";

function fixture(classId: ShipClassId = "fletcher", gun: MainGunId = "mk1-single", team: Team = "player") {
  const state = createInitialState(77, "sea-trials", gun, undefined, undefined, classId);
  state.mapId = "open-sea-range";
  const ship = state.ships[0]!;
  state.ships = [ship];
  ship.team = team;
  ship.position = { x: 0, y: 0, z: 0 };
  ship.previousPosition = { ...ship.position };
  ship.heading = 0;
  ship.speedKnots = 0;
  ship.torpedoesLoaded = 0;
  ship.aimPoint = { x: 0, y: 3, z: 1_200 };
  for (const mount of ship.mainBatteryMounts) mount.heading = mount.restHeadingOffset;
  // Sea trials still end on player-team elimination. Keep a remote survivor
  // when testing an enemy shooter so the real simulation can advance normally.
  if (team === "enemy") state.ships.push({ ...structuredClone(ship), id: "remote-player", team: "player",
    position: { x: 8_000, y: 0, z: -8_000 }, previousPosition: { x: 8_000, y: 0, z: -8_000 },
    mainBatteryMounts: [], secondaryMounts: [], isTestTarget: true });
  const base = observe(state, ship.id);
  const contact = (time: number, x: number, z: number, patch: Partial<SensorContact> = {}): SensorContact => ({
    id: "target", team: team === "player" ? "enemy" : "player", observedAt: time,
    position: { x, y: 0, z }, heading: 0, speedKnots: 0,
    rangeMeters: Math.hypot(x, z), confidence: 1, estimatedHullRatio: 1, ...patch,
  });
  const observation = (time: number, target?: SensorContact): Observation => ({
    ...base, self: ship, gameMode: "sea-trials", time, contacts: target ? [target] : [],
    friendlies: [], sharedContacts: [],
  });
  return { state, ship, contact, observation };
}

function acquire(ai: RuleBasedAi, sample: (time: number) => Observation, until = 7.5): ControlCommand {
  let command!: ControlCommand;
  for (let time = 0; time <= until; time += SENSOR.observationIntervalSeconds) command = ai.command(sample(time));
  expect(command.perception?.mode).toBe("tracking");
  return command;
}

function emit(state: BattleState, command: ControlCommand, time: number) {
  state.time = time;
  const ship = state.ships[0]!;
  stepSimulation(state, new Map([[ship.id, command]]), FIXED_STEP);
  return state.shots.filter(shot => shot.ownerId === ship.id);
}

const configurations = (["player", "enemy"] as const).flatMap(team =>
  (["fletcher", "cleveland", "yamato"] as const).flatMap(classId =>
    (["mk1-single", "mk4-twin"] as const).map(gun => ({ team, classId, gun }))));

describe("AI selected-weapon intent matches actual firing geometry", () => {
  it.each(configurations)("keeps $team $classId $gun final lead inside its equipped firing range", ({ team, classId, gun }) => {
    const { state, ship, observation, contact } = fixture(classId, gun, team);
    const range = effectiveMainBattery(ship).maximumRangeMeters;
    const ai = new RuleBasedAi(77);
    const command = acquire(ai, time => observation(time, contact(time, 0, range - 1, { speedKnots: 35 })));
    expect(command).toMatchObject({ fire: true, weaponSlot: "mainGun" });
    const shots = emit(state, command, 7.5);
    expect(shots.filter(shot => shot.weaponSource === "mainGun").length).toBeGreaterThan(0);
    expect(shots.every(shot => shot.team === team)).toBe(true);
    expect(Math.hypot(command.aimPoint.x, command.aimPoint.z)).toBeLessThanOrEqual(range + 1e-6);
  });

  it("keeps an approaching target's final lead outside the minimum firing distance", () => {
    const { state, ship, observation, contact } = fixture();
    ship.speedKnots = 35.5; // The hull advances before the short-range shot is evaluated.
    const ai = new RuleBasedAi(77);
    let checked = 0;
    for (let time = 0; time <= 160; time += SENSOR.observationIntervalSeconds) {
      const command = ai.command(observation(time, contact(time, 0, GUN.minAimRange + 1, {
        heading: Math.PI, speedKnots: 35,
      })));
      if (!command.fire) continue;
      const requested = Math.hypot(command.aimPoint.x, command.aimPoint.z);
      expect(requested).toBeGreaterThanOrEqual(GUN.minAimRange - 1e-6);
      const copy = structuredClone(state);
      expect(emit(copy, command, time).some(shot => shot.weaponSource === "mainGun")).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });

  it.each(["player", "enemy"] as const)("does not lend a torpedo lead to %s main guns outside the launch arc", team => {
    const armed = fixture("fletcher", "mk1-single", team), empty = fixture("fletcher", "mk1-single", team);
    armed.ship.torpedoesLoaded = 2;
    armed.ship.torpedoLauncherHeading = Math.PI;
    // This specimen is already loaded with AP; ammunition switching is tested elsewhere.
    armed.ship.ammoType = empty.ship.ammoType = "ap";
    const sample = (item: ReturnType<typeof fixture>, time: number) => item.observation(time,
      item.contact(time, 0, 1_200, { heading: Math.PI / 2, speedKnots: 18 }));
    const armedCommand = acquire(new RuleBasedAi(77), time => sample(armed, time), 20);
    const emptyCommand = acquire(new RuleBasedAi(77), time => sample(empty, time), 20);
    expect(armedCommand).toMatchObject({ fire: true, weaponSlot: "mainGun" });
    expect(armedCommand.aimPoint).toEqual(emptyCommand.aimPoint);
    const shots = emit(armed.state, armedCommand, 20);
    expect(shots.some(shot => shot.kind === "shell" && shot.weaponSource === "mainGun")).toBe(true);
    expect(shots.some(shot => shot.kind === "torpedo")).toBe(false);
  });

  it.each(["player", "enemy"] as const)("prepares %s torpedoes without firing a main gun at the torpedo solution", team => {
    const { state, ship, contact, observation } = fixture("fletcher", "mk1-single", team);
    ship.torpedoesLoaded = 2;
    ship.torpedoLauncherHeading = Math.PI;
    const ai = new RuleBasedAi(77);
    const sample = (time: number) => observation(time, contact(time, 1_200, 0));
    const preparing = acquire(ai, sample, 12.5);
    expect(preparing).toMatchObject({ weaponSlot: "torpedo", fire: false });
    expect(torpedoLaunchSolution(ship, preparing.aimPoint, "narrow").allowed).toBe(true);
    expect(emit(state, preparing, 12.5)).toHaveLength(0);
    let launched = false;
    for (let index = 0; index < 6 / FIXED_STEP; index++) {
      const time = state.time;
      const observedAt = Math.floor(time / SENSOR.observationIntervalSeconds) * SENSOR.observationIntervalSeconds;
      const command = ai.command(observation(time, contact(observedAt, 1_200, 0)));
      const shots = emit(state, command, time);
      if (!shots.length) continue;
      expect(command.weaponSlot).toBe("torpedo");
      expect(shots.every(shot => shot.kind === "torpedo")).toBe(true);
      launched = true;
      break;
    }
    expect(launched).toBe(true);
  });

  it("checks launcher alignment against the new torpedo solution, not the previous shared aim point", () => {
    const { state, ship, contact, observation } = fixture();
    ship.torpedoesLoaded = 2;
    ship.torpedoLauncherHeading = Math.PI / 2;
    ship.aimPoint = { x: 1_200, y: 0, z: 0 }; // Aligned only with the previous bearing.
    const command = acquire(new RuleBasedAi(77), time => observation(time, contact(time, 1_100, 600)), 12.5);
    const currentBearing = Math.atan2(command.aimPoint.x, command.aimPoint.z);
    expect(Math.abs(currentBearing - ship.torpedoLauncherHeading)).toBeGreaterThan(TORPEDO.launcherFireToleranceRadians);
    expect(command).toMatchObject({ weaponSlot: "torpedo", fire: false });
    expect(emit(state, command, 12.5)).toHaveLength(0);
  });

  it("reserves the hull movement step when firing at maximum range while reversing", () => {
    const { state, ship, observation, contact } = fixture();
    ship.speedKnots = -5;
    const range = effectiveMainBattery(ship).maximumRangeMeters;
    const command = acquire(new RuleBasedAi(77), time => observation(time, contact(time, 0, range - 1, { speedKnots: 35 })));
    expect(command.fire).toBe(true);
    expect(emit(state, command, 7.5).some(shot => shot.weaponSource === "mainGun")).toBe(true);
  });

  it("does not turn an out-of-range, stern-blocked, missing or radio-only contact into firing authority", () => {
    for (const kind of ["range", "stern", "lost", "radio"] as const) {
      const { state, ship, contact, observation } = fixture();
      const ai = new RuleBasedAi(77);
      const range = effectiveMainBattery(ship).maximumRangeMeters;
      const sample = (time: number) => {
        const target = contact(time, 0, kind === "range" ? range + 100 : kind === "stern" ? -1_500 : 1_500);
        if (kind === "radio") return { ...observation(time), sharedContacts: [{ ...target, sourceShipId: "scout", receivedAt: time }] };
        return observation(time, target);
      };
      let command: ControlCommand;
      if (kind === "radio") command = ai.command(sample(7.5));
      else {
        command = acquire(ai, sample);
        if (kind === "lost") command = ai.command(observation(7.6));
      }
      expect(command.fire).toBe(false);
      expect(emit(state, command, 7.6)).toHaveLength(0);
    }
  });

  it("does not request shell fire with empty main gun slots or unavailable torpedoes", () => {
    const { state, ship, observation, contact } = fixture();
    ship.installedEquipment = { mainGun: [null], torpedo: [], antiAir: [], sideGun: [],
      depthCharge: [], magazine: [], engine: [], steering: [] };
    ship.mainBatteryMounts = [];
    ship.torpedoesLoaded = 0;
    expect(effectiveMainBattery(ship).mounts).toHaveLength(0);
    const command = acquire(new RuleBasedAi(77), time => observation(time, contact(time, 1_200, 0)));
    expect(command).toMatchObject({ weaponSlot: "mainGun", fire: false });
    expect(emit(state, command, 7.5)).toHaveLength(0);
  });
});
