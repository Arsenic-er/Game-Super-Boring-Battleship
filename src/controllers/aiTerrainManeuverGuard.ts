import { battleMapDefinition, shipDraftMeters, type BattleMapId } from "../maps/atollMap";
import { getShipClass } from "../ships/classes";
import { shipSpeedMetersPerSecond } from "../sim/config";
import { forwardStoppingDistance, shipKinematicParameters } from "../sim/navigationKinematics";
import type { AiManeuverScheduler } from "../sim/aiManeuverScheduler";
import type { Observation, ShipState } from "../sim/types";

type Controls = { throttle: number; rudder: number };
type Parameters = ReturnType<typeof shipKinematicParameters>;
interface RequestSnapshot {
  ownerId: string; generation: number; time: number; mapId: BattleMapId; classId: ShipState["shipClassId"];
  x: number; z: number; heading: number; speed: number; parameters: Parameters; controls: Controls;
}
export interface AiTerrainManeuverTelemetry {
  phase: "inactive" | "predicting" | "braking" | "unverified" | "clear" | "no-safe-stop";
  queueAgeSeconds?: number;
  predictedContactSeconds?: number;
  reason?: string;
}

/** Conservative activation filter, NOT a navigable route or shortest coast distance. */
export function needsTerrainManeuverPrediction(mapId: BattleMapId, ship: Readonly<ShipState>): boolean {
  const map = battleMapDefinition(mapId), hull = getShipClass(ship.shipClassId);
  const params = shipKinematicParameters(ship);
  const reach = Math.hypot(hull.length * .48, hull.beam * .55)
    + shipSpeedMetersPerSecond(Math.max(Math.abs(ship.speedKnots), params.equippedMaxSpeed)) * 14
    + forwardStoppingDistance(ship);
  if (!Number.isFinite(reach)) return true;
  const { x, z } = ship.position;
  if (Math.abs(x) + reach >= map.halfExtentMeters || Math.abs(z) + reach >= map.halfExtentMeters) return true;
  const draft = shipDraftMeters(ship.shipClassId);
  return map.terrain.some(zone => {
    if (zone.kind === "shallow" && (zone.depthMeters ?? 80) - draft > .5) return false;
    const radial = zone.radialProfile && zone.radialProfile.length >= 3 ? Math.max(...zone.radialProfile)
      : zone.kind === "sandbar" ? 1.38 : zone.kind === "mountain" ? 1.31 : 1.26;
    const c = Math.abs(Math.cos(zone.rotation)), s = Math.abs(Math.sin(zone.rotation));
    const rx = Math.max(1, zone.radiusX), rz = Math.max(1, zone.radiusZ);
    return Math.abs(x - zone.x) <= (c * rx + s * rz) * radial + reach
      && Math.abs(z - zone.z) <= (s * rx + c * rz) * radial + reach;
  });
}

function snapshot(generation: number, o: Observation, controls: Controls): RequestSnapshot {
  return { ownerId: o.self.id, generation, time: o.time, mapId: o.mapId, classId: o.self.shipClassId,
    x: o.self.position.x, z: o.self.position.z, heading: o.self.heading,
    speed: o.self.speedKnots, parameters: shipKinematicParameters(o.self), controls: { ...controls } };
}
function stillRelevant(request: RequestSnapshot, o: Observation, controls: Controls): boolean {
  if (o.self.id !== request.ownerId || o.time < request.time || o.time - request.time > 1.5 || request.mapId !== o.mapId
    || request.classId !== o.self.shipClassId
    || Math.hypot(o.self.position.x - request.x, o.self.position.z - request.z) > 45
    || Math.abs(Math.atan2(Math.sin(o.self.heading - request.heading), Math.cos(o.self.heading - request.heading))) > .3
    || Math.abs(o.self.speedKnots - request.speed) > 3
    || Math.abs(controls.throttle - request.controls.throttle) > .35
    || Math.abs(controls.rudder - request.controls.rudder) > .65) return false;
  const now = shipKinematicParameters(o.self);
  return Object.keys(request.parameters).every(key => {
    const name = key as keyof Parameters, a = request.parameters[name], b = now[name];
    if (a === b) return true;
    return a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b)
      && Math.abs(a - b) <= Math.max(.01, Math.abs(a) * .1);
  });
}

