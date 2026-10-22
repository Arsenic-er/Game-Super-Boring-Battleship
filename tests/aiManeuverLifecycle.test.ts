import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTerrainManeuverGuard } from "../src/controllers/aiTerrainManeuverGuard";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { HostBattleSession } from "../src/net/hostBattleSession";
import type { LanBuildDescriptor } from "../src/net/protocol";
import { AiManeuverScheduler } from "../src/sim/aiManeuverScheduler";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { ShipManeuverPlan } from "../src/sim/shipManeuver";
import type { ControlCommand, ShipState } from "../src/sim/types";

const zeroCommand = (ship: Readonly<ShipState>): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
function fixture(count = 1, experimental = true) {
  const state = createInitialState(630178, "sea-trials");
  state.mapId = "open-sea-range"; state.airSupport = "none"; state.airSquadrons = [];
  const human = state.ships.find(ship => ship.id === "player")!;
  human.position = { x: -3000, y: 0, z: -3000 };
  human.aiControlled = false;
  const ships = Array.from({ length: count }, (_, i) => createDeveloperShipState({
    id: "lifecycle-ai-" + i, team: i % 2 ? "enemy" : "player", shipClassId: "edinburgh",
    position: { x: i * 800, y: 0, z: 0 }, heading: 0, aiControlled: true,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [], antiAirMounts: 0,
  }));
  state.ships = [human, ...ships];
  return { state, ships, session: new LocalBattleSession(state,
    experimental ? { experimentalTerrainManeuvers: true } : undefined) };
}
interface Entry {
  id: string;
  controller: RuleBasedAi;
  scheduler: AiManeuverScheduler;
  previous: ReturnType<AiManeuverScheduler["result"]>;
  generation?: number;
}
/** Seed genuine scheduler work; do not substitute fake queue/cancellation logic. */
function instrument(pending = false) {
  const entries: Entry[] = [];
  const seeded = new WeakSet<RuleBasedAi>();
  const plan: ShipManeuverPlan = {
    segments: pending ? [{ durationSeconds: 120, throttle: .2, rudder: 0 }] : [],
    brakeToStop: false,
  };
  const command = vi.spyOn(RuleBasedAi.prototype, "command").mockImplementation(function(
    this: RuleBasedAi, observation, scheduler,
  ) {
    if (!scheduler) throw new Error("Experimental session failed to share its scheduler");
    const entry: Entry = { id: observation.self.id, controller: this, scheduler,
      previous: scheduler.result(observation.self.id) };
    if (!seeded.has(this)) {
      seeded.add(this);
      entry.generation = scheduler.submit(observation.self.id, observation.self, observation.mapId, [plan]);
    }
    entries.push(entry);
    return zeroCommand(observation.self);
  });
  return { entries, command };
}
afterEach(() => vi.restoreAllMocks());

