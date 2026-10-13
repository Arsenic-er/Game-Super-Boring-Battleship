import { describe, expect, it } from "vitest";
import { terrainBlocksLineOfSight } from "../src/maps/atollMap";
import { replicationViewFor } from "../src/net/replicationView";
import { ClientBattleSession } from "../src/net/clientBattleSession";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { createAirSquadronState } from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState } from "../src/sim/simulation";
import type { AirContactSnapshot, AirSquadronState, ShipState, Team, Vec3 } from "../src/sim/types";

const other = (team: Team): Team => team === "player" ? "enemy" : "player";
const idle = (ship: ShipState) => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } });
function fixture(team: Team, visibleController = false) {
  const state = createInitialState(0x86312, "battle");
  state.mapId = "open-sea-range"; state.weatherId = "clear";
  state.airSupport = "none"; state.airSquadrons = []; state.underwaterTargets = [];
  const make = (id: string, side: Team, x: number, z: number) => createDeveloperShipState({
    id, team: side, shipClassId: "fletcher", position: { x, y: 0, z },
    aiControlled: false, mainGunMounts: 0, torpedoLauncherMounts: 0,
    secondaryGunIds: [], antiAirMounts: 0, depthChargeMounts: 0,
  });
  const viewer = make("viewer-ship", team, 0, 0);
  const controller = make("opposing-controller", other(team), visibleController ? 1000 : 5500, 0);
  state.ships = [viewer, controller];
  const session = new LocalBattleSession(state);
  const step = () => session.step(new Map([[viewer.id, idle(viewer)], [controller.id, idle(controller)]]), FIXED_STEP);
  return { state, viewer, controller, step,
    view: () => replicationViewFor(state, viewer.id, Math.round(state.time / FIXED_STEP), 4) };
}
function flight(owner: ShipState, id: string, position: Vec3): AirSquadronState {
  const air = createAirSquadronState({ id, controllerId: owner.id, team: owner.team,
    role: "fighter", position, recoverySource: { kind: "mapEdge", position: { x: 0, y: 180, z: 5500 } } });
  air.phase = "outbound";
  air.flight = { speedMetersPerSecond: 105, pitch: .1, bank: .2 };
  air.order = { squadronId: id, kind: "moveTo", issuedAt: 0,
    area: { center: { x: position.x, y: 180, z: Math.min(5500, position.z + 2000) }, radius: 90 } };
  return air;
}
function contact(air: AirSquadronState, observedAt: number): AirContactSnapshot {
  return { observedAt, lastKnownPosition: { ...air.position }, confidence: .88,
    observedRole: air.role, observedHeading: air.heading, estimatedAircraft: air.aircraftOperational };
}
const range = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

