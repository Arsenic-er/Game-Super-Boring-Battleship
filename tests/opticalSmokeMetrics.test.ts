import { describe, expect, it } from "vitest";
import { OpticalSmokeMetrics, type OpticalSmokeSample } from "./helpers/opticalSmokeMetrics";

const contact = (id: string, observedAt = 0) => ({ id, observedAt });
function sample(time: number, overrides: Partial<OpticalSmokeSample> = {}): OpticalSmokeSample {
  return { time, dt: .5, contacts: [contact("a", time)], targetId: "a", mode: "acquiring", contactSource: "local", ...overrides };
}

describe("test-only optical smoke counters", () => {
  it("separates switches from still-visible targets and switches after local loss", () => {
    const metrics = new OpticalSmokeMetrics();
    metrics.update(sample(0));
    metrics.update(sample(.5, { targetId: "b", contacts: [contact("a"), contact("b")] }));
    metrics.update(sample(1, { targetId: "c", contacts: [contact("c")] }));
    expect(metrics.report()).toMatchObject({
      localSwitchesWhilePreviousVisible: 1, localSwitchesAfterPreviousLoss: 1,
      acquisitionEpisodesStarted: 3, acquisitionEpisodesInterrupted: 2,
    });
  });

  it("counts short and long same-identity gaps without treating memory or radio as local contact", () => {
    const metrics = new OpticalSmokeMetrics();
    metrics.update(sample(0));
    metrics.update(sample(.5, { contacts: [], mode: "lost", contactSource: "memory" }));
    metrics.update(sample(3, { mode: "tracking" }));
    metrics.update(sample(3.5, { contacts: [], targetId: "radio-other", mode: "searching", contactSource: "radio" }));
    metrics.update(sample(6.1));
    expect(metrics.report()).toMatchObject({
      sameTargetReacquiredWithin2_5Seconds: 1, sameTargetReacquiredAfter2_5Seconds: 1,
      localSwitchesWhilePreviousVisible: 0, localSwitchesAfterPreviousLoss: 0,
      firstLocalContactSeconds: 0, firstTrackingSeconds: 3,
    });
  });

  it("counts acquisition completion and distinct sensor timestamps, not cached frames", () => {
    const metrics = new OpticalSmokeMetrics();
    metrics.update(sample(0, { contacts: [contact("a", 0)] }));
    metrics.update(sample(.5, { contacts: [contact("a", 0)] }));
    metrics.update(sample(1, { contacts: [contact("a", 0)] }));
    metrics.update(sample(1.5, { contacts: [contact("a", 1.5)], mode: "tracking" }));
    expect(metrics.report()).toMatchObject({
      acquisitionEpisodesStarted: 1, acquisitionEpisodesCompleted: 1,
      acquisitionEpisodesInterrupted: 0, acquisitionEpisodesActiveAtEnd: 0,
      maximumAcquisitionSeconds: 1.5, maximumAcquisitionDistinctSamples: 2,
      perceptionSeconds: { acquiring: 1.5, tracking: .5, memory: 0, radio: 0, unaware: 0 },
    });
  });

  it("interrupts an acquisition on loss and keeps unfinished final episodes distinct", () => {
    const metrics = new OpticalSmokeMetrics();
    metrics.update(sample(0));
    metrics.update(sample(.5, { contacts: [], mode: "lost", contactSource: "memory" }));
    metrics.update(sample(1));
    expect(metrics.report()).toMatchObject({
      acquisitionEpisodesStarted: 2, acquisitionEpisodesCompleted: 0,
      acquisitionEpisodesInterrupted: 1, acquisitionEpisodesActiveAtEnd: 1,
      maximumAcquisitionSeconds: .5, maximumAcquisitionDistinctSamples: 1,
    });
  });

  it("reports radio separately from memory and never labels an unavailable target as tracked", () => {
    const metrics = new OpticalSmokeMetrics();
    metrics.update(sample(0, { contacts: [], targetId: undefined, mode: "unaware", contactSource: undefined }));
    metrics.update(sample(.5, { contacts: [], contactSource: "radio", mode: "searching" }));
    metrics.update(sample(1, { contacts: [], contactSource: "memory", mode: "lost" }));
    metrics.update(sample(1.5, { contacts: [], mode: "tracking" }));
    expect(metrics.report()).toMatchObject({
      firstLocalContactSeconds: null, firstTrackingSeconds: null,
      perceptionSeconds: { acquiring: 0, tracking: 0, memory: .5, radio: .5, unaware: 1 },
    });
  });

  it("does not mutate input and returns independent report objects", () => {
    const contacts = Object.freeze([Object.freeze(contact("a"))]);
    const input = Object.freeze(sample(0, { contacts }));
    const metrics = new OpticalSmokeMetrics();
    metrics.update(input);
    const report = metrics.report();
    report.perceptionSeconds.acquiring = 100;
    expect(metrics.report().perceptionSeconds.acquiring).toBe(.5);
    expect(input).toEqual(sample(0, { contacts: [contact("a")] }));
  });
});