describe("maneuver planning lifecycle in real local sessions", () => {
  it("shares one budget across all AI while keeping separate battles isolated", () => {
    const probe = instrument(), first = fixture(3), second = fixture(2);
    const background = vi.spyOn(AiManeuverScheduler.prototype, "runBackground");
    first.session.step(new Map());
    const firstEntries = probe.entries.slice();
    expect(firstEntries).toHaveLength(3);
    expect(new Set(firstEntries.map(entry => entry.scheduler)).size).toBe(1);
    expect(new Set(firstEntries.map(entry => entry.controller)).size).toBe(3);
    const shared = firstEntries[0]!.scheduler;
    expect(shared.getTelemetry()).toMatchObject({ activeOwners: 3, completedOwners: 3, queuedOwners: 0 });
    expect(background).toHaveBeenCalledTimes(1);
    second.session.step(new Map());
    const secondEntries = probe.entries.slice(3);
    expect(secondEntries).toHaveLength(2);
    expect(secondEntries.every(entry => entry.scheduler !== shared && entry.previous === undefined)).toBe(true);
    expect(new Set(secondEntries.map(entry => entry.scheduler)).size).toBe(1);
    expect(background).toHaveBeenCalledTimes(2);
    expect(shared.getTelemetry().completedOwners).toBe(3);
  });

  for (const pending of [false, true]) {
    const label = pending ? "pending" : "completed";
    it("removes " + label + " work on human takeover and returns with a fresh controller", () => {
      const probe = instrument(pending), { state, ships, session } = fixture();
      const ship = ships[0]!;
      session.step(new Map());
      const first = probe.entries[0]!, planner = first.scheduler;
      expect(planner.getTelemetry()[pending ? "queuedOwners" : "completedOwners"]).toBe(1);
      session.step(new Map([[ship.id, { ...zeroCommand(ship), throttle: .4 }]]));
      expect(probe.entries).toHaveLength(1);
      expect(ship.throttle).toBe(.4);
      expect(planner.result(ship.id)).toBeUndefined();
      expect(planner.getTelemetry()).toMatchObject({ activeOwners: 0, queuedOwners: 0, completedOwners: 0 });
      expect(state.status).toBe("running");
      session.step(new Map());
      const returned = probe.entries[1]!;
      expect(returned.controller).not.toBe(first.controller);
      expect(returned.previous).toBeUndefined();
      expect(returned.generation).toBeGreaterThan(first.generation!);
    });

    for (const removal of ["death", "delete", "test-target"] as const) {
      it("cancels " + label + " work on " + removal + " before same-ID recreation", () => {
        const probe = instrument(pending), { state, ships, session } = fixture();
        const ship = ships[0]!;
        session.step(new Map());
        const first = probe.entries[0]!, planner = first.scheduler;
        expect(planner.getTelemetry()[pending ? "queuedOwners" : "completedOwners"]).toBe(1);
        if (removal === "death") ship.hull = 0;
        else if (removal === "delete") state.ships = state.ships.filter(candidate => candidate !== ship);
        else ship.isTestTarget = true;
        session.step(new Map());
        expect(probe.entries).toHaveLength(1);
        expect(planner.result(ship.id)).toBeUndefined();
        expect(planner.getTelemetry()).toMatchObject({ queuedOwners: 0, completedOwners: 0 });
        const replacement = structuredClone(ship);
        replacement.hull = replacement.maxHull; replacement.isTestTarget = false;
        state.ships = [...state.ships.filter(candidate => candidate.id !== ship.id), replacement];
        expect(state.status).toBe("running");
        session.step(new Map());
        const recreated = probe.entries[1]!;
        expect(recreated.controller).not.toBe(first.controller);
        expect(recreated.previous).toBeUndefined();
        expect(recreated.generation).toBeGreaterThan(first.generation!);
      });
    }

    it("drops " + label + " work when the same ID is replaced without an absent frame", () => {
      const probe = instrument(pending), { state, ships, session } = fixture();
      const ship = ships[0]!;
      session.step(new Map());
      const first = probe.entries[0]!;
      expect(first.scheduler.getTelemetry()[pending ? "queuedOwners" : "completedOwners"]).toBe(1);
      const replacement = structuredClone(ship);
      state.ships[state.ships.indexOf(ship)] = replacement;
      session.step(new Map());
      const next = probe.entries[1]!;
      expect(next.controller).not.toBe(first.controller);
      expect(next.scheduler).toBe(first.scheduler);
      expect(next.previous).toBeUndefined();
      expect(next.generation).toBeGreaterThan(first.generation!);
    });

    it("reset discards " + label + " work even when the next battle reuses all IDs", () => {
      const probe = instrument(pending), initial = fixture();
      initial.session.step(new Map());
      const first = probe.entries[0]!, next = fixture();
      expect(first.scheduler.getTelemetry()[pending ? "queuedOwners" : "completedOwners"]).toBe(1);
      initial.session.reset(next.state);
      expect(first.scheduler.getTelemetry()).toMatchObject({ activeOwners: 0, queuedOwners: 0, completedOwners: 0 });
      initial.session.step(new Map());
      const restarted = probe.entries[1]!;
      expect(restarted.controller).not.toBe(first.controller);
      expect(restarted.scheduler).toBe(first.scheduler);
      expect(restarted.previous).toBeUndefined();
      expect(restarted.generation).toBeGreaterThan(first.generation!);
    });
  }

  it("freezes pending work and world state at the result screen, then clears it on reset", () => {
    const probe = instrument(true), { state, session } = fixture();
    session.step(new Map());
    const first = probe.entries[0]!, planner = first.scheduler;
    expect(planner.getTelemetry().queuedOwners).toBe(1);
    state.status = "draw"; state.endReason = "time";
    const frozen = structuredClone(state), telemetry = planner.getTelemetry();
    const begin = vi.spyOn(planner, "beginFrame"), background = vi.spyOn(planner, "runBackground");
    const confirm = vi.spyOn(planner, "confirm");
    for (let i = 0; i < 120; i++) {
      const output = session.step(new Map());
      expect(output.shots).toEqual([]); expect(output.impacts).toEqual([]);
    }
    expect(state).toEqual(frozen); expect(planner.getTelemetry()).toEqual(telemetry);
    expect(probe.entries).toHaveLength(1);
    expect(begin).not.toHaveBeenCalled(); expect(background).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    const next = fixture(); session.reset(next.state);
    expect(planner.getTelemetry().queuedOwners).toBe(0);
    session.step(new Map());
    expect(probe.entries[1]!.previous).toBeUndefined();
    expect(probe.entries[1]!.controller).not.toBe(first.controller);
  });

  it("does not apply terrain overrides for a session step longer than the supported prefix", () => {
    const { state, ships } = fixture(), ship = ships[0]!;
    ship.speedKnots = 8;
    const scheduler = new AiManeuverScheduler(), guard = new AiTerrainManeuverGuard();
    scheduler.beginFrame(state.time, [ship.id], .3);
    const submit = vi.spyOn(scheduler, "submit"), confirm = vi.spyOn(scheduler, "confirm");
    const cancel = vi.spyOn(scheduler, "cancel");
    const controls = { throttle: .6, rudder: -.82 };
    expect(guard.command(observe(state, ship.id), controls, scheduler)).toBe(controls);
    expect(guard.getTelemetry()).toMatchObject({ phase: "inactive", reason: "unsupported-step" });
    expect(submit).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(ship.id);
    expect(scheduler.getTelemetry().dt).toBe(.3);
    expect(FIXED_STEP).toBeLessThan(.25);
  });
});


