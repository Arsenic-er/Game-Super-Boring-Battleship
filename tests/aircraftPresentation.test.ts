import { describe, expect, it } from "vitest";
import { createAirSquadronState } from "../src/sim/airOperations";
import {
  AIR_VISUAL_CONTACT_SECONDS,
  airVisualSnapshot,
  formationOffsets,
} from "../src/render/aircraftPresentation";

const create = () => createAirSquadronState({
  id: "air-test",
  controllerId: "player",
  team: "player",
  role: "fighter",
  recoverySource: { kind: "mapEdge", position: { x: 0, y: 180, z: -5_200 } },
  position: { x: 200, y: 180, z: 300 },
  aircraftCapacity: 6,
  now: 0,
});

describe("aircraft presentation", () => {
  it("hides grounded friendly aircraft and shows airborne phases", () => {
    const squadron = create();
    expect(airVisualSnapshot(squadron, 0)).toBeUndefined();
    squadron.phase = "outbound";
    expect(airVisualSnapshot(squadron, 1)).toMatchObject({
      position: squadron.position,
      aircraftCount: 6,
      observed: false,
    });
  });

  it("renders enemy aircraft only from a fresh contact snapshot", () => {
    const squadron = create();
    squadron.team = "enemy";
    delete squadron.contactsByTeam.player;
    squadron.position = { x: 9_999, y: 180, z: 9_999 };
    expect(airVisualSnapshot(squadron, 1)).toBeUndefined();
    squadron.contactsByTeam.player = {
      observedAt: 1,
      lastKnownPosition: { x: 700, y: 180, z: 400 },
      confidence: 0.8,
      observedRole: "torpedoBomber",
      observedHeading: 0.7,
      estimatedAircraft: 4,
    };
    expect(airVisualSnapshot(squadron, 2)).toMatchObject({
      position: { x: 700, y: 180, z: 400 },
      role: "torpedoBomber",
      heading: 0.7,
      aircraftCount: 4,
      observed: true,
    });
    squadron.phase = "destroyed";
    expect(airVisualSnapshot(squadron, 2.5)).toBeDefined();
    expect(airVisualSnapshot(squadron, 1 + AIR_VISUAL_CONTACT_SECONDS + 0.01))
      .toBeUndefined();
  });

  it("uses distinct, symmetric low-cost formations", () => {
    const fighter = formationOffsets("fighter", 5, "outbound");
    const torpedo = formationOffsets("torpedoBomber", 5, "outbound");
    expect(fighter).toHaveLength(5);
    expect(fighter[1]?.x).toBeCloseTo(-(fighter[2]?.x ?? 0));
    expect(torpedo[0]?.x).not.toBe(fighter[0]?.x);
    expect(Math.abs(torpedo[0]?.x ?? 0)).toBeGreaterThan(0);
    expect(formationOffsets("diveBomber", 99, "attackRun")).toHaveLength(12);
  });
});
