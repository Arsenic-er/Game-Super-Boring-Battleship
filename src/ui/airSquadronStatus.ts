import { AIR_OPERATION_TIMING, AIR_SQUADRON_LOADOUT } from "../sim/airOperations";
import type {
  AircraftRole,
  AirMissionKind,
  AirSquadronPhase,
  AirSquadronState,
} from "../sim/types";

export interface AirSquadronStatusView {
  id: string;
  role: AircraftRole;
  phase: AirSquadronPhase;
  aircraftOperational: number;
  aircraftCapacity: number;
  strengthPercent: number;
  fuelSeconds: number;
  fuelPercent: number;
  resourceKind: "ammo" | "ordnance";
  resourceCurrent: number;
  resourceMaximum: number;
  missionKind?: AirMissionKind;
  targetId?: string;
  rearmRemainingSeconds?: number;
  rearmPercent?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function buildAirSquadronStatusView(
  time: number,
  squadron: Readonly<AirSquadronState>,
): AirSquadronStatusView {
  const endurance = AIR_OPERATION_TIMING.enduranceSeconds[squadron.role];
  const resourceKind = squadron.role === "fighter" ? "ammo" : "ordnance";
  const resourceCurrent = resourceKind === "ammo"
    ? squadron.ammoRemaining
    : squadron.ordnanceRemaining;
  const resourceMaximum = resourceKind === "ammo"
    ? AIR_SQUADRON_LOADOUT.ammo[squadron.role]
    : AIR_SQUADRON_LOADOUT.ordnance[squadron.role];
  const status: AirSquadronStatusView = {
    id: squadron.id,
    role: squadron.role,
    phase: squadron.phase,
    aircraftOperational: Math.max(0, squadron.aircraftOperational),
    aircraftCapacity: Math.max(1, squadron.aircraftCapacity),
    strengthPercent: Math.round(clamp01(
      squadron.maxAirframeHealth <= 0 ? 0 : squadron.airframeHealth / squadron.maxAirframeHealth,
    ) * 100),
    fuelSeconds: Math.max(0, squadron.fuelRemainingSeconds),
    fuelPercent: Math.round(clamp01(squadron.fuelRemainingSeconds / endurance) * 100),
    resourceKind,
    resourceCurrent: Math.max(0, resourceCurrent),
    resourceMaximum: Math.max(0, resourceMaximum),
    missionKind: squadron.order?.kind,
    targetId: squadron.order?.activeTargetId ?? squadron.order?.candidateTargetIds?.[0],
  };
  if (squadron.phase === "rearming") {
    const duration = AIR_OPERATION_TIMING.rearmSeconds[squadron.role];
    const elapsed = Math.max(0, time - squadron.phaseStartedAt);
    status.rearmRemainingSeconds = Math.max(0, Math.ceil(duration - elapsed));
    status.rearmPercent = Math.round(clamp01(elapsed / duration) * 100);
  }
  return status;
}

const roleOrder: Record<AircraftRole, number> = {
  fighter: 0,
  diveBomber: 1,
  torpedoBomber: 2,
};

export function sortAirSquadronStatus(
  squadrons: readonly AirSquadronState[],
): AirSquadronState[] {
  return [...squadrons].sort((left, right) =>
    roleOrder[left.role] - roleOrder[right.role] || left.id.localeCompare(right.id));
}

export function formatAirDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
