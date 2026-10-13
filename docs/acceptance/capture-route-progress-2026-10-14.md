# Route aware capture assignments and progress handoff

Capture duties now account for safe sailing routes, not only straight-line
distance. A reachable ally can take over when an assigned ship makes no useful
progress for a sustained interval.

## Starting point

The source baseline is 8cf752f on codex/v072-historical-models. Eight fresh
surface-only 5v5/7v7 cases used seed offsets 877 and 1213 with both spawn sides.
All finished at 1,200 seconds and passed the existing runtime assertions.
Northern fleets won six of eight; the maximum continuous grounding was 0.05 s.

| Seed | Size | Spawn | Baseline winner | First ownership player / enemy in seconds |
| --- | --- | --- | --- | --- |
| 465006 | 5v5 | default | enemy | 1101.60 / 204.13 |
| 465518 | 7v7 | default | enemy | 474.60 / 201.42 |
| 465006 | 5v5 | mirrored | player | 198.15 / 477.28 |
| 465518 | 7v7 | mirrored | player | 205.45 / 497.15 |
| 465342 | 5v5 | default | player | 511.73 / never |
| 465854 | 7v7 | default | enemy | 412.57 / 199.88 |
| 465342 | 5v5 | mirrored | player | 203.97 / 1061.20 |
| 465854 | 7v7 | mirrored | enemy | 389.65 / 640.10 |

These are fixed paired cases, not independent samples of a population win rate.
First ownership includes capture progress and opposition; it is not arrival time.

## Remaining route length

ObjectiveCaptureNavigator now exposes remainingDistanceMeters without changing
the existing plan return shape or steering commands. It sums the full verified
remaining path, from current position through remaining waypoints to the capture
station. In-zone routes return zero; unsafe or invalid routes return Infinity.

The method reuses the existing two-second planning cache and bounded graph.
Eighteen new tests and the twenty prior navigation tests pass. Real atoll cases
cover multiple route legs and a valid detour that temporarily increases straight-
line distance while reducing remaining route length. Other checks cover cached
movement, invalid geometry, map/class/objective/station changes and clock resets.
Route estimation does not inspect hostile contacts or hidden occupants.

## Assignment and handoff

Candidate ranking retains in-zone priority and the existing hull-role biases,
but prefers available safe routes and compares full sailing distance. At most
64 observer entries retain two station-specific navigators. Route estimates
are sampled every four seconds; the sort comparator never triggers a search.
The existing one-second assignment cadence and twelve-second duty hold remain.

Outside the zone, an assigned ship has a sixty-second progress window. Renewing
that window requires both at least 20 m of remaining-route reduction and 20 m
of own-hull displacement. A longer replan may rebase the distance comparison
without renewing the clock. Stationary route-cost oscillations therefore do
not count as movement; ordinary detours can still make progress.

A stalled duty changes only when an eligible, reachable replacement can form
a valid station pairing with retained members. The replaced ship receives
sixty seconds of lower retry priority, not permanent exclusion. If every route
is unavailable or no replacement exists, a legal recovery duty is retained.
Healthy hulls already inside the circle remain eligible even with lost propulsion
or steering. Death, heavy damage and human takeover retain immediate release.

At most two capture ships are assigned to station 0/1. Allocation first avoids
unreachable stations, then preserves feasible existing stations, then minimizes
route length. The verified replacement pairing is retained through selection;
it is not undone by an unrelated sort. This also prevents small cost changes
from making ships continually exchange stations.

Route/progress/retry state clears on observer removal, team/class/map/objective
changes, reset or a rewound clock. Mutable terrain geometry is checked at the
four-second cadence. The feature uses own/friendly navigation and public static
geometry; it does not read hostile contacts or hidden objective occupants.
Weapon statistics, terrain, scoring and the urgency equation are unchanged.


## Physical session regressions

The new integration fixtures run LocalBattleSession, normal AI commands and
fixed-step physics for both team labels. The concave-shoal case places a nearer
Fletcher at (-400, 800), where capture navigation returns recovery, and a
farther Fletcher at (-800, 0), with a direct route. The old coordinator assigns
the recovering hull instead of the reachable one.

A separate open-sea developer fixture limits one hull's maximum speed multiplier
to 0.001. This deliberately stresses sustained progress monitoring; it is not
a claim about production engine damage or repair balance. Propulsion, steering,
other ships and capture scoring use real simulation steps. The old coordinator
does not hand off within the 220-second fixture.

All four integration checks fail against the exact 8cf752f coordinator source:
two at the initial route selection and two at missing handoff.

All four final physical fixtures pass. In both terrain cases, the chosen ship
enters and remains in the objective until ownership, travels over 400 m and has
under one second of continuous grounding. The recovering ship never enters,
so it cannot secretly complete the capture on the chosen ship's behalf.

In both developer-speed cases, handoff occurs within the asserted 45–75 second
window. The replacement travels over 1,000 m and completes ownership within the
220-second fixture; the slow hull stays outside and does not reclaim the duty
before the replacement enters. Normal capture duration remains checked.

