import type {
  AirCombatEvent,
  BattleState,
  ControlCommand,
  ImpactEvent,
  ShotEvent,
  ShipDestroyedAttributionEvent,
  ShipHullDamageEvent,
} from "../sim/types";

export interface BattleStepOutput {
  state: BattleState;
  shots: readonly ShotEvent[];
  impacts: readonly ImpactEvent[];
  airEvents: readonly AirCombatEvent[];
  /** Local session only; not replicated by the host. */
  destroyedShips?: readonly ShipDestroyedAttributionEvent[];
  hullDamage?: readonly ShipHullDamageEvent[];
}

export interface BattleStepOptions {
  includeDeveloperAi?: boolean;
}

export interface AuthoritativeBattleSession {
  readonly role: "local" | "host";
  readonly state: BattleState;
  step(
    humanCommands: ReadonlyMap<string, ControlCommand>,
    dt?: number,
    options?: Readonly<BattleStepOptions>,
  ): BattleStepOutput;
  reset(state: BattleState): void;
}
