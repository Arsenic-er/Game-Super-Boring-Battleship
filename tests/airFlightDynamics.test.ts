import { describe, expect, it } from "vitest";
import { AIR_FLIGHT_PROFILE, advanceAirKinematics, type AirKinematicsInput, type AirKinematicsResult } from "../src/sim/airFlightModel";
import type { AircraftRole } from "../src/sim/types";

const base = (role: AircraftRole = "fighter"): AirKinematicsInput => ({
  id: `${role}-physics`, role, phase: "outbound", position: { x: 0, y: 1000, z: 0 },
  heading: 0, destination: { x: 1000, y: 1100, z: 5000 },
  speedMetersPerSecond: 100, targetAltitude: 1100, dt: 1 / 60, time: 0,
  canMove: true, flight: { speedMetersPerSecond: 100, pitch: 0, bank: 0 },
});
const deltaAngle = (to: number, from: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const distance = (a: AirKinematicsResult["position"], b: AirKinematicsResult["position"]): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function fly(input: AirKinematicsInput, seconds: number, fps = 60): AirKinematicsResult {
  let current = { position: { ...input.position }, heading: input.heading, flight: { ...input.flight! } };
  for (let frame = 0; frame < seconds * fps; frame += 1) {
    current = advanceAirKinematics({ ...input, ...current, dt: 1 / fps, time: frame / fps });
  }
  return current;
}

describe("bounded three-dimensional flight dynamics", () => {
  it.each(["fighter", "diveBomber", "torpedoBomber"] as const)("respects %s pitch, roll, acceleration and airspeed limits through retasking", (role) => {
    const input = base(role);
    const profile = AIR_FLIGHT_PROFILE[role];
    let current = { position: { ...input.position }, heading: 0, flight: { ...input.flight! } };
    const dt = 1 / 60;
    for (let frame = 0; frame < 600; frame += 1) {
      const next = advanceAirKinematics({ ...input, ...current, dt, time: frame * dt,
        destination: frame < 300 ? { x: 10_000, y: 1000, z: 0 } : { x: -10_000, y: 500, z: 0 },
        targetPitch: frame < 300 ? 1 : -1.4, targetAltitude: 1000,
        speedMetersPerSecond: frame < 300 ? 200 : 60,
      });
      expect(Math.abs(next.flight.bank - current.flight.bank)).toBeLessThanOrEqual(profile.rollRateRadiansPerSecond * dt + 1e-9);
      expect(Math.abs(next.flight.pitch - current.flight.pitch)).toBeLessThanOrEqual(profile.pitchRateRadiansPerSecond * dt + 1e-9);
      expect(Math.abs(next.flight.speedMetersPerSecond - current.flight.speedMetersPerSecond)).toBeLessThanOrEqual(profile.longitudinalAccelerationMetersPerSecondSquared * dt + 1e-9);
      expect(Math.abs(next.flight.bank)).toBeLessThanOrEqual(profile.maximumBankRadians + 1e-9);
      expect(next.flight.pitch).toBeGreaterThanOrEqual(-profile.maximumDiveRadians - 1e-9);
      expect(next.flight.pitch).toBeLessThanOrEqual(profile.maximumClimbRadians + 1e-9);
      expect(next.flight.speedMetersPerSecond).toBeGreaterThan(0);
      expect(next.flight.speedMetersPerSecond).toBeLessThanOrEqual(profile.maximumSpeedMetersPerSecond);
      expect(distance(next.position, current.position)).toBeLessThanOrEqual(profile.maximumSpeedMetersPerSecond * dt + 1e-7);
      current = next;
    }
  });

  it("conserves the commanded airspeed as a 3D vector instead of adding a free vertical speed", () => {
    const input = { ...base(), dt: 1 / 120, destination: { x: 0, y: 1000, z: 10_000 }, targetPitch: 0.25,
      flight: { speedMetersPerSecond: 100, pitch: 0.25, bank: 0 } };
    const next = advanceAirKinematics(input);
    const averageSpeed = (100 + next.flight.speedMetersPerSecond) / 2;
    expect(distance(next.position, input.position) / input.dt).toBeCloseTo(averageSpeed, 7);
    expect((next.position.y - input.position.y) / input.dt).toBeCloseTo(averageSpeed * Math.sin(0.25), 7);
    expect((next.position.z - input.position.z) / input.dt).toBeCloseTo(averageSpeed * Math.cos(0.25), 7);
  });

  it("changes heading through actual bank and airspeed, with the expected right-turn sign", () => {
    const input = { ...base(), dt: 1 / 120, targetAltitude: 1000,
      flight: { speedMetersPerSecond: 100, pitch: 0, bank: 0.4 } };
    const next = advanceAirKinematics(input);
    const midBank = (input.flight.bank + next.flight.bank) / 2;
    const midSpeed = (input.flight.speedMetersPerSecond + next.flight.speedMetersPerSecond) / 2;
    expect(deltaAngle(next.heading, input.heading) / input.dt).toBeCloseTo(9.81 * Math.tan(midBank) / midSpeed, 8);
    expect(next.heading).toBeGreaterThan(0);
    expect(next.position.x).toBeGreaterThan(0);
  });

  it("loses speed while climbing and gains speed in a dive under the same speed command", () => {
    const input = { ...base(), destination: { x: 0, y: 1000, z: 10_000 } };
    const level = fly({ ...input, targetPitch: 0 }, 5);
    const climb = fly({ ...input, targetPitch: 0.3 }, 5);
    const dive = fly({ ...input, targetPitch: -0.3 }, 5);
    expect(climb.flight.speedMetersPerSecond).toBeLessThan(level.flight.speedMetersPerSecond - 2);
    expect(dive.flight.speedMetersPerSecond).toBeGreaterThan(level.flight.speedMetersPerSecond + 2);
    expect(climb.position.y).toBeGreaterThan(level.position.y + 70);
    expect(dive.position.y).toBeLessThan(level.position.y - 70);
  });

  it("does not stop or snap onto a nearby waypoint", () => {
    const input = { ...base(), destination: { x: 0, y: 1000, z: 0.1 }, targetAltitude: 1000, dt: 0.1 };
    const next = advanceAirKinematics(input);
    expect(next.position.z).toBeGreaterThan(9);
    expect(next.flight.speedMetersPerSecond).toBeGreaterThan(99);
  });

  it("accelerates continuously from launch speed instead of jumping to cruise", () => {
    const input = { ...base(), flight: { speedMetersPerSecond: 0, pitch: 0, bank: 0 }, dt: 0.1 };
    const next = advanceAirKinematics(input);
    expect(next.flight.speedMetersPerSecond).toBeGreaterThan(0);
    expect(next.flight.speedMetersPerSecond).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(next.position.y).toBe(input.position.y);
    expect(distance(next.position, input.position)).toBeLessThan(0.1);
  });

  it("captures an altitude smoothly without the old programmed sine bobbing", () => {
    const input = { ...base("diveBomber"), position: { x: 0, y: 100, z: 0 },
      destination: { x: 0, y: 300, z: 100_000 }, targetAltitude: 300 };
    const at30 = fly(input, 30);
    const at60 = fly(input, 60);
    expect(Math.abs(at30.position.y - 300)).toBeLessThan(2);
    expect(Math.abs(at60.position.y - 300)).toBeLessThan(0.05);
    expect(Math.abs(at60.flight.pitch)).toBeLessThan(0.001);
  });

  it("supports a visible steep dive then rate-limited pull-out without changing position directly", () => {
    const input = { ...base("diveBomber"), position: { x: 0, y: 1500, z: 0 },
      destination: { x: 0, y: 100, z: 100_000 }, targetPitch: -1.05 };
    const diving = fly(input, 4);
    expect(diving.flight.pitch).toBeLessThan(-0.9);
    expect(diving.position.y).toBeLessThan(1330);
    const pulling = advanceAirKinematics({ ...input, ...diving, targetPitch: 0.2, dt: 1 / 60 });
    expect(pulling.flight.pitch).toBeGreaterThan(diving.flight.pitch);
    expect(pulling.flight.pitch - diving.flight.pitch).toBeLessThanOrEqual(AIR_FLIGHT_PROFILE.diveBomber.pitchRateRadiansPerSecond / 60 + 1e-9);
    expect(distance(pulling.position, diving.position)).toBeLessThan(3);
  });

  it("anticipates pull-out height and never crosses a supplied sea/terrain floor", () => {
    const input = { ...base("diveBomber"), position: { x: 0, y: 800, z: 0 },
      destination: { x: 0, y: 0, z: 100_000 }, targetPitch: -1.1, minimumAltitude: 30 };
    let current = { position: { ...input.position }, heading: 0, flight: { ...input.flight! } };
    let minimum = input.position.y;
    let recovered = false;
    for (let frame = 0; frame < 1800; frame += 1) {
      current = advanceAirKinematics({ ...input, ...current });
      minimum = Math.min(minimum, current.position.y);
      if (frame > 600 && current.flight.pitch > -0.01) recovered = true;
      expect(current.position.y).toBeGreaterThanOrEqual(30);
    }
    expect(minimum).toBeLessThan(150);
    expect(recovered).toBe(true);
  });

  it("preserves position and flight state during pause or disabled movement", () => {
    const input = { ...base(), flight: { speedMetersPerSecond: 75, pitch: 0.2, bank: 0.3 } };
    for (const stopped of [{ canMove: false, dt: 1 }, { canMove: true, dt: 0 }, { canMove: true, dt: -1 }]) {
      const result = advanceAirKinematics({ ...input, ...stopped });
      expect(result.position).toEqual(input.position);
      expect(result.heading).toBe(input.heading);
      expect(result.flight).toEqual(input.flight);
    }
  });

  it("is deterministic and agrees at 30 and 60 simulation steps per second", () => {
    const input = base();
    const at30 = fly(input, 24, 30);
    const at60 = fly(input, 24, 60);
    expect(fly(input, 24, 60)).toEqual(at60);
    expect(distance(at30.position, at60.position)).toBeLessThan(0.02);
    expect(Math.abs(deltaAngle(at30.heading, at60.heading))).toBeLessThan(0.0001);
    expect(Math.abs(at30.flight.pitch - at60.flight.pitch)).toBeLessThan(0.0001);
    expect(Math.abs(at30.flight.bank - at60.flight.bank)).toBeLessThan(0.0001);
  });

  it("contains non-finite inputs and bounds excessively late updates without looping forever", () => {
    const corrupt = advanceAirKinematics({ ...base(), dt: Number.POSITIVE_INFINITY,
      position: { x: Number.NaN, y: 100, z: Number.NEGATIVE_INFINITY }, heading: Number.NaN,
      flight: { speedMetersPerSecond: Number.NaN, pitch: Number.NaN, bank: Number.POSITIVE_INFINITY } });
    expect(Object.values(corrupt.position).every(Number.isFinite)).toBe(true);
    expect(Object.values(corrupt.flight).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(corrupt.heading)).toBe(true);
    const late = advanceAirKinematics({ ...base(), dt: 100_000 });
    expect(distance(late.position, base().position)).toBeLessThanOrEqual(AIR_FLIGHT_PROFILE.fighter.maximumSpeedMetersPerSecond * 2);
  });
});
