# Withdrawal recovery interruptions — 2026-10-21

## Main checkpoint and scope

The owner requested a main merge before continuing. Main was fast-forwarded
from e5f6bd7 to 8ef5b84 and pushed: 34 commits, no branch deletion or history
rewrite. This records the existing development checkpoint, including its open
AI defects. It is not a stable release or general AI-readiness approval.

Subsequent work remains on codex/v072-historical-models. Only the withdrawal
interruption contract changes: entering damaged withdrawal or changing the
known threat identity clears recovery once. A threat moving from local optical
contact into bounded memory retains its identity; true expiry, reacquisition
or a different target invalidates once. Recovering above the damage threshold
resets the state so later re-injury is a new event. Continuous collision risk
and torpedo danger after the existing reaction delay still interrupt.

The controller retains damage thresholds, concealment/fire suppression,
withdrawal speed limits, sensor authority and target-selection rules. Navigation
geometry, cache cadence, propulsion, rudder, gun damage/accuracy, the 240-second
reverse cap and the twenty-minute match limit do not change. A same-target cover
point change is not a new event under this contract; corridor revalidation
remains, but tactical optimality for every moving threat is not established.

## Direct contract tests

Eight public-controller cases cover both teams, no-target withdrawal,
repair/re-injury, real optical acquisition/target switches, same-target memory,
expiry/reacquisition, continuous collision and delayed continuous torpedo
priority. All eight fail against the exact 8ef5b84 controller and pass after
the change. These fixtures advance physics with idle commands on open water;
they establish the event signal, not successful autonomous navigation.

Four navigation tests form a real commitment using public pose/time boundary
inputs, without assigning private recovery state. Three cache-time pulses
verify that a single true interrupt clears the retained exit before the next
false-input replan. A false-only control retains the
safe commitment. They are boundary fixtures with public relocation, not a
continuous natural recovery replay.

## Complete-session evidence

Twelve full actual-session cases cover 5v5 and 7v7, clear/rain/fog and both
spawn sides, using fleet-support aviation and seed offset 211. Each final
canonical state and recorded per-ship navigation metric matches the archived
8ef5b84 result exactly. All 144 ship appearances fire main guns (20,052 shells).
Nine matches end by time, two by destruction and one by score; duration is
1,001.87–1,200 seconds. Time endings remain normal. The maximum reported
continuous grounding is .05 seconds, which is not full-hull clearance proof.

Each process snapshots source before loading. Both 44-module manifests match
the final production tree. The metrics comparison excludes only the diagnostic
nextTrace scheduling field, because this round watches a3 rather than a5.
No gameplay metric is excluded. These unchanged outcomes establish no observed
regression in this set, not general equivalence or improved movement.

An additional passive default-5v5 rain trace reproduces the baseline and normal
candidate terminal hash exactly. In the final 300 seconds:

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Recovery interruption frames | 18,000 | 15 |
| Actual travel | 0 m | 0 m |
| Committed recovery-exit frames | 0 | 0 |
| Commanded rudder sign changes | 15 | 15 |
| Actual rudder sign changes | 7 | 7 |
| Main-gun shells | 0 | 0 |

All fifteen remaining interruptions are real target-identity changes. Every one
of the 18,000 physics/control frames is identical. The ship remains damaged and
withdraws legitimately; its operational propulsion does not excuse the failed
escape. This fixes repeated state invalidation, **not** the diagnosed stoppage.
All three prior rain late-stop cases remain open.

## Separate navigation findings

The healthy mirrored-5v5 rain Edinburgh enters reorientation at 893.58 s. It
turns right 52.17 degrees over 140.53 seconds before committing to a left exit.
No emergency interruption occurs. At the switch, an earlier verified exit still
has clear 261.8 m and 1 km corridors and needs another 56.56 degrees right.
Comparing only the recent candidates instead chooses a 102.87-degree left turn.
Retaining useful prior progress needs a narrowly guarded navigation change,
not faster rudder physics or arbitrary nearest-heading shortcuts.

Full-body checks also find bow OBB corners in a 6 m shoal while the Edinburgh's
6.5 m draft centre remains in deep water. The current centre-line resolver
misses that overlap. This is an open collision/clearance validation issue;
neither a centre-point deep-water label nor .05 s reported grounding proves
whole-hull safety. No collision margins are relaxed here.

## Verification and boundaries

- 2,064 regular tests pass; eleven opt-in cases are skipped, not passed.
  The two offline balance-report entrypoints remain excluded.
- Six explicit prototype checks, production build and eleven actual-main
  browser checks pass. Browser errors: zero; temporary port 5286 is closed.
  The existing large-bundle warning remains.
- Source, tests and condensed records only. Raw traces and reports stay ignored
  under .qa/coastal-recovery-20261021/; baseline evidence is preserved under
  .qa/coastal-maneuver-20261021/.
- No asset, version/tag or local-delivery changes. Native Windows, physical LAN
  and mobile/Surface performance are not tested by this work.

Next priority is useful coastal turn continuity with full-hull swept clearance.
Keep naval roles, observed-contact firing and actual mechanical limits; do not
mask these route defects with weapon, speed, rudder or visibility buffs.
