# Physical maneuver prediction — 2026-10-23

## Delivered scope

Extract the existing propulsion, rudder response, heading and translation
calculation into one shared kernel without changing its arithmetic. The live
simulation uses that kernel; a new snapshot-only predictor uses it to evaluate
explicit final throttle and rudder orders, followed optionally by a neutral
throttle/neutral helm braking tail.

The predictor samples water at the old centre on each 60 Hz step. Engine and
steering health, equipment and flooding remain fixed during a prediction.
It does not advance weapons, repair, RNG, contacts or other ships. A clear
result describes only the supplied terrain trajectory. It is not approval
of a different throttle, an endpoint bearing or future controller decisions.

Live AI and the centre-only terrain resolver remain unchanged; full-hull
physical integration is not enabled. In particular,
the old centre-only collision gap and three known late-stop rain cases are
not fixed by this delivery.

## Actual approach that the old planner misses

Replayed the rejected full-hull experiment from the preceding checkpoint:
default 7v7 clear, seed 464852, fleet support, Edinburgh calibration-a-4.
All 45 loaded source hashes match that archived experiment. The first contact
with mountain-ne occurs at 573.0167 s, followed by about 627 s of reversing
without useful escape.

At 565 s the current padded centre ray reports an obstruction 106.771 m away.
The desired bearing is clear along a straight ray, but requires about 175
degrees of physical turning. The 187 m hull has a collision half-length of
89.76 m; the centre-ray padding is only 23.58 m. A distant clear direction is
not a physically reachable clear turn.

Frozen-damage counterfactuals using the original movement block establish
the following results, now reproduced by the new predictor:

| Starting time | Counterfactual control orders | Result |
| --- | --- | --- |
| 565 s | Keep throttle .35, rudder -.82 | Hull hits the mountain after 8.000 s |
| 565 s | Neutral throttle and neutral target rudder | Stops safely after 7.4667 s |
| 565 s | Original order for .5 or 1 s, then neutral controls | Stops safely |
| 570 s | Immediately neutral controls | Still hits after 3.7333 s |

The subsequent reverse failure has a separate cause. At 574 s the accepted
static hull is clear but tight against the coast. A target rudder of +.49087
sweeps the turning hull into land while reversing. Holding that order gives
zero travel in 60 s. Neutral target rudder, with the original gradual rudder
response, permits about 99.73 m of astern travel after an initial 1.05 s
obstruction. This is an isolated counterfactual, not a complete-battle fix.

Snapshots, counterfactuals and source manifests remain in the server-only
directory `.qa/coastal-approach-20261023/`. No raw replay or duplicate source
tree is added to Git.

## Collision checks and bounded work

Every intermediate physical pose contributes its complete hull to a
half-second batch envelope. The envelope includes the existing coast chord
error and the rotational sweep error. A clear batch avoids checking each
constituent step separately. A hit is refined against consecutive physical
steps, so land inside a curved path's convex pocket need not reject the
actual clear arc.

A collision-corrected pose is never substituted into the prediction.
Specifically, the resolver's translation-only fallback with rejected yaw
does not count as execution of the original helm order. An initially
overlapping hull is rejected; this predictor does not solve legacy overlap.

One call accepts at most sixteen command segments and performs at most
7,200 motion steps and 1,024 full-hull geometry queries. Point-water samples
are separately bounded by the motion steps. Limits may be lowered, not
raised, by callers. Incomplete work returns incomplete, never clear.

Review found and fixed two additional edge cases: nonzero forced speed
starting from rest cannot be called stopped, and a huge but finite turn
multiplier is rejected before entering the original angle-normalization
loop. Normal simulation formulas are unchanged.

## Performance constraint before enabling live planning

Server CPU measurements used fourteen independent ship snapshots in one
synchronous batch, three warm-up batches and fifteen measured batches.
This is not game frame time or a Surface/mobile measurement.

| Case | Candidates per ship | Batch median | Batch maximum |
| --- | ---: | ---: | ---: |
| Open water, 10 s orders plus braking | 1 | 24.50 ms | 25.35 ms |
| Open water, 10 s orders plus braking | 3 | 42.24 ms | 70.77 ms |
| 565 s approach, .5 s order plus braking | 1 | 26.04 ms | 28.15 ms |
| 565 s approach, 12 s orders plus braking | 3 | 114.47 ms | 122.42 ms |
| Powerless reverse, full motion budget | 3 | 70.19 ms | 76.75 ms |

Each powerless reverse prediction terminates after 7,200 steps, about
120 simulated seconds, with incomplete/motion-budget. No normal benchmark
case exhausts its budget. Scheduling all ships and candidates in the same
frame is unsuitable for the low-end target; live integration needs
near-coast activation, staggered work and a strict per-frame budget.

## Verification

- 2,172 regular tests pass; eleven opt-in cases remain skipped and the two
  offline balance-report entrypoints are excluded, as in the prior checkpoint.
- Sixty-three new regressions comprise 39 exact kinematic parity checks,
  21 maneuver cases and three batch-envelope cases. Existing tests and
  thresholds are unchanged.
- Independent old/new processes run four ships for 1,200 real simulation
  ticks with changing controls, damage repair, flooding and firing. Every
  complete BattleState hash matches. Final hash:
  `eb65be18c24829b10d32b228187530eb4fd36aebf25a302a1569474cc064093f`.
- Six explicit prototype checks pass, including complete 5v5/7v7 battles
  and the no-input twenty-minute clock.
- Production build passes with the existing large-chunk warning. Eleven
  actual-main browser checks pass with zero errors; the temporary service
  closes and no preview service remains.
- Twelve full 5v5/7v7 fleet-support sessions, clear/rain/fog from both sides,
  pass their existing gates. Every terminal hash and navigation metric
  matches 3e98d41: all 144 ship appearances fire main guns, totalling
  20,288 shells. Both 45-module manifests match the final source tree.
  This proves preservation of gameplay, not improved live navigation.
- Independent sampling checks 600 arc batches; 357 clear envelopes have
  10,710 consecutive sweeps with no contradiction. This is supplemental
  sampling, not a general mathematical proof.
- Final logs and verification summary remain under the server-only
  `.qa/maneuver-prediction-20261023/` directory. No Windows package,
  hardware performance or new LAN acceptance is claimed.


## Next integration gate

1. Select candidate orders after all tactical throttle and station-turn
   overrides. The current controller computes those after navigation recovery.
2. Schedule near-coast predictions across frames, bound candidate count and
   revalidate stale plans after damage, map/pose changes or emergency intent.
3. Prefer an actually safe braking/neutral-helm or astern maneuver before
   contact. Never treat a safe target ray or reduced throttle as proof of a
   safe physical turn.
4. Reconnect full-hull collision only with recovery fixtures and all twelve
   natural battle gates passing. Keep engine, rudder, weapons, sensors and
   twenty-minute endings unchanged.
