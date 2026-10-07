import type { AiDecisionTelemetry, PerceptionMode, SensorContact } from "../../src/sim/types";

type Contact = Readonly<Pick<SensorContact, "id" | "observedAt">>;
type DiagnosticMode = "acquiring" | "tracking" | "memory" | "radio" | "unaware";

export interface OpticalSmokeSample {
  time: number;
  dt: number;
  /** Exact pre-step local contacts supplied to this observer's controller. */
  contacts: readonly Contact[];
  targetId?: string;
  mode?: PerceptionMode;
  contactSource?: AiDecisionTelemetry["contactSource"];
}

/** Test-only, constant-space counters. Never reads another ship's world state or RNG. */
export class OpticalSmokeMetrics {
  private readonly seconds: Record<DiagnosticMode, number> = {
    acquiring: 0, tracking: 0, memory: 0, radio: 0, unaware: 0,
  };
  private lastLocalTargetId?: string;
  private localLostAt?: number;
  private episode?: { targetId: string; startedAt: number; lastSampleAt: number; samples: number };
  private localSwitchesWhilePreviousVisible = 0;
  private localSwitchesAfterPreviousLoss = 0;
  private sameTargetReacquiredWithin2_5Seconds = 0;
  private sameTargetReacquiredAfter2_5Seconds = 0;
  private acquisitionEpisodesStarted = 0;
  private acquisitionEpisodesCompleted = 0;
  private acquisitionEpisodesInterrupted = 0;
  private maximumAcquisitionSeconds = 0;
  private maximumAcquisitionDistinctSamples = 0;
  private firstLocalContactSeconds?: number;
  private firstTrackingSeconds?: number;

  update(sample: Readonly<OpticalSmokeSample>): void {
    const { time, dt, contacts, targetId, mode, contactSource } = sample;
    const local = contactSource === "local" && targetId
      ? contacts.find((contact) => contact.id === targetId) : undefined;
    const diagnosticMode: DiagnosticMode = local && mode === "tracking" ? "tracking"
      : local && mode === "acquiring" ? "acquiring"
      : contactSource === "radio" ? "radio"
      : contactSource === "memory" || mode === "lost" || mode === "searching" ? "memory"
      : "unaware";
    this.seconds[diagnosticMode] += dt;
    if (contacts.length > 0) this.firstLocalContactSeconds ??= time;
    if (diagnosticMode === "tracking") this.firstTrackingSeconds ??= time;

    if (local) {
      if (this.lastLocalTargetId && this.lastLocalTargetId !== local.id) {
        if (contacts.some((contact) => contact.id === this.lastLocalTargetId))
          ++this.localSwitchesWhilePreviousVisible;
        else ++this.localSwitchesAfterPreviousLoss;
      } else if (this.lastLocalTargetId === local.id && this.localLostAt !== undefined) {
        if (time - this.localLostAt <= 2.5 + 1e-9) ++this.sameTargetReacquiredWithin2_5Seconds;
        else ++this.sameTargetReacquiredAfter2_5Seconds;
      }
      this.lastLocalTargetId = local.id;
      this.localLostAt = undefined;
    } else if (this.lastLocalTargetId && this.localLostAt === undefined) {
      this.localLostAt = time;
    }

    if (this.episode && (diagnosticMode !== "acquiring" || local?.id !== this.episode.targetId)) {
      const completed = diagnosticMode === "tracking" && local?.id === this.episode.targetId;
      if (completed && local) this.countSample(local);
      this.maximumAcquisitionSeconds = Math.max(this.maximumAcquisitionSeconds, time - this.episode.startedAt);
      if (completed) ++this.acquisitionEpisodesCompleted;
      else ++this.acquisitionEpisodesInterrupted;
      this.episode = undefined;
    }
    if (diagnosticMode === "acquiring" && local) {
      if (!this.episode) {
        this.episode = { targetId: local.id, startedAt: time, lastSampleAt: -Infinity, samples: 0 };
        ++this.acquisitionEpisodesStarted;
      }
      this.countSample(local);
      this.maximumAcquisitionSeconds = Math.max(this.maximumAcquisitionSeconds, time + dt - this.episode.startedAt);
    }
  }

  private countSample(contact: Contact): void {
    const episode = this.episode!;
    // Sensor timestamps are monotonic. Repeated per-frame cached contacts do not count again.
    if (contact.observedAt > episode.lastSampleAt) {
      episode.lastSampleAt = contact.observedAt;
      ++episode.samples;
      this.maximumAcquisitionDistinctSamples = Math.max(this.maximumAcquisitionDistinctSamples, episode.samples);
    }
  }

  report() {
    const round = (value: number): number => Math.round(value * 100) / 100;
    return {
      localSwitchesWhilePreviousVisible: this.localSwitchesWhilePreviousVisible,
      localSwitchesAfterPreviousLoss: this.localSwitchesAfterPreviousLoss,
      sameTargetReacquiredWithin2_5Seconds: this.sameTargetReacquiredWithin2_5Seconds,
      sameTargetReacquiredAfter2_5Seconds: this.sameTargetReacquiredAfter2_5Seconds,
      perceptionSeconds: Object.fromEntries(Object.entries(this.seconds).map(([key, value]) => [key, round(value)])),
      firstLocalContactSeconds: this.firstLocalContactSeconds === undefined ? null : round(this.firstLocalContactSeconds),
      firstTrackingSeconds: this.firstTrackingSeconds === undefined ? null : round(this.firstTrackingSeconds),
      acquisitionEpisodesStarted: this.acquisitionEpisodesStarted,
      acquisitionEpisodesCompleted: this.acquisitionEpisodesCompleted,
      acquisitionEpisodesInterrupted: this.acquisitionEpisodesInterrupted,
      acquisitionEpisodesActiveAtEnd: this.episode ? 1 : 0,
      maximumAcquisitionSeconds: round(this.maximumAcquisitionSeconds),
      maximumAcquisitionDistinctSamples: this.maximumAcquisitionDistinctSamples,
    };
  }
}
