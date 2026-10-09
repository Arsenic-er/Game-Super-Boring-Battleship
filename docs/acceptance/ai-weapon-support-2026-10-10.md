# AI weapon intent and reachable support stations

The 2026-10-10 continuation fixes weapon-selection and support-navigation
correctness, and broadens full-battle tests to real saved cruiser and battleship
builds. Weapon statistics, optical firing authority, scoring rules, match limit,
normal spawns, artwork and player defaults are unchanged.

## Changes

### Keep the selected weapon and its aim solution together

A ready torpedo launcher now selects the torpedo slot while traversing, and
fires only after its actual heading matches the current torpedo solution and
allowed launch arc. It no longer aims the shared control point at a torpedo
intercept while asking the main gun to fire. When torpedoes cannot be prepared,
the main gun receives its own noisy solution.

Main-gun range checks previously bounded the pre-lead estimate, not the final
aim point. Target lead could put that point beyond the equipped gun's range,
causing a fire command that the simulation rejected. The controller now bounds
the complete solution and reserves one fixed-step hull-movement margin, because
movement occurs before firing. Existing range limits, dispersion, tracking noise
and delayed optical acquisition remain intact.

Twenty-one weapon-intent checks cover both teams, three hulls, two gun grades,
minimum/maximum range while moving, launcher preparation, actual projectile
emission and rejection boundaries. Against the exact old controller, nineteen
fail and two pass; all twenty-one pass after the fixes.

### Choose water that the supporting hull can reach

The old role-specific radial support point could fall inside an island. The
new controller-local planner checks hull draft, route clearance, map bounds,
the full arrival band and a runout beyond the waypoint. It tries at most
forty-eight ring candidates and retains a reachable alternative to avoid
frequent steering changes. It consumes only own pose, public objective geometry
and static terrain, not unseen enemy positions.

Planning has a hard two-second cadence. Cached route permission is withdrawn
when the ship moves beyond its verified corridor allowance; normal terrain
recovery takes over until the next planning deadline. Clear open-sea stations
avoid terrain sweeps. With no reachable candidate, holding is allowed only
near the requested support band; a distant safe-water spawn is not considered
a completed station.

This is bounded straight-line station selection, not global pathfinding.
Capture-duty navigation is unchanged. Dynamic ship avoidance and emergency
terrain recovery retain higher priority.

### Remove a stationary braking dead zone

An intermediate full Cleveland 5v5 run failed the existing minimum-movement
assertion: allied Yamato travelled only 92.79 m. The first hypothesis, failure
to find a route, was disproved. Its actual initial alternative station was
reachable and about 348 m away.

A real 180-second short scenario reproduced the problem: Yamato stopped
264.77 m from its station, outside the 220 m arrival band. The fixed 45 m
early-braking allowance still applied at zero speed, preventing any further
approach. Support braking now uses current physical stopping distance without
that permanent allowance. The capture branch keeps its existing behavior.

The regression uses the actual Cleveland fleet spawn, unchanged equipment and
other stationary ships as real obstacles. It requires entering the true arrival
band, moving over 100 m, avoiding sustained grounding and holding safely for
five seconds. It passes after the controller fix. The original full-battle
movement threshold was not lowered.

## Saved-build coverage

`PROTOTYPE_PLAYER_BUILD` is test-only:

- `default-fletcher`: the previous default factory remains deeply equal.
- `cleveland-starter`: select the hull, save it, select that save and validate
  readiness through production profile APIs.
- `north-carolina-magazine-refit`: use real research, purchase, equipment and
  save APIs to install `magazine-purple`, then select the updated saved build.

No test resources or developer equipment are injected. The magazine fixture
spends 120 research points, 3,800 credits and 20 parts from the default profile;
it starts combat with the actual selected equipment. Short tests verify nine
main-gun projectiles and a 28.704-second reload. This is a legal game loadout,
not a claim about a historically authentic North Carolina magazine refit.

Non-default reports include the actual initial hull, mounted weapons, installed
equipment and performance values. Default report fields remain unchanged.
These fixtures do not change the player's default ship or introduce new ships.

## Full-battle evidence

Baseline controller: `19a03cb4634041fb4046f13c4d941468f6d3af5a`.
All runs used the real local/host session, clear weather and fixed-step physics.
Only the human keyboard command was replaced with an ordinary AI controller.
The mirrored side rotates spawn poses, not terrain.

Eight final cases passed: every ship fired, both sides damaged opponents,
existing movement checks held, and no ship had a grounding episode longer than
0.05 seconds. Seven cases reached twenty minutes; one ended on score at
1,143.13 seconds. This is eight configurations, not eight independent seeds.

