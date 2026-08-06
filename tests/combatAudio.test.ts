import { describe, expect, it } from "vitest";
import {
  audioAngularDelta,
  combatShotSoundKind,
  mainGunLayerGains,
  mountTraversed,
  throttleOrderChanged,
} from "../src/render/combatAudio";

describe("combat audio telemetry", () => {
  it("rings the engine telegraph only after a real throttle order change", () => {
    expect(throttleOrderChanged(undefined, 0.55)).toBe(false);
    expect(throttleOrderChanged(0.55, 0.55)).toBe(false);
    expect(throttleOrderChanged(0.55, 0.8)).toBe(true);
    expect(throttleOrderChanged(0.8, 0.55)).toBe(true);
  });

  it("detects mount traversal without treating angle wrapping as a full rotation", () => {
    const almostPositivePi = 179 * Math.PI / 180;
    const almostNegativePi = -179 * Math.PI / 180;
    expect(mountTraversed(undefined, 0)).toBe(false);
    expect(mountTraversed(0.4, 0.4)).toBe(false);
    expect(mountTraversed(0.4, 0.42)).toBe(true);
    expect(audioAngularDelta(almostPositivePi, almostNegativePi)).toBeCloseTo(2 * Math.PI / 180);
  });

  it("classifies aircraft weapons before their projectile shape", () => {
    expect(combatShotSoundKind({
      kind: "shell",
      weaponSource: "aircraft",
      airWeapon: "machineGun",
    })).toBe("airMachineGun");
    expect(combatShotSoundKind({
      kind: "shell",
      weaponSource: "aircraft",
      airWeapon: "heBomb",
    })).toBe("airBombRelease");
    expect(combatShotSoundKind({
      kind: "torpedo",
      weaponSource: "aircraft",
      airWeapon: "aerialTorpedo",
    })).toBe("airTorpedoEntry");
  });

  it("keeps ship weapons and depth charges on their own sound families", () => {
    expect(combatShotSoundKind({
      kind: "depthCharge",
      weaponSource: undefined,
      airWeapon: undefined,
    })).toBe("depthChargeDrop");
    expect(combatShotSoundKind({
      kind: "torpedo",
      weaponSource: undefined,
      airWeapon: undefined,
    })).toBe("torpedoLaunch");
    expect(combatShotSoundKind({
      kind: "shell",
      weaponSource: "secondary",
      airWeapon: undefined,
    })).toBe("secondaryGun");
    expect(combatShotSoundKind({
      kind: "shell",
      weaponSource: "mainGun",
      airWeapon: undefined,
    })).toBe("mainGun");
  });

  it("gives main guns a sharp transient above their pressure and echo layers", () => {
    const layers = mainGunLayerGains(0.2);
    expect(layers.crack).toBeGreaterThan(layers.blast);
    expect(layers.blast).toBeGreaterThan(layers.pressure);
    expect(layers.pressure).toBeGreaterThan(layers.echo);
    expect(layers.echo).toBeGreaterThan(0);
  });

  it("clamps invalid main-gun layer input", () => {
    expect(mainGunLayerGains(Number.NaN).crack).toBe(0);
    expect(mainGunLayerGains(-1).pressure).toBe(0);
    expect(mainGunLayerGains(2).crack).toBeCloseTo(1.28);
  });
});
