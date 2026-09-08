import type { BattleStepOutput } from "../session/battleSession";
import type { BattleState } from "../sim/types";
export interface BattlePerformanceSummary {
  durationSeconds: number;
  damageDealt: number;
  shellHits: number;
  torpedoHits: number;
  shipsSunk: number;
  playerScore: number;
  enemyScore: number;
}
export class BattleTelemetryAccumulator {
  private damage = 0;
  private shellHits = 0;
  private torpedoHits = 0;
  private processedImpacts = new Set<number>();
  private processedDamageEvents = new WeakSet<object>();
  private sunkTargets = new Set<string>();
  private frozenSummary: BattlePerformanceSummary | null = null;
  constructor(readonly controlledShipId: string) {}
  consume(output: BattleStepOutput): void {
    if (this.frozenSummary) return;
    const controlled = output.state.ships.find((ship) => ship.id === this.controlledShipId);
    const isEnemy = (targetId: string): boolean => {
      const target = output.state.ships.find((ship) => ship.id === targetId);
      return !!target && !!controlled && target.team !== controlled.team;
    };
    for (const event of output.hullDamage ?? []) {
      if (this.processedDamageEvents.has(event)) continue;
      this.processedDamageEvents.add(event);
      if (event.creditedOwnerId === this.controlledShipId && isEnemy(event.targetId)) {
        this.damage += Number.isFinite(event.damage) ? Math.max(0, event.damage) : 0;
      }
    }
    for (const impact of output.impacts) {
      if (this.processedImpacts.has(impact.id)) continue;
      this.processedImpacts.add(impact.id);
      if (impact.sourceId !== this.controlledShipId || !impact.targetId || impact.kind !== "hit") continue;
      if (!isEnemy(impact.targetId)) continue;
      if (!output.hullDamage) this.damage += Number.isFinite(impact.damage) ? Math.max(0, impact.damage!) : 0;
      if (impact.projectileKind === "shell" && impact.weaponSource === "mainGun") this.shellHits += 1;
      if (impact.projectileKind === "torpedo" && impact.weaponSource !== "aircraft") this.torpedoHits += 1;
    }
    for (const event of output.destroyedShips ?? []) {
      if (event.creditedOwnerId === this.controlledShipId && isEnemy(event.targetId)) this.sunkTargets.add(event.targetId);
    }
    if (output.state.status !== "running") this.freeze(output.state);
  }
  summary(state: BattleState): BattlePerformanceSummary {
    if (this.frozenSummary) return { ...this.frozenSummary };
    return { durationSeconds: Math.max(0, state.time), damageDealt: this.damage, shellHits: this.shellHits,
      torpedoHits: this.torpedoHits, shipsSunk: this.sunkTargets.size,
      playerScore: state.objective.scores.player, enemyScore: state.objective.scores.enemy };
  }
  freeze(state: BattleState): BattlePerformanceSummary {
    this.frozenSummary ??= Object.freeze(this.summary(state));
    return { ...this.frozenSummary };
  }
}
