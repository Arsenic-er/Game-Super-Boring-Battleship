import type { AircraftRole, AirFlightState, Vec3 } from "../sim/types";
import { advanceAirKinematics, AIR_FLIGHT_PROFILE, airSquadronSeed } from "../sim/airFlightModel";
import type { AirSquadronVisual } from "./aircraftGeometry";
import { formationOffsets, type AirVisualSnapshot } from "./aircraftPresentation";

export interface AircraftWorldPose {
  /** Stable visual slot, never an extra combat or network entity. */
  id: string;
  slot: number;
  position: Vec3;
  heading: number;
  /** Babylon +Z model conventions: negative pitch climbs; negative bank turns right. */
  pitch: number;
  bank: number;
  speedMetersPerSecond: number;
}

interface FlightSample {
  time: number;
  position: Vec3;
  heading: number;
  flight: AirFlightState;
}

interface PlaneMotion {
  pose: AircraftWorldPose;
  /** Physical signs, shared with the simulation integrator. */
  flight: AirFlightState;
  stationOffset: Vec3;
}

interface SeparationSample {
  slot: number;
  position: Vec3;
  velocity: Vec3;
}

const HISTORY_LIMIT = 96;
const SAMPLE_INTERVAL = 1 / 30;
const MAXIMUM_STEP = 1 / 120;
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const angleDelta = (to: number, from: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const mix = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const lerpPoint = (from: Vec3, to: Vec3, amount: number): Vec3 => ({
  x: mix(from.x, to.x, amount), y: mix(from.y, to.y, amount), z: mix(from.z, to.z, amount),
});
const blendSample = (before: FlightSample, after: FlightSample, time: number): FlightSample => {
  const amount = after.time > before.time ? clamp((time - before.time) / (after.time - before.time), 0, 1) : 0;
  return {
    time, position: lerpPoint(before.position, after.position, amount),
    heading: before.heading + angleDelta(after.heading, before.heading) * amount,
    flight: {
      speedMetersPerSecond: mix(before.flight.speedMetersPerSecond, after.flight.speedMetersPerSecond, amount),
      pitch: mix(before.flight.pitch, after.flight.pitch, amount),
      bank: mix(before.flight.bank, after.flight.bank, amount),
    },
  };
};

/**
 * Leader follows the authorized SIM/contact sample exactly. Every wingman owns an
 * integrated flight state; formation offsets supply navigation goals, never positions.
 * Uses the same bounded bank/pitch/speed physics as the simulation, with small fixed
 * integration steps so rendering at 30 or 60 Hz does not change the flight controller.
 */
export class AircraftFormationTracker {
  private history: FlightSample[] = [];
  private latest?: FlightSample;
  private planes: PlaneMotion[] = [];
  private role?: AircraftRole;
  private hasMeasuredVelocity = false;

  constructor(private readonly squadronId: string) {}

  get historySize(): number { return this.history.length; }

  update(snapshot: Readonly<AirVisualSnapshot>, time: number): readonly AircraftWorldPose[] {
    const count = Number.isFinite(snapshot.aircraftCount) ? clamp(Math.floor(snapshot.aircraftCount), 0, 12) : 0;
    if (!count || !Number.isFinite(time) || !Number.isFinite(snapshot.heading)
      || !Object.values(snapshot.position).every(Number.isFinite)) {
      this.clear();
      return [];
    }
    const previous = this.latest;
    const elapsed = previous ? time - previous.time : 0;
    const distance = previous ? Math.hypot(snapshot.position.x - previous.position.x,
      snapshot.position.y - previous.position.y, snapshot.position.z - previous.position.z) : 0;
    // A developer teleport or new replay segment is an explicit reset, not a formation correction.
    const reset = !previous || this.role !== snapshot.role || elapsed < 0 || elapsed > .5
      || distance > Math.max(80, elapsed * 260);
    if (reset) this.clear();
    this.role = snapshot.role;
    const dt = reset ? 0 : elapsed;
    if (dt === 0 && !reset && this.planes.length === count) return this.poses();

    const sample = this.flightSample(snapshot, time, reset ? undefined : previous);
    const offsets = formationOffsets(snapshot.role, count, snapshot.phase);
    this.planes.length = Math.min(this.planes.length, count);
    if (reset) {
      this.latest = sample;
      this.history.push(sample);
    }
    for (let slot = this.planes.length; slot < count; slot += 1) {
      const offset = this.layeredOffset(offsets[slot]!, slot, snapshot.role);
      const position = slot === 0 ? { ...sample.position } : this.stationPoint(sample, offset, 0);
      const flight = { ...sample.flight };
      this.planes.push({ stationOffset: offset, flight, pose: this.pose(slot, position, sample.heading, flight) });
    }
    if (dt > 0 && previous) {
      // Unknown contacts may not include velocity. Bootstrap once from an actual displacement,
      // never from live enemy flight data; after this, the normal acceleration limits apply.
      if (!this.hasMeasuredVelocity && sample.flight.speedMetersPerSecond > 1) {
        for (const plane of this.planes) plane.flight.speedMetersPerSecond = sample.flight.speedMetersPerSecond;
        previous.flight = { ...sample.flight };
        this.hasMeasuredVelocity = true;
      }
      const steps = Math.max(1, Math.ceil(dt / MAXIMUM_STEP - 1e-7));
      const step = dt / steps;
      for (let substep = 1; substep <= steps; substep += 1) {
        const stepTime = previous.time + substep * step;
        const leader = blendSample(previous, sample, stepTime);
        this.latest = leader;
        const lastStored = this.history[this.history.length - 1];
        if (!lastStored || stepTime - lastStored.time >= SAMPLE_INTERVAL - 1e-7) {
          this.history.push(leader);
          if (this.history.length > HISTORY_LIMIT) this.history.shift();
        }
        // Take one immutable start-of-step snapshot so slot update order does not
        // affect avoidance. The lead uses the same instant as integrated wingmen.
        const leaderStart = blendSample(previous, sample, stepTime - step);
        const neighbors = this.planes.map((plane, slot) => this.separationSample(slot,
          slot === 0 ? leaderStart.position : plane.pose.position,
          slot === 0 ? leaderStart.heading : plane.pose.heading,
          slot === 0 ? leaderStart.flight : plane.flight));
        for (let slot = 1; slot < count; slot += 1) {
          this.integrateWingman(this.planes[slot]!, this.layeredOffset(offsets[slot]!, slot, snapshot.role),
            snapshot, stepTime, step, neighbors);
        }
      }
    }
    // The displayed lead is the physical leader, without a procedural altitude or yaw overlay.
    this.planes[0]!.flight = { ...sample.flight };
    this.planes[0]!.pose = this.pose(0, { ...sample.position }, sample.heading, sample.flight);
    this.latest = sample;
    return this.poses();
  }

  private integrateWingman(plane: PlaneMotion, requestedOffset: Vec3,
    snapshot: Readonly<AirVisualSnapshot>, time: number, dt: number, neighbors: readonly SeparationSample[]): void {
    plane.stationOffset = lerpPoint(plane.stationOffset, requestedOffset, 1 - Math.exp(-dt * 1.8));
    const slot = plane.pose.slot;
    const lag = .16 + slot * .065 + Math.abs(plane.stationOffset.x) * .0015;
    // Compare states at the same integration-start instant; otherwise a one-step lead
    // makes even perfect straight station keeping request a spurious acceleration.
    const navigationTime = time - dt;
    const leader = this.sampleAt(navigationTime - lag);
    const age = Math.max(0, navigationTime - leader.time);
    const station = this.stationPoint(leader, plane.stationOffset, age);
    const speed = leader.flight.speedMetersPerSecond;
    if (speed < 1) return; // A stationary or stale contact must not invent a circling flight path.

    const sin = Math.sin(leader.heading), cos = Math.cos(leader.heading);
    const dx = station.x - plane.pose.position.x, dz = station.z - plane.pose.position.z;
    const verticalError = station.y - plane.pose.position.y;
    const forwardError = dx * sin + dz * cos;
    const profile = AIR_FLIGHT_PROFILE[snapshot.role];
    const targetSpeed = clamp(speed + clamp(forwardError * .6, -speed * .18, speed * .23),
      profile.minimumSpeedMetersPerSecond, profile.maximumSpeedMetersPerSecond);
    // A moving forward aim point avoids stopping or orbiting around a nearby formation station.
    const lookAheadSeconds = 1.8;
    const forwardDistance = Math.max(65, speed * Math.cos(leader.flight.pitch) * lookAheadSeconds);
    const destination = {
      x: station.x + sin * forwardDistance,
      y: station.y + Math.sin(leader.flight.pitch) * speed * lookAheadSeconds,
      z: station.z + cos * forwardDistance,
    };
    const separation = this.separationNavigation(plane, neighbors, snapshot.role, leader.heading);
    destination.x += separation.x;
    destination.z += separation.z;
    destination.y += separation.y;
    const targetPitch = clamp(leader.flight.pitch + Math.atan2(verticalError + separation.y, Math.max(80, speed * 2.4)),
      -profile.maximumDiveRadians, profile.maximumClimbRadians);
    const result = advanceAirKinematics({
      id: plane.pose.id, role: snapshot.role, phase: snapshot.phase,
      position: plane.pose.position, heading: plane.pose.heading, flight: plane.flight,
      destination, speedMetersPerSecond: targetSpeed, dt, time, canMove: true,
      targetAltitude: destination.y, targetPitch, minimumAltitude: 8,
    });
    plane.flight = result.flight;
    plane.pose = this.pose(slot, result.position, result.heading, result.flight);
  }

  private separationSample(slot: number, position: Vec3, heading: number, flight: AirFlightState): SeparationSample {
    const horizontal = Math.cos(flight.pitch) * flight.speedMetersPerSecond;
    return { slot, position: { ...position }, velocity: {
      x: Math.sin(heading) * horizontal, y: Math.sin(flight.pitch) * flight.speedMetersPerSecond,
      z: Math.cos(heading) * horizontal,
    } };
  }

  private separationNavigation(plane: PlaneMotion, neighbors: readonly SeparationSample[],
    role: AircraftRole, heading: number): Vec3 {
    const self = neighbors[plane.pose.slot]!;
    // Conservative span-plus-length diagonal clearances: historical profiles span
    // 12–13.04 m, 12.65–14.37 m and 15.5–16.51 m. This is flight guidance only;
    // no positions are pushed apart and the shared flight-rate limits still apply.
    const clearance = role === "fighter" ? 18 : role === "diveBomber" ? 20 : 23;
    const rightX = Math.cos(heading), rightZ = -Math.sin(heading);
    let lateral = 0, vertical = 0;
    for (const other of neighbors) {
      if (other.slot === self.slot) continue;
      const rx = self.position.x - other.position.x, ry = self.position.y - other.position.y, rz = self.position.z - other.position.z;
      const vx = self.velocity.x - other.velocity.x, vy = self.velocity.y - other.velocity.y, vz = self.velocity.z - other.velocity.z;
      const relativeSpeedSquared = vx * vx + vy * vy + vz * vz;
      const closing = rx * vx + ry * vy + rz * vz;
      const distance = Math.hypot(rx, ry, rz);
      if (closing >= 0 && distance >= clearance * .85) continue;
      const closestTime = relativeSpeedSquared > .01 ? clamp(-closing / relativeSpeedSquared, 0, 3) : 0;
      const predicted = Math.hypot(rx + vx * closestTime, ry + vy * closestTime, rz + vz * closestTime);
      if (predicted >= clearance) continue;
      const strength = clamp((clearance - predicted) / (clearance * .45), 0, 1);
      const across = rx * rightX + rz * rightZ;
      // Stable side/layer tie-breaking prevents two followers choosing the same escape lane.
      const side = Math.abs(across) > 1 ? Math.sign(across)
        : Math.sign(plane.stationOffset.x) || (self.slot > other.slot ? 1 : -1);
      lateral += side * clearance * 2.4 * strength;
      vertical += (ry > 1 ? 1 : ry < -1 ? -1 : self.slot > other.slot ? 1 : -1) * 8 * strength;
    }
    lateral = clamp(lateral, -clearance * 3, clearance * 3);
    return { x: lateral * rightX, y: clamp(vertical, -12, 12), z: lateral * rightZ };
  }

  private flightSample(snapshot: Readonly<AirVisualSnapshot>, time: number, previous?: FlightSample): FlightSample {
    const dt = previous ? time - previous.time : 0;
    let flight: AirFlightState;
    if (snapshot.flight) {
      flight = { ...snapshot.flight };
      this.hasMeasuredVelocity = true;
    } else if (previous && dt > 0) {
      const dx = snapshot.position.x - previous.position.x, dz = snapshot.position.z - previous.position.z;
      const dy = snapshot.position.y - previous.position.y, horizontalSpeed = Math.hypot(dx, dz) / dt;
      const profile = AIR_FLIGHT_PROFILE[snapshot.role];
      const speed = clamp(Math.hypot(dx, dy, dz) / dt, 0, profile.maximumSpeedMetersPerSecond);
      const measuredPitch = horizontalSpeed > 1 ? Math.atan2(dy / dt, horizontalSpeed) : previous.flight.pitch;
      const turnRate = angleDelta(snapshot.heading, previous.heading) / dt;
      flight = { speedMetersPerSecond: speed, pitch: clamp(measuredPitch, -profile.maximumDiveRadians, profile.maximumClimbRadians),
        bank: clamp(Math.atan(horizontalSpeed * turnRate / 9.81), -profile.maximumBankRadians, profile.maximumBankRadians) };
    } else {
      flight = previous ? { ...previous.flight } : { speedMetersPerSecond: 0, pitch: 0, bank: 0 };
    }
    return { time, position: { ...snapshot.position }, heading: snapshot.heading, flight };
  }

  private layeredOffset(offset: Vec3, slot: number, role: AircraftRole): Vec3 {
    if (slot === 0) return { x: 0, y: 0, z: 0 };
    const layer = role === "fighter" ? 3.2 : role === "diveBomber" ? 2.5 : 1.8;
    const fixedTrim = (airSquadronSeed(`${this.squadronId}:${slot}`) - .5) * .8;
    return { ...offset, y: offset.y + (slot % 2 ? 1 : -1) * (2 + (.5 + Math.floor(slot / 2)) * layer) + fixedTrim };
  }

  private stationPoint(sample: FlightSample, offset: Vec3, age: number): Vec3 {
    const horizontalSpeed = Math.cos(sample.flight.pitch) * sample.flight.speedMetersPerSecond;
    const forward = offset.z + horizontalSpeed * age;
    return {
      x: sample.position.x + offset.x * Math.cos(sample.heading) + forward * Math.sin(sample.heading),
      y: sample.position.y + offset.y + Math.sin(sample.flight.pitch) * sample.flight.speedMetersPerSecond * age,
      z: sample.position.z - offset.x * Math.sin(sample.heading) + forward * Math.cos(sample.heading),
    };
  }

  private sampleAt(time: number): FlightSample {
    const first = this.history[0]!;
    if (time <= first.time) return first;
    let low = 0, high = this.history.length;
    while (low + 1 < high) { const middle = (low + high) >>> 1; if (this.history[middle]!.time <= time) low = middle; else high = middle; }
    const before = this.history[low]!, after = this.history[low + 1] ?? this.latest!;
    return blendSample(before, after, clamp(time, before.time, after.time));
  }

  private pose(slot: number, position: Vec3, heading: number, flight: AirFlightState): AircraftWorldPose {
    return { id: `${this.squadronId}:aircraft:${slot}`, slot, position, heading,
      pitch: -flight.pitch, bank: -flight.bank, speedMetersPerSecond: flight.speedMetersPerSecond };
  }

  private poses(): readonly AircraftWorldPose[] { return this.planes.map(({ pose }) => pose); }

  /** Idempotent reset for replay/session teardown; no render loop, geometry or timer is owned here. */
  clear(): void { this.history = []; this.latest = undefined; this.planes = []; this.role = undefined; this.hasMeasuredVelocity = false; }
}

export function applyAircraftWorldPoses(visual: AirSquadronVisual, poses: readonly AircraftWorldPose[]): void {
  visual.root.position.setAll(0);
  visual.root.rotation.setAll(0);
  visual.root.rotationQuaternion = null;
  for (let index = 0; index < visual.planes.length; index += 1) {
    const plane = visual.planes[index]!, pose = poses[index];
    plane.root.setEnabled(Boolean(pose));
    if (!pose) continue;
    plane.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    plane.root.rotation.set(pose.pitch, pose.heading, pose.bank);
    plane.root.rotationQuaternion = null;
  }
}
