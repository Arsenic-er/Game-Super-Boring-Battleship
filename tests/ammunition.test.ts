import { describe, expect, it } from "vitest";
import {
  armorThicknessFor,
  createInitialState,
  moduleForProjectileHit,
  projectileHitContact,
  projectileImpactAngleDegrees,
  resolveArmorInteraction,
  stepSimulation,
} from "../src/sim/simulation";
import { FIXED_STEP } from "../src/sim/config";
import type { ControlCommand } from "../src/sim/types";

describe("ammunition and armor interaction", () => {
  it("lets HE ignore impact angle but respects nominal penetration", () => {
    expect(resolveArmorInteraction("he", 20, 82, 3).result).toBe("penetration");
    expect(resolveArmorInteraction("he", 30, 0, 1).result).toBe("shatter");
  });

  it("makes AP ricochet at an extreme angle", () => {
    const result = resolveArmorInteraction("ap", 16, 72, 1.5);
    expect(result.result).toBe("ricochet");
    expect(result.damageMultiplier).toBe(0);
  });

  it("distinguishes AP penetration, overpenetration and non-penetration", () => {
    expect(resolveArmorInteraction("ap", 20, 45, 1).result).toBe("penetration");
    expect(resolveArmorInteraction("ap", 6, 0, 1).result).toBe("overpenetration");
    expect(resolveArmorInteraction("ap", 40, 60, 4).result).toBe("shatter");
  });

  it("uses thicker armor around machinery and the magazine", () => {
    expect(armorThicknessFor("bridge")).toBeLessThan(armorThicknessFor("engineRoom"));
    expect(armorThicknessFor("engineRoom")).toBeLessThan(armorThicknessFor("magazine"));
  });

  it("maps precise compartments to their physical modules", () => {
    expect(moduleForProjectileHit("engineRoom", 4)).toBe("engine");
    expect(moduleForProjectileHit("magazine", 4)).toBe("magazine");
    expect(moduleForProjectileHit("stern", 4)).toBe("steering");
    expect(moduleForProjectileHit("bridge", 9)).toBe("crew");
    expect(moduleForProjectileHit("bow", 10)).toBe("gun");
  });

  it("derives impact angle from target aspect", () => {
    const broadside = projectileImpactAngleDegrees(
      { velocity: { x: 1, y: 0, z: 0 } },
      { x: 1, y: 0, z: 0 },
    );
    const grazing = projectileImpactAngleDegrees(
      { velocity: { x: 0, y: 0, z: 1 } },
      { x: 1, y: 0, z: 0 },
    );
    expect(broadside).toBeCloseTo(0, 5);
    expect(grazing).toBeCloseTo(90, 5);
  });

  it("continuously intersects a shell crossing the full beam in one tick", () => {
    const ship = createInitialState(204, "sea-trials").ships[0]!;
    ship.position = { x: 0, y: 0, z: 0 };
    ship.heading = 0;
    const contact = projectileHitContact({
      previousPosition: { x: -100, y: 5, z: 0 },
      position: { x: 100, y: 5, z: 0 },
    }, ship);
    expect(contact).not.toBeNull();
    expect(contact?.armorZone).toBe("side");
    expect(contact?.point.x).toBeCloseTo(-7.5, 5);
    expect(contact?.surfaceNormal.x).toBeCloseTo(-1, 5);
  });

  it("keeps continuous collision correct for a rotated hull", () => {
    const ship = createInitialState(205, "sea-trials").ships[0]!;
    ship.position = { x: 0, y: 0, z: 0 };
    ship.heading = Math.PI / 2;
    const contact = projectileHitContact({
      previousPosition: { x: 0, y: 5, z: -100 },
      position: { x: 0, y: 5, z: 100 },
    }, ship);
    expect(contact).not.toBeNull();
    expect(contact?.armorZone).toBe("side");
    expect(contact?.point.z).toBeCloseTo(-7.5, 5);
  });

  it("does not hit when a shell passes above the hull box", () => {
    const ship = createInitialState(206, "sea-trials").ships[0]!;
    ship.position = { x: 0, y: 0, z: 0 };
    const contact = projectileHitContact({
      previousPosition: { x: -100, y: 30, z: 0 },
      position: { x: 100, y: 30, z: 0 },
    }, ship);
    expect(contact).toBeNull();
  });

  it("requires a reload when changing shell type", () => {
    const state = createInitialState(202, "sea-trials");
    const player = state.ships.find((ship) => ship.id === "player")!;
    const command: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { x: player.position.x, y: 0, z: player.position.z + 1_000 },
      fire: false,
      ammoType: "ap",
      weaponSlot: "mainGun",
    };
    stepSimulation(state, new Map([["player", command]]), FIXED_STEP);
    expect(player.ammoType).toBe("ap");
    expect(player.reloadRemaining).toBeGreaterThan(5);
  });

  it("spawns projectiles with the loaded shell type", () => {
    const state = createInitialState(203, "sea-trials");
    const player = state.ships.find((ship) => ship.id === "player")!;
    player.ammoType = "ap";
    const command: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { x: player.position.x, y: 0, z: player.position.z + 1_000 },
      fire: true,
      ammoType: "ap",
      weaponSlot: "mainGun",
    };
    stepSimulation(state, new Map([["player", command]]), FIXED_STEP);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]?.ammoType).toBe("ap");
    expect(state.shots[0]?.ammoType).toBe("ap");
  });
});
