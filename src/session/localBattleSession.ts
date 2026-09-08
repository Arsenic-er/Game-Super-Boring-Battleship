import { RuleBasedAi } from "../controllers/ruleBasedAi";
import { FIXED_STEP } from "../sim/config";
import { observe, stepSimulation, takeLocalShipDestroyedEvents, takeLocalHullDamageEvents } from "../sim/simulation";
import type { BattleState, ControlCommand } from "../sim/types";
import type {
  AuthoritativeBattleSession,
  BattleStepOptions,
  BattleStepOutput,
} from "./battleSession";

const actorSeed = (id: string): number => {
  let seed = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    seed ^= id.charCodeAt(index);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
};

export class LocalBattleSession implements AuthoritativeBattleSession {
  readonly role = "local" as const;
  private currentState: BattleState;
  private readonly defaultIncludeDeveloperAi: boolean;
  private shipAiById = new Map<string, RuleBasedAi>();

  constructor(state: BattleState, options?: { includeDeveloperAi?: boolean }) {
    this.currentState = state;
    this.defaultIncludeDeveloperAi = options?.includeDeveloperAi ?? false;
  }

  get state(): BattleState {
    return this.currentState;
  }

  step(
    humanCommands: ReadonlyMap<string, ControlCommand>,
    dt = FIXED_STEP,
    options?: Readonly<BattleStepOptions>,
  ): BattleStepOutput {
    const commands = new Map(humanCommands);
    const includeDeveloperAi = options?.includeDeveloperAi ?? this.defaultIncludeDeveloperAi;
    const aiShips = this.currentState.ships.filter((ship) =>
      ship.hull > 0
      && !ship.isTestTarget
      && !commands.has(ship.id)
      && (includeDeveloperAi || ship.id === "enemy" || ship.aiControlled));
    const activeAiIds = new Set(aiShips.map(({ id }) => id));
    for (const id of this.shipAiById.keys()) {
      if (!activeAiIds.has(id)) this.shipAiById.delete(id);
    }
    for (const aiShip of aiShips) {
      let controller = this.shipAiById.get(aiShip.id);
      if (!controller) {
        controller = new RuleBasedAi(this.currentState.randomSeed ^ actorSeed(aiShip.id));
        this.shipAiById.set(aiShip.id, controller);
      }
      commands.set(aiShip.id, controller.command(observe(this.currentState, aiShip.id)));
    }
    stepSimulation(this.currentState, commands, dt);
    return {
      state: this.currentState,
      shots: [...this.currentState.shots],
      impacts: [...this.currentState.impacts],
      airEvents: [...this.currentState.airEvents],
      destroyedShips: takeLocalShipDestroyedEvents(this.currentState),
      hullDamage: takeLocalHullDamageEvents(this.currentState),
    };
  }

  reset(state: BattleState): void {
    this.currentState = state;
    this.shipAiById.clear();
  }
}
