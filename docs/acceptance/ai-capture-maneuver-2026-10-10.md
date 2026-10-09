# Capture routes and station firing maneuvers

This continuation adds terrain-aware capture routes, repairs the transition
from reversing to forward navigation, and lets a stationary capper turn its
forward guns toward a tracked stern target. It changes AI helm and propulsion
commands, not weapon statistics, sensor authority, rudder physics, terrain,
scoring, artwork or the twenty-minute match limit.

## Route around real island barriers

Capture navigation first checks a direct route to the existing station.
If blocked, it uses an eleven-by-eleven static navigation graph with at most
121 nodes and 420 undirected edges. Connections include hull clearance and
draft. Each end tests at most sixteen nearby graph attachments; there are at
most sixteen cached graph variants.

Per-ship replanning has a hard two-second cadence. A ship leaving its verified
corridor loses permission to use the old route until replanning. The controller
then keeps its capture duty but hands direction to local terrain recovery with
limited propulsion; it does not substitute an unchecked final cap destination.
Intermediate waypoints are transit markers, not permanent stopping stations.
Map-geometry changes invalidate graph and route contexts.

Four real simulation tests start behind actual island barriers: east/west
Fletcher, east Cleveland and east Yamato. Each follows controller commands,
enters the objective and completes capture within 600 simulated seconds,
without a grounding episode reaching one second. These are physics tests,
separate from the planner's six geometric route-clearance checks.

Two additional real-motion tests begin crossing the cached corridor at speed.
They verify waypoint use, departure, limited recovery without per-frame search,
and a new valid route after the two-second deadline.

## Complete recovery before resuming forward travel

The recorded destroyer location at approximately (1183.37, 1714.57) had a clear
direct route to the cap, but its bow pointed toward a coast about 24 m away.
The old recovery backed away and resumed forward travel before the hull had
turned clear, creating repeated reverse/forward cycles.

In a short scenario initialized from the rounded log pose, the old controller
and recovery made three reverse runs within 180 seconds and spent about
107.7 seconds reversing. This is a reconstructed initial condition, not a
replay of the original full battle or its private controller state.

After backing away, recovery now brakes and checks a hull-scaled exit corridor.
It permits slow steerage only with forward clearance and no appreciable
sternway, then resumes normal travel when aligned. An out-of-bounds request
keeps recovery pointed inward until the hull is safely away from the edge;
the verified exit heading is retained when control is released.

The near-coast regression requires at most one reverse run, under sixty seconds
reversing, no grounding and physical entry into the objective within 360 seconds.
For a Yamato initially facing opposite its exit, a separate 180-second test
requires real displacement and over forty degrees of turning. It does not
claim an instant or completed 180-degree battleship turn. A real blocked
shallow-water approach still commands braking. Ordinary navigation that has
not entered reverse recovery keeps its previous behavior.

## Turn forward guns out of a blind sector

A capper already at its station may have healthy guns but no mount able to
bear on a tracked target behind its hull. It now makes a small low-power turn
inside the safe part of the capture circle, using the nearest usable firing
sector. The selected turning direction remains stable across noisy aim
updates; the existing aiming error is not removed.

A slow heavy ship maintains helm until the arc opens rather than easing off
too early. Once a healthy gun can bear, propulsion stops and the firing heading
is retained. A ship with an available aft gun does not make an unnecessary
hull maneuver. Optical loss, invalid target/range, disabled propulsion,
steering or guns cancel this behavior. Avoiding torpedoes, friendly collisions,
close-range threats and terrain takes priority.

Sixteen integration checks cover both teams, sparse forward-only Fletcher
mounts and Richelieu's all-forward battery, aft-gun controls, circle boundaries,
perception and damage/safety conditions. The exact previous controller fails
five and passes eleven; the new controller passes all sixteen. Both Richelieu
fixtures produce a real main-gun shot at about 157.38 seconds while remaining
inside the objective. This is a local firing-position policy, not broadside
optimization or a guarantee that every stationary target can be engaged.

## Verification

Baseline: `a2f1b40b8bb6f0c1c7844391d6ee809558b8216c`.

- 1,483 regular tests passed, with five existing opt-in skips.
- Eight balance tests passed, for 1,491 total regular/balance passes.
  The percentile case took 22.574 seconds under the unchanged thirty-second
  timeout; the representative fifteen-to-twenty-minute case also passed.
- Production TypeScript/Vite build passed. The existing large-chunk warning
  remains: the main bundle is 2,027.17 kB before gzip.
- Eleven actual-main browser checks passed with zero page errors. The temporary
  loopback test server was closed after the run.
