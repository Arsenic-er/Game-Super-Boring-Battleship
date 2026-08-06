import { describe, expect, it } from "vitest";
import {
  armorThicknessFor,
  compartmentSaturationMultiplier,
  createInitialState,
  isCitadelHit,
  moduleForProjectileHit,
  projectileHitContact,
  projectileImpactAngleDegrees,
  resolveArmorInteraction,
  recoverableFractionForHit,
  stepSimulation,
  type ArmorResolution,
  type ProjectileHitContact,
} from "../src/sim/simulation";
import { recommendedAmmoForTarget } from "../src/controllers/ruleBasedAi";
import { FIXED_STEP } from "../src/sim/config";
import type { ControlCommand, ProjectileState } from "../src/sim/types";
import { SHIP_CLASSES } from "../src/ships/classes";
import { SHIP_ARMOR_PROFILES } from "../src/ships/armorProfiles";
import { getMainBattery } from "../src/ships/mainBatteries";

describe("ammunition and armor interaction", () => {
  it("defines distinct gameplay armor schemes for every historical ship class", () => {
    expect(Object.keys(SHIP_ARMOR_PROFILES)).toHaveLength(15);
    expect(SHIP_ARMOR_PROFILES["north-carolina"].zones.side.magazine)
      .toBeGreaterThan(SHIP_ARMOR_PROFILES.cleveland.zones.side.magazine);
    expect(SHIP_ARMOR_PROFILES.cleveland.zones.side.magazine)
      .toBeGreaterThan(SHIP_ARMOR_PROFILES.fletcher.zones.side.magazine);
    expect(SHIP_ARMOR_PROFILES.richelieu.zones.side.bow)
      .toBeLessThan(SHIP_ARMOR_PROFILES.richelieu.zones.side.magazine);
  });

  it("derives WoWS-style HE penetration and AP overmatch from main-gun caliber", () => {
    const cleveland = getMainBattery("cleveland", "mk1-single", 4).shellProfile;
    const nurnberg = getMainBattery("nurnberg", "mk1-single", 3).shellProfile;
    const northCarolina = getMainBattery("north-carolina", "mk1-single", 3).shellProfile;
    expect(cleveland.hePenetrationMm).toBe(25);
    expect(nurnberg.hePenetrationMm).toBe(38);
    expect(northCarolina.apOvermatchArmorMm).toBeCloseTo(406 / 14.3, 5);
    expect(northCarolina.apFuseArmingArmorMm).toBeCloseTo(406 / 6, 5);
  });

  it("lets battleship AP defeat a broadside belt nearby but lose penetration with flight time", () => {
    const shell = getMainBattery("north-carolina", "mk1-single", 3).shellProfile;
    expect(resolveArmorInteraction("ap", 305, 0, 2, 30, .5, shell).result)
      .toBe("penetration");
    expect(resolveArmorInteraction("ap", 305, 0, 8, 30, .5, shell).result)
      .toBe("shatter");
  });

  it("overmatches thin bow plating but overpenetrates instead of deleting a destroyer", () => {
    const shell = getMainBattery("north-carolina", "mk1-single", 3).shellProfile;
    const result = resolveArmorInteraction("ap", 26, 80, 1, 20, 0, shell);
    expect(result.result).toBe("overpenetration");
    expect(result.damageMultiplier).toBe(.1);
  });

  it("keeps battleship HE out of the main belt and armored deck but lets it hit superstructure", () => {
    const shell = getMainBattery("yamato", "mk1-single", 3).shellProfile;
    expect(resolveArmorInteraction("he", 410, 0, 1, 30, .5, shell).result).toBe("shatter");
    expect(resolveArmorInteraction("he", 230, 0, 1, 30, .5, shell).result).toBe("shatter");
    expect(resolveArmorInteraction("he", 50, 0, 1, 30, .5, shell).result).toBe("penetration");
  });

  it("still ricochets 460 mm AP from an extremely angled heavy belt", () => {
    const shell = getMainBattery("yamato", "mk1-single", 3).shellProfile;
    expect(resolveArmorInteraction("ap", 410, 70, 1, 30, 0, shell).result).toBe("ricochet");
  });

  it("lets HE ignore impact angle but respects nominal penetration", () => {
    expect(resolveArmorInteraction("he", 21, 82, 3).result).toBe("penetration");
    const shatter = resolveArmorInteraction("he", 22, 0, 1);
    expect(shatter.result).toBe("shatter");
    expect(shatter.damageMultiplier).toBe(0);
    expect(shatter.moduleDamageMultiplier).toBeGreaterThan(0);
    expect(shatter.fireChanceMultiplier).toBeGreaterThan(0);
    expect(shatter.floodingChanceMultiplier).toBe(0);
  });

  it("makes AP ricochet at an extreme angle", () => {
    const result = resolveArmorInteraction("ap", 16, 72, 1.5);
    expect(result.result).toBe("ricochet");
    expect(result.damageMultiplier).toBe(0);
  });

  it("distinguishes AP penetration, overpenetration and non-penetration", () => {
    expect(resolveArmorInteraction("ap", 20, 44, 1, 11).result).toBe("penetration");
    expect(resolveArmorInteraction("ap", 6, 0, 1).result).toBe("overpenetration");
    expect(resolveArmorInteraction("ap", 20, 0, 1, 4).result).toBe("overpenetration");
    expect(resolveArmorInteraction("ap", 40, 44, 10, 20).result).toBe("shatter");
  });

  it("uses a probabilistic ricochet band and lets very thin armor overmatch", () => {
    expect(resolveArmorInteraction("ap", 16, 44, 1, 20, 0).result).not.toBe("ricochet");
    expect(resolveArmorInteraction("ap", 16, 52.5, 1, 20, 0.49).result).toBe("ricochet");
    expect(resolveArmorInteraction("ap", 16, 52.5, 1, 20, 0.51).result).not.toBe("ricochet");
    expect(resolveArmorInteraction("ap", 16, 60, 1, 20, 0.99).result).toBe("ricochet");
    expect(resolveArmorInteraction("ap", 8, 80, 1, 20, 0).result).not.toBe("ricochet");
  });

  it("keeps penetration damage at 33, 16.5 and 10 percent through saturation", () => {
    expect(compartmentSaturationMultiplier(100, 100)).toBe(1);
    expect(compartmentSaturationMultiplier(50, 100)).toBe(0.5);
    expect(compartmentSaturationMultiplier(1, 100)).toBe(0.5);
    expect(compartmentSaturationMultiplier(0, 100)).toBeCloseTo(0.1 / 0.33, 8);
  });

  it("recognizes low AP penetrations into cruiser and battleship citadels only", () => {
    const cruiser = createInitialState(
      101,
      "sea-trials",
      undefined,
      undefined,
      undefined,
      "cleveland",
    ).ships[0]!;
    const destroyer = createInitialState(102, "sea-trials").ships[0]!;
    const projectile: ProjectileState = {
      id: 1,
      ownerId: "test",
      team: "enemy",
      kind: "shell",
      ammoType: "ap",
      position: { x: 0, y: 3, z: 0 },
      previousPosition: { x: -10, y: 3, z: 0 },
      velocity: { x: 100, y: 0, z: 0 },
      damage: 300,
      age: 1,
    };
    const penetration: ArmorResolution = {
      result: "penetration",
      penetrationMm: 180,
      effectiveArmorMm: 100,
      damageMultiplier: 0.33,
      moduleDamageMultiplier: 0.58,
      fireChanceMultiplier: 0,
      floodingChanceMultiplier: 0,
    };
    const side: ProjectileHitContact = {
      point: { x: 0, y: 3, z: 0 },
      localPoint: { longitudinal: 0, lateral: 0, height: 3 },
      surfaceNormal: { x: 1, y: 0, z: 0 },
      armorZone: "side",
      distanceFraction: 0.5,
    };
    expect(isCitadelHit(cruiser, projectile, penetration, "engineRoom", side)).toBe(true);
    expect(isCitadelHit(cruiser, projectile, penetration, "magazine", {
      ...side,
      armorZone: "deck",
      localPoint: { ...side.localPoint, height: cruiser.maxHull },
    })).toBe(true);
    expect(isCitadelHit(cruiser, projectile, penetration, "bridge", side)).toBe(false);
    expect(isCitadelHit(destroyer, projectile, penetration, "engineRoom", side)).toBe(false);
    expect(isCitadelHit(cruiser, { ...projectile, ammoType: "he" }, penetration, "engineRoom", side))
      .toBe(false);
    expect(isCitadelHit(cruiser, projectile, { ...penetration, result: "overpenetration" }, "engineRoom", side))
      .toBe(false);
    expect(isCitadelHit(cruiser, projectile, penetration, "engineRoom", {
      ...side,
      localPoint: {
        ...side.localPoint,
        height: SHIP_CLASSES.cleveland.deckHeight,
      },
    })).toBe(false);
  });

  it("maps hit types to WoWS-style recoverable damage fractions", () => {
    const shell = { kind: "shell" } as ProjectileState;
    const torpedo = { kind: "torpedo" } as ProjectileState;
    expect(recoverableFractionForHit(shell, false, "overpenetration")).toBe(1);
    expect(recoverableFractionForHit(shell, false, "penetration")).toBe(0.5);
    expect(recoverableFractionForHit(shell, true, "penetration")).toBe(0.1);
    expect(recoverableFractionForHit(torpedo, false, "penetration")).toBe(0.5);
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
      previousPosition: { x: -100, y: 3, z: 0 },
      position: { x: 100, y: 3, z: 0 },
    }, ship);
    expect(contact).not.toBeNull();
    expect(contact?.armorZone).toBe("side");
    expect(contact?.point.x).toBeCloseTo(-(SHIP_CLASSES.fletcher.beam / 2 + 2), 5);
    expect(contact?.surfaceNormal.x).toBeCloseTo(-1, 5);
  });

  it("separates high side hits into the lightly armored superstructure", () => {
    const ship = createInitialState(204, "sea-trials").ships[0]!;
    ship.position = { x: 0, y: 0, z: 0 };
    ship.heading = 0;
    const contact = projectileHitContact({
      previousPosition: { x: -100, y: 7, z: 0 },
      position: { x: 100, y: 7, z: 0 },
    }, ship);
    expect(contact?.armorZone).toBe("superstructure");
    expect(armorThicknessFor("engineRoom", "superstructure", "fletcher")).toBe(16);
  });

  it("keeps continuous collision correct for a rotated hull", () => {
    const ship = createInitialState(205, "sea-trials").ships[0]!;
    ship.position = { x: 0, y: 0, z: 0 };
    ship.heading = Math.PI / 2;
    const contact = projectileHitContact({
      previousPosition: { x: 0, y: 3, z: -100 },
      position: { x: 0, y: 3, z: 100 },
    }, ship);
    expect(contact).not.toBeNull();
    expect(contact?.armorZone).toBe("side");
    expect(contact?.point.z).toBeCloseTo(-(SHIP_CLASSES.fletcher.beam / 2 + 2), 5);
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

  it("uses each hull class beam for projectile collision", () => {
    const destroyer = createInitialState(301, "sea-trials").ships[0]!;
    const battleship = createInitialState(
      301,
      "sea-trials",
      undefined,
      undefined,
      undefined,
      "north-carolina",
    ).ships[0]!;
    destroyer.position = { x: 0, y: 0, z: 0 };
    battleship.position = { x: 0, y: 0, z: 0 };
    const grazingPath = {
      previousPosition: { x: 12, y: 5, z: -150 },
      position: { x: 12, y: 5, z: 150 },
    };
    expect(projectileHitContact(grazingPath, destroyer)).toBeNull();
    expect(projectileHitContact(grazingPath, battleship)).not.toBeNull();
    expect(armorThicknessFor("engineRoom", "side", "battleship"))
      .toBeGreaterThan(armorThicknessFor("engineRoom", "side", "destroyer"));
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
    expect(player.ammoType).toBe("he");
    expect(player.pendingAmmoType).toBe("ap");
    expect(player.reloadRemaining).toBeGreaterThan(5);
    for (let index = 0; index < 400; index += 1) {
      stepSimulation(state, new Map([["player", command]]), FIXED_STEP);
    }
    expect(player.ammoType).toBe("ap");
    expect(player.pendingAmmoType).toBeUndefined();
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
    expect(state.projectiles[0]?.shellProfile?.caliberMm).toBe(127);
    expect(state.shots[0]?.ammoType).toBe("ap");
  });

  it("does not let ordinary shell hits create flooding", () => {
    const state = createInitialState(207, "sea-trials");
    const target = state.ships.find((ship) => ship.id === "test-target")!;
    target.position = { x: 0, y: 0, z: 0 };
    target.previousPosition = { ...target.position };
    target.heading = 0;
    state.projectiles.push({
      id: state.nextEntityId++,
      ownerId: "player",
      team: "player",
      kind: "shell",
      ammoType: "he",
      position: { x: -20, y: 5, z: 0 },
      previousPosition: { x: -20, y: 5, z: 0 },
      velocity: { x: 1_000, y: 0, z: 0 },
      damage: 105,
      age: 1,
    });
    stepSimulation(state, new Map(), 0.05);
    expect(state.impacts.some((impact) => impact.targetId === target.id)).toBe(true);
    expect(target.flooding).toBe(0);
  });

  it("selects AP for a close broadside with hysteresis and HE for an angled target", () => {
    expect(recommendedAmmoForTarget(2_200, 0, Math.PI / 2, "he")).toBe("ap");
    expect(recommendedAmmoForTarget(2_800, 0, Math.PI / 2, "ap")).toBe("ap");
    expect(recommendedAmmoForTarget(2_800, 0, Math.PI / 2, "he")).toBe("he");
    expect(recommendedAmmoForTarget(1_500, 0, 0.2, "ap")).toBe("he");
  });
});
