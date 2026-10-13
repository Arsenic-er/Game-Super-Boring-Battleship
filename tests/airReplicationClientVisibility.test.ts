import { describe, expect, it } from "vitest";
import { ClientBattleSession } from "../src/net/clientBattleSession";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import { replicationViewFor } from "../src/net/replicationView";
import { airVisualSnapshot } from "../src/render/aircraftPresentation";
import { createAirSquadronState } from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ShipState, Team } from "../src/sim/types";
import {
  compileAirMissionCommands, entityIdsInRect, type TacticalMapEntity,
} from "../src/ui/tacticalAirCommand";

const other = (team: Team): Team => team === "player" ? "enemy" : "player";
const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
const client = () => new ClientBattleSession({
  roomId: "air-client-visibility", peerId: "guest",
  gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH,
});

function fixture(team: Team) {
  const state = createInitialState(9201, "sea-trials");
  state.mapId = "open-sea-range"; state.underwaterTargets = [];
  const makeShip = (id: string, team: Team, x: number, z: number) => createDeveloperShipState({
    id, team, shipClassId: "fletcher", position: { x, y: 0, z },
    aiControlled: false, antiAirMounts: 0, secondaryGunIds: [], torpedoLauncherMounts: 0,
  });
  const viewer = makeShip("viewer", team, 0, 0);
  const owner = makeShip("private-controller", other(team), 5_500, 5_500);
  state.ships = [viewer, owner];
  const target = createAirSquadronState({
    id: "seen-aircraft", controllerId: owner.id, team: owner.team, role: "diveBomber",
    position: { x: 2_100, y: 180, z: 0 },
    recoverySource: { kind: "mapEdge", position: { x: 2_100, y: 80, z: 5_500 } },
  });
  target.phase = "outbound";
  target.flight = { speedMetersPerSecond: 90, pitch: 0, bank: 0 };
  target.order = {
    squadronId: target.id, kind: "moveTo", issuedAt: 0,
    area: { center: { x: 2_100, y: 180, z: 5_000 }, radius: 90 },
  };
  const own = createAirSquadronState({
    id: "own-fighter", controllerId: viewer.id, team, role: "fighter",
    position: { x: 0, y: 80, z: 0 },
    recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: 0 } },
  });
  state.airSquadrons = [own, target];
  const advance = (command: ControlCommand = idle(viewer)) =>
    stepSimulation(state, new Map([[viewer.id, command], [owner.id, idle(owner)]]),
      FIXED_STEP, { automatedAirControllerIds: new Set() });
  let tick = 0;
  const wire = () => replicationViewFor(state, viewer.id, ++tick, 0);
  advance();
  return { state, viewer, owner, targetId: target.id, ownId: own.id, advance, wire };
}

