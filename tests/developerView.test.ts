import { describe, expect, it } from "vitest";
import {
  activeControlledShipId,
  controlDeveloperShip,
  normalDeveloperView,
  observeDeveloperEntity,
  reconcileDeveloperView,
} from "../src/controllers/developerView";
import { spawnDeveloperAirSquadron, spawnDeveloperShip } from "../src/sim/developerSandbox";
import { createInitialState } from "../src/sim/simulation";

describe("developer observation and control session", () => {
  it("observes ships and aircraft but only allows ships to be controlled", () => {
    const state = createInitialState();
    const ally = spawnDeveloperShip(state, "player", "cleveland")!;
    const air = spawnDeveloperAirSquadron(state, "player", "fighter", 5)!;

    expect(observeDeveloperEntity(state, ally.id)).toEqual({
      active: true,
      focus: { kind: "ship", id: ally.id },
    });
    expect(observeDeveloperEntity(state, air.id)).toEqual({
      active: true,
      focus: { kind: "airSquadron", id: air.id },
    });
    expect(controlDeveloperShip(state, ally.id)).toEqual({
      active: true,
      focus: { kind: "ship", id: ally.id },
      controlledShipId: ally.id,
    });
    expect(controlDeveloperShip(state, air.id)).toBeUndefined();
  });

  it("has one controlled ship at most and returns safely when focus disappears", () => {
    const state = createInitialState();
    const ally = spawnDeveloperShip(state, "player", "cleveland")!;
    const session = controlDeveloperShip(state, ally.id)!;
    expect(activeControlledShipId(session)).toBe(ally.id);

    ally.hull = 0;
    expect(reconcileDeveloperView(state, session)).toEqual(normalDeveloperView());
    expect(activeControlledShipId(normalDeveloperView())).toBe("player");
  });

  it("observation mode leaves every ship available to AI", () => {
    const state = createInitialState();
    const air = spawnDeveloperAirSquadron(state, "player", "fighter", 5)!;
    const session = observeDeveloperEntity(state, air.id)!;
    expect(session.controlledShipId).toBeUndefined();
    expect(activeControlledShipId(session)).toBeUndefined();
  });
});
