import { type BattleMapId } from "../maps/atollMap";
import { FIXED_STEP } from "./config";
import { createShipKinematicSnapshot, shipKinematicParameters } from "./navigationKinematics";
import {
  createShipManeuverPrediction, predictShipManeuver,
  type ShipManeuverPlan, type ShipManeuverPrediction, type ShipManeuverPredictionTask,
} from "./shipManeuver";
import type { ShipState } from "./types";

export interface AiManeuverFrameBudget {
  maxMotionSteps?: number;
  maxTerrainQueries?: number;
}
export interface AiManeuverWork {
  motionSteps: number;
  terrainQueries: number;
}
export interface AiManeuverCompletedBundle {
  generation: number;
  createdAt: number;
  results: ShipManeuverPrediction[];
}
export interface AiManeuverSchedulerTelemetry {
  time?: number;
  dt: number;
  activeOwners: number;
  queuedOwners: number;
  completedOwners: number;
  remaining: AiManeuverWork;
  work: AiManeuverWork;
  totals: AiManeuverWork;
}
interface Job {
  generation: number;
  createdAt: number;
  tasks: ShipManeuverPredictionTask[];
  planIndex: number;
  results: ShipManeuverPrediction[];
}

const MAX_OWNER_JOBS = 64;
const MAX_PLANS = 3;
const TASK_MOTION_STEPS = 3600;
const TASK_TERRAIN_QUERIES = 256;
const SLICE_MOTION_STEPS = 30;
const SLICE_TERRAIN_QUERIES = 2;
const copyPrediction = (prediction: ShipManeuverPrediction): ShipManeuverPrediction => ({
  ...prediction,
  end: { ...prediction.end, position: { ...prediction.end.position } },
  ...(prediction.contact ? {
    contact: { ...prediction.contact, zoneIds: [...prediction.contact.zoneIds] },
  } : {}),
});

/**
 * One scheduler per local authoritative battle. No process-wide queue or budget.
 * Foreground confirmations and round-robin background work share each frame's
 * resource ceiling; a pending prediction is never a permission to move.
 */
export class AiManeuverScheduler {
  private readonly maximum: AiManeuverWork;
  private active = new Set<string>();
  private jobs = new Map<string, Job>();
  private completed = new Map<string, AiManeuverCompletedBundle>();
  private queue: string[] = [];
  private frameTime?: number;
  private frameDt = FIXED_STEP;
  private frameWork: AiManeuverWork = { motionSteps: 0, terrainQueries: 0 };
  private cumulativeWork: AiManeuverWork = { motionSteps: 0, terrainQueries: 0 };
  private nextGeneration = 0;

  constructor(budget: Readonly<AiManeuverFrameBudget> = {}) {
    const motionSteps = budget.maxMotionSteps ?? 1024;
    const terrainQueries = budget.maxTerrainQueries ?? 64;
    if (!Number.isInteger(motionSteps) || motionSteps < 0 || motionSteps > 7200
      || !Number.isInteger(terrainQueries) || terrainQueries < 0 || terrainQueries > 1024) {
      throw new RangeError("Invalid shared maneuver frame budget");
    }
    this.maximum = { motionSteps, terrainQueries };
  }

