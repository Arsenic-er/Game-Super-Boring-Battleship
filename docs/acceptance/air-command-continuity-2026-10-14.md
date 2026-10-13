# Aviation command continuity and LAN visibility acceptance

The 2026-10-14 continuation keeps surviving aircraft active after controller
loss, connects authoritative aircraft contacts to LAN presentation and targeting,
and prevents ship anti-aircraft fire from passing through terrain. Ship damage,
weapon range, weather art, scoring and the approved clear-sky appearance are
unchanged.

## Command succession

A squadron loses its command owner only when that ship is missing, dead or on
the wrong team. A live same-team owner retains command even during human
takeover. Surviving squadrons sharing an old owner transfer together to the
eligible same-team AI ship nearest their horizontal center. Stable squadron
ordering and ID tie-breaks make the result independent of roster order and
team labels. Test targets and human-controlled ships cannot become successors;
without a qualified successor the existing owner ID remains until one is available.

The authoritative session supplies the eligible AI set. The raw simulation
entry point retains its existing uncommanded-AI fallback. Transfer precedes
aircraft sensing, movement and order validation, changes only controllerId,
and never resets orders, phases, position, ammunition, health, fuel or recovery
sources. Ready squadrons can dispatch in that same step. Active missions finish
under their existing orders; a guard mission is not silently replaced by a new
one. Terminal sessions do not transfer ownership.

Calibration reports retain initial and current controllers plus timestamped
ownership history. Aircraft hull damage is assigned to the command owner at
impact, including ordnance launched before transfer; this is an explicit
calibration accounting rule, not original-launcher battle credit.

## LAN aircraft observations

Enemy aircraft require a valid recipient-team optical contact. Seeing their
controller or being within the former 1,200 m shortcut no longer reveals them.
Fresh contacts carry permitted pose data and stable aircraft identity; the
controller ID is sent only when that controller is separately visible. After
contact loss, at most five seconds of original observed position, heading,
role and estimated count remain. Hidden live changes and flight telemetry are
not substituted for stale observations. Friendly aircraft retain their actual
positions and ownership.

Snapshots include a copied contact with its original observedAt. The client
validates and reconstructs it under snapshot.self.team, allowing the existing
aircraft presentation and targeting path to consume it. Enemy records without
a stable ID or valid contact fail closed. Hidden-controller placeholders use
stable aircraft IDs, so array reordering does not break interpolation. Enemy
interpolation stays between observed fixes; it does not extrapolate hidden
motion or renew observation timestamps.

Enemy command acknowledgements stay private. An unseen aircraft cannot disclose
its launch position through a visible controller or a friendly target. Impacts
against known friendlies can still arrive anonymously. The LAN content
fingerprint includes aviationContinuityRulesRevision so old and new builds do
not silently join with incompatible aircraft semantics; package version stays
0.7.9.

## Terrain and anti-aircraft fire

Each in-range battery tests terrain line of sight from ship deck height to
actual aircraft altitude before contributing continuous damage or flak.
Completely blocked sources contribute neither damage nor a random draw;
partially visible batteries retain the existing aggregate flak calculation.
Open-water and high-altitude positive controls preserve prior damage and RNG
behavior. Weather affects optical contacts, not the physical AA range.

## Regression evidence

| Coverage | Cases | Result |
| --- | ---: | --- |
| Pure command succession and invariance | 23 | Pass |
| Session integration and two physical bomber sorties after transfer | 9 | Pass |
| Terrain AA including real concave island and multiple ridges | 19 | Pass |
| Authoritative LAN visibility and event privacy | 32 | Pass |
| Producer to client to presentation and interception command | 15 | Pass |

Exact source from 86ad69a was loaded with isolated Vitest overrides, without
replacing working files. Old simulation fails 7 of 9 continuity cases, old
simulation fails 6 of 19 AA cases, old replication fails 26 of 32 visibility
cases, and old client fails all 15 client-chain cases. Passing old controls
remain part of the suite. Legacy fixture records were updated to include
authorized observations, rather than restoring the removed visibility shortcuts.

The final run passes 1,832 regular tests, eight balance tests, six prototype
smokes, production build, and eleven actual-main browser checks. Thirteen
opt-in cases remain skipped in the regular command. The existing large-chunk
build warning remains; the temporary browser server closes after inspection.
The client-chain tests exercise real production snapshots, presentation
snapshots, map selection functions and server command acceptance; they are not
a two-PC LAN or opposite-team DOM-map acceptance.

## Complete battles

Eighteen complete sessions cover 5v5 and 7v7, clear/rain-squall/sea-fog,
two spawn orientations, and six label-only controls. Seeds are 0x71501 + 211
and 0x71701 + 211. Twelve geographic cases have 57 individual squadron
ownership changes, with no manual respawns or resource resets.

| Fleet and weather | Default handoffs | Mirrored handoffs | Label-only final state |
| --- | ---: | ---: | --- |
| 5v5 clear | 4 | 4 | Exact match |
| 5v5 rain-squall | 6 | 5 | Exact match |
| 5v5 sea-fog | 6 | 5 | Exact match |
| 7v7 clear | 4 | 4 | Exact match |
| 7v7 rain-squall | 4 | 6 | Exact match |
| 7v7 sea-fog | 3 | 6 | Exact match |

Each label control matches the entire unrounded normalized final-state hash
after 72,000 steps. Both teams launch aircraft and release weapons in every
case. Maximum continuous grounding is 0.05 seconds. All cases end at the
twenty-minute time limit, so pacing and geographic fairness remain open rather
than accepted as balanced.

## Scope and reproducibility

Production support currently recovers at map-edge airfields. The reserved
carrier recovery source is preserved, not reassigned to a successor's deck;
invalid-carrier landing/refueling safeguards remain work for the carrier
module. Live weather changes can still wait one surface sensor sample.
Actual Surface/mobile FPS and physical two-PC LAN testing remain outstanding.

Evidence stays on the server in .qa/air-continuity-20261014:
full-default.log, full-mirrored.log, full-label-swap.log, accepted-regular.log,
balance.log, prototype.log, accepted-build.log and accepted-browser.log.
Isolated baseline logs are baseline-continuity.log, replication-baseline.log,
../air-aa-baseline.log and ../air-client-visibility-baseline.log.

All changes and generated checks stayed on the server. No assets changed,
no local download or Windows delivery occurred, and no main merge, tag or
version bump was made. Material-B remains isolated.
