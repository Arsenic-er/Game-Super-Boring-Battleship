import { describe, expect, it } from "vitest";
import { ATOLL_MAP, terrainBlocksLineOfSight } from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import { shipPresentationMode } from "../src/sim/playerPerception";
import { seaTrialsContacts } from "../src/sim/seaTrialsContacts";
import { createInitialState } from "../src/sim/simulation";

function trials() {
  const state = createInitialState(7501, "sea-trials");
  return {
    state,
    player: state.ships.find(ship => ship.id === "player")!,
    target: state.ships.find(ship => ship.isTestTarget)!,
  };
}

describe("sea-trial map contacts", () => {
  it("exposes the actual stationary test target without a sensor acquisition step", () => {
    const { state, target } = trials();
    state.time = 12.5;
    target.hull = target.maxHull * .75;
    expect(seaTrialsContacts(state)).toEqual([{
      id: target.id, team: "enemy", mode: "tracking", live: true, confidence: 1,
      lastObservedAt: 12.5, position: { x: 0, y: 0, z: -460 },
      heading: Math.PI / 2, speedKnots: 0, rangeMeters: 440, estimatedHullRatio: .75,
    }]);
  });

  it("never augments normal battle perception, even for a marked test target", () => {
    const state = createInitialState(7502, "battle");
    const enemy = state.ships.find(ship => ship.team === "enemy")!;
    enemy.isTestTarget = true;
    expect(seaTrialsContacts(state)).toEqual([]);
    expect(shipPresentationMode(enemy, "battle")).toBe("hidden");
  });

  it("includes all living enemy ships, including unmarked developer spawns", () => {
    const { state, target } = trials();
    state.ships.push(
      { ...target, id: "ordinary-enemy", isTestTarget: false },
      { ...target, id: "friendly-target", team: "player" },
      { ...target, id: "sunk-target", hull: 0 },
      { ...target, id: "destroyed-target", hull: -1 },
    );
    expect(seaTrialsContacts(state).map(contact => contact.id)).toEqual([target.id, "ordinary-enemy"]);
  });

  it("uses an explicitly selected living friendly observer", () => {
    const { state, player, target } = trials();
    state.ships.push({ ...player, id: "ally", position: { x: 300, y: 0, z: target.position.z - 400 } });
    expect(seaTrialsContacts(state, "ally")[0]?.rangeMeters).toBe(500);
  });

  it.each(["missing", "dead-ally", "test-target"])(
    "falls back to the live player when the requested observer %s is invalid",
    observerId => {
      const { state, player } = trials();
      state.ships.unshift({ ...player, id: "dead-ally", hull: 0, position: { x: 900, y: 0, z: 900 } });
      expect(seaTrialsContacts(state, observerId)[0]?.rangeMeters).toBe(440);
    },
  );

  it("keeps the player observer stable when friendly ships are reordered", () => {
    const { state, player, target } = trials();
    state.ships.unshift({ ...player, id: "ally", position: { x: 300, y: 0, z: target.position.z - 400 } });
    expect(seaTrialsContacts(state)[0]?.rangeMeters).toBe(440);
    player.hull = 0;
    expect(seaTrialsContacts(state)[0]?.rangeMeters).toBe(500);
  });

  it("does not use a hostile or destroyed ship when no living friendly exists", () => {
    const { state, player, target } = trials();
    player.hull = 0;
    expect(seaTrialsContacts(state, target.id)).toEqual([]);
  });

  it("respects island line of sight even for explicitly visible training targets", () => {
    const { state, player, target } = trials();
    state.mapId = ATOLL_MAP.id;
    player.position = { x: -1_680, y: 0, z: 850 };
    target.position = { x: -1_680, y: 0, z: 2_600 };
    expect(terrainBlocksLineOfSight(
      state.mapId, player.position, target.position,
      getShipClass(player.shipClassId).deckHeight + 12,
      getShipClass(target.shipClassId).deckHeight + 12,
    )).toBe(true);
    expect(seaTrialsContacts(state)).toEqual([]);
    target.position.z = 950;
    expect(seaTrialsContacts(state).map(contact => contact.id)).toEqual([target.id]);
  });

  it("returns copied snapshots without mutating or exposing live ship positions", () => {
    const { state, target } = trials();
    const before = structuredClone(state);
    const contact = seaTrialsContacts(state)[0]!;
    expect(state).toEqual(before);
    expect(contact.position).not.toBe(target.position);
    contact.position.x += 100;
    expect(target.position.x).toBe(0);
    target.position.z += 100;
    expect(contact.position.z).toBe(-460);
  });
});
