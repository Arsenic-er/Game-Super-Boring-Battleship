import { describe, expect, it } from "vitest";
import { LocalBattleSession } from "../src/session/localBattleSession";
import {
  AIR_NAVIGATION,
  AIR_OPERATION_TIMING,
  createAirSquadronState,
} from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import {
  createDeveloperShipState,
  createInitialState,
  stepSimulation,
} from "../src/sim/simulation";
import type { ControlCommand, ShipState } from "../src/sim/types";

const roles = ["fighter", "diveBomber", "torpedoBomber"] as const;
const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});

function fixture(swapped = false) {
  const state = createInitialState(9771, "sea-trials");
  state.mapId = "open-sea-range";
  state.underwaterTargets = [];
  state.ships = ["a1", "a2", "b1", "b2"].map((id, index) =>
    createDeveloperShipState({
      id, team: ((index < 2) !== swapped) ? "player" : "enemy",
      shipClassId: "north-carolina", aiControlled: true,
      position: { x: index % 2 ? 240 : -240, y: 0, z: index < 2 ? -450 : 450 },
      heading: index < 2 ? 0 : Math.PI,
      antiAirMounts: 0, secondaryGunIds: [],
    }));
  state.airSquadrons = state.ships.flatMap(ship => roles.map(role => {
    const position = { ...ship.position, y: 80 };
    return createAirSquadronState({
      id: ship.id + "-" + role, controllerId: ship.id, team: ship.team,
      role, position, heading: ship.heading,
      recoverySource: { kind: "mapEdge", position },
    });
  }));
  return state;
}

function owned(state: ReturnType<typeof fixture>, ship: ShipState) {
  return state.airSquadrons.filter(squadron => squadron.controllerId === ship.id);
}

