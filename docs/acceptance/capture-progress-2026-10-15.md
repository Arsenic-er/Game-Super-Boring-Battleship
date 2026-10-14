# Capture duty progress and late battle diagnostics

The 2026-10-15 continuation fixes an occupation-duty stall bug: revisiting the
same water positions no longer renews the progress clock indefinitely. This is
a bounded correctness fix, not acceptance of overall battle pacing. In twelve
paired complete battles, survivors silent for their final 300 seconds increase
from nine to thirteen. The timeout-heavy battle pattern remains.

## Progress rules

The coordinator retains the lowest verified remaining distance for each static
route. Renewing its clock requires both a further 20 m reduction on that route
and at least 20 m of physical displacement. Replanning alone does not count.
Returning from route B to route A restores A's previous record instead of
raising its baseline.

Route identity excludes own position, heading, height, time and waypoint cursor.
Cache refreshes, waypoint advancement, retained suffixes and the final direct
leg keep the same identity; genuinely bypassing unvisited waypoints creates a
different route. Navigation targets, route clearance and steering outputs are
unchanged.

History holds at most 128 routes without eviction. At capacity, an unfamiliar
route cannot manufacture fresh grace. Existing sixty-second stall and retry
rules remain; a ship is not stripped of capture duty when no healthy, reachable
replacement exists. New sessions reset the history.

Sixteen coordinator tests cover both teams, two- and three-position loops,
stationary ships, genuine forward travel, island detours, route revisits,
capacity and no-substitute recovery. Seven navigator tests cover identity
stability and genuine route changes. Loading the exact old coordinator from
b22d851 with the current navigator fails all four loop counterexamples by
assertion, not by a missing API. These fixtures move positions through real
route planning to isolate assignment logic; they are not full steering tests.
The existing longer-detour fixture now supplies explicit new-route identity
without changing its original assertions.

## Read only late battle measurements

Test-only telemetry separates the intervals (900, 1050] and (1050, terminal].
It records acquiring and tracking contact, estimated gun opportunity, disabled
main batteries, fire intent, capture/support duties, shells, tactical phases
and contact sources. Shells at 1050 seconds belong only to the earlier window.
Early endings have no invented later windows, and dead ships stop accruing time.

At most three detached diagnostic snapshots contain actual milestone or terminal
states, own aim, mount health, reload, firing arcs and own perception. Same-time
terminal updates refresh metadata without charging time or shells twice.
Neither collector calls observe, advances RNG or looks up hidden target state
to create opportunities. Estimated opportunities are not guarantees of line
of sight, a usable firing arc or a legal shot.

Twelve baseline sessions using the new telemetry reproduce the previous
checkpoint's complete canonical final-state hashes and initial surface/air
manifests exactly. Twenty-five telemetry tests and five snapshot tests cover
boundaries, terminal handling and read-only isolation.

## Complete battle comparison

Primary seeds are 0x71501 + 211 and 0x71701 + 211, with 5v5/7v7 fleets,
clear/rain-squall/sea-fog weather and both spawn orientations. All twelve
old/new initial surface and air manifests match. Six final states are unchanged;
six differ after the capture-duty correction.

| Spawn | Fleet | Weather | Old silent survivors | New silent survivors |
| --- | --- | --- | ---: | ---: |
| Default | 5v5 | Clear | 0 | 0 |
| Default | 5v5 | Rain | 0 | 2 |
| Default | 5v5 | Fog | 0 | 0 |
| Default | 7v7 | Clear | 0 | 0 |
| Default | 7v7 | Rain | 1 | 1 |
| Default | 7v7 | Fog | 2 | 2 |
| Mirrored | 5v5 | Clear | 0 | 0 |
| Mirrored | 5v5 | Rain | 0 | 0 |
| Mirrored | 5v5 | Fog | 1 | 1 |
| Mirrored | 7v7 | Clear | 0 | 0 |
| Mirrored | 7v7 | Rain | 2 | 2 |
| Mirrored | 7v7 | Fog | 3 | 5 |