describe("LAN aircraft visibility follows authoritative optical contacts", () => {
  for (const team of ["player", "enemy"] as const) {
    it(`${team}: a visible controller does not reveal its remote aircraft`, () => {
      const { state, controller, step, view } = fixture(team, true);
      state.airSquadrons = [flight(controller, "hidden-flight", { x: 4500, y: 180, z: 4000 })];
      step();
      expect(view().contacts.some(item => item.id === controller.id)).toBe(true);
      expect(state.airSquadrons[0]!.contactsByTeam[team]).toBeUndefined();
      expect(view().aircraft).toEqual([]);
    });

    it(`${team}: the legacy 1200m shortcut cannot expose an aircraft behind a real mountain`, () => {
      const { state, viewer, controller, step, view } = fixture(team);
      state.mapId = "atoll-prototype";
      viewer.position = { x: 1680, y: 0, z: 1100 }; viewer.previousPosition = { ...viewer.position };
      const air = flight(controller, "hidden-behind-mountain", { x: 1680, y: 180, z: 2200 });
      state.airSquadrons = [air];
      expect(range(viewer.position, air.position)).toBeLessThan(1200);
      expect(terrainBlocksLineOfSight(state.mapId, viewer.position, air.position, 19, 0)).toBe(true);
      step();
      expect(state.airSquadrons[0]!.contactsByTeam[team]).toBeUndefined();
      expect(view().aircraft).toEqual([]);
    });

    for (const weather of ["clear", "rain-squall", "sea-fog"] as const) {
      it(`${team}: wire visibility matches real ${weather} sensors, independently of controller visibility`, () => {
        const { state, controller, step, view } = fixture(team);
        state.weatherId = weather;
        state.airSquadrons = [flight(controller, "observed-flight", { x: 2100, y: 180, z: 0 })];
        step();
        const payload = view(), air = state.airSquadrons[0]!;
        expect(payload.contacts).toEqual([]);
        if (weather === "clear") {
          expect(air.contactsByTeam[team]?.observedAt).toBe(state.time);
          expect(payload.aircraft).toHaveLength(1);
          expect(payload.aircraft[0]).toMatchObject({ id: air.id, team: air.team,
            position: air.contactsByTeam[team]!.lastKnownPosition, flight: air.flight });
          expect(payload.aircraft[0]).not.toHaveProperty("controllerId");
        } else {
          expect(air.contactsByTeam[team]).toBeUndefined();
          expect(payload.aircraft).toEqual([]);
        }
      });
    }

    it(`${team}: a real fog-lost contact freezes at the observed position for five seconds, then disappears`, () => {
      const { state, controller, step, view } = fixture(team);
      state.airSquadrons = [flight(controller, "lost-flight", { x: 2100, y: 180, z: 0 })];
      step();
      const saved = structuredClone(state.airSquadrons[0]!.contactsByTeam[team]!);
      state.weatherId = "sea-fog";
      while (state.time - saved.observedAt < 3) step();
      const wire = view().aircraft[0]!;
      expect(range(state.airSquadrons[0]!.position, saved.lastKnownPosition)).toBeGreaterThan(150);
      expect(wire).toMatchObject({ position: saved.lastKnownPosition, heading: saved.observedHeading,
        aircraftOperational: saved.estimatedAircraft, role: saved.observedRole, phase: "patrolling" });
      expect(wire).not.toHaveProperty("flight");
      expect(wire).not.toHaveProperty("controllerId");
      expect(wire.contact).toEqual(saved);
      expect((wire.contact as AirContactSnapshot).observedAt).not.toBe(state.time);
      while (state.time - saved.observedAt <= 5) step();
      expect(view().aircraft).toEqual([]);
    });

    it(`${team}: old contact metadata never falls back to changed hidden live state and is deep-cloned`, () => {
      const { state, controller, view } = fixture(team);
      state.time = 8;
      const air = flight(controller, "old-flight", { x: 5000, y: 800, z: 4900 });
      const saved: AirContactSnapshot = { observedAt: 4, confidence: .8,
        lastKnownPosition: { x: 2100, y: 180, z: 0 }, observedRole: "fighter",
        observedHeading: .3, estimatedAircraft: 6 };
      Object.assign(saved, { privateFutureField: "must-not-replicate" });
      air.contactsByTeam[team] = saved;
      air.role = "torpedoBomber"; air.heading = 2; air.aircraftOperational = 1; air.phase = "attackRun";
      state.airSquadrons = [air];
      const wire = view().aircraft[0]!;
      expect(wire).toMatchObject({ id: air.id, position: saved.lastKnownPosition,
        heading: .3, role: "fighter", aircraftOperational: 6, phase: "patrolling" });
      expect(wire).not.toHaveProperty("flight");
      expect(wire.contact).toMatchObject({ observedAt: 4, lastKnownPosition: saved.lastKnownPosition });
      expect(wire.contact).not.toHaveProperty("privateFutureField");
      (wire.contact as AirContactSnapshot).lastKnownPosition.x = -7777;
      expect((wire.position as Vec3).x).toBe(2100);
      expect(saved.lastKnownPosition.x).toBe(2100);
      (wire.position as Vec3).x = -9999;
      expect(saved.lastKnownPosition.x).toBe(2100);
      expect(air.position.x).toBe(5000);
    });

    it(`${team}: friendly aircraft remain complete in fog and retain their actual controller identity`, () => {
      const { state, viewer, view } = fixture(team);
      state.weatherId = "sea-fog";
      const ally = createDeveloperShipState({ id: "ally-controller", team, shipClassId: "fletcher",
        position: { x: -5000, y: 0, z: -5000 } });
      state.ships.push(ally);
      state.airSquadrons = [
        flight(viewer, "own-flight", { x: 4500, y: 180, z: 4000 }),
        flight(ally, "ally-flight", { x: -4500, y: 180, z: -4000 }),
      ];
      const payload = view();
      expect(payload.controlledShipId).toBe(viewer.id);
      expect(payload.self.id).toBe(viewer.id);
      expect(payload.aircraft.map(air => air.controllerId)).toEqual([viewer.id, ally.id]);
      for (let index = 0; index < 2; ++index) {
        expect(payload.aircraft[index]).toMatchObject({ id: state.airSquadrons[index]!.id,
          position: state.airSquadrons[index]!.position, flight: state.airSquadrons[index]!.flight });
      }
      (payload.aircraft[0]!.flight as { bank: number }).bank = 99;
      expect(state.airSquadrons[0]!.flight!.bank).toBe(.2);
    });

    it(`${team}: hidden release/loss events cannot leak via a visible controller or friendly target, but hits stay anonymous`, () => {
      const { state, viewer, controller, view } = fixture(team, true);
      const hidden = flight(controller, "hidden-event-source", { x: 5000, y: 300, z: 4000 });
      state.airSquadrons = [hidden];
      const source = { time: state.time, team: controller.team, controllerId: controller.id,
        squadronId: hidden.id, targetId: viewer.id, position: { ...hidden.position } };
      state.airEvents = [
        { ...source, id: 10, kind: "weaponReleased", weapon: "heBomb" },
        { ...source, id: 11, kind: "aircraftLost", aircraftLost: 1 },
        { ...source, id: 12, kind: "attackHit", position: { x: 10, y: 0, z: 0 }, damage: 17, weapon: "heBomb" },
        { ...source, id: 13, kind: "orderAccepted", orderKind: "strikeShip" },
        { ...source, id: 14, kind: "weaponReleased", position: { x: 100, y: 300, z: 100 } },
      ];
      state.shots = [{ id: 20, ownerId: hidden.id, team: controller.team, kind: "shell",
        position: { ...hidden.position }, weaponSource: "aircraft", airWeapon: "heBomb" }];
      state.projectiles = [{ id: 21, ownerId: hidden.id, team: controller.team, kind: "shell",
        position: { ...hidden.position }, previousPosition: { ...hidden.position }, velocity: { x: 0, y: -10, z: 20 },
        damage: 20, age: 0, weaponSource: "aircraft", airWeapon: "heBomb" }];
      const payload = view();
      expect(payload.contacts.some(item => item.id === controller.id)).toBe(true);
      expect(payload.aircraft).toEqual([]);
      expect(payload.projectiles).toEqual([]);
      expect(payload.events.map(event => event.id)).toEqual([12]);
      expect(payload.events[0]).toMatchObject({ damage: 17, targetId: viewer.id, position: { x: 10, y: 0, z: 0 } });
      expect(payload.events[0]).not.toHaveProperty("squadronId");
      expect(payload.events[0]).not.toHaveProperty("controllerId");
      expect(JSON.stringify(payload.events)).not.toContain(hidden.id);
    });

    it(`${team}: authorized enemy flight events do not grant controller identity or private orders`, () => {
      const { state, controller, step, view } = fixture(team);
      state.airSquadrons = [flight(controller, "visible-event-source", { x: 2100, y: 180, z: 0 })];
      step();
      const air = state.airSquadrons[0]!;
      const source = { time: state.time, team: controller.team, controllerId: controller.id,
        squadronId: air.id, position: { ...air.position } };
      state.airEvents = [
        { ...source, id: 30, kind: "weaponReleased", weapon: "machineGun" },
        { ...source, id: 31, kind: "orderAccepted", orderKind: "defendShip" },
        { ...source, id: 32, kind: "orderRejected", rejectReason: "invalid-target" },
      ];
      const events = view().events;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ id: 30, squadronId: air.id, position: air.position });
      expect(events[0]).not.toHaveProperty("controllerId");
      expect(events[0]).not.toHaveProperty("orderKind");
    });
  }

  it.each(["expired", "future", "negative-time", "nonfinite-position", "no-role", "no-heading", "no-count"] as const)(
    "fails closed for an unusable hostile contact: %s", kind => {
      const { state, controller, view } = fixture("player", true);
      state.time = 8;
      const air = flight(controller, "invalid-contact-flight", { x: 500, y: 180, z: 0 });
      const sample = contact(air, 8);
      if (kind === "expired") sample.observedAt = 2.9;
      if (kind === "future") sample.observedAt = 8.1;
      if (kind === "negative-time") sample.observedAt = -1;
      if (kind === "nonfinite-position") sample.lastKnownPosition.x = NaN;
      if (kind === "no-role") delete sample.observedRole;
      if (kind === "no-heading") delete sample.observedHeading;
      if (kind === "no-count") delete sample.estimatedAircraft;
      air.contactsByTeam.player = sample; state.airSquadrons = [air];
      expect(view().aircraft).toEqual([]);
    });

  it("does not give sea-trials or developer mode a LAN visibility bypass", () => {
    const { state, viewer, controller, view } = fixture("player", true);
    state.mode = "sea-trials";
    viewer.developer = { enabled: true, unrestrictedWeapons: true, infiniteAmmunition: true,
      instantReload: true, speedMultiplier: 1 };
    state.airSquadrons = [flight(controller, "debug-hidden-flight", { x: 4500, y: 180, z: 4000 })];
    expect(view().aircraft).toEqual([]);
  });

  it("the unchanged client wire can render and then remove a frozen last-known aircraft", () => {
    const { state, controller, view } = fixture("player");
    state.time = 4;
    const air = flight(controller, "wire-old-flight", { x: 4500, y: 180, z: 4000 });
    air.contactsByTeam.player = { ...contact(air, 1), lastKnownPosition: { x: 2100, y: 180, z: 0 } };
    state.airSquadrons = [air];
    const client = new ClientBattleSession({ roomId: "air-visibility", peerId: "guest",
      gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH });
    client.receiveSnapshot(view(), 0);
    const rendered = client.renderState(150)!.state.airSquadrons[0]!;
    expect(rendered.position).toEqual(air.contactsByTeam.player.lastKnownPosition);
    expect(rendered).not.toHaveProperty("flight");
    state.time = 6.1;
    client.receiveSnapshot(view(), 2100);
    expect(client.renderState(2300)!.state.airSquadrons).toEqual([]);
  });
  it("friendly attack results do not expose an unseen target's live position", () => {
    const { state, viewer, controller, view } = fixture("player");
    const own = flight(viewer, "own-attack-source", { x: 0, y: 180, z: 0 });
    state.airSquadrons = [own];
    state.airEvents = [{ id: 40, time: state.time, kind: "attackHit", team: viewer.team,
      controllerId: viewer.id, squadronId: own.id, targetId: controller.id,
      position: { ...controller.position }, damage: 15, weapon: "heBomb", orderKind: "strikeShip" }];
    const event = view().events[0]!;
    expect(event).toMatchObject({ id: 40, squadronId: own.id, controllerId: viewer.id, damage: 15 });
    expect(event).not.toHaveProperty("targetId");
    expect(event).not.toHaveProperty("position");
  });

  it("nearby enemy ordnance keeps its physical position but not the hidden aircraft's identity or release origin", () => {
    const { state, controller, view } = fixture("player", true);
    const air = flight(controller, "hidden-ordnance-source", { x: 4500, y: 180, z: 4000 });
    state.airSquadrons = [air];
    const near = { x: 100, y: 20, z: 100 };
    state.projectiles = [{ id: 45, ownerId: air.id, team: controller.team, kind: "shell",
      position: near, previousPosition: { ...air.position }, velocity: { x: -20, y: -10, z: 10 },
      damage: 20, age: 1, weaponSource: "aircraft", airWeapon: "heBomb" }];
    state.shots = [{ id: 46, ownerId: air.id, team: controller.team, kind: "shell",
      position: { ...air.position }, weaponSource: "aircraft", airWeapon: "heBomb" }];
    state.impacts = [{ id: 47, kind: "splash", position: near, sourceId: air.id,
      sourceTeam: controller.team, weaponSource: "aircraft", airWeapon: "heBomb" }];
    const payload = view();
    expect(payload.aircraft).toEqual([]);
    expect(payload.projectiles[0]).toMatchObject({ id: 45, position: near });
    expect(payload.projectiles[0]).not.toHaveProperty("ownerId");
    expect(payload.projectiles[0]).not.toHaveProperty("previousPosition");
    expect(payload.events.map(event => event.id)).toEqual([47]);
    expect(payload.events[0]).not.toHaveProperty("sourceId");
    expect(JSON.stringify(payload)).not.toContain(air.id);
  });

  it("includes the exact five-second contact boundary and drops it immediately afterward", () => {
    const { state, controller, view } = fixture("player");
    const air = flight(controller, "expiry-boundary", { x: 4500, y: 180, z: 4000 });
    air.contactsByTeam.player = { ...contact(air, 1), lastKnownPosition: { x: 1900, y: 180, z: 0 } };
    state.airSquadrons = [air]; state.time = 6;
    expect(view().aircraft).toHaveLength(1);
    state.time = 6.000001;
    expect(view().aircraft).toEqual([]);
  });

});
