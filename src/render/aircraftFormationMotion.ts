import type { AircraftRole, Vec3 } from "../sim/types";
import { airSquadronSeed } from "../sim/airFlightModel";
import type { AirSquadronVisual } from "./aircraftGeometry";
import { formationOffsets, type AirVisualSnapshot } from "./aircraftPresentation";

export interface AircraftWorldPose {
  /** Stable visual slot, not a new simulation entity or an inferred enemy aircraft. */
  id: string;
  slot: number;
  position: Vec3;
  heading: number;
  pitch: number;
  bank: number;
}

interface FlightSample {
  time: number;
  position: Vec3;
  heading: number;
  speed: number;
  climb: number;
}

interface PlaneMotion {
  pose: AircraftWorldPose;
  offset: Vec3;
}

const HISTORY_LIMIT = 96;
const SAMPLE_INTERVAL = 1 / 30;
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const angleDelta = (to: number, from: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const mix = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const lerpPoint = (from: Vec3, to: Vec3, amount: number): Vec3 => ({
  x: mix(from.x, to.x, amount), y: mix(from.y, to.y, amount), z: mix(from.z, to.z, amount),
});

/** Render-only flight history. Does not alter simulation positions, count, weapons or contacts. */
export class AircraftFormationTracker {
  private history: FlightSample[] = [];
  private latest?: FlightSample;
  private planes: PlaneMotion[] = [];
  private role?: AircraftRole;

  constructor(private readonly squadronId: string) {}

  get historySize(): number { return this.history.length; }

  update(snapshot: Readonly<AirVisualSnapshot>, time: number): readonly AircraftWorldPose[] {
    // Match the existing supported formation size, and never manufacture a minimum of one.
    const count = Number.isFinite(snapshot.aircraftCount)
      ? clamp(Math.floor(snapshot.aircraftCount), 0, 12) : 0;
    if (count === 0 || !Number.isFinite(time)) {
      this.clear();
      return [];
    }
    const previous = this.latest;
    const elapsed = previous ? time - previous.time : 0;
    const distance = previous
      ? Math.hypot(snapshot.position.x - previous.position.x, snapshot.position.z - previous.position.z) : 0;
    // Reacquisition, replay seeks and developer teleports must not drag an old formation across the map.
    const reset = !previous || this.role !== snapshot.role || elapsed < 0 || elapsed > 0.5
      || distance > Math.max(80, elapsed * 250);
    if (reset) this.clear();
    this.role = snapshot.role;
    const dt = reset ? 0 : elapsed;
    const offsets = formationOffsets(snapshot.role, count, snapshot.phase);
    this.planes.length = Math.min(this.planes.length, count);
    if (dt === 0 && !reset && this.planes.length === count) return this.planes.map(({ pose }) => pose);

    const velocityBlend = 1 - Math.exp(-dt * 8);
    const sample: FlightSample = {
      time,
      position: { ...snapshot.position },
      heading: snapshot.heading,
      speed: dt > 0 && previous ? mix(previous.speed, clamp(distance / dt, 0, 200), velocityBlend) : 0,
      climb: dt > 0 && previous
        ? mix(previous.climb, clamp((snapshot.position.y - previous.position.y) / dt, -140, 140), velocityBlend) : 0,
    };
    // The first measured displacement also initializes the oldest velocity. Otherwise a newly
    // visible wingman would sit at the initial anchor for its entire history delay.
    if (dt > 0 && previous && this.history.length === 1 && this.history[0] === previous) {
      previous.speed = clamp(distance / dt, 0, 200);
      previous.climb = clamp((snapshot.position.y - previous.position.y) / dt, -140, 140);
      sample.speed = previous.speed;
      sample.climb = previous.climb;
    }
    this.latest = sample;
    if (!this.history.length || time - this.history[this.history.length - 1]!.time >= SAMPLE_INTERVAL - 1e-7) {
      this.history.push(sample);
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    }

    const roleLayer = snapshot.role === "fighter" ? 2.6 : snapshot.role === "diveBomber" ? 2 : 1.3;
    const squadronLayer = (airSquadronSeed(this.squadronId) - 0.5) * 8;
    for (let slot = 0; slot < count; slot += 1) {
      const base = offsets[slot]!;
      const old = this.planes[slot];
      const response = 1 - Math.exp(-dt * 2.2);
      const offset = old ? lerpPoint(old.offset, base, response) : { ...base };
      // Actual prior flight headings/positions delay the wingmen through a turn. The lead has no delay.
      const lag = slot === 0 ? 0 : 0.18 + slot * 0.105 + Math.abs(base.x) * 0.0025;
      const delayed = this.sampleAt(time - lag);
      const age = Math.max(0, time - delayed.time);
      const sin = Math.sin(delayed.heading);
      const cos = Math.cos(delayed.heading);
      // Compensate only the history actually available: no start-up leap while the history fills.
      const forward = offset.z + delayed.speed * age;
      const phase = airSquadronSeed(`${this.squadronId}:${slot}`) * Math.PI * 2;
      const stationKeeping = Math.sin(time * 0.46 + phase) * (snapshot.role === "fighter" ? 0.9 : 0.55);
      const position: Vec3 = {
        x: delayed.position.x + offset.x * cos + forward * sin,
        y: delayed.position.y + delayed.climb * age + offset.y
          + (slot % 3 - 1) * roleLayer + squadronLayer + stationKeeping,
        z: delayed.position.z - offset.x * sin + forward * cos,
      };
      let heading = old?.pose.heading ?? delayed.heading;
      let pitch = old?.pose.pitch ?? 0;
      let bank = old?.pose.bank ?? 0;
      if (old && dt > 0) {
        const vx = (position.x - old.pose.position.x) / dt;
        const vz = (position.z - old.pose.position.z) / dt;
        const vy = (position.y - old.pose.position.y) / dt;
        const speed = Math.hypot(vx, vz);
        // Follow the tangent of this aircraft's path, not an independent yaw/bank sine wave.
        const desiredHeading = speed > 8 ? Math.atan2(vx, vz) : delayed.heading;
        // Linear history segments have tiny tangent jumps. A time-based heading response prevents
        // differentiating those jumps again into alternating bank commands at higher render rates.
        const headingResponse = 1 - Math.exp(-dt * 12);
        const headingStep = clamp(angleDelta(desiredHeading, old.pose.heading) * headingResponse, -1.4 * dt, 1.4 * dt);
        heading = old.pose.heading + headingStep;
        const turnRate = headingStep / dt;
        const maxBank = snapshot.role === "fighter" ? 0.78 : snapshot.role === "diveBomber" ? 0.64 : 0.48;
        const targetBank = clamp(-Math.atan(speed * turnRate / 9.81), -maxBank, maxBank);
        bank = mix(old.pose.bank, targetBank, 1 - Math.exp(-dt * 4));
        // Historical models point along +Z: positive Babylon X rotation pitches the nose DOWN.
        const targetPitch = clamp(-Math.atan2(vy, Math.max(8, speed)), -0.95, 0.95);
        pitch = mix(old.pose.pitch, targetPitch, 1 - Math.exp(-dt * 5));
      }
      this.planes[slot] = {
        offset,
        pose: { id: `${this.squadronId}:aircraft:${slot}`, slot, position, heading, pitch, bank },
      };
    }
    return this.planes.map(({ pose }) => pose);
  }

  private sampleAt(time: number): FlightSample {
    const first = this.history[0]!;
    const latest = this.latest!;
    if (time <= first.time) return first;
    let low = 0;
    let high = this.history.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (this.history[middle]!.time <= time) low = middle;
      else high = middle;
    }
    const before = this.history[low]!;
    const after = this.history[low + 1] ?? latest;
    const amount = after.time > before.time ? clamp((time - before.time) / (after.time - before.time), 0, 1) : 0;
    return {
      time: mix(before.time, after.time, amount),
      position: lerpPoint(before.position, after.position, amount),
      heading: before.heading + angleDelta(after.heading, before.heading) * amount,
      speed: mix(before.speed, after.speed, amount),
      climb: mix(before.climb, after.climb, amount),
    };
  }

  private clear(): void {
    this.history = [];
    this.latest = undefined;
    this.planes = [];
    this.role = undefined;
  }
}

/** One shared application path for GameView and real body/propeller world-transform tests. */
export function applyAircraftWorldPoses(visual: AirSquadronVisual, poses: readonly AircraftWorldPose[]): void {
  visual.root.position.setAll(0);
  visual.root.rotation.setAll(0);
  visual.root.rotationQuaternion = null;
  for (let index = 0; index < visual.planes.length; index += 1) {
    const plane = visual.planes[index]!;
    const pose = poses[index];
    plane.root.setEnabled(Boolean(pose));
    if (!pose) continue;
    plane.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    plane.root.rotation.set(pose.pitch, pose.heading, pose.bank);
    plane.root.rotationQuaternion = null;
  }
}
