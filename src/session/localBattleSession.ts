import { AiManeuverScheduler } from "../sim/aiManeuverScheduler";
import { RuleBasedAi } from "../controllers/ruleBasedAi";
import { FleetObjectiveCoordinator } from "../controllers/fleetObjectiveCoordinator";
import { FleetTargetCoordinator } from "../controllers/fleetTargetCoordinator";
import { FleetRadioNetwork } from "../sim/fleetRadio";
import { FIXED_STEP } from "../sim/config";
import { observe, stepSimulation, takeLocalShipDestroyedEvents, takeLocalHullDamageEvents } from "../sim/simulation";
import type { BattleState, ControlCommand, ShipState } from "../sim/types";
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
  private readonly maneuverPlanning?: AiManeuverScheduler;
  private readonly aiShipIdentity = new Map<string, ShipState>();
  private shipAiById = new Map<string, RuleBasedAi>();
  private readonly fleetRadio = new FleetRadioNetwork();
  private readonly fleetTargets = new FleetTargetCoordinator();
  private readonly fleetObjectives = new FleetObjectiveCoordinator();

  constructor(state: BattleState, options?: { includeDeveloperAi?: boolean;
    /** Laboratory only: not exposed by the game UI; failed recovery gates remain. */
    experimentalTerrainManeuvers?: boolean }) {
    this.currentState = state;
    this.defaultIncludeDeveloperAi = options?.includeDeveloperAi ?? false;
    if (options?.experimentalTerrainManeuvers) this.maneuverPlanning = new AiManeuverScheduler();
  }

  get state(): BattleState {
    return this.currentState;
  }

  step(
    humanCommands: ReadonlyMap<string, ControlCommand>,
    dt = FIXED_STEP,
    options?: Readonly<BattleStepOptions>,
  ): BattleStepOutput {
    // The renderer may keep ticking after a result. Do not mutate observations,
    // restart AI planning or deliver the previous frame's effects again.
    if (this.currentState.status !== "running") {
      return { state: this.currentState, shots: [], impacts: [], airEvents: [],
        destroyedShips: [], hullDamage: [] };
    }
    const commands = new Map(humanCommands);
    const includeDeveloperAi = options?.includeDeveloperAi ?? this.defaultIncludeDeveloperAi;
    const aiShips = this.currentState.ships.filter((ship) =>
      ship.hull > 0
      && !ship.isTestTarget
      && !commands.has(ship.id)
      && (includeDeveloperAi || ship.id === "enemy" || ship.aiControlled));
    const activeAiIds = new Set(aiShips.map(({ id }) => id));
    this.maneuverPlanning?.beginFrame(this.currentState.time, activeAiIds, dt);
    for (const id of this.shipAiById.keys()) {
      if (!activeAiIds.has(id)) { this.shipAiById.delete(id); this.aiShipIdentity.delete(id); }
    }
    // Take a complete local-sensor batch before any controller runs. Human ships
    // can report sightings too; reports never alter the local sensor cache.
    const observations = new Map(this.currentState.ships
      .filter((ship) => ship.hull > 0 && !ship.isTestTarget)
      .map((ship) => [ship.id, observe(this.currentState, ship.id)] as const));
    this.fleetRadio.update([...observations.values()], this.currentState.time);
    // Only eligible AI participate. Human commands neither receive assignments
    // nor leave reservations that can redirect other ships after takeover.
    const assignments = this.fleetTargets.update(
      aiShips.map((ship) => observations.get(ship.id)!), this.currentState.time,
    );
    const objectiveAssignments = this.currentState.mode === "battle"
      ? this.fleetObjectives.update(aiShips.map((ship) => observations.get(ship.id)!), this.currentState.time)
      : undefined;
    if (!objectiveAssignments) this.fleetObjectives.reset();
    for (const aiShip of aiShips) {
      let controller = this.shipAiById.get(aiShip.id);
      if (this.aiShipIdentity.get(aiShip.id) !== aiShip) {
        this.maneuverPlanning?.cancel(aiShip.id); controller = undefined;
      }
      if (!controller) {
        controller = new RuleBasedAi(this.currentState.randomSeed ^ actorSeed(aiShip.id));
        this.shipAiById.set(aiShip.id, controller);
        this.aiShipIdentity.set(aiShip.id, aiShip);
      }
      const localObservation = observations.get(aiShip.id)!;
      commands.set(aiShip.id, controller.command({
        ...localObservation,
        sharedContacts: this.fleetRadio.contactsFor(aiShip, this.currentState.time),
        fleetTarget: assignments.get(aiShip.id),
        fleetObjective: objectiveAssignments?.get(aiShip.id),
      }, this.maneuverPlanning));
    }
    this.maneuverPlanning?.runBackground();
    stepSimulation(this.currentState, commands, dt, { automatedAirControllerIds: activeAiIds });
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
    this.aiShipIdentity.clear();
    this.maneuverPlanning?.reset();
    this.fleetRadio.reset();
    this.fleetTargets.reset();
    this.fleetObjectives.reset();
  }
}