/**
 * Best-effort early braking advice. A queued result is never live clearance:
 * each changed control gets a NEW full-hull check from this tick's real state.
 * Existing contact recovery and emergency ship/torpedo evasion keep ownership.
 */
export class AiTerrainManeuverGuard {
  private request?: RequestSnapshot;
  private advice?: { source: RequestSnapshot; contactSeconds: number; controls: Controls };
  private telemetry: AiTerrainManeuverTelemetry = { phase: "inactive" };

  getTelemetry(): AiTerrainManeuverTelemetry { return { ...this.telemetry }; }

  command(o: Observation, controls: Controls, scheduler: AiManeuverScheduler, emergency = false): Controls {
    const dt = scheduler.getTelemetry().dt;
    const cancel = (reason: string): Controls => {
      scheduler.cancel(o.self.id); this.request = undefined; this.advice = undefined;
      this.telemetry = { phase: "inactive", reason }; return controls;
    };
    if (emergency) return cancel("existing-emergency-or-recovery");
    if (!(dt > 0 && dt <= .25)) return cancel("unsupported-step");
    if (o.self.speedKnots < -.05 || controls.throttle < 0
      || (o.self.speedKnots <= .2 && !this.request && !this.advice)) return cancel("not-forward-prevention");
    if (!needsTerrainManeuverPrediction(o.mapId, o.self)) return cancel("open-water");
    if (this.request && !stillRelevant(this.request, o, controls)) {
      scheduler.cancel(o.self.id); this.request = undefined;
    }
    if (this.advice && !stillRelevant(this.advice.source, o, controls)) this.advice = undefined;

    if (this.request) {
      const bundle = scheduler.result(o.self.id);
      if (bundle?.generation === this.request.generation) {
        const [primary, steeringStop, neutralStop] = bundle.results;
        const steerClear = steeringStop?.status === "clear" && steeringStop.stopped;
        const neutralClear = neutralStop?.status === "clear" && neutralStop.stopped;
        if (primary?.status === "blocked" && primary.reason === "terrain-contact"
          && (steerClear || neutralClear)) {
          this.advice = { source: this.request, contactSeconds: primary.elapsedSeconds,
            controls: { throttle: 0, rudder: steerClear ? this.request.controls.rudder : 0 } };
        } else {
          this.advice = undefined;
          this.telemetry = { phase: primary?.status === "clear" ? "clear" : "no-safe-stop",
            reason: primary?.reason };
        }
        if (o.time - this.request.time >= .35) {
          scheduler.cancel(o.self.id); this.request = undefined;
        }
      }
    }
    if (!this.request) {
      const generation = scheduler.submit(o.self.id, o.self, o.mapId, [
        { segments: [{ durationSeconds: 12, ...controls }], brakeToStop: true },
        { segments: [{ durationSeconds: 6, throttle: 0, rudder: controls.rudder }], brakeToStop: true },
        { segments: [], brakeToStop: true },
      ]);
      if (generation === undefined) {
        this.telemetry = { phase: "unverified", reason: "queue-capacity" }; return controls;
      }
      this.request = snapshot(generation, o, controls);
    }
    this.telemetry = { ...this.telemetry, queueAgeSeconds: o.time - this.request.time };
    if (!this.advice) {
      if (!scheduler.result(o.self.id)) this.telemetry.phase = "predicting";
      return controls;
    }
    // This is a terrain prefix check only, not certification of a future full stop.
    const confirmed = scheduler.confirm(o.self.id, o.mapId, o.self, {
      segments: [{ durationSeconds: dt, ...this.advice.controls }], brakeToStop: false,
    });
    this.telemetry = { phase: confirmed.status === "clear" ? "braking" : "unverified",
      queueAgeSeconds: o.time - this.request.time, predictedContactSeconds: this.advice.contactSeconds,
      reason: confirmed.reason };
    return confirmed.status === "clear" ? { ...this.advice.controls } : controls;
  }
}