/** Call-through spies: production AI must still run, only the experiment is off. */
function inactiveExperimentProbe() {
  const guard = vi.spyOn(AiTerrainManeuverGuard.prototype, "command");
  const planning = (["beginFrame", "runBackground", "submit", "confirm", "result", "cancel", "reset"] as const)
    .map(method => vi.spyOn(AiManeuverScheduler.prototype, method));
  return () => {
    expect(guard).not.toHaveBeenCalled();
    for (const method of planning) expect(method).not.toHaveBeenCalled();
  };
}

describe("experimental maneuver planning stays disabled in production defaults", () => {
  it("does not allocate or advance planning in default local battles, including reset", () => {
    const checkInactive = inactiveExperimentProbe();
    const command = vi.spyOn(RuleBasedAi.prototype, "command");
    const { session, ships } = fixture(3, false);
    expect(Object.values(session).some(value => value instanceof AiManeuverScheduler)).toBe(false);
    for (let i = 0; i < 60; i++) session.step(new Map());
    expect(command).toHaveBeenCalledTimes(180);
    expect(command.mock.calls.every(([, scheduler]) => scheduler === undefined)).toBe(true);
    expect(ships.every(ship => ship.aiDecision !== undefined)).toBe(true);
    checkInactive();
    const next = fixture(2, false);
    session.reset(next.state);
    session.step(new Map());
    expect(command).toHaveBeenCalledTimes(182);
    expect(Object.values(session).some(value => value instanceof AiManeuverScheduler)).toBe(false);
    checkInactive();
  });

  it("does not enable planning through the default LAN host path", () => {
    const checkInactive = inactiveExperimentProbe();
    const command = vi.spyOn(RuleBasedAi.prototype, "command");
    const build: LanBuildDescriptor = {
      buildId: "lifecycle-fletcher", buildName: "Lifecycle Fletcher", shipClassId: "fletcher",
      slots: {
        mainGun: Array.from({ length: 5 }, () => "mainGun-common"),
        torpedo: ["torpedo-common", null],
        antiAir: ["antiAir-common", null, null, null], sideGun: [],
        depthCharge: ["depthCharge-common", null],
        magazine: ["magazine-common"], engine: ["engine-common"], steering: ["steering-common"],
      },
    };
    const host = new HostBattleSession({
      hostPeerId: "lifecycle-host", guestPeerId: "lifecycle-guest",
      seed: 630178, teamSize: 3, hostBuild: build, guestBuild: structuredClone(build),
    });
    const human = host.state.ships.find(ship => ship.id === host.assignments.get("lifecycle-host"))!;
    for (let i = 0; i < 60; i++) host.step(zeroCommand(human), FIXED_STEP);
    expect(host.state.time).toBeCloseTo(1);
    // A three-versus-three session has two human allies and four real AI.
    expect(command).toHaveBeenCalledTimes(240);
    expect(command.mock.calls.every(([, scheduler]) => scheduler === undefined)).toBe(true);
    checkInactive();
  });

  it("keeps a standalone controller on its original path without explicit planning injection", () => {
    const checkInactive = inactiveExperimentProbe();
    const { state, ships } = fixture(1, false), ship = ships[0]!;
    state.mapId = "atoll-prototype";
    // Real near-coast case: this would activate the experimental predictor.
    ship.position = { x: 1695, y: 0, z: 1282 };
    ship.heading = -.5; ship.speedKnots = .3; ship.rudder = -.82;
    const controller = new RuleBasedAi(123);
    const command = controller.command(observe(state, ship.id));
    expect(Number.isFinite(command.throttle)).toBe(true);
    expect(Number.isFinite(command.rudder)).toBe(true);
    expect(command.aiDecision).toBeDefined();
    expect(Object.values(controller).some(value => value instanceof AiManeuverScheduler)).toBe(false);
    checkInactive();
  });
});
