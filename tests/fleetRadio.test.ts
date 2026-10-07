import { describe, expect, it } from "vitest";
import { FleetRadioNetwork, FLEET_RADIO_DELAY_SECONDS, FLEET_RADIO_TTL_SECONDS } from "../src/sim/fleetRadio";
import { createInitialState, observe } from "../src/sim/simulation";
import type { Observation, SensorContact, ShipState, Team } from "../src/sim/types";

function fixture() {
  const state = createInitialState(103);
  const source = structuredClone(state.ships[0]);
  source.id = "scout";
  source.team = "player";
  source.hull = source.maxHull;
  source.isTestTarget = false;
  source.position = { x: 0, y: 0, z: 0 };
  const receiver = { ...structuredClone(source), id: "receiver", position: { x: 100, y: 0, z: 100 } };
  const enemy = { ...structuredClone(source), id: "enemy-scout", team: "enemy" as Team };
  const template = observe(state, state.ships[0].id);
  const observation = (self: ShipState, contacts: SensorContact[] = [], time = 0): Observation =>
    ({ ...template, self, contacts, sharedContacts: [], time });
  const contact = (observedAt = 0, id = "enemy-target"): SensorContact => ({
    id, team: "enemy", observedAt, position: { x: 400, y: 4, z: 500 },
    heading: 0.25, speedKnots: 24, rangeMeters: 640, confidence: 0.9, estimatedHullRatio: 0.8,
  });
  const radio = new FleetRadioNetwork();
  return { source, receiver, enemy, observation, contact, radio };
}

