import type { BattleState } from "../sim/types";

export type DeveloperViewTarget =
  | { kind: "ship"; id: string }
  | { kind: "airSquadron"; id: string };

export interface DeveloperViewSession {
  active: boolean;
  focus?: DeveloperViewTarget;
  controlledShipId?: string;
}

export const normalDeveloperView = (): DeveloperViewSession => ({
  active: false,
  focus: { kind: "ship", id: "player" },
  controlledShipId: "player",
});

export function observeDeveloperEntity(
  state: Readonly<BattleState>,
  id: string,
): DeveloperViewSession | undefined {
  const ship = state.ships.find((candidate) => candidate.id === id && candidate.hull > 0);
  if (ship) return { active: true, focus: { kind: "ship", id } };
  const squadron = state.airSquadrons.find((candidate) =>
    candidate.id === id && candidate.aircraftOperational > 0);
  if (squadron) return { active: true, focus: { kind: "airSquadron", id } };
  return undefined;
}

export function controlDeveloperShip(
  state: Readonly<BattleState>,
  id: string,
): DeveloperViewSession | undefined {
  const ship = state.ships.find((candidate) => candidate.id === id && candidate.hull > 0);
  if (!ship) return undefined;
  return {
    active: true,
    focus: { kind: "ship", id },
    controlledShipId: id,
  };
}

export function reconcileDeveloperView(
  state: Readonly<BattleState>,
  session: Readonly<DeveloperViewSession>,
): DeveloperViewSession {
  if (!session.active) return session as DeveloperViewSession;
  const focusAlive = session.focus?.kind === "ship"
    ? state.ships.some(({ id, hull }) => id === session.focus?.id && hull > 0)
    : session.focus?.kind === "airSquadron"
      ? state.airSquadrons.some(({ id, aircraftOperational }) =>
        id === session.focus?.id && aircraftOperational > 0)
      : false;
  const controlAlive = !session.controlledShipId || state.ships.some(({ id, hull }) =>
    id === session.controlledShipId && hull > 0);
  return focusAlive && controlAlive ? session as DeveloperViewSession : normalDeveloperView();
}

export function activeControlledShipId(session: Readonly<DeveloperViewSession>): string | undefined {
  return session.active ? session.controlledShipId : "player";
}