All 144 ship appearances still fire their main battery at least once. Main-gun
shells change from 19,729 to 19,631. Eleven cases still time out at 1,200 seconds;
mirrored 5v5 rain still ends by destruction at 743.38 seconds. None ends by score.
The normal 15-20 minute and at-least-70-percent non-timeout goals remain unmet.

Six additional team-label reversals match their counterparts' exact normalized
canonical hashes. Four independent seed-offset-zero fog cases pass, all with
main-gun participation and all ending at 1,200 seconds. Across the twenty-two
new-controller complete cases, maximum continuous grounding is 0.05 seconds.
That metric does not detect stationary turning on safe water near a shoal.

## Remaining contact and recovery problems

In default 5v5 rain, the additional silent Edinburgh survives where its baseline
counterpart sank; at 900 seconds it has 452.54/2,100 hull and subsequently spends
88.5 seconds withdrawing. The healthy Richelieu instead has identical positions
at 900, 1,050 and 1,200 seconds, with only 2.48 seconds of late-window tracking.
Its baseline counterpart's three snapshots also share a position, but with
targets in view. These snapshots do not prove continuous immobility. At the
new terminal snapshot its guns can bear but remain reloading. A switch of shell
type may explain that reload; the snapshots do not prove the switch history.

In mirrored 7v7 fog, the additional silent Edinburgh and Richelieu have no local
contact during the last 300 seconds and no disabled main battery. Both show
poor recovery or reacquisition; the old Richelieu had already sunk. Silent
survivor counts therefore mix contact quality and changes in who survives.
These cases remain recorded as participation regressions, not dismissed.

The unchanged mirrored 5v5 fog case also exposes a separate conflict: a healthy
front-turret Richelieu tracks a target at about 1.82 km while the existing 2,450 m
retreat threshold requests an away-heading maneuver. The 900-second snapshot
has blocked firing arcs; tracking totals 10.02 seconds in the next 150 seconds,
and the final 150 seconds have no local contact. The complete causal sequence
has not been replayed. Late stopped ships near shallow water are consistent
with reverse-then-reorient
recovery; reproducing that internal mode at the sampled position is evidence
for investigation, not a replay of its entire historical state.

Next, isolate weather-dependent support engagement, safe recovery from shoals
and reacquisition/reloading in separate production-session regressions. Keep
damaged-ship withdrawal, torpedo avoidance and terrain safety. Radio reports
must remain navigation information, not permission to fire.

## Verification

The final serial regular suite passes 1,931 tests with thirteen opt-in skips.
Eight isolated balance tests, six original prototype checks, production build
and eleven actual-main browser checks pass. The twenty-two full new-controller
sessions comprise twelve geographic cases, six label controls and four fog
holdouts. Browser errors are empty and its temporary server is closed.

The first regular run passed 1,926 tests before five extra same-time-terminal
cases were added. A subsequent concurrent run passed 1,930 and hit one
five-second wall-clock timeout in the clear-weather label-symmetry test.
After complete matrices finished, the unchanged full regular suite passed
serially. No timeout or assertion was relaxed. The existing >500 kB bundle
warning remains; server tests do not establish physical-device FPS or two-PC LAN.

## Reproduction and scope

Evidence stays on the server under .qa/late-battle-20261015. Baseline and final
211 logs cover both orientations; labelswap and offset-zero fog logs provide
controls. The isolated old-coordinator config and capture-old-coordinator-red.log
preserve the behavioral counterexample. Raw logs, snapshots and temporary
configs are excluded from Git.

Development, checks and build outputs stay on GPU-821560. No art/assets,
damage, dispersion, scoring, match duration, player controls or material-B
integration changed. Package remains 0.7.9 on codex/v072-historical-models;
there is no main merge, release tag or local package delivery.
