# Coastal recovery execution — 2026-10-23

## Decision

**Do not enable in ordinary gameplay.** The explicit recovery controller improves
the short neutral-lock reproduction, but both strict four-minute real-session
fixtures still fail. This checkpoint is an experimental implementation and
reproducible acceptance evidence, not an AI-navigation release.

Work starts from 8b4bac0 on codex/v072-historical-models. Development, builds,
tests and generated reports stay on GPU-821560 under /home/ubuntu/battleship.

## Implemented behavior

- Arrest: execute the selected steering brake for at most six seconds, then
  command neutral helm. Replanning cannot restart this stage's elapsed time.
- Settle: require actual zero speed and actual zero rudder (or disabled
  steering) for three ticks before planning from a stationary source.
- Plan: check ordinary controls for twenty-four seconds plus their complete
  neutral stop. If blocked, check a twelve-second low-speed turn and a
  thirty-second straight-astern maneuver, each with a full neutral stop.
- Execute: only a clear, stopped candidate may start. A useful turn must
  produce over five metres displacement and over 0.1 rad heading change.
  Every applied tick gets a fresh complete-hull prefix; next-tick motion
  must agree with that expectation within the stated implementation tolerances.
- Rejoin: the checked explicit forward order gets one new prefix check and
  one executed tick. Later ordinary AI orders are evaluated afresh; this
  does not certify their future trajectories.
- Interrupt: emergencies, external astern orders, changed physical parameters,
  motion divergence, budget shortage and non-60 Hz steps reject old execution.
  Two retreats, four low-speed turns and a one-hundred-second episode deadline
  bound the experiment. Exhaustion remains latched until real relocation or
  a substantial heading change; handing back to old AI is not recovery success.

A queued maneuver uses a fixed explicit proposal. Ordinary tracking changes
of 0.0001 rad no longer cancel it on every frame. Larger order changes and
physical-source changes still invalidate it. The independent four-second
reproduction now submits once and moves about 4.25 m instead of submitting
237 times and remaining stationary.

## Real-session acceptance

These are seeded controller/session fixtures, not replays of the entire
historical battle. The second starts from the archived 565-second pose and
module health; normal repair and simulation continue.

Progress uses actual position after session.step. The distanceTravelled
counter alone is unsuitable: contact resolution can revert position without
subtracting the kernel's accumulated distance. Safety checks observe both
the unconstrained commanded sweep and final full-body contact, without
changing the test trajectory.

| Fixture | First 60 s | Four-minute result |
|---|---|---|
| Neutral lock | 86.92 m actual path; 21.26 m net; 41.91 m in last 30 s; no whole-hull contact; still recovering | First terrain contact 125.47 s; net 25.44 m; last 60 s path 44.58 m; zero successful rejoins |
| Damaged 565 s approach | Natural repairs repeatedly invalidate the frozen physical plan; first contact 8.05 s | Net 24.46 m; last 60 s path 29.45 m; zero successful rejoins |

The neutral fixture's initial immobilization is improved, but its recovery
deadline returns control to an unsafe legacy route. The damaged fixture
demonstrates that invalidating old geometry is necessary but returning the
old ordinary order is not a safe replacement. Neither result permits default
activation or full-body collision integration.

Reproduce the unchanged short gate:

    node scripts/qa/coastal-maneuver-acceptance.mjs --experimental-terrain-maneuvers

Run the stronger, deliberately unmet acceptance:

    node scripts/qa/coastal-recovery-acceptance.mjs --experimental-terrain-maneuvers

The strict script must return exit 1 while any safety/progress gate fails;
without explicit opt-in it returns exit 2. Do not convert this into skipped
or expected-failure unit acceptance.

## Performance scope

A frozen pre-final-boundary-check revision measured fourteen copies of the
565 s approach for three runs of 1,000 frames: server CPU p50 0.530–0.871 ms,
p95 3.188–5.906 ms, maximum 13.007 ms. Per run: 82,464 motion steps and
30,511 terrain queries; frame ceilings remained 1,024/64. All ships settled
with actual neutral rudder by 9.42 s and began astern movement by 10.44 s.
At 16.67 s they were still reversing. Open-water samples did zero prediction work.

This measures different control stages/work than the previous indefinite-brake
experiment, not an equal-work speedup. It excludes rendering, the full battle,
LAN, native Windows, Surface and mobile performance. Source hashes accompany
the raw server report; these timing figures are not final-revision hardware
acceptance.

## Evidence and remaining scope

- Server investigation: .qa/coastal-recovery-20261023/
- Candidate trajectories and frozen hashes: candidate-exploration.json
- CPU sampling: scheduler-performance.json
- Final strict acceptance: .qa/coastal-recovery-acceptance/
- Unit regressions: tests/aiTerrainRecovery.test.ts
- Final regular suite: 2,275 passes, 11 existing opt-in skips; 177 test
  files pass. Two balance-report entrypoints are excluded as before.
- Sixteen new recovery regressions pass, plus independent recovery/lifecycle
  review (34 tests). Final build passes with the existing large-chunk warning.
- Final strict report hashes match all 38 loaded production source modules.
  Its two failing cases remain unmet activation gates, not passing tests.
- The original short acceptance exits 0; strict acceptance exits 1 and
  missing-opt-in invocation exits 2, as documented.
- Final logs: regular-final.log, build-final.log and short-final.log in the
  investigation folder. No source edits occurred during the final suite.
- This checkpoint does not rerun the opt-in prototype or browser suites;
  its changed controller remains isolated from their default gameplay path.

The previous checkpoint's twelve ordinary fleet terminal/hash comparisons
remain historical evidence, not a newly repeated twelve-case run here.
No new native Windows, multiplayer transport, low-end hardware or visual
acceptance is claimed. Main, assets, version/tag, twenty-minute duration,
default-off flag and disabled preview service remain unchanged.

Next: retain safe control while repair changes invalidate a candidate; replace
unsafe deadline/exhaustion handoff with a checked continuation or explicit
navigation recovery contract. Then repeat the strict fixtures, natural fleet
matrix and sustained-cost gates before activation.
