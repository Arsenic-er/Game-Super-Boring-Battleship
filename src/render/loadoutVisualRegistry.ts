import type { ShipClassId } from "../ships/classes";
import type { InstalledEquipmentIds } from "../sim/types";
import { resolveLoadoutVisualPlan, type ResolvedLoadoutVisualPlan } from "./loadoutVisualPlan";

/** A registry owns exactly one visual session. Reusing ship IDs cannot retain an old loadout. */
export class LoadoutVisualRegistry {
  private scope?: string;
  private readonly plans = new Map<string, ResolvedLoadoutVisualPlan>();
  begin(scope: string): void {
    if (!scope.trim()) throw new Error("A visual session scope is required");
    this.clear();
    this.scope = scope;
  }
  get sessionScope(): string | undefined { return this.scope; }
  get size(): number { return this.plans.size; }
  register(scope: string, shipId: string, shipClassId: ShipClassId, installed: Readonly<InstalledEquipmentIds>, batteryClassId?: ShipClassId): ResolvedLoadoutVisualPlan {
    if (scope !== this.scope) throw new Error("Cannot register a loadout in an inactive visual session");
    const next = resolveLoadoutVisualPlan(shipClassId, installed, batteryClassId);
    const prior = this.plans.get(shipId);
    if (prior?.signature === next.signature) return prior;
    this.plans.set(shipId, next);
    return next;
  }
  get(scope: string, shipId: string): ResolvedLoadoutVisualPlan | undefined {
    return scope === this.scope ? this.plans.get(shipId) : undefined;
  }
  remove(scope: string, shipId: string): void { if (scope === this.scope) this.plans.delete(shipId); }
  clear(): void { this.plans.clear(); this.scope = undefined; }
}
