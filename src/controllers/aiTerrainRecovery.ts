import { FIXED_STEP } from "../sim/config";
import { shipKinematicParameters, type ShipKinematicState } from "../sim/navigationKinematics";
import type { AiManeuverScheduler } from "../sim/aiManeuverScheduler";
import type { Observation } from "../sim/types";

type Controls = { throttle: number; rudder: number };
type Parameters = ReturnType<typeof shipKinematicParameters>;
export type TerrainRecoveryPhase = "braking" | "holding" | "recovery-planning" | "retreating" | "turning" | "settling" | "rejoined" | "recovery-failed" | "unverified";
export interface TerrainRecoveryTelemetry { phase: TerrainRecoveryPhase; reason?: string; attempts: number }
interface Receipt {
  generation: number;
  time: number;
  controls: Controls;
  x: number; z: number; heading: number; speed: number; rudder: number;
}
const neutral: Controls = { throttle: 0, rudder: 0 };
const astern: Controls = { throttle: -.25, rudder: 0 };
const angleDistance = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * Explicitly experimental arrest -> settle -> checked retreat -> rejoin.
 * It never moves/repairs a ship itself. Movement overrides require a fresh
 * prefix check; missing proof retains best-effort neutral control explicitly
 * labelled unverified. The next tick must match a confirmed prefix.
 * A complete retreat is only a terrain plan, not a route or other-ship clearance.
 */
export class AiTerrainRecovery {
  private phase: TerrainRecoveryPhase = "braking";
  private parameters: Parameters;
  private parametersChangedAt = -Infinity;
  private explorationExhausted = false;
  private holdReason?: string;
  private nextHoldCheckAt = 0;
  private expected?: ShipKinematicState;
  private request?: Receipt;
  private previousTime: number;
  private previousControls: Controls;
  private executedSeconds = 0;
  private attempts = 0;
  private turnAttempts = 0;
  private turnControls: Controls = { ...neutral };
  private settledTicks = 0;
  private retreatStart?: { x: number; z: number };
  private telemetry: TerrainRecoveryTelemetry = { phase: "braking", attempts: 0 };
  private readonly ownerId: string;
  private readonly classId: Observation["self"]["shipClassId"];
  private readonly mapId: Observation["mapId"];
  private readonly startedAt: number;
  private readonly steerSeconds: number;
  private readonly brakeRudder: number;

  constructor(o: Observation, controls: Controls, brakeRudder: number) {
    this.brakeRudder = brakeRudder;
    this.ownerId = o.self.id; this.classId = o.self.shipClassId; this.mapId = o.mapId;
    this.startedAt = o.time; this.previousTime = o.time; this.previousControls = { ...controls };
    this.parameters = shipKinematicParameters(o.self);
    this.steerSeconds = brakeRudder === 0 ? 0 : 6;
  }

  beginConfirmedStep(end: ShipKinematicState, dt: number): Controls {
    this.expected = { ...end, position: { ...end.position } };
    this.executedSeconds = dt;
    return { throttle: 0, rudder: this.brakeRudder };
  }

  getTelemetry(): TerrainRecoveryTelemetry { return { ...this.telemetry }; }

