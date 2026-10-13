# Terrain visibility and reverse recovery

The geographic follow-up identified two reproducible defects: a sightline could
skip a later high ridge of the same concave island, and a reversing cruiser
could remain against a shoal because its recovery command kept pushing astern.
Neither fix changes terrain placement, weapon statistics or scoring.

## Baseline and geographic context

Eight fresh baseline battles used offsets 211 and 503, 5v5/7v7, and both spawn
sides at 9f968e5. Seven passed; seed 465144, default placement, 7v7 failed the
unchanged under-30-second grounding check. Cleveland calibration-b-3 remained
grounded for 34.58 seconds. All eight finished at 1,200 seconds; the northern
fleet won five of eight. These paired deterministic cases do not establish
population win rates or explain the prior 23/32 northern wins by themselves.

The earlier 32-case reports give mean first ownership times of 234.64 seconds
for the north and 622.90 for the south, with first shots at 85.34/85.03 seconds.
Ownership is not first entry. A separate 300-second default 5v5 check at seed
464129 put both flagships inside the circle by 140 seconds; the north first
owned it at 224.50. Later reinforcement timing and damage diverged. A direct
claim that the southern flagship could not reach the point would be incorrect.

## Multiple land intervals

A ray through the real northeastern mountain can enter, leave and re-enter the
same island. The old interval function returned only the first land segment.
At 18 metres, one verified line crosses a first lobe with a maximum height of
15.859 m, then a second lobe reaching 43.757 m. Looking from the low lobe toward
the high lobe incorrectly returned clear; reversing the ray hit the high lobe.

The endpoints are (3035.1183128077537, -1037.8978638909757) and
(1710.5826835613698, 3293.8307989388704), with both positions navigable.
Real ship optical observations reproduce this leak with firing North Carolina
battleships. Exchanging team labels and observation order does not remove it.

Intersection traversal now visits every sampled land interval of an island,
while returning the first actual height intersection across all islands.
Navigation still consumes only the first coastline interval and exits early.
A fixed 1,500-query navigation comparison (500 rays at three drafts) exactly
matches the old source, including complete contact fields.

The 12 geometry regressions cover separate lobes, physical sloped rays,
first-contact ordering, kind filters, coastline endpoints, zero-length rays
and sampled tangents. Four fail against the exact 9f968e5 terrain source;
all 12 pass after the fix. In a bounded random check, all 4,079 rays with
navigable endpoints returned reciprocal 18 m visibility after the fix.

This remains a sampled geometric approximation, not an analytic intersection
solver. Coastline scans retain the 8–128 step bound and eight bisections per
crossing; each land interval retains 15 height samples. At most 65 sampled
intervals can occur per island/ray, and height processing stops on a first hit.
No rendered terrain, terrain coordinates or navigation clearance is changed.

The eight real-sensor regressions include both team assignments and read
orders, two distances/classes, repeated samples and an open-sea positive
control using the same range, weather and gun bloom. Against the exact old
terrain source, four fail and four pass; after the interval fix all eight pass.
Sensor contacts and visibility results are not mocked.

## Astern recovery

In the exact old-source seed-465144 replay, Cleveland calibration-b-3 first
touched the shoal at 1,133.15 seconds. Its astern movement left that contact but
entered another lobe at 1,165.433 seconds, after about 54 metres of travel.
The hull centre was in deep water; the real beam-scaled margin still overlapped
central-shoal-nw. Full engine/steering health and no friendly collision threat
rule out those alternative explanations for the repeated negative throttle.

Recovery now checks the actual collision margin (beam × 0.42) along a 100 m
exit corridor, searching at most 16 fixed headings. Initial hull-margin overlap
may be escaped only through the existing outward-contact predicate, in
one-metre steps bounded by ceil(4 × margin). The current stern direction must
also have enough braking clearance before negative throttle is requested.
Otherwise the ship receives zero throttle and turns physically toward an exit.
The existing 0.5-second cache and 12/45-second, 65-metre phase limits remain.

The zero-engine case has no finite powered stopping distance. It receives
zero throttle rather than approval to back up; a real one-step physics test
confirms that existing negative-speed inertia still moves the ship. The change
does not modify the simulation, teleport the hull or promise an instant stop.
For positive but severely damaged propulsion, the calculation now divides by
actual braking response without an upward 0.1 floor. A Yamato fixture at one
percent engine health and -2 kn requires a 33.69 m checked corridor including
existing margins, not the incorrect 18.20 m corridor. That additional test
fails against the intermediate floor-clamped implementation and passes now.
It verifies the real terrain-query length, not an actual low-power stopping
manoeuvre. Sampled terrain and half-second planning do not guarantee zero
collisions for every possible damaged or moving state.

Ten focused regressions pass; eight fail and two pass against the exact old
navigation source. Four short physical fixtures use two recorded poses and
both teams: each moves more than 65 m, ends outside grounding and has under
one second of continuous grounding during 180 seconds. These fixtures do not
replay the full battle or promise completion of every later reorientation phase.
The observed first-contact fixture uses fewer than 80 terrain queries per
planning check; the following 29 cached ticks issue none. This is not a global
80-query bound or an on-device performance measurement.