| Saved build / fleet | Side | Seed | Winner | End seconds | Contested seconds | Final points player / enemy |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| Fletcher / 5v5 | Default | 464129 | Enemy | 1200 | 186.30 | 106.5 / 1179.6 |
| Fletcher / 5v5 | Mirrored | 464129 | Enemy | 1200 | 198.62 | 426.0 / 502.8 |
| Fletcher / 7v7 | Default | 464641 | Player | 1200 | 278.58 | 1521.0 / 304.7 |
| Fletcher / 7v7 | Mirrored | 464641 | Player | 1200 | 351.68 | 787.8 / 613.8 |
| Cleveland / 5v5 | Default | 464129 | Enemy | 1200 | 390.33 | 419.3 / 857.3 |
| Cleveland / 5v5 | Mirrored | 464129 | Player | 1200 | 178.43 | 1536.3 / 605.6 |
| North Carolina refit / 5v5 | Default | 464129 | Player | 1200 | 518.55 | 1002.2 / 269.9 |
| North Carolina refit / 5v5 | Mirrored | 464129 | Player | 1143.13 | 183.67 | 2000.0 / 8.1 |

The four new-build baseline runs all reached 1,200 seconds. Their contested
times were 208.53 / 105.95 seconds for Cleveland and 172.02 / 176.33 seconds
for the North Carolina refit (default / mirrored). Default-Fletcher baseline
results are reused from the verified previous checkpoint. Damage, winners and
contesting do not uniformly improve, and these combined changes do not isolate
which fix caused each outcome. No general win-rate or pacing claim is made.

## Verification

- 74 focused checks passed: 21 weapon-intent, 23 planner, 11 real-session
  support checks and 19 saved-build/spawn checks.
- All 1,430 regular and eight separately run balance tests passed: 1,438 total,
  with five existing opt-in skips. The slow batch-percentile check took 19.759
  seconds against its unchanged 30-second limit; its separate representative
  fifteen-to-twenty-minute match check also passed.
- TypeScript and the production Vite build passed. The existing large-chunk
  warning remains; the main bundle is approximately 2.020 MB before gzip.
- Eleven actual-main browser regressions passed with zero page errors. They
  exercise contact rendering, both maps, observer changes, battle reset and
  sea-trial visibility, not visual acceptance of new artwork. The temporary
  loopback server closed.
- An independent read-only review found no new release-blocking issue.
  Uncovered contracts and remaining gameplay limitations are listed below.

Evidence remains on the server under `.qa/fleet-pacing-20261010/`:
`candidate-final-*.log` are the final eight cases; `baseline-*.log` contain
new-build comparisons. The earlier `candidate-cleveland-starter-default.log`
is intentionally retained as the failed intermediate full run, not acceptance.

Weapon before/after evidence is in `.qa/fleet-calibration-20261010/` under
`weapon-intent-baseline-final-tests.log` and `weapon-intent-final.log`.
The nine initial support-session checks yielded seven failures against the old
controller and all passed after integration; two additional real-spawn checks
were added for the braking regression.

## Reproduction

```sh
export PATH="$HOME/battleship/.tools/node/bin:$PATH"
npx vitest run tests/aiWeaponIntent.test.ts tests/objectiveSupportNavigation.test.ts tests/aiSupportStationSession.test.ts tests/fleetSmokeScenario.test.ts --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_SPAWN_SIDE=mirrored npx vitest run tests/prototypeBattleSmoke.test.ts -t "AI fleets navigate" --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_PLAYER_BUILD=cleveland-starter PROTOTYPE_SPAWN_SIDE=default npx vitest run tests/prototypeBattleSmoke.test.ts -t "5v5 AI fleets" --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_PLAYER_BUILD=north-carolina-magazine-refit PROTOTYPE_SPAWN_SIDE=mirrored npx vitest run tests/prototypeBattleSmoke.test.ts -t "5v5 AI fleets" --maxWorkers=1
```

## Remaining limits and next work

- Cappers can still spend excessive time navigating around island barriers.
  Global or waypoint-based capture routes need separate measured work.
- A stopped capper with only forward guns can leave a stern target in a blind
  sector without turning its hull. A controlled firing-position policy is next;
  this is not fixed by the present weapon-intent correction.
- More seeds, weather, aircraft engagements and human play are needed before
  tuning team balance or claiming consistently shorter matches.
- Current cache validity assumes static terrain. Runtime terrain editing would
  need an explicit geometry revision in the cache context.
- Weapon movement margins follow the production `FIXED_STEP` contract. Larger
  external step sizes and real-step optical loss during torpedo preparation
  would benefit from dedicated additional regression coverage.
- Surface/mobile FPS, native Windows testing and two-physical-PC LAN acceptance
  remain outstanding. The CPU-side bounded planner is not a device benchmark.

No asset changes, local downloads, Windows package, persistent preview service,
package version bump or release tag are part of this continuation. The checkout
remains an untagged 0.7.9; material-B stays isolated.
