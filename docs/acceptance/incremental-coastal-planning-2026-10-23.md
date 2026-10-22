# Incremental coastal planning — 2026-10-23

## Decision

Deliver resumable physical predictions and a bounded, battle-local scheduler.
Keep the coastal control experiment **disabled in normal single-player, host
and offline balance runs**. A real-session permanent-stop counterexample,
repeated throttle cycling and sustained CPU cost fail the activation gate.

This checkpoint does not fix the existing centre-only terrain collision gap,
three known late-stop rain cases, or general coastal recovery. No propulsion,
rudder, weapons, sensors, scoring or 1,200-second battle limit changes.

## Completed infrastructure

- Prediction creation freezes motion state, physical parameters, class, plan
  and total budgets. Each advance call may stop before any physical step,
  initial hull check, batch check or refining sweep.
- Slice motion/geometry ceilings are exact, including zero-work slices.
  Exhausted work is pending/incomplete, not clearance. The synchronous API
  drains the same task and retains the previous results.
- Ten full-result fixtures from bd508ef match under three different slice
  schedules. Additional tests cover snapshot isolation, output isolation,
  invalid budgets and a conservative batch requiring thirty refining sweeps.
- One scheduler belongs to an explicitly experimental authoritative session.
  Foreground current-state confirmations and background predictions share
  1,024 motion steps / 64 geometry queries per simulation tick.
- Background jobs rotate in slices of at most thirty steps / two queries.
  Each candidate is limited to 3,600 steps / 256 queries. At most three
  candidate plans and 64 resident owners are admitted; excess developer
  entities retain their existing controls rather than crashing the session.
- Removal, death, human takeover, test-target changes, same-ID replacement,
  reset and time rewind discard stale work. Terminal sessions do not advance
  it. Default controllers and host sessions perform no prediction work.

Background rotation is not a guarantee of foreground or admission fairness
for arbitrarily many developer-spawned entities. At normal 60 Hz, fourteen
one-step foreground confirmations fit within the shared geometry budget.
Forty same-order confirmations can repeatedly exhaust it after the first
32 clear cases. That larger-entity scheduling policy remains unfinished.

## Experimental control path

The switch is a source-level laboratory option,
LocalBattleSession(..., { experimentalTerrainManeuvers: true }); it is not
exposed by the game UI. RuleBasedAi only invokes the guard when a scheduler
is explicitly injected. Ordinary construction retains the prior controls.

A conservative all-direction reach bound activates planning near terrain,
using the hull circumradius, travel and stopping distance. Rotated terrain
AABBs use maximum radial extent, with draft-aware shallow-water filtering.
A centre-heading ray or radial terrain clearance is not used as proof of
shortest coast distance.

The experiment predicts the final tactical throttle and rudder, after station
turns and damage caps. Current candidates are:

1. Original controls for twelve seconds, followed by a complete neutral stop.
2. Zero throttle with the original rudder for six seconds, then neutral stop.
3. Neutral throttle and rudder through a complete stop.

Old results supply advice only. Every applied override gets a fresh whole-hull
check from the current pose/parameters for the actual current dt. Unsupported
dt above .25 s, insufficient work, incomplete confirmation or an emergency
does not authorize an override. Existing recovery and ship/torpedo evasion
retain priority. These prefix checks are not full-stop certificates and do
not check ship/ship contact or evolving damage.

## Evidence that prevents activation

### Early natural approach

The archived Edinburgh pose at 565 s has original controls .35 / -.82.
Holding that order touches terrain after eight seconds. The experiment can
start braking before the safe window closes:

- Fourteen simultaneous copies first brake after .4167–.4667 simulated
  seconds, within the 1,024 / 64 per-frame ceilings.
- A 240-second single-ship run has no swept-hull contact and eventually
  travels 247.596 m, including 173.439 m in the last minute.
- Nevertheless, it releases braking 105 times. A full stopping tail reduces
  the earlier cycling but does not produce smooth sustained coastal control.

A shorter thirty-second no-contact test is therefore insufficient acceptance.

