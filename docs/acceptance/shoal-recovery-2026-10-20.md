# Battleship shoal recovery — 2026-10-20

## Accepted scope

This change reduces prolonged stationary turning during a battleship's first
recovery beside a shoal. It does not solve every later coastal navigation
problem. The owner accepts twenty-minute matches: the 1,200-second limit and
normal score settlement remain unchanged. There is no non-timeout quota.

A short initial reverse used to hand off after 65 m or 45 seconds even when
a long hull still lacked forward clearance. Battleships can now continue
reversing through the existing verified stern corridor. After 45 seconds,
candidate stern headings favor the navigation exit; actual rudder and engine
physics still perform the turn. Destroyer and cruiser thresholds are unchanged.

Safe-water handoff is allowed once there is sufficient retreat/forward
clearance, after 45 seconds with less than 10 m displacement from the initial
recovery position, or at 240 seconds of initial reverse. These conditions
still require the ship not to be grounded. The 240 seconds are not a guarantee
of complete recovery: a grounded ship retains the existing safety behavior,
and the subsequent reorientation has its own forward-clearance checks.
The 45-second condition is net displacement, not a rolling stall timer.

Existing engine-aware stopping distance, actual stern-direction clearance,
other-shoal and boundary checks remain. No teleport, direct heading/speed
write, rudder buff, weapon adjustment, damage change or scoring change is used.

## Same-session counterexample

Fresh production LocalBattleSession fixtures start an intact Richelieu at the
recorded safe-water pose (-2053.6284329947434, 658.7294229859721), in rain on the
atoll. Two headings and both team labels are tested. The opposing weaponless
sentinel keeps the match running. No recovery state, AI command or sensor
contact is injected. This reproduces the location and behavior, not the
original historical battle's complete controller state.

The exact old navigation source is loaded from commit 4518766 through a
test-only override. Every other source file and fixture is the same.

| Heading | First recovery starts | Old release | New release | Old longest stationary interval | New interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.7249218624 rad | 26.08 s | 417.58 s | 216.37 s | 339.20 s | 0.20 s |
| 0.3 rad | 41.07 s | Not released by 480 s | 275.50 s | 386.65 s | 0.20 s |

Both team labels yield the same measurements. The new recovery has actual
negative speed for 184.23 and 228.38 seconds. Neither old nor new first
recovery grounds the ship. For the next sixty seconds, the new controller
stays in normal navigation and travels 317.9 and 304.9 m respectively.

The old 45-second reverse already moved about 65 m. A reported net displacement
near 11 m included earlier forward travel; it did not mean the stern corridor
prevented reverse motion.

## Remaining coastal issue

The full 480-second observation is retained. New recovery begins again about
106.9 and 123.7 seconds after the first release, at positions 286.3 and 310.9 m
from the original recovery starts. A subsequent 0.05-second grounding contact
occurs near another coastal segment. Thus the accepted regression requires
a safe first recovery and sixty seconds of useful normal navigation, not
zero contacts throughout the map. Normal navigation near later shoals is
still an open task.

## Low-visibility audit, not a shipped fix

A separate read-only investigation did not establish a reload-reset bug.
Contact loss/reacquisition left an active ammunition change counting down.
The initial rear-facing fixture showed poor re-engagement, but it started
with its guns already outside their firing arc and cannot prove that retreat
caused the loss. With a forward-facing start, both the current policy and an
isolated weather-distance experiment fired 24 shells in 180 seconds.
Weather-only distance scaling is not accepted as a solution. No firing,
optical-contact or reload behavior was changed.

## Complete battle comparison

Twelve matched 5v5/7v7 sessions use clear, rain and fog weather at seed offset
211 in both spawn orientations. All old/new surface and air starting manifests
match. All 144 ship appearances still fire a main gun at least once. The maximum
continuous grounding interval remains 0.05 seconds.

