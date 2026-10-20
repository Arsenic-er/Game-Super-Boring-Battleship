# AI recovery heading stabilization — 2026-10-20

## Accepted scope

Suppress large port/starboard candidate reversals during an already active,
blocked, nearly stationary post-reverse maneuver. This is a bounded navigation
repair, not acceptance of fleet-wide engagement or universally fast recovery.

An exit is retained only after adjacent planning samples show opposite turn
directions, both more than 30 degrees off the bow, an absolute candidate jump
over 45 degrees, and less than five degrees of actual hull rotation. Both
samples must be on the same map, within one second, with a blocked bow and
absolute speed at most 0.5 kn. The selected exit must have a fully checked
hull-scaled terrain/boundary corridor at the current position.

Once established, the commitment survives renewed motion while its corridor
remains clear. A new reverse, unsafe exit, boundary handling or recovery
completion clears it. Collision avoidance, a detected torpedo threat or damage
withdrawal explicitly interrupts it; the existing half-second planning cadence
is retained. Ordinary moving recovery and steady one-direction turns do not
start commitments. Wrapped differences reject mere +/-pi representation changes.

Actual-bow propulsion and release conditions are unchanged. This does not alter
speed, low-speed rudder authority, braking, gun arcs, reload, aim uncertainty,
sensors, radio firing permission, damage, scoring or the accepted twenty-minute
limit. There is no new rendering work.

## Original fault and same-frame evidence

Baseline adf6560, seed offset 211, mirrored 7v7 rain-squall:
Richelieu calibration-b-5 remained at (839.84, -1226.43) for the last 300 seconds.
A capture-recovery plan without a waypoint used the ship's current position;
its station heading followed the changing bow. Discrete terrain candidates
alternated sides instead of completing either turn.

A passive replay reproduces the baseline canonical hash exactly:
cad3134a8b77360d8e31f49e2d07eec03e1024a7a5fec6f64462814ee43e7ec4.

The final candidate's passive replay also matches its uninstrumented session:
6cf1bb8dd779744c12ec0bac09f869aa4762e1274dfc24ba3e860bbda93ca259.

| b5, final 300 seconds | Baseline | Candidate |
| --- | ---: | ---: |
| Full-helm direction reversals | 32 | 0 |
| Post-reverse reorientation | 300 s | 0 s |
| Actual cumulative travel | 0 m | 641.03 m |
| Local tracking | 104.15 s | 45.15 s |
| Main-gun fire intent | 0 s | 15.08 s |
| Actual main-gun shells | 0 | 16 |

Both eight-shell salvos occur with a real local track and legal firing arcs.
They follow changed navigation and new contacts, not an unchanged historical
target trajectory. The ship still enters another reverse at 1096.47 seconds
and ends at -1.88 kn; this does not establish complete coastal-navigation
acceptance.

The separate baseline 5/default/rain a4 case is not the same oscillation:
it turns steadily without helm reversals and releases near 1179.65 seconds.
It remains a slow-turn/navigation problem, not evidence for altering physics.

## Counterexamples and safety controls

Nineteen navigation tests include six natural reconstructions, nine phase-boundary
guards and four negative controls. The natural cases use both teams and heading
offsets -0.006, 0 and +0.006 radians, fresh controllers, real observe/commands and
simulation physics. The initial position is moved 280 m from the historical
pose toward the real shoal. This is an integration reconstruction with a fixed
public objective order and stationary target, not a replay of the full fleet.

| Per-team heading offset | Old release within 600 s | New release | Old longest stop | New longest stop | Travel in following normal 30 s |
| --- | --- | ---: | ---: | ---: | ---: |
| -0.006 | None | 502.82 s | 365.25 s | 4.22 s | 86.03 m |
| 0 | None | 365.90 s | 398.23 s | 7.40 s | 70.09 m |
| +0.006 | None | 366.93 s | 392.25 s | 4.40 s | 70.14 m |

All six finish one reverse/reorientation, then sail normally for at least
thirty seconds; grounding remains zero and performance parameters unchanged.
The final same tests fail on exact old navigation: six natural recoveries
never release, nine guards fail their new commitment setup, and four negative
controls pass. Those nine setup failures do not mean old safety guards failed.

