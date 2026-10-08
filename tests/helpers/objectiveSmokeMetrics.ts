import type { ObjectiveObservation, ShipState, Team } from "../../src/sim/types";

const teams = ["player", "enemy"] as const;
export const LATE_BATTLE_START_SECONDS = 900;
const FIXED_STEP_BOUNDARY_EPSILON = 1e-6;

type ObjectiveSnapshot = {
  time: number;
  objective: Pick<ObjectiveObservation, "center" | "radius" | "scores">;
  ships: readonly Pick<ShipState, "team" | "hull" | "position">[];
};

/** Extra paired-seed runs are opt-in; defaults preserve the two historical cases. */
export function prototypeSeedOffset(raw: string | undefined): number {
  if (raw === undefined) return 0;
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))
    || Math.abs(Number(raw)) > 100_000) {
    throw new Error("PROTOTYPE_SEED_OFFSET must be a decimal integer in [-100000, 100000]");
  }
  return Number(raw);
}

/** Test-only, post-step measurements. Never feeds world positions back to an AI. */
export class ObjectiveSmokeMetrics {
  private readonly inZoneShipSeconds: Record<Team, number> = { player: 0, enemy: 0 };
  private contestedSeconds = 0;
  private readonly lateScoreGain: Record<Team, number> = { player: 0, enemy: 0 };
  private previousTime: number;
  private previousScores: Record<Team, number>;

  constructor(initial: Pick<ObjectiveSnapshot, "time" | "objective">) {
    this.previousTime = initial.time;
    this.previousScores = { ...initial.objective.scores };
  }

  update(snapshot: ObjectiveSnapshot): void {
    const elapsed = snapshot.time - this.previousTime;
    if (elapsed <= 0) return;
    const occupants: Record<Team, number> = { player: 0, enemy: 0 };
    for (const ship of snapshot.ships) {
      if (ship.hull <= 0) continue;
      if (Math.hypot(ship.position.x - snapshot.objective.center.x,
        ship.position.z - snapshot.objective.center.z) <= snapshot.objective.radius) {
        occupants[ship.team] += 1;
      }
    }
    for (const team of teams) this.inZoneShipSeconds[team] += occupants[team] * elapsed;
    if (occupants.player > 0 && occupants.enemy > 0) this.contestedSeconds += elapsed;
    // Fixed-step smoke starts at zero and samples every tick, including the 900s
    // boundary. Do not count the tick ending at that boundary. Score gains include
    // every scoreboard source (capture and destruction), not capture points alone.
    if (this.previousTime >= LATE_BATTLE_START_SECONDS - FIXED_STEP_BOUNDARY_EPSILON) {
      for (const team of teams) {
        this.lateScoreGain[team] += Math.max(0, snapshot.objective.scores[team] - this.previousScores[team]);
      }
    }
    this.previousTime = snapshot.time;
    this.previousScores = { ...snapshot.objective.scores };
  }

  report() {
    return {
      inZoneShipSeconds: { ...this.inZoneShipSeconds },
      contestedSeconds: this.contestedSeconds,
      lateScoreStartSeconds: LATE_BATTLE_START_SECONDS,
      lateScoreGain: { ...this.lateScoreGain },
    };
  }
}
