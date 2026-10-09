# Fleet steering handoff and spawn calibration

The 2026-10-10 continuation fixes capture duties held by ships with destroyed
steering and adds repeatable tests from both physical spawn sides. Weapon
statistics, scoring rules, terrain, artwork and normal spawn placement are
unchanged.

## Destroyed steering releases the capture duty

An otherwise healthy AI outside the capture disk now needs both engine and
steering health above zero to receive a capture duty. Losing either module
invalidates the reservation on the next session step, without waiting for the
one-second planning cadence or twelve-second hold. A disabled ship already
inside remains eligible until it drifts outside.

A restored module allows the ship back into the candidate pool, without taking
over another valid held duty. Normal damage-control repair skips zero-health
modules, so it cannot be relied on to clear this failure automatically. This
guard handles fully destroyed modules, not minimum maneuverability or optimal
arrival time for nearly disabled ships.

## Spawn calibration method

`PROTOTYPE_SPAWN_SIDE=mirrored` is an opt-in test setting, not a player-facing
map change. The test rotates every initial ship pose by 180 degrees around
the midpoint of the two flagship spawn anchors, at x=90 and z=175. Terrain and
the objective stay fixed. Team, IDs, equipment, random seed and fleet spacing
are preserved; position, previous position, aim point and absolute turret
headings rotate consistently.

The default factory remains deeply equal to the previous smoke factory.
Mirroring requires a fresh, unobserved battle, rejects invalid settings, and
reverses itself when applied twice. For both 5v5 and 7v7, all ships start
stationary, opposing ships remain at least 5 km apart, and a 5-by-3 footprint
sample for each hull is clear deep water.

The matrix is two fleet sizes, two seeds per size and two spawn sides: eight
cases, not eight independent seeds. It uses the default saved Fletcher build,
clear weather and the production local/host session, with an AI proxy replacing
only the human keyboard input. It does not establish equal team win rates or
accept all player builds, weather, aircraft battles or human play styles.

## Verification

Baseline: `1e19c179236e1e2b6aeb6e97765e53d78feaab33`.
All development and checks ran on GPU-821560 with Node 24.21.0.

- 28 coordinator checks cover eligibility, immediate invalidation, zone
  boundary/drift, repaired re-entry, retention and team symmetry. Four
  steering-specific checks fail against the baseline and pass after the fix.
- 20 navigation/session checks include two new real-simulation cases, one per
  team. A nearer ship first receives capture duty, its steering is destroyed,
  and the healthy ship takes over on the next 60 Hz step and completes capture
  within 180 simulated seconds. The disabled ship never turns or enters the
  zone, and its steering stays at zero. Both new cases fail on the old
  coordinator at the handoff assertion.
- Ten spawn-helper checks cover defaults, invalid settings, rotation,
  identity/equipment preservation, involution and hull clearance.
- All 1,366 regular and eight separately run balance tests passed: 1,374 total,
  with five existing opt-in skips. The slow batch took 21.005 seconds against
  the unchanged 30-second limit. The representative 15–20 minute check passed.
- TypeScript/Vite build passed; the existing approximately 2.017 MB main-chunk
  warning remains.
- Eleven actual-main browser checks passed with zero page errors, and the
  temporary loopback server closed.

## Full battle results

Every ship fired in all eight candidate cases, both sides caused damage, and
the longest individual grounding episode was 0.05 seconds. All cases finished
at the twenty-minute time limit. Each team's last damaging hit occurred within
the final 24 seconds in every case, so these runs were not simply idle at the
end.

| Fleet and seed | Spawn side | Winner | Contested seconds | Final points player / enemy |
| --- | --- | --- | ---: | ---: |
| 5v5 464129 | Default | Player | 95.55 | 1321.4 / 947.7 |
| 7v7 464641 | Default | Player | 114.05 | 1120.1 / 1091.8 |
| 5v5 464130 | Default | Enemy | 278.07 | 458.5 / 1502.2 |
| 7v7 464642 | Default | Player | 281.67 | 981.2 / 729.3 |
| 5v5 464129 | Mirrored | Enemy | 69.32 | 1065.7 / 1104.3 |
| 7v7 464641 | Mirrored | Player | 441.13 | 937.7 / 254.7 |
| 5v5 464130 | Mirrored | Player | 129.72 | 1079.2 / 596.8 |
| 7v7 464642 | Mirrored | Player | 324.85 | 1254.7 / 441.3 |

All reported simulation metrics, including per-ship optical/combat telemetry,
match the corresponding baseline cases exactly after excluding wall-clock time
and the newly added spawn labels. This establishes regression stability in
these cases, not equality of every unreported world state. The explicit
steering-failure session tests establish the behavior change.

The four default baseline reports are reused from the previous verified
checkpoint in `.qa/objective-navigation-20261008/candidate-final-offset{0,1}.log`.
Four mirrored baseline cases ran this turn; the second pair loaded the exact
old coordinator through an ignored Vite configuration without reverting the
worktree.

## Reproduction and next calibration

```sh
export PATH="$PWD/.tools/node/bin:$PATH"
npx vitest run tests/fleetObjectiveCoordinator.test.ts tests/fleetObjectiveNavigation.test.ts tests/fleetSmokeScenario.test.ts --maxWorkers=1
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
for side in default mirrored; do
  for offset in 0 1; do
    PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_SPAWN_SIDE="$side" PROTOTYPE_SEED_OFFSET="$offset" \
      npx vitest run tests/prototypeBattleSmoke.test.ts -t "AI fleets navigate" --maxWorkers=1
  done
done
npm run build
node scripts/qa/multi-contact-regression.mjs
```

Run full battles and timing checks serially. Evidence stays in
`.qa/fleet-calibration-20261010/`, including before/after focused logs,
baseline/candidate fleet reports, comparison output, regular/slow test logs,
build and browser logs. Browser screenshots and the structured report remain
in `.qa/multi-contact-20261008/`. Name-filtered exclusions are not extra
product skips.

Next work is broader hull/loadout and seed calibration, followed by measured
late-game scoring/capture adjustments if warranted. These eight capped battles
do not by themselves justify changing gun damage, hit probability or the time
limit.

This is an untagged 0.7.9 working checkpoint. No art, asset-repository, save
format, Windows package or local download changed. Material-B remains isolated.
Surface/mobile frame rates and two-physical-PC LAN acceptance remain separate.
