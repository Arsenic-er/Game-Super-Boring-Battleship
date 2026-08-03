export interface AuxiliaryHudContext {
  started: boolean;
  paused: boolean;
  running: boolean;
  mapOpen: boolean;
  menuOpen: boolean;
  developerOpen: boolean;
}

export function auxiliaryHudVisible(
  held: boolean,
  context: Readonly<AuxiliaryHudContext>,
): boolean {
  return held
    && context.started
    && !context.paused
    && context.running
    && !context.mapOpen
    && !context.menuOpen
    && !context.developerOpen;
}
