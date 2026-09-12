import { describe, expect, it } from "vitest";
import { createAirSquadronState } from "../src/sim/airOperations";
import {
  AIR_VISUAL_CONTACT_SECONDS,
  aircraftFormationPose,
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
    expect(torpedo[0]?.x).toBe(0);
    expect(Math.abs(torpedo[1]?.x ?? 0)).toBeGreaterThan(Math.abs(fighter[1]?.x ?? 0));
    expect(formationOffsets("diveBomber", 99, "attackRun")).toHaveLength(12);
  });

  it("keeps preview poses static instead of inventing sine-wave flight motion", () => {
    const lead = aircraftFormationPose("fighter", 0, 5, "outbound", 12, "alpha")!;
    const wingman = aircraftFormationPose("fighter", 1, 5, "outbound", 12, "alpha")!;
    const later = aircraftFormationPose("fighter", 0, 5, "outbound", 12.1, "alpha")!;
    expect(lead.y).not.toBe(wingman.y);
    expect(lead.yaw).toBe(0);
    expect(wingman.yaw).toBe(0);
    expect(later).toEqual(lead);
  });

  it("changes formation and attitude for role-specific attack runs", () => {
    const torpedo = formationOffsets("torpedoBomber", 5, "attackRun");
    const dive = aircraftFormationPose("diveBomber", 0, 5, "attackRun", 2, "dive")!;
    expect(Math.max(...torpedo.map(({ x }) => x)) - Math.min(...torpedo.map(({ x }) => x)))
      .toBeGreaterThan(70);
    expect(dive.pitch).toBeGreaterThan(.7);
  });

  it("copies authorized physical flight state without exposing the mutable SIM object", () => {
    const squadron = create();
    squadron.phase = "outbound";
    squadron.flight = { speedMetersPerSecond: 83, pitch: .14, bank: -.4 };
    const view = airVisualSnapshot(squadron, 1)!;
    expect(view.flight).toEqual(squadron.flight);
    expect(view.flight).not.toBe(squadron.flight);
    view.flight!.pitch = .9;
    expect(squadron.flight.pitch).toBe(.14);
  });

  it("never copies live enemy flight state into a last-known contact", () => {
    const squadron = create();
    squadron.team = "enemy";
    squadron.phase = "outbound";
    squadron.flight = { speedMetersPerSecond: 133, pitch: 1.1, bank: -.8 };
    squadron.contactsByTeam.player = { observedAt: 1, lastKnownPosition: { x: 1, y: 2, z: 3 }, confidence: .9, estimatedAircraft: 4 };
    expect(airVisualSnapshot(squadron, 2)?.flight).toBeUndefined();
    expect(airVisualSnapshot(squadron, 2, "enemy")?.flight).toEqual(squadron.flight);
    squadron.contactsByTeam.player.estimatedAircraft = 0;
    expect(airVisualSnapshot(squadron, 2)).toBeUndefined();
  });
});
