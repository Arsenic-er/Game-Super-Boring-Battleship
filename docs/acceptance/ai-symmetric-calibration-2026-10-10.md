# Symmetric fleet calibration and surface sensor timing

An unused enemy aviation path was refreshing ship sensors during simulation
movement, even when no aircraft existed. That made a ship's observation timing
depend on its team label. The fix removes that unnecessary sampling without
changing detection ranges, gun dispersion, damage, equipment or AI difficulty
constants.

The new test-only fleet benchmark gives both sides equivalent ships and runs
every controller through the production local/host session. It complements,
rather than replaces, the existing human-input-proxy smoke test.

## Controlled fleet setup

The benchmark starts from the real saved-build fixture and clones its allied
roster into two independent fleets. Each opposing pair has the same complete
non-placement ship state: hull, modules, compartments, ammunition, consumables,
installed components including empty slots, performance multipliers, and
individual main/secondary mount state.

Fleet B is a rigid half-turn of fleet A around the existing spawn midpoint,
including previous positions, aim points and every weapon heading. Both fleets
start stationary, at least five kilometres apart, with safe hull footprints.
The atoll terrain is unchanged and is not assumed rotationally symmetric.

All ships use neutral persistent IDs, are AI-controlled and count for victory.
No developer bonuses, injected contacts, free resources or external proxy
commands are used. Every tick calls `LocalBattleSession.step` with an empty
human-command map, so both fleets receive radio, target and objective
coordination through the same path.

Two separate transformations answer different questions:

- A spawn-side swap rotates both fleets while preserving identity, equipment,
  random streams and roster order. It probes this terrain's side sensitivity.
- A team-label swap preserves the same world, IDs, RNG seed and roster order.
  Only team semantics change. Corresponding exact final states should match
  after normalizing team labels, scores, signed capture progress and the winner.

Per-ID controller and sensor randomness remains intact; opposing paired ships
are not forced to make identical decisions. The common A-then-B iteration order
is recorded, not randomized. Initial equipment hashes and readable manifests
are captured before the first simulation step. Final state hashes use the
unrounded complete state, with canonical object-key order.

## Reproduced sensor defect

In the old `automatedAirMissionsFor`, the enemy-only branch called `observe`
before checking whether the ship had any ready, unassigned squadrons.
`observe` updates a cached optical sample. The extra call occurs after
simulation time advances but before movement is complete, while the common
session sensor batch runs before stepping.

With identical IDs, world poses and RNG, changing only team labels first
changed sensor-cache metadata at about 5.0167 seconds. Actual aiming points
then diverged at 70.0333 seconds in 5v5 and 72.5333 seconds in 7v7. Both
experiments had zero aircraft. This demonstrates a label-dependent side
effect, not a general numerical estimate of enemy advantage.

The function now filters usable squadrons first. Empty or unavailable fleets
do not request surface observations. Fighter guard orders also need no surface
target; genuinely ready strike aircraft still obtain their own sensed targets
and retain their automatic orders. Player aviation command ownership is
unchanged.

Against exact baseline `122d8afa6e1863d535103f2a8f595eab5feb9dfc`, six of
eight focused tests fail and the two existing-strike-behavior controls pass.
After the fix all eight pass. Both 5v5 and 7v7 also produce exactly equivalent
unrounded states after eighty seconds when only team labels are exchanged,
including sensor caches, RNG, projectiles and objective state.

## Full battle results

The final matrix contains twelve primary surface battles and two additional
team-label controls. It covers both spawn sides, two seeds for each of 5v5 and
7v7 with the Fletcher-led roster, plus Cleveland-starter and North Carolina
magazine-refit 5v5 rosters. These are mixed-class fleets, not fleets composed
entirely of the named flagship.

| Saved flagship build | Fleet | Seed | Spawn side | Winner | End | Duration |
| --- | --- | --- | --- | --- | --- | --- |
| Fletcher | 5v5 | 464129 | Default | Enemy | Time | 1200 s |
| Fletcher | 5v5 | 464129 | Mirrored | Player | Time | 1200 s |
| Fletcher | 7v7 | 464641 | Default | Player | Time | 1200 s |
| Fletcher | 7v7 | 464641 | Mirrored | Enemy | Time | 1200 s |
| Fletcher | 5v5 | 464130 | Default | Enemy | Time | 1200 s |
| Fletcher | 5v5 | 464130 | Mirrored | Enemy | Time | 1200 s |
| Fletcher | 7v7 | 464642 | Default | Enemy | Time | 1200 s |
| Fletcher | 7v7 | 464642 | Mirrored | Enemy | Time | 1200 s |
| Cleveland starter | 5v5 | 464129 | Default | Enemy | Destruction | 1199.32 s |
| Cleveland starter | 5v5 | 464129 | Mirrored | Enemy | Time | 1200 s |
| North Carolina refit | 5v5 | 464130 | Default | Player | Time | 1200 s |
| North Carolina refit | 5v5 | 464130 | Mirrored | Enemy | Time | 1200 s |