One pre-existing support-station test placed a ship at an enclosed mountain
centre and required negative throttle. All 16 radial 100 m endpoints are
grounded there. Its expectation now explicitly verifies real recovery
delegation and zero throttle instead of requiring movement into unsafe land.
The call-through recovery result, finite heading, no fake station and no
firing are checked; no full-battle grounding threshold was relaxed.

## Follow-up objective assignment

The coordinator ranks capture candidates by presence in the zone, straight-line
distance, hull-role bias and stable ID. It does not yet account for full route
length or persistent lack of progress. A frozen-state diagnostic selects the
nearer ship whose navigator returns recovery over a slightly farther ship with
a clear direct route. This proves a selection limitation, not a real ship
remaining stuck for the entire frozen diagnostic.

Another diagnostic found a 2,745.62 m planned route from a position only
1,136.10 m from the objective centre. Route-aware estimates and sustained-
progress handoff remain follow-up work; they are not changed here. Complete
propulsion/steering failure and human takeover already release duties promptly.

## Verification and full battles

The frozen final code passed all eight primary battles: 5v5/7v7, offsets
211 and 503, default and mirrored spawns, normal identities, A-first update
order, clear weather and no aircraft. Every ship fired, all matches reached
1,200 seconds and the largest continuous grounding was 0.05 seconds. The
original under-30-second acceptance limit was not changed.

| Seed | Size | Spawn | Winner | Longest grounding old → fixed | First ownership P / E, fixed (s) |
| --- | --- | --- | --- | --- | --- |
| 464340 | 5v5 | default | player | 0.05 → 0.05 s | 456.48 / 372.43 |
| 464852 | 7v7 | default | player | 0.05 → 0.05 s | 446.57 / 202.08 |
| 464340 | 5v5 | mirrored | player | 0 → 0 s | 200.17 / 642.07 |
| 464852 | 7v7 | mirrored | enemy | 0.05 → 0.05 s | 201.45 / 415.12 |
| 464632 | 5v5 | default | enemy | 0.05 → 0.05 s | 814.53 / 201.00 |
| 465144 | 7v7 | default | enemy | 34.58 → 0.05 s | 498.22 / 777.25 |
| 464632 | 5v5 | mirrored | player | 0.05 → 0.05 s | 215.62 / 596.68 |
| 465144 | 7v7 | mirrored | player | 0 → 0.05 s | 215.77 / 740.72 |

The north won five of eight, as before. Default placement puts player-labelled
fleet A south; mirrored placement puts it north. First ownership is not first
entry. Outcomes remain correlated deterministic comparisons, not an estimated
population win rate or proof of geographic fairness.

Two additional label-reversal controls at offset 211, default spawn, 5v5/7v7,
each ran 72,000 steps and matched the base case's normalized unrounded final-
state SHA-256 exactly. The final low-power braking correction left the eight
primary and two control hashes unchanged from the preceding candidate.

Final regular checks: 1,614 passed with seven existing opt-in skips; the
separate balance laboratory passed all eight. Production type-check/build
passed. Vite retains its large-chunk warning; this work does not claim bundle
size optimization. All eleven actual-main browser checks passed with zero
browser errors, and the temporary loopback server closed.

The original human-slot-proxy prototype smoke suite passed all six cases.
Those fixtures remain separate from the symmetric equal-equipment calibration.
Real Surface/mobile frame rates, physical two-PC LAN behavior, broad weather/
aircraft balance and human-player difficulty remain unverified here.

Reproduce from the repository root on the server:

```sh
export PATH="$HOME/battleship/.tools/node/bin:$PATH"
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
npm run build
node scripts/qa/multi-contact-regression.mjs
PROTOTYPE_BATTLE_SMOKE=1 npx vitest run tests/prototypeBattleSmoke.test.ts --maxWorkers=1
for offset in 211 503; do
  for side in default mirrored; do
    FLEET_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=$offset PROTOTYPE_SPAWN_SIDE=$side \
      npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
  done
done
FLEET_CALIBRATION=1 FLEET_CALIBRATION_LABEL_SWAP=1 \
  PROTOTYPE_SEED_OFFSET=211 PROTOTYPE_SPAWN_SIDE=default \
  npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
```

Server-only evidence is under .qa/geographic-20261014 (final accepted-* logs),
.qa/geographic-audit-20261014 (geometry comparisons),
.qa/grounding-20261014 (old exact full replay and physical recovery checks),
and .qa/objective-audit-20261014 (coordinator diagnostics). Generated logs are
not added to Git. The fixed-source tests and concise reproduction record are.


All development, build output and diagnostic evidence stay on GPU-821560.
The asset repository and isolated material-B preview are unchanged. No local
downloads, permanent preview service, Windows package, version bump or release
tag are included. Package version remains 0.7.9.