The new, unpublished reconstruction window was expanded from 390 to 600 seconds
after narrowing the policy from immediate commitment to observed candidate
reversal. The earlier 360-second release threshold came from the discarded
candidate, not an existing product contract. No existing test was relaxed.
The broader candidate released around 351 seconds; the narrower policy is
deliberately more selective and is not described as faster.

Phase-boundary guards relocate public state to check emergency/cache handling,
new grounding, newly unsafe terrain, boundaries, sternway, engine-loss inertia
and completed recovery. Negative controls cover moving recovery, stable slow
turning, +/-pi and small alignment overshoot. These guards are not natural
end-to-end voyage acceptance. Eight additional controller tests verify real
public collision/torpedo/damage signals and no unauthorized firing, not full
avoidance performance.

## Full-battle results and unresolved cases

Twelve paired 5v5/7v7 clear/rain/fog sessions retain identical initial ship and
air manifests. All 144 ship appearances fire main guns. Total shells change
18,825 to 19,005, but surviving ships with at least 300 seconds since their last
shot increase from nine to fourteen. This is not a fleet-wide participation pass.

| Spawn | Size | Weather | Old late silent | New |
| --- | --- | --- | ---: | ---: |
| Default | 5v5 | Clear | 0 | 0 |
| Default | 5v5 | Rain | 2 | 0 |
| Default | 5v5 | Fog | 0 | 0 |
| Default | 7v7 | Clear | 0 | 0 |
| Default | 7v7 | Rain | 1 | 3 |
| Default | 7v7 | Fog | 1 | 5 |
| Mirrored | 5v5 | Clear | 0 | 0 |
| Mirrored | 5v5 | Rain | 0 | 0 |
| Mirrored | 5v5 | Fog | 0 | 1 |
| Mirrored | 7v7 | Clear | 1 | 4 |
| Mirrored | 7v7 | Rain | 3 | 0 |
| Mirrored | 7v7 | Fog | 1 | 1 |

There are ten newly silent identities, four retained and five removed. Five new
ones survived both runs; five previously sank. Eight new ones have no late local
contact; two of those have disabled main guns throughout the window and two
others have zero rudder health in all three diagnostic snapshots. All ten have
zero late fire intent. These facts do not prove every remaining silence benign.

Next priorities are 7/default/fog a5 Richelieu (healthy, no contact, same position
and zero speed in three snapshots while turning slowly), and
7/mirrored/clear b2 Cleveland (29.07 seconds tracking but no intent; heavily
damaged/withdrawing during much of the window). Snapshot evidence cannot establish
their exact same-frame navigation/firing cause. Do not bypass terrain or grant
radio-only fire to address them.

Ten primary battles settle normally at twenty minutes and two end by destruction.
Maximum continuous grounding is 0.05 seconds. Six team-label controls match
complete canonical hashes; four seed-offset-zero fog sessions pass, with two
late silent survivors in mirrored 7v7 and zero in the other three.

The discarded broad-commit candidate raised late silent survivors to eighteen
and reduced shells to 17,402. A one-case ablation removing only its extra
exit-clearance propulsion gate leaves its full 7/mirrored/rain hash unchanged.
That result separates the gate from the broad commitment policy in that one case;
it is not a causal explanation for the entire matrix.

## Verification and delivery

- 1,989 regular-suite tests pass, including eight balance-lab tests
  (1,981 other regular tests); six explicit prototype checks also pass.
- Twenty-two complete fleet sessions pass: twelve primary, six label controls
  and four independent-seed fog sessions. This is regression coverage, not
  statistical proof of fleet-wide balance or participation.
- Production build passes. Eleven isolated server-browser checks pass with
  zero errors; the temporary preview is closed. The existing large-bundle
  warning remains. The two opt-in balance report entrypoints were skipped,
  not counted as additional passing balance tests.
- Independent code/test review found no blocking defect within this bounded
  scope. No private navigation state is injected by the six main regressions.

Source, tests and condensed records stay on the active development branch.
Assets, main, tags, version and local delivery are unchanged. Detailed ignored
server evidence is under .qa/arc-reengagement-20261020/; the narrow-* files are
the selected candidate, while final-* preserve the discarded broad experiment.
No raw traces or duplicate source snapshots are committed. Native Windows,
physical two-PC LAN, Surface and mobile frame-rate validation remain outstanding.
