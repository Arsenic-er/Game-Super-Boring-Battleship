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

export interface AirVisualSnapshot {
  role: AircraftRole;
  phase: AirSquadronPhase;
  position: Vec3;
  heading: number;
  aircraftCount: number;
  visibility: number;
  observed: boolean;
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
      squadron.aircraftCapacity,
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
    };
  }

  const contact = squadron.contactsByTeam[viewerTeam];
  if (!contact) return undefined;
  const age = Math.max(0, time - contact.observedAt);
  if (age > AIR_VISUAL_CONTACT_SECONDS) return undefined;
  const aircraftCount = clamp(
    Math.floor(contact.estimatedAircraft ?? 1),
    1,
    squadron.aircraftCapacity,
  );
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
    ? [[-1, 0], [0, 0], [1, 0], [-1, -1], [0, -1], [1, -1], [-1, -2], [0, -2], [1, -2]]
    : role === "diveBomber"
      ? [[0, 0], [-1, -1], [1, -1], [-2, -2], [2, -2], [0, -2.35], [-3, -3], [3, -3]]
      : [[0, 0], [-1, -1], [1, -1], [-2, -2], [2, -2], [-3, -3], [3, -3]];
  const baseSpacing = role === "fighter" ? 13 : role === "diveBomber" ? 16 : 18;
  const phaseScale = phase === "attackRun" ? 1.35 : phase === "returning" ? 0.82 : 1;
  return Array.from({ length: safeCount }, (_, index) => {
    const pattern = patterns[index % patterns.length] ?? [0, -index];
    const depthBand = Math.floor(index / patterns.length);
    return {
      x: pattern[0] * baseSpacing * phaseScale,
      y: ((index % 3) - 1) * 0.7,
      z: (pattern[1] - depthBand * 1.3) * baseSpacing * phaseScale,
    };
  });
}

export function aircraftPitch(role: AircraftRole, phase: AirSquadronPhase): number {
  if (phase !== "attackRun") return 0;
  if (role === "diveBomber") return -0.24;
  if (role === "torpedoBomber") return -0.035;
  return -0.08;
}
