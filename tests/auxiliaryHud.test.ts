import { describe, expect, it } from "vitest";
import { auxiliaryHudVisible } from "../src/ui/auxiliaryHud";

const active = {
  started: true,
  paused: false,
  running: true,
  mapOpen: false,
  menuOpen: false,
  developerOpen: false,
};

describe("auxiliary HUD hold gate", () => {
  it("shows details only while Tab is held in an active battle", () => {
    expect(auxiliaryHudVisible(true, active)).toBe(true);
    expect(auxiliaryHudVisible(false, active)).toBe(false);
  });

  it("stays closed behind every modal or inactive state", () => {
    expect(auxiliaryHudVisible(true, { ...active, started: false })).toBe(false);
    expect(auxiliaryHudVisible(true, { ...active, paused: true })).toBe(false);
    expect(auxiliaryHudVisible(true, { ...active, running: false })).toBe(false);
    expect(auxiliaryHudVisible(true, { ...active, mapOpen: true })).toBe(false);
    expect(auxiliaryHudVisible(true, { ...active, menuOpen: true })).toBe(false);
    expect(auxiliaryHudVisible(true, { ...active, developerOpen: true })).toBe(false);
  });
});
