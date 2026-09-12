import { AIR_OPERATION_TIMING } from "../sim/airOperations";
import type {
  AircraftRole,
  AirSquadronPhase,
  AirSquadronState,
  Team,
  Vec3,
} from "../sim/types";

export const AIR_VISUAL_CONTACT_SECONDS = 5;

export interface AircraftFormationOffset {
  x: number;
  y: number;
  z: number;
}
export interface AircraftFormationPose extends AircraftFormationOffset {
  pitch: number;
  yaw: number;
  bank: number;
}

export interface AirVisualSnapshot {
  role: AircraftRole;
  phase: AirSquadronPhase;
  position: Vec3;
  heading: number;
  aircraftCount: number;
  visibility: number;
  observed: boolean;
  /** Physical convention: positive pitch climbs and positive bank turns right. */
  flight?: { speedMetersPerSecond: number; pitch: number; bank: number };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function airVisualSnapshot(
  squadron: Readonly<AirSquadronState>,
  time: number,
  viewerTeam: Team = "player",
): AirVisualSnapshot | undefined {
  if (squadron.team === viewerTeam) {
    if (["ready", "rearming", "destroyed"].includes(squadron.phase)) return undefined;
    const aircraftCount = clamp(
      Math.floor(squadron.aircraftOperational),
      0,
      Math.min(12, squadron.aircraftCapacity),
    );
    if (aircraftCount <= 0) return undefined;
    const phaseElapsed = Math.max(0, time - squadron.phaseStartedAt);
    const visibility = squadron.phase === "launching"
      ? clamp(phaseElapsed / AIR_OPERATION_TIMING.launchSeconds, 0.2, 1)
      : squadron.phase === "landing"
        ? 1 - clamp(phaseElapsed / AIR_OPERATION_TIMING.landingSeconds, 0, 0.88)
        : 1;
    return {
      role: squadron.role,
      phase: squadron.phase,
      position: { ...squadron.position },
      heading: squadron.heading,
      aircraftCount,
      visibility,
      observed: false,
      ...(squadron.flight && Object.values(squadron.flight).every(Number.isFinite)
        ? { flight: { ...squadron.flight } } : {}),
    };
  }

  const contact = squadron.contactsByTeam[viewerTeam];
  if (!contact) return undefined;
  const age = Math.max(0, time - contact.observedAt);
  if (age > AIR_VISUAL_CONTACT_SECONDS) return undefined;
  const aircraftCount = clamp(
    Math.floor(contact.estimatedAircraft ?? 1),
    0,
    12,
  );
  if (aircraftCount <= 0) return undefined;
  return {
    role: contact.observedRole ?? "fighter",
    phase: "outbound",
    position: { ...contact.lastKnownPosition },
    heading: contact.observedHeading ?? 0,
    aircraftCount,
    visibility: age <= AIR_VISUAL_CONTACT_SECONDS - 2
      ? 1
      : clamp((AIR_VISUAL_CONTACT_SECONDS - age) / 2, 0, 1),
    observed: true,
  };
}

export function formationOffsets(
  role: AircraftRole,
  count: number,
  phase: AirSquadronPhase,
): AircraftFormationOffset[] {
  const safeCount = clamp(Math.floor(count), 0, 12);
  const patterns: ReadonlyArray<readonly [number, number]> = role === "torpedoBomber"
    ? phase === "attackRun"
      ? [[0, 0], [-1.6, -.6], [1.6, -.9], [-3.2, -1.4], [3.2, -1.8], [-4.8, -2.4], [4.8, -2.8]]
      : [[0, 0], [-1.4, -1], [1.4, -1.4], [-2.8, -2.4], [2.8, -2.8], [-4.2, -3.8], [4.2, -4.2]]
    : role === "diveBomber"
      ? phase === "attackRun"
        // Separate dive lanes must clear the complete 12.65–14.37 m wingspan,
        // including a follower catching up while the lead pulls out of the dive.
        ? [[0, 0], [-1.5, -1.7], [1.5, -2.4], [-3, -3.7], [3, -4.4], [-.75, -5.8]]
        : [[0, 0], [-1, -1], [1.15, -1.3], [-2.1, -2.2], [1.9, -2.65], [.25, -3.15]]
      : [[0, 0], [-1, -1], [1, -1.35], [-2.05, -2.2], [1.75, -2.7], [-3.1, -3.4], [2.8, -3.75]];
  const baseSpacing = role === "fighter" ? 13 : role === "diveBomber" ? 16 : 18;
  const phaseScale = phase === "attackRun"
    ? role === "torpedoBomber" ? 1.28 : role === "diveBomber" ? 1.08 : 1.18
    : 1;
  // Additional slots repeat behind the complete preceding element, not inside it.
  const bandDepth = Math.max(...patterns.map(([, z]) => -z)) + 1.8;
  return Array.from({ length: safeCount }, (_, index) => {
    const pattern = patterns[index % patterns.length] ?? [0, -index];
    const depthBand = Math.floor(index / patterns.length);
    return {
      x: pattern[0] * baseSpacing * phaseScale,
      y: ((index * 2 + Math.floor(index / 3)) % 5 - 2) * (role === "fighter" ? 1.65 : 1.1),
      z: (pattern[1] - depthBand * bandDepth) * baseSpacing * phaseScale,
    };
  });
}

/** Static preview only. In-flight motion belongs to AircraftFormationTracker, not sine offsets. */
export function aircraftFormationPose(
  role: AircraftRole,
  index: number,
  count: number,
  phase: AirSquadronPhase,
  _time: number,
  _squadronId = "air",
): AircraftFormationPose | undefined {
  const base = formationOffsets(role, count, phase)[index];
  if (!base) return undefined;
  return {
    ...base,
    pitch: aircraftPitch(role, phase),
    yaw: 0,
    bank: 0,
  };
}

export function aircraftPitch(role: AircraftRole, phase: AirSquadronPhase): number {
  if (phase !== "attackRun") return 0;
  if (role === "diveBomber") return 0.76;
  if (role === "torpedoBomber") return 0.035;
  return 0.08;
}
