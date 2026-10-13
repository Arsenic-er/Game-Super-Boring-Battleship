import type { AirSquadronState, BattleState, ShipState } from "./types";

export interface AirCommandSuccession {
  squadronId: string;
  previousControllerId: string;
  controllerId: string;
}

const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const livingShip = (ship: Readonly<ShipState>): boolean => Number.isFinite(ship.hull) && ship.hull > 0;
const livingSquadron = (squadron: Readonly<AirSquadronState>): boolean =>
  squadron.phase !== "destroyed" && Number.isFinite(squadron.aircraftOperational)
  && squadron.aircraftOperational > 0 && Number.isFinite(squadron.airframeHealth)
  && squadron.airframeHealth > 0;

/**
 * Plan command ownership only, never aircraft resources, missions or recovery.
 * A living same-team controller keeps command even while a human controls it.
 * Orphaned squadrons sharing a team and old controller remain one command group:
 * choose the authorized AI ship nearest their unweighted horizontal centroid,
 * then break exact ties by ID. No load balancing or per-frame reassignment.
 * Sorted accumulation and ID tie-breaking make roster order irrelevant.
 */
export function planAirCommandSuccession(
  state: Pick<Readonly<BattleState>, "ships" | "airSquadrons">,
  eligibleAiControllerIds: ReadonlySet<string>,
): AirCommandSuccession[] {
  const ships = new Map(state.ships.map(ship => [ship.id, ship]));
  const groups = new Map<string, AirSquadronState[]>();
  for (const squadron of state.airSquadrons) {
    if (!livingSquadron(squadron)) continue;
    const owner = ships.get(squadron.controllerId);
    if (owner && livingShip(owner) && owner.team === squadron.team) continue;
    const key = squadron.team + ":" + squadron.controllerId;
    const group = groups.get(key) ?? [];
    group.push(squadron);
    groups.set(key, group);
  }
  if (groups.size === 0 || eligibleAiControllerIds.size === 0) return [];
  const candidates = state.ships.filter(ship => livingShip(ship) && !ship.isTestTarget
    && eligibleAiControllerIds.has(ship.id)
    && Number.isFinite(ship.position.x) && Number.isFinite(ship.position.z))
    .sort((a, b) => compareId(a.id, b.id));
  const result: AirCommandSuccession[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => compareId(a.id, b.id));
    // Corrupt positions cannot justify a guessed destination or split a group.
    if (group.some(squadron => !Number.isFinite(squadron.position.x)
      || !Number.isFinite(squadron.position.z))) continue;
    const center = group.reduce((sum, squadron) => ({
      x: sum.x + squadron.position.x / group.length,
      z: sum.z + squadron.position.z / group.length,
    }), { x: 0, z: 0 });
    let successor: ShipState | undefined;
    let nearest = Infinity;
    for (const candidate of candidates) {
      if (candidate.team !== group[0]!.team) continue;
      const distance = Math.hypot(candidate.position.x - center.x, candidate.position.z - center.z);
      if (distance < nearest) { successor = candidate; nearest = distance; }
    }
    if (!successor) continue;
    for (const squadron of group) result.push({
      squadronId: squadron.id, previousControllerId: squadron.controllerId, controllerId: successor.id,
    });
  }
  return result.sort((a, b) => compareId(a.squadronId, b.squadronId));
}
