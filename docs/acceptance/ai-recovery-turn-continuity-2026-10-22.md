# Recovery turn continuity — 2026-10-22

## Change

Preserve evidence of an earlier safe recovery exit while the hull makes a
continuous physical turn toward it. Recording this history does not lock the
command. Only the existing low-speed, blocked-bow, large candidate reversal
can promote the earlier exit: the hull must have turned at least 20 degrees
toward it without passing it, and the remaining turn must be shorter than the
ordinary two-candidate choice.

The earlier exit must pass the existing padded forward corridor, a 1 km
corridor and map bounds. Commitments promoted from this history keep the 1 km
check at every actual replan; ordinary existing commitments keep their original
rules. Emergencies, reverse transitions, boundaries, completion and invalid
corridors clear the added state. History also rejects moving/clear-bow phases,
backward or discontinuous planning time, map changes, position/angle jumps and
physical countersteering. Planning still runs at its existing half-second
cadence. Propulsion, rudder, ammunition, sensors, scoring and the twenty-minute
limit are unchanged. Straight padded rays are not full-hull swept clearance.

## Controlled evidence

Fifteen new cases exercise real coastal reverse/reorientation, physical turn
progress, cached emergency pulses, time/map/position discontinuities, moving
ships, countersteering, oscillation, angle representation and the long-corridor
source marker. Both positive team cases fail against the exact old navigation
source. Existing test thresholds are unchanged.

The player-side bounded case releases at 286.33 s and then follows the scripted
route for 30.02 s / 160 m. It uses production navigation and physics, but the
test supplies desired headings and changes to its continuation heading after
release. This is not a complete RuleBasedAi or historical-battle escape. Its
zero centre-grounding observation covers the post-promotion verification
segment, not a whole-hull collision certificate.

Boundary fixtures use public relocation, not private recovery-state injection.
One atoll fixture at (-1500, 200), heading .903718, has a clear 261.8 m corridor
and an in-bounds 1 km endpoint, but meets central-shoal-nw about 582 m ahead.
The history-derived commitment is dropped. A separate fixture verifies that
a later ordinary commitment does not inherit the stronger history-only rule.
Some lifecycle resets are code-reviewed rather than independently exercised
for every new-state combination.

## Exact historical replay

The final passive mirrored-5v5 rain replay matches its uninstrumented candidate
terminal hash, 1a13f76a6bce9bfa3dbbca66d12da5269ed98dd679bee9b58d70617124f3efd2.
All 44 loaded source hashes match the final tree. The trace's older expected-
baseline field deliberately differs; it is not a failed observer-invariance
check.

At 1034.12 s, Edinburgh keeps the earlier .6916435-radian exit rather than
reversing its useful right turn. In the last 300 seconds it turns right a net
84.26 degrees, rather than ending 2.70 degrees left of its starting heading
after substantial back-and-forth turning. However, it still travels zero
metres before the 1,200-second ending. Proportional helm reduces as it
approaches the selected heading while the actual forward corridor remains
blocked. This corrects lost turn progress, not the complete stoppage.

The independent sampled OBB-corner/edge check changes from 300 seconds of
detected overlap to 158.58 seconds. After 1058.58 s the checked corners/edges
are clear until the ending; the centre remains deep water throughout and
position does not change. This removes the detected overlap in that replay,
but is not an exact continuous full-hull collision validation.

## Fleet results

Twelve final 5v5/7v7 fleet-support sessions cover both spawn sides and
clear/rain/fog at seed offset 211 against the archived 126fbdc baseline.
Ten terminal states are identical. Default 7v7 clear and mirrored 5v5 rain
change; all existing basic battle gates pass. Both 44-module source manifests
match the final tree.

All 144 ship appearances still fire main guns. Shell count changes from
20,052 to 20,288, which is not a quality metric by itself. The same six late
silent survivors and the same three rain late-stationary survivors remain;
there are no added or removed identities in either set. Nine matches end by
time, two by destruction and one by score, retaining their previous durations.
Maximum reported continuous grounding is .05 s, subject to the geometry gap.

Default-clear 7v7 Richelieu a5 travels 2,182.29 m rather than 1,767.84 m after
900 s, and its navigation phase stays cruising instead of including 178.97 s
of reversing. Earlier recovery phases and other ships' damage/routes also
change. This is a coupled whole-battle outcome, not proof of faster recovery
everywhere. All three original rain stoppages remain open.

## Full-body collision audit and next work

The current terrain resolver sweeps the centre with beam*.42 padding, ignoring
length and heading. Ship/ship collision instead uses an OBB with half-length
.48L and half-width .55B. Terrain rollback restores position but not the heading
already changed by movement; ship/ship separation later runs after terrain
resolution without another terrain constraint.

The archived Edinburgh state has an 80 m deep centre while its bow corners
enter a 6 m shoal below its 6.5 m draft. A complete fix must share hull geometry,
check edge intersection and containment as well as corners, constrain
translation and rotation together, allow only safe outward recovery from an
existing overlap, and recheck ship/ship displacement. Use bounded spatial
filtering to avoid expensive narrow checks in open water. No such physics
change is included in this navigation patch.

## Verification and delivery

- 2,079 regular tests pass; eleven opt-in cases remain skipped. Two offline
  balance-report entrypoints are excluded.
- Six explicit prototype checks, production build and eleven actual-main
  browser checks pass; no browser errors and temporary port 5286 is closed.
  The existing large-bundle warning remains.
- Raw evidence stays ignored under .qa/coastal-progress-20261022/ and
  .qa/coastal-recovery-20261022/. The preceding-day baselines are preserved.
- Development branch only. Main remains at 8ef5b84 from the owner's preceding
  merge request. No asset, version/tag or local delivery changes. Native
  Windows, physical LAN and Surface/mobile performance are not validated here.
