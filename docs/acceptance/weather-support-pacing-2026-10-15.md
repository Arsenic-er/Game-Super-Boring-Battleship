# Weather-aware fleet support and pacing

The 2026-10-15 continuation fixes support ships parking outside useful optical
range, especially in rain and fog. It does not finish general battle pacing or
geographic balance. Weapon damage, dispersion, firing ranges, capture rules,
the 2,000-point victory target and the twenty-minute limit are unchanged.

## Support behavior

Observations expose the normalized public weather ID. Legacy observations
without it retain clear-weather behavior. Support spacing scales with the
existing visibility multiplier and, in reduced visibility, reserves the
220 m arrival band. For the tested battleship range, requested station radii
are 2,372.5 m in clear weather, 1,250.95 m in rain and 850 m in fog. The existing
terrain-aware station planner still enforces hull clearance outside the cap.

A healthy support ship can search a legitimate radio report or its own recent
memory rather than being unconditionally sent back to a blind station.
Search is bounded around the objective; the direct approach cannot enter or
cross the capture disk. A safely owned, uncontested, leading objective is not
abandoned for a remote report. Retreat, torpedo avoidance, friendly collision
avoidance and terrain recovery retain priority.

Radio guides navigation only. It does not supply optical acquisition samples,
a torpedo track or fire authorization. Local acquiring/tracking contacts retain
priority. Radio expires at age >= 15 seconds, matching the network contract;
own memory expires after 24 seconds. Future, friendly and malformed reports
fail closed. Team labels and hidden enemy coordinates do not choose the route.

Public weather is also part of the optical cache key. Changing weather within
the same 2.5-second sample immediately refreshes contacts without advancing
simulation time or RNG. Existing hydro behavior is preserved.

## Measurement and regression checks

Test-only, post-step telemetry records alive time, local contact, estimated
main-gun opportunity, fire intent, capture/support duties, emitted main-battery
shells and the latest/longest no-main-gun interval. It also records actual
900/1,050-second scoreboard and survival milestones. Earlier terminal battles
do not receive fabricated later samples.

An estimated opportunity uses the ship's own reported contact and ready,
healthy in-range gun state. It is not proof of line of sight, a usable firing
arc or a likely hit, and never looks up hidden target coordinates. Secondary,
torpedo and aircraft attacks cannot hide an idle main battery. The inactivity
fraction describes the final no-shot interval divided by alive time, not all
idle time across the battle. A two-session exact-state check proves that
collecting these metrics does not alter simulation.

New coverage comprises 30 support tests, 16 public-weather/cache tests and
11 telemetry tests. Support checks include real local sessions that acquire
their own tracks and emit main-gun shells in clear, rain and fog. An isolated
load of the exact 69f4d8b controller fails six of the 30 support tests and
passes the other 24; no working source was replaced for the comparison.

The final regular suite passes 1,889 tests, with 13 opt-in skips. Eight
separate balance tests, six original prototype checks, production build and
eleven actual-main browser checks pass. An initial concurrent balance run
hit three wall-clock timeouts; the unchanged suite passed in isolation after
the long matrices finished. No timeouts or assertions were relaxed. Browser
errors are empty and its temporary server is closed. The existing >500 kB
bundle warning remains.

## Complete paired battles

The primary comparison uses seeds 0x71501 + 211 and 0x71701 + 211,
5v5/7v7, clear/rain-squall/sea-fog and both spawn orientations. All twelve
old/new initial surface and air manifests match exactly. The baseline loads
the old controller with the new passive telemetry and public-weather cache;
its scores, all-weapon shot counts, damage, winners, durations and ending
reasons reproduce the previous checkpoint in all twelve cases.

| Side | Fleet | Weather | Old zero-main-gun ships | New | New ending | Seconds | Player / enemy score |
| --- | --- | --- | ---: | ---: | --- | ---: | --- |
| Default | 5v5 | Clear | 0 | 0 | Time | 1200 | 1869.50 / 151.00 |
| Default | 5v5 | Rain | 0 | 0 | Time | 1200 | 823.58 / 1116.37 |
| Default | 5v5 | Fog | 1 | 0 | Time | 1200 | 497.37 / 167.79 |
| Default | 7v7 | Clear | 0 | 0 | Time | 1200 | 321.04 / 1358.02 |
| Default | 7v7 | Rain | 1 | 0 | Time | 1200 | 218.10 / 1757.17 |
| Default | 7v7 | Fog | 3 | 0 | Time | 1200 | 695.60 / 873.75 |
| Mirrored | 5v5 | Clear | 0 | 0 | Time | 1200 | 1076.87 / 773.21 |
| Mirrored | 5v5 | Rain | 1 | 0 | Destroyed | 743.38 | 731.21 / 279.63 |
| Mirrored | 5v5 | Fog | 0 | 0 | Time | 1200 | 1239.88 / 553.36 |
| Mirrored | 7v7 | Clear | 0 | 0 | Time | 1200 | 394.10 / 1187.62 |
| Mirrored | 7v7 | Rain | 2 | 0 | Time | 1200 | 1884.99 / 0 |
| Mirrored | 7v7 | Fog | 3 | 0 | Time | 1200 | 232.21 / 1778.57 |

Across 144 ship appearances, zero main-gun fire falls from 11 to zero.
Survivors silent for their final 300 seconds fall from 25 to nine, and total
main-gun shells rise from 16,713 to 19,729. Nine old zero-fire ships had no
local contact; two had estimated opportunities, which are not guaranteed
legal shots. One Richelieu had eight non-main-gun firing events, explaining
why the older all-weapons counter reported only ten fully silent ships.

Battleship local-contact fractions, weighted by alive time, change from
61.28% to 57.01% in clear weather, 11.52% to 49.84% in rain and 6.77% to
45.01% in fog. The benefit is not a uniform increase in every weather metric.

Six additional team-label reversals match the exact unrounded normalized
final-state hashes of their default counterparts. Four independent seed-offset
zero fog cases pass on final source and match their preflight hashes exactly
after the radio TTL boundary correction. These 22 final-source sessions are
not 22 independent map samples. Maximum continuous grounding remains 0.05 s.

The twelve primary cases still have eleven time-limit endings and one
destruction ending at 743.38 seconds, below fifteen minutes. The desired
normal 15–20 minute pacing and >=70% non-timeout outcome are not accepted.
North wins seven of twelve before and after; this sample and the non-rotated
terrain do not establish geographic fairness. Recent-window contact and
opportunity telemetry is still needed to explain late silent periods; whole-
battle totals cannot identify their immediate cause. Next work should examine
late-game target access and objective pressure, not force an earlier finish.

## Evidence and scope

Server evidence is under .qa/fleet-pacing-20261015:
support-baseline.log, support-accepted.log, observation-weather.log,
baseline-211-default.log, baseline-211-mirrored.log, final-211-default.log,
final-211-mirrored.log, final-211-label.log, final-holdout-fog-default.log,
final-holdout-fog-mirrored.log, final-regular.log, final-balance.log,
final-prototype.log, final-build.log and final-browser.log.
The isolated baseline config is baseline.config.ts; set
FLEET_AIR_CALIBRATION=1, PROTOTYPE_SEED_OFFSET=211 and optionally
PROTOTYPE_SPAWN_SIDE=mirrored or FLEET_CALIBRATION_LABEL_SWAP=1.

Development, builds and evidence remain on GPU-821560. No assets, local
downloads, Windows delivery, main merge, tag, version bump or material-B
integration occurred. Package version remains 0.7.9. Server simulation and
browser checks do not replace physical two-PC LAN or Surface/mobile FPS tests.