| Spawn | Fleet | Weather | Old final-300-second silent survivors | New |
| --- | --- | --- | ---: | ---: |
| Default | 5v5 | Clear | 0 | 0 |
| Default | 5v5 | Rain | 2 | 0 |
| Default | 5v5 | Fog | 0 | 1 |
| Default | 7v7 | Clear | 0 | 0 |
| Default | 7v7 | Rain | 1 | 3 |
| Default | 7v7 | Fog | 2 | 4 |
| Mirrored | 5v5 | Clear | 0 | 3 |
| Mirrored | 5v5 | Rain | 0 | 0 |
| Mirrored | 5v5 | Fog | 1 | 0 |
| Mirrored | 7v7 | Clear | 0 | 0 |
| Mirrored | 7v7 | Rain | 2 | 0 |
| Mirrored | 7v7 | Fog | 5 | 5 |

Silent survivors increase from 13 to 16, and main-gun shells decrease from
19,631 to 17,716. This local recovery fix is not acceptance of overall fleet
participation or geographic balance. Ten sessions finish normally at 1,200
seconds; default 5v5 fog ends by destruction at 1,053.8 seconds and mirrored
5v5 rain at 861.55 seconds. Earlier endings are not a success criterion.

The changed silent set contains ten additions and seven removals. Four added
survivors had sunk in the corresponding old battle. Seven additions have no
local contact in the recorded post-900-second windows; the early-ended fog
case has only 153.8 seconds of such observation. Other additions include a
main battery disabled for 270.35 seconds and a damaged ship withdrawing for
299.27 seconds. One 7v7 rain ship records tracking and fire intent without
a shell; sampled reload values cannot establish the cause. These observations
do not dismiss the regressions, and the aggregate telemetry does not measure
reverse duration or prove that extended reverse has no tactical cost.

Of the six added silent ships that survived in both versions, four have no
local contact despite moving: 7/default/rain Richelieu b5 and Bismarck b6,
7/default/fog Richelieu a5, and 5/mirrored/clear Agano a2. Their three
900/1,050/1,200-second snapshots are not identical; the latter two show only
189 m and 37 m net displacement across that interval. This is not solely
survival bias and remains a navigation/reacquisition investigation.

The priority fire-intent fixture is 7/default/rain Richelieu a5. It survives
in both versions, changing from 24 late-window shells to zero. In the new
run, hull increases from 2,280 to 3,354 of 3,900, with usable engine, steering
and main guns. The last 150 seconds record 94.98 s tracking and 21.12 s fire
intent. Sampled gun bearings are valid, but reload is 8.14/0/13.51 s and the
sampled contacts are memory/unaware/tracking. These separate snapshots do
not prove all firing prerequisites coincided. Next capture same-frame
ammunition state and shot rejection reasons without granting hidden targets.

## Verification and delivery

Final serial verification passes 1,942 regular tests with thirteen opt-in
skips, eight isolated balance tests, six prototype checks, twenty-two complete
fleet sessions, the production build and eleven actual-main browser checks.
The 127 targeted checks are a subset of the regular suite, not extra coverage.
Six label-swapped complete states match exact normalized hashes. Four fog
holdouts all retain main-gun participation. Browser errors are empty and
the temporary preview is closed.

The first isolated balance run completed the duration fixture in 10.46 seconds
and hit its existing 10-second wall-clock timeout; the unchanged full eight-test
retry passes. No assertion or timeout was relaxed. An unused test variable
caught during the first build was removed before the successful final build.
The existing large-bundle warning remains; server checks do not establish
physical-device FPS or two-computer LAN behavior.

Detailed raw evidence remains only under .qa/shoal-recovery-20261020 on the
server. final-targeted.log and final-old-red.log retain the focused green/red
comparison; phase-old.log and phase-new.log retain the full 480-second
observation. final-211-* and final-0-fog-* cover the complete-session matrix;
comparison-summary.json records the paired totals. regular-final.log,
balance-final.log, balance-retry.log, prototype-final.log, build-final.log
and browser.log retain verification, including the initial timing failure.
Raw logs, exploratory red tests and temporary overrides are excluded from Git.

All development remains on GPU-821560. Assets are unchanged. There is no local
download, persistent preview service, main merge, tag or version bump.
Physical Surface/mobile performance and two-PC LAN validation remain outside
this server-only regression.