- Fifty-three new tests cover capture planning, physical waypoint travel,
  recovery handoff, reverse recovery and firing-station maneuvers.
- Against the exact baseline recovery/controller sources, the final eleven
  recovery checks produce eight failures and three passes; all eleven pass
  with the new sources. The sixteen firing checks produce five baseline
  failures and eleven passes; all sixteen now pass.

Evidence stays on the server under `.qa/fleet-maneuver-20261010/`:
`regular-final.log`, `balance-final.log`, `build-final.log`,
`browser-final.log`, `recovery-before-final.log`,
`firing-before.log` and `firing-after.log`. Diagnostic logs and generated
artifacts are intentionally not committed.

## Full battle comparison

Eight configuration/side cases use the same seeds, saved builds, test assertions
and terrain as the previous checkpoint. The baseline logs are
`.qa/fleet-pacing-20261010/candidate-final-*.log`; new logs are
`.qa/fleet-maneuver-20261010/candidate-*.log`.

| Player build | Team size | Spawn side | Seed | Previous winner | New winner | New duration | End |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fletcher | 5v5 | Default | 464129 | Enemy | Enemy | 1200 s | Time |
| Fletcher | 5v5 | Mirrored | 464129 | Enemy | Enemy | 1200 s | Time |
| Fletcher | 7v7 | Default | 464641 | Player | Enemy | 1200 s | Time |
| Fletcher | 7v7 | Mirrored | 464641 | Player | Enemy | 1200 s | Time |
| Cleveland starter | 5v5 | Default | 464129 | Enemy | Player | 1200 s | Time |
| Cleveland starter | 5v5 | Mirrored | 464129 | Player | Enemy | 1200 s | Time |
| North Carolina magazine refit | 5v5 | Default | 464129 | Player | Enemy | 1200 s | Time |
| North Carolina magazine refit | 5v5 | Mirrored | 464129 | Player | Enemy | 1113.85 s | Destruction |

Every ship fired, both sides dealt damage, and the longest individual grounding
episode was 0.05 seconds. Seven cases reached the twenty-minute limit. The other
ended at 18:33.85 by destruction. All eight passed the existing runtime checks.

**This is not a balance acceptance.** Enemy wins rose from three to seven of
eight cases. These cases reuse two seeds across configurations and are not eight
independent estimates of win probability. The smoke harness substitutes an AI
for human input, but that proxy receives a plain observation rather than the
session fleet target, objective and radio coordination used by the other AIs.
This asymmetry predates these changes, and cannot alone explain the outcome
shift. Saved player equipment also differs across the tested configurations.

The next calibration should give both teams equivalent equipment and the same
controller/coordination path, run paired spawn sides across more seeds, and
then separately evaluate the human-player session. Until then, neither uniform
pacing improvement nor balanced difficulty is established.

## Reproduction

```sh
export PATH="$HOME/battleship/.tools/node/bin:$PATH"
npx vitest run tests/objectiveCaptureNavigation.test.ts tests/aiCaptureWaypointSession.test.ts tests/aiCaptureRecoveryHandoff.test.ts tests/aiNavigationRecovery.test.ts tests/aiFiringStationManeuver.test.ts --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_SPAWN_SIDE=mirrored npx vitest run tests/prototypeBattleSmoke.test.ts -t "AI fleets navigate" --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_PLAYER_BUILD=cleveland-starter npx vitest run tests/prototypeBattleSmoke.test.ts -t "5v5 AI fleets" --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_PLAYER_BUILD=north-carolina-magazine-refit PROTOTYPE_SPAWN_SIDE=mirrored npx vitest run tests/prototypeBattleSmoke.test.ts -t "5v5 AI fleets" --maxWorkers=1
```

## Scope and remaining work

- The sparse routes are not optimal ship-kinematic paths or an exhaustive search
  through every narrow passage. Dynamic ship avoidance remains a separate layer.
- The current atoll's central objective disk is open water. Its in-zone shortcut
  is not a guarantee for arbitrary objectives moved across edited island terrain.
- The bounded graph and cached searches constrain CPU work; they are not measured
  Surface/mobile frame-rate results.
- Complete battle results need more seeds, weather, aircraft and human play
  before asserting overall win-rate balance or consistently faster matches.
- Native Windows and two-physical-PC LAN acceptance remain separate tasks.
  This batch leaves graphics, material-B experiments and the asset repository
  unchanged.

Code, logs and build output remain on GPU-821560. No local download, Windows
package, persistent preview service, version bump or release tag is included.
The working package remains 0.7.9.