describe("delayed friendly search reports", () => {
  it("delivers only after the full three-second transport delay", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()])], 0);
    radio.update([observation(source)], FLEET_RADIO_DELAY_SECONDS - 0.001);
    expect(radio.contactsFor(receiver, 2.999)).toEqual([]);
    radio.update([observation(source)], FLEET_RADIO_DELAY_SECONDS);
    expect(radio.contactsFor(receiver, 3)).toEqual([expect.objectContaining({
      id: "enemy-target", sourceShipId: "scout", observedAt: 0, receivedAt: 3,
    })]);
  });

  it("starts latency on first network sampling, not the old observation timestamp", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact(0)])], 8);
    radio.update([observation(source)], 10);
    expect(radio.contactsFor(receiver, 10)).toEqual([]);
    radio.update([observation(source)], 11);
    expect(radio.contactsFor(receiver, 11)[0]).toMatchObject({ observedAt: 0, receivedAt: 11 });
  });

  it("does not starve first delivery under continuous new local samples", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    for (let tick = 0; tick <= 30; tick++) {
      const time = tick / 10;
      radio.update([observation(source, [contact(time)], time)], time);
    }
    expect(radio.contactsFor(receiver, 3)[0]).toMatchObject({ observedAt: 0, receivedAt: 3 });
    for (let tick = 31; tick <= 61; tick++) {
      const time = tick / 10;
      radio.update([observation(source, [contact(time)], time)], time);
    }
    const next = radio.contactsFor(receiver, 6.1)[0];
    expect(next.observedAt).toBeGreaterThan(0);
    expect(next.observedAt).toBeLessThanOrEqual(3.1);
  });

  it("never requeues the same cached source/target/timestamp after delivery", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    for (let time = 0; time < 15; time++) radio.update([observation(source, [contact()])], time);
    expect(radio.contactsFor(receiver, 14)[0]?.receivedAt).toBe(3);
    radio.update([observation(source, [contact()])], 15);
    expect(radio.contactsFor(receiver, 15)).toEqual([]);
  });

  it("isolates both sides and never returns a source's own report", () => {
    const { source, receiver, enemy, contact, observation, radio } = fixture();
    const enemyAlly = { ...enemy, id: "enemy-receiver" };
    const enemyContact = { ...contact(), id: receiver.id, team: "player" as Team };
    const observations = [observation(source, [contact()]), observation(enemy, [enemyContact])];
    radio.update(observations, 0);
    radio.update(observations, 3);
    expect(radio.contactsFor(receiver, 3).map(({ id }) => id)).toEqual(["enemy-target"]);
    expect(radio.contactsFor(enemyAlly, 3).map(({ id }) => id)).toEqual([receiver.id]);
    expect(radio.contactsFor(source, 3)).toEqual([]);
    expect(radio.contactsFor(enemy, 3)).toEqual([]);
  });

  it("expires at observedAt + TTL, even if transport started much later", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()])], 10);
    radio.update([observation(source)], 13);
    expect(radio.contactsFor(receiver, FLEET_RADIO_TTL_SECONDS - 0.001)).toHaveLength(1);
    expect(radio.contactsFor(receiver, FLEET_RADIO_TTL_SECONDS)).toEqual([]);
    radio.update([observation(source)], 15);
    expect(radio.contactsFor(receiver, 16)).toEqual([]);
  });

  it("does not transmit samples that expire while in transit", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()])], 13);
    radio.update([observation(source)], 16);
    expect(radio.contactsFor(receiver, 16)).toEqual([]);
  });

  it.each(["removed", "destroyed", "test-target"] as const)("drops %s source packets and delivered reports", (kind) => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()])], 0);
    radio.update([observation(source)], 3);
    expect(radio.contactsFor(receiver, 3)).toHaveLength(1);
    if (kind === "destroyed") source.hull = 0;
    if (kind === "test-target") source.isTestTarget = true;
    radio.update(kind === "removed" ? [] : [observation(source, [contact(4)])], 4);
    expect(radio.contactsFor(receiver, 4)).toEqual([]);
    source.hull = source.maxHull;
    source.isTestTarget = false;
    radio.update([observation(source)], 8);
    expect(radio.contactsFor(receiver, 8)).toEqual([]);
  });

  it("does not leak exact target removal or destruction into the cached report", () => {
    const { source, receiver, enemy, contact, observation, radio } = fixture();
    const seen = { ...contact(), id: enemy.id };
    radio.update([observation(source, [seen]), observation(enemy)], 0);
    radio.update([observation(source), observation(enemy)], 3);
    enemy.hull = 0;
    radio.update([observation(source), observation(enemy)], 4);
    expect(radio.contactsFor(receiver, 4)[0]?.id).toBe(enemy.id);
    radio.update([observation(source)], 5);
    expect(radio.contactsFor(receiver, 5)[0]?.id).toBe(enemy.id);
  });

  it("takes defensive copies on input and every output without extrapolating motion", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    const seen = contact();
    radio.update([observation(source, [seen])], 0);
    seen.position.x = 999;
    seen.heading = 10;
    seen.confidence = 0.1;
    radio.update([observation(source)], 3);
    const first = radio.contactsFor(receiver, 3)[0];
    expect(first.position).toEqual({ x: 400, y: 4, z: 500 });
    expect(first.heading).toBe(0.25);
    first.position.z = 900;
    first.speedKnots = 500;
    const later = radio.contactsFor(receiver, 6)[0];
    expect(later.position).toEqual({ x: 400, y: 4, z: 500 });
    expect(later.speedKnots).toBe(24);
    expect(later.observedAt).toBe(0);
    expect(later.confidence).toBeLessThan(first.confidence);
  });

  it("computes each receiver's own current horizontal range", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()])], 0);
    radio.update([observation(source)], 3);
    expect(radio.contactsFor(receiver, 3)[0].rangeMeters).toBe(500);
    receiver.position = { x: 400, y: 100, z: 500 };
    expect(radio.contactsFor(receiver, 4)[0].rangeMeters).toBe(0);
  });

  it("does not retransmit already shared reports", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()]), observation(receiver)], 0);
    radio.update([observation(source), observation(receiver)], 3);
    const relay = observation(receiver);
    relay.sharedContacts = radio.contactsFor(receiver, 3);
    radio.update([relay], 4);
    radio.update([relay], 7);
    expect(radio.contactsFor({ ...receiver, id: "third" }, 7)).toEqual([]);
  });

  it("clears state on explicit reset and starts full latency in a new battle", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()])], 0);
    radio.update([observation(source)], 3);
    radio.reset();
    expect(radio.contactsFor(receiver, 4)).toEqual([]);
    radio.update([observation(source, [contact(4)])], 4);
    radio.update([observation(source)], 6.99);
    expect(radio.contactsFor(receiver, 6.99)).toEqual([]);
    radio.update([observation(source)], 7);
    expect(radio.contactsFor(receiver, 7)[0]?.observedAt).toBe(4);
  });

  it("clears state when simulation time rewinds in update or read", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact(20)])], 20);
    radio.update([observation(source)], 23);
    radio.update([observation(source, [contact()])], 0);
    expect(radio.contactsFor(receiver, 0)).toEqual([]);
    radio.update([observation(source)], 3);
    expect(radio.contactsFor(receiver, 3)[0]?.observedAt).toBe(0);
    expect(radio.contactsFor(receiver, 1)).toEqual([]);
    expect(radio.contactsFor(receiver, 3)).toEqual([]);
  });

  it("deduplicates deterministically by freshness, confidence then source id", () => {
    const { source, receiver, contact, observation } = fixture();
    const a = { ...source, id: "a" }, b = { ...source, id: "b" }, c = { ...source, id: "c" };
    const samples = [
      observation(c, [{ ...contact(1), confidence: 0.8 }]),
      observation(b, [{ ...contact(1), confidence: 0.9 }]),
      observation(a, [{ ...contact(1), confidence: 0.9 }, contact(0, "z-target"), contact(0, "a-target")]),
    ];
    const outputs = [samples, [...samples].reverse()].map((batch) => {
      const radio = new FleetRadioNetwork();
      radio.update(batch, 1);
      radio.update(batch, 4);
      return radio.contactsFor(receiver, 4);
    });
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0].map(({ id }) => id)).toEqual(["a-target", "enemy-target", "z-target"]);
    expect(outputs[0].find(({ id }) => id === "enemy-target")?.sourceShipId).toBe("a");
    const fresh = new FleetRadioNetwork();
    fresh.update([observation(a, [contact(0)]), observation(b, [{ ...contact(1), confidence: 0.1 }])], 1);
    fresh.update([observation(a), observation(b)], 4);
    expect(fresh.contactsFor(receiver, 4)[0].sourceShipId).toBe("b");
  });

  it("rejects non-finite fields, future samples, negative ranges and invalid contact allegiance", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    const invalid = [
      { ...contact(), observedAt: 1 },
      { ...contact(), observedAt: NaN },
      { ...contact(), heading: Infinity },
      { ...contact(), speedKnots: NaN },
      { ...contact(), rangeMeters: -1 },
      { ...contact(), confidence: NaN },
      { ...contact(), estimatedHullRatio: Infinity },
      { ...contact(), position: { x: NaN, y: 0, z: 0 } },
      { ...contact(), team: "player" as Team },
      { ...contact(), id: source.id },
    ];
    radio.update([observation(source, invalid)], 0);
    radio.update([observation(source)], 3);
    expect(radio.contactsFor(receiver, 3)).toEqual([]);
    radio.update([observation(source, [contact(3)])], 3);
    radio.update([observation(source)], 6);
    expect(radio.contactsFor({ ...receiver, position: { x: Infinity, y: 0, z: 0 } }, 6)).toEqual([]);
    radio.update([], NaN);
    expect(radio.contactsFor(receiver, 6)).toEqual([]);
  });

  it("clears a source's old team when developer tools move it to the other side", () => {
    const { source, receiver, enemy, contact, observation, radio } = fixture();
    radio.update([observation(source, [contact()])], 0);
    radio.update([observation(source)], 3);
    source.team = "enemy";
    radio.update([observation(source)], 4);
    expect(radio.contactsFor(receiver, 4)).toEqual([]);
    expect(radio.contactsFor(enemy, 4)).toEqual([]);
  });

  it("bounds remembered targets across waves of distinct debug entities", () => {
    const { source, receiver, contact, observation, radio } = fixture();
    const many = Array.from({ length: 200 }, (_, index) => contact(0, "target-" + index.toString().padStart(3, "0")));
    radio.update([observation(source, many)], 0);
    radio.update([observation(source)], 3);
    expect(radio.contactsFor(receiver, 3)).toHaveLength(64);
    expect(radio.contactsFor(receiver, 3)[0].id).toBe("target-000");
  });
});