describe("replicated aircraft reach the client presentation and selection chain", () => {
  for (const team of ["player", "enemy"] as const) {
    it(`${team}: real observation survives producer, client, renderer and interception selection`, () => {
      const { state, viewer, targetId, ownId, advance, wire } = fixture(team);
      const payload = wire();
      const targetWire = payload.aircraft.find(entry => entry.id === targetId)!;
      expect(targetWire).toHaveProperty("contact");
      expect(targetWire).not.toHaveProperty("controllerId");
      const session = client();
      session.receiveSnapshot(payload, 0);
      const rendered = session.renderState(150).state;
      const target = rendered.airSquadrons.find(air => air.id === targetId)!;
      const contact = target.contactsByTeam[team]!;
      expect(contact).toBeDefined();
      expect(target.contactsByTeam[other(team)]).toBeUndefined();
      expect(airVisualSnapshot(target, rendered.time, team)).toMatchObject({
        observed: true, role: "diveBomber", aircraftCount: 6,
        position: contact.lastKnownPosition,
      });
      // These are the same contact-derived entity inputs and public selection /
      // command compiler consumed by the tactical map; no hidden model is read.
      const entities: TacticalMapEntity[] = [{
        id: target.id, category: "enemySquadron", label: "observed aircraft",
        point: { x: contact.lastKnownPosition.x, y: contact.lastKnownPosition.z },
        world: { ...contact.lastKnownPosition }, role: contact.observedRole,
      }];
      const targets = entityIdsInRect(entities,
        { left: 2_000, top: -100, right: 2_200, bottom: 100 }, ["enemySquadron"]);
      expect(targets).toEqual([targetId]);
      const missions = compileAirMissionCommands([{ id: ownId, role: "fighter" }],
        "interceptSquadron", { targetIds: targets });
      const frame = session.submitLocalCommand({ ...idle(viewer), airMissions: missions }, 160);
      advance(frame.payload.command);
      expect(state.airEvents).toContainEqual(expect.objectContaining({
        kind: "orderAccepted", squadronId: ownId, targetId, orderKind: "interceptSquadron",
      }));
    });

    it(`${team}: old contact timestamps survive repeated snapshots and retain the five-second fade`, () => {
      const { state, targetId, advance, wire } = fixture(team);
      const initial = wire();
      const initialContact = structuredClone(state.airSquadrons.find(air => air.id === targetId)!.contactsByTeam[team]!);
      const session = client();
      session.receiveSnapshot(initial, 0);
      state.weatherId = "sea-fog";
      while (state.time - initialContact.observedAt < 3.2) advance();
      const stale = wire();
      session.receiveSnapshot(stale, 3_200);
      const view = session.renderState(3_350).state;
      const target = view.airSquadrons.find(air => air.id === targetId)!;
      expect(target.contactsByTeam[team]!.observedAt).toBe(initialContact.observedAt);
      expect(target.position).toEqual(initialContact.lastKnownPosition);
      expect(target).not.toHaveProperty("flight");
      expect(airVisualSnapshot(target, view.time, team)?.visibility).toBeLessThan(1);
      expect(airVisualSnapshot(target, initialContact.observedAt + 5.01, team)).toBeUndefined();
      expect(state.airSquadrons.find(air => air.id === targetId)!.position)
        .not.toEqual(initialContact.lastKnownPosition);
      while (state.time - initialContact.observedAt <= 5.1) advance();
      session.receiveSnapshot(wire(), 5_100);
      expect(session.renderState(5_250).state.airSquadrons.some(air => air.id === targetId)).toBe(false);
    });

    it(`${team}: stable hidden-controller aliases keep reordered observed aircraft interpolation continuous`, () => {
      const { state, targetId, advance, wire } = fixture(team);
      const second = structuredClone(state.airSquadrons.find(air => air.id === targetId)!);
      second.id = "seen-aircraft-b";
      second.position.x = 1_900;
      second.previousPosition = { ...second.position };
      second.order!.squadronId = second.id;
      second.contactsByTeam = {};
      state.airSquadrons.push(second);
      advance();
      const previous = wire();
      const session = client();
      session.receiveSnapshot(previous, 0);
      for (let i = 0; i < 12; i++) advance();
      state.airSquadrons.reverse();
      const next = wire();
      session.receiveSnapshot(next, 200);
      const rendered = session.renderState(220).state;
      for (const id of [targetId, second.id]) {
        const before = previous.aircraft.find(air => air.id === id)!;
        const after = next.aircraft.find(air => air.id === id)!;
        expect(before).not.toHaveProperty("controllerId");
        expect(after).not.toHaveProperty("controllerId");
        const target = rendered.airSquadrons.find(air => air.id === id)!;
        const oldPoint = before.position as { x: number; y: number; z: number };
        const newPoint = after.position as { x: number; y: number; z: number };
        expect(target.position.z).toBeCloseTo((oldPoint.z + newPoint.z) / 2, 8);
        expect(target.controllerId).toBe("replicated-hidden-air-" + id);
        expect(airVisualSnapshot(target, rendered.time, team)?.position).toEqual(target.position);
        const later = session.renderState(600).state.airSquadrons.find(air => air.id === id)!;
        expect(later.position).toEqual(newPoint); // no hidden enemy dead reckoning
        expect(later.contactsByTeam[team]!.observedAt)
          .toBe((after.contact as { observedAt: number }).observedAt);
      }
    });
  }

  it.each([
    "missing-contact", "future", "expired", "missing-heading", "invalid-role", "invalid-point", "negative-count", "missing-id",
  ] as const)("fails closed for malformed or old enemy observation metadata: %s", malformed => {
    const { targetId, wire } = fixture("player");
    const payload = wire();
    const target = payload.aircraft.find(air => air.id === targetId)!;
    const contact = target.contact as Record<string, unknown>;
    if (malformed === "missing-contact") delete target.contact;
    if (malformed === "future") contact.observedAt = payload.time + 1;
    if (malformed === "expired") payload.time += 6;
    if (malformed === "missing-heading") delete contact.observedHeading;
    if (malformed === "invalid-role") contact.observedRole = "hidden-invalid-role";
    if (malformed === "invalid-point") contact.lastKnownPosition = { x: NaN, y: 1, z: 2 };
    if (malformed === "negative-count") contact.estimatedAircraft = -1;
    if (malformed === "missing-id") delete target.id;
    const session = client();
    session.receiveSnapshot(payload, 0);
    const rendered = session.renderState(150).state;
    expect(rendered.airSquadrons.filter(air => air.team === "enemy")).toEqual([]);
    expect(rendered.airSquadrons.some(air => air.id === "own-fighter")).toBe(true);
  });

  it("does not replace a stale contact with contradictory hidden live fields or share its object", () => {
    const { state, targetId, wire } = fixture("player");
    const payload = wire();
    payload.time += 3;
    const target = payload.aircraft.find(air => air.id === targetId)!;
    const contact = structuredClone(target.contact);
    target.position = { x: 5_555, y: 999, z: 5_555 };
    target.heading = 3;
    target.role = "torpedoBomber";
    target.aircraftOperational = 1;
    target.phase = "attackRun";
    target.flight = { speedMetersPerSecond: 175, pitch: -.9, bank: .7 };
    const session = client();
    session.receiveSnapshot(payload, 0);
    const rendered = session.renderState(150).state;
    const aircraft = rendered.airSquadrons.find(air => air.id === targetId)!;
    expect(aircraft.contactsByTeam.player).toEqual(contact);
    expect(aircraft.role).toBe("diveBomber");
    expect(aircraft.phase).toBe("patrolling");
    expect(aircraft.aircraftOperational).toBe(6);
    expect(aircraft.position).not.toEqual(target.position);
    expect(aircraft).not.toHaveProperty("flight");
    aircraft.contactsByTeam.player!.lastKnownPosition.x = -999;
    expect(session.renderState(150).state.airSquadrons.find(air => air.id === targetId)!.contactsByTeam.player)
      .toEqual(contact);
    expect(state.airSquadrons.find(air => air.id === targetId)!.position.x).not.toBe(-999);
  });
});
