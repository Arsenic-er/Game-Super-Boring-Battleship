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
    ? phase === "attackRun"
      ? [[-2, 0], [-1, -.12], [0, 0], [1, -.18], [2, .05], [-2.8, -1], [2.7, -1.1]]
      : [[-1, 0], [0, 0], [1.1, -.2], [-1.8, -1.25], [.45, -1.4], [2.2, -1.7], [-2.8, -2.45]]
    : role === "diveBomber"
      ? phase === "attackRun"
        ? [[0, 0], [-.55, -1], [.68, -1.35], [-.35, -2.25], [.78, -2.75], [-.7, -3.7]]
        : [[0, 0], [-1, -1], [1.15, -1.3], [-2.1, -2.2], [1.9, -2.65], [.25, -3.15]]
      : [[0, 0], [-1, -1], [1, -1.35], [-2.05, -2.2], [1.75, -2.7], [-3.1, -3.4], [2.8, -3.75]];
  const baseSpacing = role === "fighter" ? 13 : role === "diveBomber" ? 16 : 18;
  const phaseScale = phase === "attackRun"
    ? role === "torpedoBomber" ? 1.28 : role === "diveBomber" ? .92 : 1.18
    : phase === "returning" ? 0.82 : 1;
  return Array.from({ length: safeCount }, (_, index) => {
    const pattern = patterns[index % patterns.length] ?? [0, -index];
    const depthBand = Math.floor(index / patterns.length);
    return {
      x: pattern[0] * baseSpacing * phaseScale,
      y: ((index * 2 + Math.floor(index / 3)) % 5 - 2) * (role === "fighter" ? 1.65 : 1.1),
      z: (pattern[1] - depthBand * 1.3) * baseSpacing * phaseScale,
    };
  });
}

function stringPhase(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x45d9f3b);
  }
  return (hash >>> 0) / 0xffffffff * Math.PI * 2;
}

/** Smooth per-aircraft offsets keep the formation cohesive without rigid parallel flight. */
export function aircraftFormationPose(
  role: AircraftRole,
  index: number,
  count: number,
  phase: AirSquadronPhase,
  time: number,
  squadronId = "air",
): AircraftFormationPose | undefined {
  const base = formationOffsets(role, count, phase)[index];
  if (!base) return undefined;
  const individualPhase = stringPhase(`${squadronId}:${index}`);
  const responseLag = index * .14;
  const slow = time * (.47 + index % 3 * .035) - responseLag + individualPhase;
  const quick = time * (.83 + index % 2 * .07) + individualPhase * .63;
  const looseness = phase === "attackRun" ? 1.45 : phase === "intercepting" ? 1.25 : 1;
  const verticalAmplitude = role === "fighter" ? 5.2 : role === "diveBomber" ? 3.8 : 2.6;
  const pitch = aircraftPitch(role, phase)
    + Math.sin(slow * .72) * (role === "torpedoBomber" ? .012 : .025);
  return {
    x: base.x + Math.sin(slow) * 1.8 * looseness,
    y: base.y + Math.sin(quick) * verticalAmplitude * looseness,
    z: base.z + Math.cos(slow * .86) * 2.4 * looseness,
    pitch,
    yaw: Math.sin(slow * .58) * (role === "fighter" ? .065 : .038),
    bank: Math.sin(quick * .77) * (role === "fighter" ? .085 : .05),
  };
}

export function aircraftPitch(role: AircraftRole, phase: AirSquadronPhase): number {
  if (phase !== "attackRun") return 0;
  if (role === "diveBomber") return -0.76;
  if (role === "torpedoBomber") return -0.035;
  return -0.08;
}