  /** The same timestamp is idempotent: callers cannot replenish a spent frame. */
  beginFrame(time: number, activeIds: ReadonlySet<string> | readonly string[], dt = FIXED_STEP): void {
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(dt) || dt <= 0) {
      throw new RangeError("Invalid maneuver frame");
    }
    const owners = new Set(activeIds);
    if ([...owners].some(id => typeof id !== "string" || id.length === 0)) {
      throw new RangeError("Maneuver owners require nonempty ids");
    }
    if (this.frameTime !== undefined && time < this.frameTime) this.reset();
    for (const owner of this.active) if (!owners.has(owner)) this.cancel(owner);
    this.active = owners;
    if (this.frameTime === undefined || time !== this.frameTime) {
      this.frameWork = { motionSteps: 0, terrainQueries: 0 };
    }
    this.frameTime = time;
    this.frameDt = dt;
  }

  submit(
    ownerId: string, ship: Readonly<ShipState>, mapId: BattleMapId,
    plans: readonly Readonly<ShipManeuverPlan>[],
  ): number | undefined {
    this.assertOwner(ownerId, ship);
    if (plans.length < 1 || plans.length > MAX_PLANS) {
      throw new RangeError("A maneuver job needs one to three plans");
    }
    // Developer fleets may contain arbitrarily many active ships. Capacity is
    // backpressure on resident jobs/results, not an exception in the battle.
    if (!this.jobs.has(ownerId) && !this.completed.has(ownerId)
      && this.jobs.size + this.completed.size >= MAX_OWNER_JOBS) return undefined;
    // Every alternative captures NOW, not when the primary eventually finishes.
    const tasks = plans.map(plan => createShipManeuverPrediction(mapId, ship, plan, {
      maxMotionSteps: TASK_MOTION_STEPS, maxTerrainQueries: TASK_TERRAIN_QUERIES,
    }));
    this.cancel(ownerId);
    const generation = ++this.nextGeneration;
    this.jobs.set(ownerId, {
      generation, createdAt: this.frameTime!, tasks, planIndex: 0, results: [],
    });
    this.queue.push(ownerId);
    return generation;
  }

  result(ownerId: string): AiManeuverCompletedBundle | undefined {
    const result = this.completed.get(ownerId);
    return result ? { ...result, results: result.results.map(copyPrediction) } : undefined;
  }

  cancel(ownerId: string): void {
    this.jobs.delete(ownerId);
    this.completed.delete(ownerId);
    this.queue = this.queue.filter(id => id !== ownerId);
  }

  /** Generations stay monotonic so a reset cannot resurrect an older receipt. */
  reset(): void {
    this.active.clear(); this.jobs.clear(); this.completed.clear(); this.queue = [];
    this.frameTime = undefined; this.frameDt = FIXED_STEP;
    this.frameWork = { motionSteps: 0, terrainQueries: 0 };
    this.cumulativeWork = { motionSteps: 0, terrainQueries: 0 };
  }

  runBackground(): void {
    if (this.frameTime === undefined) return;
    let idleTurns = 0;
    while (this.queue.length > 0) {
      const remaining = this.remaining;
      if (remaining.motionSteps === 0 && remaining.terrainQueries === 0) return;
      const owner = this.queue.shift()!;
      const job = this.jobs.get(owner);
      if (!job) continue;
      const slice = job.tasks[job.planIndex]!.advance({
        maxMotionSteps: Math.min(SLICE_MOTION_STEPS, remaining.motionSteps),
        maxTerrainQueries: Math.min(SLICE_TERRAIN_QUERIES, remaining.terrainQueries),
      });
      this.account(slice);
      let progressed = slice.motionSteps > 0 || slice.terrainQueries > 0;
      if (slice.status === "complete") {
        progressed = true;
        job.results.push(slice.result);
        // Only a physically BLOCKED primary justifies testing alternatives.
        // A budget-limited/invalid primary is not treated as proof of danger.
        const needAlternative = job.results[0]!.status === "blocked"
          && job.planIndex + 1 < job.tasks.length;
        if (needAlternative) job.planIndex++;
        else {
          this.completed.set(owner, {
            generation: job.generation, createdAt: job.createdAt,
            results: job.results.map(copyPrediction),
          });
          this.jobs.delete(owner);
        }
      }
      if (this.jobs.has(owner)) this.queue.push(owner);
      idleTurns = progressed ? 0 : idleTurns + 1;
      // One exhausted resource may still permit another owner's query/step.
      // Stop only after a full queued round cannot make any further progress.
      if (idleTurns >= this.queue.length) return;
    }
  }

  /**
   * Fresh synchronous confirmation, never queued or cached. Call this before
   * runBackground so near-term actual helm orders get first use of the budget.
   */
  confirm(
    ownerId: string, mapId: BattleMapId, ship: Readonly<ShipState>,
    plan: Readonly<ShipManeuverPlan>,
  ): ShipManeuverPrediction {
    this.assertOwner(ownerId, ship);
    const remaining = this.remaining;
    if (remaining.motionSteps === 0 || remaining.terrainQueries === 0) {
      const end = createShipKinematicSnapshot(ship), parameters = shipKinematicParameters(ship);
      return {
        status: "incomplete",
        reason: remaining.terrainQueries === 0 ? "terrain-budget" : "motion-budget",
        end, elapsedSeconds: 0, lastClearSeconds: 0, motionSteps: 0, terrainQueries: 0,
        stopped: (parameters.forcedSpeedKnots === undefined || parameters.forcedSpeedKnots === 0)
          && end.speedKnots === 0 && (end.rudder === 0 || parameters.steeringRatio === 0),
      };
    }
    const prediction = predictShipManeuver(mapId, ship, plan, {
      maxMotionSteps: Math.min(TASK_MOTION_STEPS, remaining.motionSteps),
      maxTerrainQueries: Math.min(TASK_TERRAIN_QUERIES, remaining.terrainQueries),
    });
    this.account(prediction);
    return prediction;
  }

  get remaining(): AiManeuverWork {
    return {
      motionSteps: this.maximum.motionSteps - this.frameWork.motionSteps,
      terrainQueries: this.maximum.terrainQueries - this.frameWork.terrainQueries,
    };
  }
  get work(): AiManeuverWork { return { ...this.frameWork }; }
  get totals(): AiManeuverWork { return { ...this.cumulativeWork }; }
  getTelemetry(): AiManeuverSchedulerTelemetry {
    return {
      time: this.frameTime, dt: this.frameDt, activeOwners: this.active.size,
      queuedOwners: this.jobs.size, completedOwners: this.completed.size,
      remaining: this.remaining, work: this.work, totals: this.totals,
    };
  }
  private account(work: Readonly<AiManeuverWork>): void {
    this.frameWork.motionSteps += work.motionSteps;
    this.frameWork.terrainQueries += work.terrainQueries;
    this.cumulativeWork.motionSteps += work.motionSteps;
    this.cumulativeWork.terrainQueries += work.terrainQueries;
  }
  private assertOwner(ownerId: string, ship: Readonly<ShipState>): void {
    if (this.frameTime === undefined || !this.active.has(ownerId) || ship.id !== ownerId) {
      throw new RangeError("Maneuver owner must be active in the current frame and match its ship");
    }
  }
}