describe("authoritative fleet aviation autonomy", () => {
  it("launches all eligible AI-owned squadrons equally after swapping team labels", () => {
    const run = (swapped: boolean) => {
      const state = fixture(swapped);
      new LocalBattleSession(state).step(new Map(), FIXED_STEP);
      expect(state.airSquadrons).toHaveLength(12);
      expect(state.airSquadrons.every(s => s.phase === "launching")).toBe(true);
      expect(state.airEvents.filter(e => e.kind === "orderAccepted")).toHaveLength(12);
      for (const s of state.airSquadrons) {
        expect(s.order?.kind).toBe(s.role === "fighter" ? "defendShip" : "strikeShip");
        expect(s.order?.targetIds?.length).toBeGreaterThan(0);
      }
      return state.airSquadrons.map(s => ({
        id: s.id, phase: s.phase, kind: s.order?.kind,
        targets: s.order?.targetIds, positions: s.order?.lastKnownPositions,
        weapon: s.order?.selectedWeapon,
      }));
    };
    expect(run(false)).toEqual(run(true));
  });

  it.each(["player", "enemy"] as const)(
    "suppresses %s AI dispatch while the authoritative session has human control", team => {
      const state = fixture();
      const human = state.ships.find(s => s.team === team)!;
      // Preserve the historical enemy ID too: takeover must override that shortcut.
      if (team === "enemy") {
        for (const s of owned(state, human)) s.controllerId = "enemy";
        human.id = "enemy";
      }
      const session = new LocalBattleSession(state, { includeDeveloperAi: true });
      session.step(new Map([[human.id, idle(human)]]), FIXED_STEP);
      expect(owned(state, human).every(s => s.phase === "ready" && !s.order)).toBe(true);
      expect(state.airSquadrons.filter(s => s.controllerId !== human.id)
        .every(s => s.phase === "launching")).toBe(true);
      session.step(new Map(), FIXED_STEP);
      expect(owned(state, human).every(s => s.phase === "launching")).toBe(true);
    },
  );

  it.each(["player", "enemy"] as const)(
    "keeps explicit %s patrol orders authoritative even when that actor is AI-authorized", team => {
      const state = fixture();
      const owner = state.ships.find(s => s.team === team)!;
      const fighter = owned(state, owner).find(s => s.role === "fighter")!;
      const mission = {
        squadronId: fighter.id, kind: "patrolArea" as const,
        area: { center: { x: 1_000, y: 180, z: 0 }, radius: 350 },
      };
      stepSimulation(state, new Map([[owner.id, { ...idle(owner), airMission: mission }]]),
        FIXED_STEP, { automatedAirControllerIds: new Set([owner.id]) });
      const current = state.airSquadrons.find(s => s.id === fighter.id)!;
      expect(current.order?.kind).toBe("patrolArea");
      expect(current.order?.area?.center).toEqual(mission.area.center);
      expect(state.airEvents.filter(e => e.kind === "orderAccepted" && e.squadronId === fighter.id))
        .toHaveLength(1);
      expect(owned(state, owner).filter(s => s.role !== "fighter")
        .every(s => s.order?.kind === "strikeShip")).toBe(true);
    },
  );

  it.each(["player", "enemy"] as const)(
    "honors direct-step human commands and only defaults uncommanded %s AI to autonomy", team => {
      const state = fixture();
      const owner = state.ships.find(s => s.team === team)!;
      if (team === "enemy") {
        for (const s of owned(state, owner)) s.controllerId = "enemy";
        owner.id = "enemy";
      }
      stepSimulation(state, new Map([[owner.id, idle(owner)]]), FIXED_STEP);
      expect(owned(state, owner).every(s => s.phase === "ready")).toBe(true);
      stepSimulation(state, new Map(), FIXED_STEP);
      expect(owned(state, owner).every(s => s.phase === "launching")).toBe(true);
    },
  );

  it("does not dispatch test targets, dead ships or inactive AI, but respects developer AI opt-in", () => {
    const state = fixture();
    state.ships[0]!.isTestTarget = true;
    state.ships[1]!.hull = 0;
    state.ships[2]!.aiControlled = false;
    state.ships[3]!.aiControlled = false;
    const session = new LocalBattleSession(state);
    session.step(new Map(), FIXED_STEP);
    expect(state.airSquadrons.every(s => s.phase === "ready")).toBe(true);
    session.step(new Map(), FIXED_STEP, { includeDeveloperAi: true });
    expect(owned(state, state.ships[0]!).every(s => s.phase === "ready")).toBe(true);
    expect(owned(state, state.ships[1]!).every(s => s.phase === "ready")).toBe(true);
    expect(owned(state, state.ships[2]!).every(s => s.phase === "launching")).toBe(true);
    expect(owned(state, state.ships[3]!).every(s => s.phase === "launching")).toBe(true);
  });

  it.each(roles)("rearms and redispatches %s on both teams without resetting its launch clock", role => {
    const state = fixture();
    state.airSquadrons = state.airSquadrons.filter(s => s.role === role);
    for (const s of state.airSquadrons) {
      s.phase = "rearming";
      s.phaseStartedAt = -AIR_OPERATION_TIMING.rearmSeconds[role] + FIXED_STEP / 2;
      s.ordnanceRemaining = 0;
      s.ammoRemaining = 0;
    }
    const session = new LocalBattleSession(state);
    session.step(new Map(), FIXED_STEP);
    expect(state.airSquadrons.every(s => s.phase === "launching")).toBe(true);
    expect(state.airSquadrons.every(s =>
      (role === "fighter" ? s.ammoRemaining : s.ordnanceRemaining) > 0)).toBe(true);
    const startedAt = state.airSquadrons.map(s => s.phaseStartedAt);
    session.step(new Map(), FIXED_STEP);
    expect(state.airSquadrons.map(s => s.phaseStartedAt)).toEqual(startedAt);
    expect(state.airEvents.filter(e => e.kind === "orderAccepted")).toHaveLength(0);
  });

  it.each(["player", "enemy"] as const)(
    "completes a physical bomber sortie and launches again while its %s controller is alive", team => {
      const state = fixture();
      const owner = state.ships.find(s => s.team === team)!;
      const target = state.ships.find(s => s.team !== team)!;
      owner.position = { x: 0, y: 0, z: -900 };
      target.position = { x: 0, y: 0, z: 0 };
      owner.previousPosition = { ...owner.position };
      target.previousPosition = { ...target.position };
      state.ships = [owner, target];
      const position = { x: 0, y: 80, z: -2_600 };
      state.airSquadrons = [createAirSquadronState({
        id: "repeat-sortie", controllerId: owner.id, team, role: "diveBomber",
        position, recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: -3_000 } },
      })];
      state.airSquadrons[0]!.flight = {
        speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond.diveBomber, pitch: 0, bank: 0,
      };
      // Fixed legal idle commands isolate aviation from naval fire/movement;
      // explicit authoritative ownership permits autonomous aviation only.
      // No entity state or phase is modified after this initial setup.
      const commands = new Map([[owner.id, idle(owner)], [target.id, idle(target)]]);
      const options = { automatedAirControllerIds: new Set([owner.id]) };
      const phases = new Set<string>();
      let launches = 0, releases = 0, landings = 0;
      for (let frame = 0; frame < 300 / FIXED_STEP; frame++) {
        stepSimulation(state, commands, FIXED_STEP, options);
        phases.add(state.airSquadrons[0]!.phase);
        launches += state.airEvents.filter(e => e.kind === "launched").length;
        releases += state.airEvents.filter(e => e.kind === "weaponReleased").length;
        landings += state.airEvents.filter(e => e.kind === "landed").length;
        if (launches >= 2) break;
      }
      expect(owner.hull).toBeGreaterThan(0);
      expect(launches).toBe(2);
      expect(releases).toBeGreaterThanOrEqual(1);
      expect(landings).toBeGreaterThanOrEqual(1);
      for (const phase of ["attackRun", "returning", "landing", "rearming"]) {
        expect(phases.has(phase)).toBe(true);
      }
      expect(state.airSquadrons[0]!.ordnanceRemaining).toBeGreaterThan(0);
    },
  );

  it.each(["player", "enemy"] as const)(
    "recovers a %s guarding fighter on fuel reserve and starts a second physical sortie", team => {
      const state = fixture();
      const owner = state.ships.find(s => s.team === team)!;
      owner.position = { x: 0, y: 0, z: 0 };
      owner.previousPosition = { ...owner.position };
      // Keep both victory teams represented; a lone enemy ends sea trials as
      // player-destroyed before its first launch. The distant ship stays idle.
      const distant = state.ships.find(s => s.team !== team)!;
      distant.position = { x: 5_000, y: 0, z: 5_000 };
      distant.previousPosition = { ...distant.position };
      state.ships = [owner, distant];
      state.airSquadrons = [createAirSquadronState({
        id: "guard-cycle", controllerId: owner.id, team, role: "fighter",
        position: { x: 0, y: 80, z: -1_000 },
        recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: -1_000 } },
      })];
      state.airSquadrons[0]!.flight = {
        speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond.fighter, pitch: 0, bank: 0,
      };
      const commands = new Map([[owner.id, idle(owner)], [distant.id, idle(distant)]]);
      const options = { automatedAirControllerIds: new Set([owner.id]) };
      let launches = 0;
      const phases = new Set<string>();
      // Fuel, steering, return guidance, landing and rearming are all production
      // transitions; no phase, fuel or position is patched inside the loop.
      for (let frame = 0; frame < 400 / FIXED_STEP; frame++) {
        stepSimulation(state, commands, FIXED_STEP, options);
        phases.add(state.airSquadrons[0]!.phase);
        launches += state.airEvents.filter(e => e.kind === "launched").length;
        if (launches >= 2) break;
      }
      expect(launches).toBe(2);
      for (const phase of ["patrolling", "returning", "landing", "rearming"]) {
        expect(phases.has(phase)).toBe(true);
      }
      expect(state.airSquadrons[0]!.aircraftOperational).toBe(6);
      expect(state.airSquadrons[0]!.fuelRemainingSeconds).toBeGreaterThan(190);
      expect(owner.hull).toBeGreaterThan(0);
    },
  );

  it.each([false, true])(
    "samples %s aviation target validation before any ship moves regardless of array order", explicit => {
      const run = (reverse: boolean) => {
        const state = fixture();
        const owner = state.ships[0]!, target = state.ships[2]!;
        owner.id = "enemy";
        owner.team = "enemy";
        target.id = "player";
        target.team = "player";
        target.speedKnots = 25;
        target.heading = Math.PI / 2;
        state.ships = reverse ? [target, owner] : [owner, target];
        const plane = createAirSquadronState({
          id: "strike", controllerId: owner.id, team: owner.team, role: "diveBomber",
          position: { ...owner.position, y: 80 },
          recoverySource: { kind: "mapEdge", position: { ...owner.position, y: 80 } },
        });
        state.airSquadrons = [plane];
        const commands = new Map([[target.id, { ...idle(target), throttle: 1 }]]);
        if (explicit) commands.set(owner.id, {
          ...idle(owner), airMission: { squadronId: plane.id, kind: "strikeShip", targetId: target.id },
        });
        stepSimulation(state, commands, .25, { automatedAirControllerIds: new Set([owner.id]) });
        const live = state.airSquadrons[0]!;
        expect(live.phase).toBe("launching");
        expect(live.order?.activeTargetId).toBe(target.id);
        expect(target.position.x).not.toBe(target.previousPosition.x);
        return live.order?.lastKnownPositions;
      };
      expect(run(false)).toEqual(run(true));
    },
  );

  it.each(["destroyed", "removed"] as const)(
    "does not use a %s controller as a surface sensor or crash tracking", disposition => {
      const state = fixture();
      const owner = state.ships[0]!, target = state.ships[2]!;
      state.ships = [owner, target];
      const s = owned(state, owner).find(s => s.role === "diveBomber")!;
      s.phase = "outbound";
      s.position = { x: 0, y: 400, z: -5_000 };
      s.previousPosition = { ...s.position };
      const retained = { x: 30, y: 0, z: 40 };
      s.order = {
        squadronId: s.id, kind: "strikeShip", targetId: target.id, targetIds: [target.id],
        candidateTargetIds: [target.id], activeTargetId: target.id, selectedWeapon: "heBomb",
        lastKnownPositions: { [target.id]: retained }, lastKnownPosition: retained, issuedAt: 0,
      };
      state.airSquadrons = [s];
      if (disposition === "destroyed") owner.hull = 0;
      else state.ships = [target];
      expect(() => stepSimulation(state, new Map(), FIXED_STEP)).not.toThrow();
      expect(state.airSquadrons[0]!.phase).toBe("searching");
      expect(state.airSquadrons[0]!.order?.lastKnownPositions?.[target.id]).toEqual(retained);
    },
  );

  it("keeps an orphan aircraft's own optical observation usable", () => {
    const state = fixture();
    const owner = state.ships[0]!, target = state.ships[2]!;
    const s = owned(state, owner).find(s => s.role === "diveBomber")!;
    state.ships = [target];
    state.airSquadrons = [s];
    s.phase = "outbound";
    s.position = { ...target.position, y: 300, z: target.position.z - 1_000 };
    s.order = {
      squadronId: s.id, kind: "strikeShip", targetIds: [target.id],
      candidateTargetIds: [target.id], activeTargetId: target.id,
      selectedWeapon: "heBomb", lastKnownPositions: { [target.id]: { x: 4_000, y: 0, z: 4_000 } },
      issuedAt: 0,
    };
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.airSquadrons[0]!.phase).not.toBe("searching");
    expect(state.airSquadrons[0]!.order?.lastKnownPositions?.[target.id]?.x)
      .toBeCloseTo(target.position.x, -2);
  });
});