Every ship fired, both teams dealt damage, every ship received session objective
duties, and the longest individual grounding was 0.05 seconds. All fourteen
runs passed the same operational checks. No threshold was loosened.

For the seed-464129 5v5 and seed-464641 7v7 default cases, the additional
label-reversed runs each completed all 72,000 steps. Their entire final state
hashes match the corresponding normal run after exact team-label normalization:

- 5v5: `ebc25038398ba40c998e681243b401a8f6b4b2af2726c15658d692dd74e6870e`
- 7v7: `1e5c95aa838ba7c5e856a6fb585a12c02ab029660062ec62a4de126168da10fe`

This is stronger than matching rounded telemetry or the winner alone, but it
does not compare every intermediate state of the full twenty-minute runs.
The focused eighty-second regressions separately check intermediate real state
and the complete final state.

Enemy-labelled fleet B won nine of the twelve primary cases; the fleet starting
on the original southern side won seven. Thus neither a 50% win rate nor a
dominant terrain side is established. The controlled matrix should not be
numerically compared with the previous seven-of-eight human-proxy result:
its rosters, formations, IDs and controller eligibility differ. The next
fairness experiment should cross over fleet identities and update order across
more seeds before adjusting difficulty or weapon statistics.

## Verification

- 1,522 regular tests passed, with seven opt-in skips in that invocation.
  This includes thirty-one new calibration fixture/hash checks and eight sensor
  regressions. The two new long calibration tests were then exercised explicitly.
- All eight balance tests passed, giving 1,530 regular/balance passes. The
  percentile test took 22.337 seconds under the unchanged thirty-second limit;
  the representative fifteen-to-twenty-minute case passed.
- Fourteen final full calibration runs passed, including the two exact
  label-reversal controls. Their initial per-pair equipment hashes were verified.
- The unchanged original prototype smoke passed all six tests: three launch/
  clock invariants, real 5v5 and 7v7 human-proxy battles, and a full no-input
  twenty-minute clock control. Its outcomes are not pooled with calibration.
- Production TypeScript/Vite build passed. The existing large-chunk warning
  remains; the main bundle is 2,027.23 kB before gzip.
- Eleven actual-main browser checks passed with zero page errors. The temporary
  loopback server closed after testing. These checks cover actual presentation/
  contact lifecycle, not native Windows, physical LAN or hardware frame rates.

Server evidence is under `.qa/fleet-symmetric-20261010/`:
`final-*.log` contains the fourteen final calibration reports;
`label-verification.log` records exact final-state comparisons;
`sensor-symmetry-before.log` and `sensor-symmetry-after.log` preserve the
baseline regression; `regular-final.log`, `balance-final.log`,
`human-proxy-final.log`, `build-final.log` and `browser-final.log` record
the remaining checks. Generated logs and artifacts are not committed.

## Reproduction

```sh
export PATH="$HOME/battleship/.tools/node/bin:$PATH"
npx vitest run tests/fleetCalibration.test.ts tests/aiSurfaceSensorSymmetry.test.ts --maxWorkers=1
FLEET_CALIBRATION=1 npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
FLEET_CALIBRATION=1 PROTOTYPE_SPAWN_SIDE=mirrored npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
FLEET_CALIBRATION=1 FLEET_CALIBRATION_LABEL_SWAP=1 npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
FLEET_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=1 npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
FLEET_CALIBRATION=1 PROTOTYPE_PLAYER_BUILD=cleveland-starter npx vitest run tests/fleetCalibrationBattle.test.ts -t 5v5 --maxWorkers=1
FLEET_CALIBRATION=1 PROTOTYPE_PLAYER_BUILD=north-carolina-magazine-refit PROTOTYPE_SEED_OFFSET=1 PROTOTYPE_SPAWN_SIDE=mirrored npx vitest run tests/fleetCalibrationBattle.test.ts -t 5v5 --maxWorkers=1
```

## Limits and next steps

The controlled benchmark is surface-only and checks that no aircraft appear.
Ready strike-aircraft sampling and automatic aviation ownership still have
different human-versus-AI paths and need separate coverage. Equal equipment
and control eligibility do not make the asymmetric map, IDs or iteration order
identical for opposing ships.

A small paired matrix is not a general win-rate estimate, human difficulty
calibration, or proof that all weather/aircraft combinations meet the desired
pace. The original human-proxy harness retains its documented coordination
asymmetry and should not be pooled with this controlled benchmark.

All changes, logs and build output remain on GPU-821560. No artwork, asset
repository changes, local downloads, persistent preview server, Windows package,
version bump or release tag are included. The package remains 0.7.9.