### Real-session neutral lock

A full-health Edinburgh begins at x=1695, z=1282, heading=-.5,
speed=.3 knots and actual rudder=-.82. The initial full hull is clear.
In an atoll sea-trials LocalBattleSession, seed 123, an AI-controlled test
cruiser with no weapons faces a distant human-held ship at (-5000,-5000).

The forward and steering-stop candidates hit terrain; neutral stopping is
clear. The guard keeps selecting neutral controls, while old centre-based
navigation stays in cruising rather than taking over recovery. In sixty
seconds the ship moves about .05 m, with zero travel in the last thirty.
This is a real controller/session failure, not just a fixed-command puzzle.

Run the deliberately unmet activation gate on the server:

    node scripts/qa/coastal-maneuver-acceptance.mjs --experimental-terrain-maneuvers

It writes ignored diagnostic results and exits unsuccessfully while the
experimental ship fails to make useful progress. It is not a skipped or
expected-failure unit test, and its failure is not counted as successful
gameplay acceptance.

### Sustained cost

Three runs of 1,000 measured frames, following 240 warm-up frames, use
fourteen independent copies of the original approach. These are server Node
CPU timings for guard plus scheduler, not rendered game frames:

| Scenario | Median per frame | 95th percentile | Maximum |
| --- | ---: | ---: | ---: |
| Fourteen near-coast ships | 5.26–5.41 ms | 7.67–7.84 ms | 14.95 ms |
| Fourteen open-water ships | .0047–.0072 ms | .0060–.0091 ms | .087 ms |

The near-coast sample uses the entire geometry budget in 974 of 1,000 frames;
this is sustained work, not only startup. No Surface/mobile performance or
FPS claim is supported. Historical synchronous batches have different work
loads, so these numbers do not establish an equivalent-work speedup.

## Verification and retained state

- 2,259 regular tests pass. Eleven pre-existing opt-in cases remain skipped;
  the two offline balance-report entrypoints are excluded as before.
- Eighty-seven new regressions cover incremental parity (23), scheduler
  accounting/fairness/backpressure (24), guard mechanics (22), and lifecycle
  plus default-disabled paths (18). Existing thresholds are unchanged.
- Six explicit prototype checks pass, including full 5v5/7v7 sessions and
  the no-input twenty-minute clock.
- Production build passes with the existing large-chunk warning. Eleven
  actual-main browser checks pass with zero errors; the temporary service
  closes after the checks.
- Twelve full ordinary fleet-support sessions (5v5/7v7, clear/rain/fog,
  both spawn sides) preserve every bd508ef terminal hash and navigation
  metric. All 144 ship appearances fire main guns, totalling 20,288 shells.
  Both 48-module manifests match the final tree. Experimental scheduling
  is never invoked in these ordinary sessions.
- The explicit neutral-lock activation gate FAILS as documented above;
  its result is separate from the passing ordinary regression suite.
- An earlier enabled integration run produced five timeout failures and one
  dead-owner error in the offline balance integration. That balance integration
  was removed. No timeout or gameplay threshold was increased to get a pass.
- No Windows package launch, fresh native LAN, Surface or mobile acceptance
  is claimed for this checkpoint.

Detailed evidence stays in the ignored server directory
.qa/coastal-planning-20261023/. The concise activation script and unit
regressions are versioned; raw logs, snapshots, replay archives and generated
builds are not. The assets repository remains 4e4d587; main remains 8ef5b84.
No asset upload, version/tag change, local download or persistent preview.

## Next activation gate

1. Give preventive braking an explicit, physically checked escape/recovery
   handoff. A safe stop with no route out is not a navigation solution.
2. Remove repeated accelerate/brake cycling without hiding it behind a longer
   test timeout, weaker progress threshold or stronger engines/rudders.
3. Reduce repeated near-coast work and validate cost on the low-end targets.
4. Pass the neutral-lock gate, long continuous approaches and all twelve
   natural fleet cases before enabling ordinary AI or reconnecting whole-hull
   physical collision.