  command(o: Observation, controls: Controls, scheduler: AiManeuverScheduler): { controls: Controls; done: boolean } {
    const dt = scheduler.getTelemetry().dt;
    const fail = (reason: string): { controls: Controls; done: boolean } => {
      scheduler.cancel(this.ownerId); this.request = undefined;
      this.telemetry = { phase: reason.includes("budget") ? "unverified" : "recovery-failed", reason, attempts: this.attempts };
      return { controls, done: true };
    };
    if (!Number.isFinite(dt) || Math.abs(dt - FIXED_STEP) > 1e-9) return fail("unsupported-recovery-step");
    const hold = (reason: string, exhausted = false): void => {
      scheduler.cancel(this.ownerId); this.request = undefined;
      this.phase = "holding"; this.holdReason = reason;
      this.explorationExhausted ||= exhausted;
      this.nextHoldCheckAt = o.time + 2;
      this.executedSeconds = 0; this.retreatStart = undefined;
    };
    const currentParameters = shipKinematicParameters(o.self);
    const changedParameters = Object.keys(this.parameters).some(key => {
      const name = key as keyof Parameters;
      return currentParameters[name] !== this.parameters[name];
    });
    if (o.self.id !== this.ownerId || o.self.shipClassId !== this.classId || o.mapId !== this.mapId
      || o.time < this.previousTime || o.time - this.previousTime > .25) return fail("recovery-state-changed");
    if (changedParameters) {
      // The old complete suffix is invalid, but the ordinary coastal order is
      // not thereby safe. Retain neutral control, checked against NEW physics.
      scheduler.cancel(this.ownerId); this.request = undefined; this.expected = undefined;
      this.parameters = currentParameters; this.parametersChangedAt = o.time;
      this.phase = this.explorationExhausted ? "holding" : "settling";
      this.holdReason = "physical-parameters-changed"; this.executedSeconds = 0;
      this.retreatStart = undefined;
      // Do not reset settledTicks: continuous repair must not prevent measured
      // stationary evidence from accumulating.
    }
    if (!this.explorationExhausted && o.time - this.startedAt > 100) hold("recovery-deadline", true);
    if (this.phase === "braking" && (Math.abs(controls.throttle - this.previousControls.throttle) > .35
      || Math.abs(controls.rudder - this.previousControls.rudder) > .65)) return fail("recovery-orders-changed");
    if (this.expected && (Math.hypot(o.self.position.x - this.expected.position.x, o.self.position.z - this.expected.position.z) > .2
      || angleDistance(o.self.heading, this.expected.heading) > .01
      || Math.abs(o.self.speedKnots - this.expected.speedKnots) > .1
      || Math.abs(o.self.rudder - this.expected.rudder) > .03)) return fail("recovery-motion-diverged");
    this.previousTime = o.time; this.previousControls = { ...controls };

    const stopped = o.self.speedKnots === 0 && (o.self.rudder === 0 || currentParameters.steeringRatio === 0);
    this.settledTicks = stopped ? this.settledTicks + 1 : 0;
    if ((this.phase === "braking" && this.executedSeconds >= this.steerSeconds || this.phase === "settling")
      && this.settledTicks >= 3) {
      if (this.retreatStart && Math.hypot(o.self.position.x - this.retreatStart.x, o.self.position.z - this.retreatStart.z) < 5) {
        hold("retreat-made-no-progress", true);
      } else if (o.time - this.parametersChangedAt >= .25) {
        this.retreatStart = undefined;
        this.phase = "recovery-planning"; this.executedSeconds = 0; this.request = undefined;
        this.holdReason = undefined; scheduler.cancel(this.ownerId);
      }
    }
    if (this.phase === "holding" && this.settledTicks >= 3
      && o.time >= this.nextHoldCheckAt && o.time - this.parametersChangedAt >= .25) {
      this.phase = "recovery-planning"; this.request = undefined;
    }

    if (this.phase === "recovery-planning") {
      if (!stopped) return fail("planning-start-not-settled");
      if (this.request) {
        const r = this.request;
        // A complete suffix is accepted only from the same stationary source.
        // Actual rudder is deliberately part of this receipt, not just the helm order.
        if (o.time - r.time > 3
          || Math.hypot(o.self.position.x - r.x, o.self.position.z - r.z) > 1e-5
          || angleDistance(o.self.heading, r.heading) > 1e-7
          || o.self.speedKnots !== r.speed || o.self.rudder !== r.rudder) {
          scheduler.cancel(this.ownerId); this.request = undefined;
        } else {
          // Do not starve queued explicit maneuvers when the ordinary AI makes
          // tiny target-tracking adjustments. A major new order is different.
          if (Math.abs(controls.throttle - r.controls.throttle) > .35
            || Math.abs(controls.rudder - r.controls.rudder) > .65) return fail("recovery-orders-changed");
          const result = scheduler.result(this.ownerId);
          if (result?.generation === r.generation) {
            const [forward, turn, reverse] = result.results;
            if (forward?.status === "clear" && forward.stopped) {
              // Execute one fresh-confirmed tick of the explicit verified
              // forward order. Ordinary AI resumes evaluation next tick; this
              // is NOT approval of any different future tracking commands.
              const prefix = scheduler.confirm(this.ownerId, o.mapId, o.self,
                { segments: [{ durationSeconds: dt, ...r.controls }], brakeToStop: false });
              if (prefix.status !== "clear") {
                hold("rejoin-" + prefix.reason); this.expected = undefined;
                this.telemetry = { phase: "unverified", reason: "rejoin-" + prefix.reason, attempts: this.attempts };
                return { controls: { ...neutral }, done: false };
              }
              scheduler.cancel(this.ownerId);
              this.telemetry = { phase: "rejoined", reason: "forward-order-and-stop-checked", attempts: this.attempts };
              return { controls: { ...r.controls }, done: true };
            }
            if (this.explorationExhausted || forward?.status !== "blocked") {
              hold(this.explorationExhausted ? this.holdReason ?? "recovery-limit"
                : "rejoin-" + (forward?.reason ?? "missing-result"));
            } else {
              const usefulTurn = turn?.status === "clear" && turn.stopped
                && Math.hypot(turn.end.position.x - o.self.position.x, turn.end.position.z - o.self.position.z) > 5
                && angleDistance(turn.end.heading, o.self.heading) > .1;
              if (usefulTurn && this.turnAttempts < 4) {
                this.turnAttempts++; this.phase = "turning";
                this.turnControls = { throttle: .18, rudder: r.controls.rudder };
              } else {
                if (reverse?.status !== "clear" || !reverse.stopped) hold("retreat-" + (reverse?.reason ?? "not-verified"));
                else if (this.attempts >= 2) hold("recovery-attempt-limit", true);
                else { this.attempts++; this.phase = "retreating"; }
              }
              this.executedSeconds = 0;
              if (["retreating", "turning"].includes(this.phase)) this.retreatStart = { x: o.self.position.x, z: o.self.position.z };
              this.settledTicks = 0; this.request = undefined;
              scheduler.cancel(this.ownerId);
            }
          }
        }
      }
      if (this.phase === "recovery-planning" && !this.request) {
        const plans = [
          { segments: [{ durationSeconds: 24, ...controls }], brakeToStop: true },
          { segments: [{ durationSeconds: 12, throttle: .18, rudder: controls.rudder }], brakeToStop: true },
          { segments: [{ durationSeconds: 30, ...astern }], brakeToStop: true },
        ];
        const generation = scheduler.submit(this.ownerId, o.self, o.mapId,
          this.explorationExhausted ? plans.slice(0, 1) : plans);
        if (generation === undefined) hold("recovery-queue-capacity");
        else this.request = { generation, time: o.time, controls: { ...controls },
          x: o.self.position.x, z: o.self.position.z, heading: o.self.heading,
          speed: o.self.speedKnots, rudder: o.self.rudder };
      }
    }

    if ((this.phase === "retreating" && this.executedSeconds >= 30 - 1e-8)
      || (this.phase === "turning" && this.executedSeconds >= 12 - 1e-8)) {
      this.phase = "settling"; this.executedSeconds = 0; this.settledTicks = 0;
    }
    const desired = this.phase === "retreating" ? astern
      : this.phase === "turning" ? this.turnControls
      : this.phase === "braking" && this.executedSeconds < this.steerSeconds - 1e-8
        ? { throttle: 0, rudder: this.brakeRudder } : neutral;
    const prefix = scheduler.confirm(this.ownerId, o.mapId, o.self,
      { segments: [{ durationSeconds: dt, ...desired }], brakeToStop: false });
    if (prefix.status !== "clear") {
      // No previous receipt can authorize this frame. Neutral is explicitly
      // best-effort, NOT certified safe, until a new prefix succeeds.
      hold("recovery-" + prefix.reason);
      this.expected = undefined;
      this.telemetry = { phase: "unverified", reason: "recovery-" + prefix.reason, attempts: this.attempts };
      return { controls: { ...neutral }, done: false };
    }
    // Count executed time, never asynchronous planning latency or rejected work.
    this.executedSeconds += dt; this.expected = prefix.end;
    this.telemetry = { phase: this.phase, ...(this.holdReason ? { reason: this.holdReason } : {}), attempts: this.attempts };
    return { controls: { ...desired }, done: false };
  }
}