The 23 coordinator-specific tests combine real-map route cases with controlled
route-cost matrices for otherwise difficult assignment corner cases. Synthetic
matrices verify station compatibility, legitimate route-length jumps and
stationary cost oscillation; they do not certify terrain geometry. A 64-observer
cadence test makes 128 route API calls initially, none in the next 239 frames at
60 Hz, and another 128 at four seconds. This bounds planning calls, not measured
Surface/mobile frame time.


## Verification

All sixteen final surface battles passed the unchanged runtime checks.
They cover offsets 211, 503, 877 and 1213, 5v5/7v7 and both spawn sides. Every
ship fired, each side dealt damage, and the largest continuous grounding was
0.05 seconds. All ended at 1,200 seconds; no pacing or weapon constant changed.

| Seed | Size | Spawn | Winner old → new | New first ownership player / enemy in seconds |
| --- | --- | --- | --- | --- |
| 464340 | 5v5 | default | player → enemy | 846.65 / 197.58 |
| 464852 | 7v7 | default | player → enemy | 330.73 / 796.52 |
| 464340 | 5v5 | mirrored | player → enemy | 272.12 / 569.88 |
| 464852 | 7v7 | mirrored | enemy → player | 201.58 / 516.40 |
| 464632 | 5v5 | default | enemy → player | 432.65 / 318.22 |
| 465144 | 7v7 | default | enemy → enemy | 455.63 / 199.42 |
| 464632 | 5v5 | mirrored | player → player | 196.12 / 840.00 |
| 465144 | 7v7 | mirrored | player → enemy | 206.65 / 462.47 |
| 465006 | 5v5 | default | enemy → enemy | 342.27 / 215.25 |
| 465518 | 7v7 | default | enemy → player | 357.72 / 203.13 |
| 465006 | 5v5 | mirrored | player → player | 198.27 / 1010.08 |
| 465518 | 7v7 | mirrored | player → player | 206.22 / 478.07 |
| 465342 | 5v5 | default | player → enemy | 313.63 / 444.03 |
| 465854 | 7v7 | default | enemy → enemy | 315.87 / 567.50 |
| 465342 | 5v5 | mirrored | player → enemy | 255.43 / 464.20 |
| 465854 | 7v7 | mirrored | enemy → player | 270.55 / 511.12 |

Northern fleets won eleven of sixteen both before and after the change; the
eight fresh cases retained six northern wins. Individual outcomes changed in
both directions. These results validate runtime behavior, not geographical
fairness, human difficulty or an improved population win rate. Weather and
aviation remain outside this surface-only matrix.

Two extra team-label reversals at offset 877/default, 5v5 and 7v7, each ran
72,000 fixed steps. Their normalized unrounded final-state hashes match the
corresponding ordinary-label run exactly. Identity, update order, poses,
equipment and seeds were preserved.

Final verification passed 1,659 regular tests plus eight separate balance tests,
with seven opt-in skips in the regular invocation. The original prototype smoke
suite passed all six cases. Production type-check/build and eleven actual-main
browser checks passed; the temporary loopback service closed. The existing Vite
large-chunk warning remains, so this is not a bundle-size optimization.

The 23 new coordinator cases fail 19/pass four against the exact 8cf752f source,
then all pass with the change. The four physical session tests all fail against
the old coordinator and pass now. Original tests and full-battle thresholds
were not loosened. Independent review found no remaining blocker after the
route-growth and compatible-replacement regressions were added.

Reproduce on the server from the project root:

```sh
export PATH="$HOME/battleship/.tools/node/bin:$PATH"
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
npm run build
node scripts/qa/multi-contact-regression.mjs
PROTOTYPE_BATTLE_SMOKE=1 npx vitest run tests/prototypeBattleSmoke.test.ts --maxWorkers=1
for offset in 211 503 877 1213; do
  for side in default mirrored; do
    FLEET_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=$offset PROTOTYPE_SPAWN_SIDE=$side \
      npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
  done
done
FLEET_CALIBRATION=1 FLEET_CALIBRATION_LABEL_SWAP=1 \
  PROTOTYPE_SEED_OFFSET=877 PROTOTYPE_SPAWN_SIDE=default \
  npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
```

Evidence is stored under .qa/objective-progress-20261014. The first eight
comparison baselines reuse the accepted 8cf752f results in
.qa/geographic-20261014; the other eight were freshly run before this change.
Full logs remain server-only, not tracked repository content. Test sources
and this condensed acceptance record preserve the reproduction steps.

Next: broaden weather/aviation calibration and continue investigating geographic
side differences. Real Surface/mobile frame rates and physical two-PC LAN
acceptance remain separate outstanding work.


All source edits, tests, generated evidence and build output remain on GPU-821560.
Package version stays 0.7.9. No art/assets, permanent preview, Windows delivery,
local download, release tag or main merge is part of this change.
