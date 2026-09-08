# 0.7.1 prototype battle smoke acceptance

Initial run: 2026-09-08, approximately 11:45 UTC (20:45 JST). Navigation repair and same-seed re-verification followed on the same date.

Current status: **same-seed navigation repair passed the representative 5v5/7v7 checks**. Continuous individual grounding fell from minutes to at most 0.05 seconds; fleet-wide grounding fell to zero in both cases. The exact twenty-minute clock boundary was also repaired. See “Post-repair verification” below for the current results and source hashes. This remains a bounded smoke test, not proof of all possible navigation situations or game balance.

The following initial-run sections are retained as before/after evidence. Their failures and 72,001-step clock overrun describe the **pre-repair** code, not the current implementation.

## Scope and reproducibility

- Server: `ubuntu@150.65.181.188`.
- Worktree: `/home/ubuntu/battleship/.worktrees/v071-first-voyage`.
- Git base: `d03b45d565799b365c02fd93ba834d3846861c70`, with the current uncommitted 0.7.1 implementation. Source hashes below identify the tested revision more precisely than the base commit alone.
- Test: `tests/prototypeBattleSmoke.test.ts`.
- `createDefaultLocalProfile()` supplies its actual selected `default-fletcher` saved build. `battleLoadoutFromSlots()` and `createInitialState()` construct the battle; no laboratory-only fleet or weapon preset is substituted.
- Map: `atoll-prototype`; weather: `clear`; stock 5v5 and 7v7 roster construction, including the normal 7v7 air-support setting.
- `LocalBattleSession` runs the production allied/enemy AI path. A normal `RuleBasedAi` generates commands in place of the human player's keyboard input. This is a render-free mechanical smoke test, not a human-play usability or desktop/GPU performance test.
- Fixed timestep remains `1 / 60` second throughout. No enlarged simulation step, time jump, damage multiplier, invulnerability, developer mode or AI/simulation code change is used by this test.
- Exactly one fixed seed per fleet size is used. These two examples are not a statistical balance sample and establish no win-rate or fleet-strength conclusion.

Run the optional full smoke test on Linux:

```sh
PROTOTYPE_BATTLE_SMOKE=1 npx vitest run tests/prototypeBattleSmoke.test.ts --reporter=verbose --no-file-parallelism
```

Without the environment variable, fast checks run and the three long-running checks are explicitly skipped. Ordinary test-suite success therefore does **not** certify the optional navigation check. Initial full-run result on the pre-repair revision: **4 passed, 1 failed**, approximately 48.96 seconds total wall time. The failing assertion was retained; no seed substitution or relaxed threshold was used to hide it. The current suite additionally includes a fast exact-clock boundary regression.

## Launch and terminal results

| Case | Seed | Initial minimum opposing separation | Duration / fixed steps | Terminal state | First opposing damage | Opposing hull damage: player / enemy |
| --- | --- | --- | --- | --- | --- | --- |
| 5v5 representative AI | `0x71501` / 464129 | 5153.14 m | 1147.97 s / 68,878 | `player-won`, `score` | 104.65 s | 5261.63 / 6957.53 |
| 7v7 representative AI | `0x71701` / 464641 | 5153.14 m | 1200.0167 s / 72,001 | `enemy-won`, `time` | 107.00 s | 7972.21 / 6251.70 |
| 5v5 full-clock control | `0x71fff` / 466943 | At least 5000 m | 1200.0167 s / 72,001 | `draw`, `time` | No combat | No combat |

All launch checks pass: exactly 5 or 7 surface ships per side, speed and throttle exactly zero, deep-water navigation state, and allied companion AI enabled. The observed separation is at least the requested 5 km, not an assertion that every opposing pair is exactly 5 km apart.

The 20-minute configuration is `BATTLE_DURATION_SECONDS === 1200`. Floating-point accumulation reaches the boundary on the 72,001st fixed update; the 0.0167-second overrun is at most one fixed timestep, not an additional gameplay minute. The 7v7 AI case and independent full-clock control each actually execute a complete twenty-minute simulation. The control sends zero-throttle/no-fire commands to every ship, suppressing controllers through the existing session API so that combat cannot end the case early; it is not counted as evidence of AI navigation. All ships retain full hull and zero speed in that control.

Final objective scores:

- 5v5: player 2000; enemy 418.375.
- 7v7: player 626.542; enemy 1490.625.

Finite ship/projectile numerical state is checked every simulated second. The passing 7v7 case also checks that 120 subsequent terminal-session updates leave time and status unchanged. The 5v5 case reaches its terminal state but its earlier navigation assertion fails before that post-terminal assertion is reached.

## Allied behavior evidence

Every allied companion in both examples travels more than 100 m, records an enemy target and produces real shot events. Travel is cumulative path length, not displacement from the spawn point. Shot counts include the ship's actual weapon events, not fire-button requests. Damage uses exact local hull-damage attribution and only counts sources and targets on opposite teams; collision/uncredited damage is not credited to a team.

| Case / allied companion | Travel | First target | First shot | Shot events |
| --- | --- | --- | --- | --- |
| 5v5 Tashkent (`ally-destroyer-1`) | 20,382.70 m | 80.03 s | 92.53 s | 142 |
| 5v5 Nürnberg (`ally-lightCruiser-2`) | 3,757.16 m | 82.53 s | 110.03 s | 114 |
| 5v5 Cleveland (`ally-lightCruiser-3`) | 4,307.68 m | 92.53 s | 128.68 s | 159 |
| 5v5 Yamato (`ally-battleship-4`) | 6,435.33 m | 100.03 s | 110.03 s | 164 |
| 7v7 J class (`ally-destroyer-1`) | 6,013.88 m | 82.53 s | 115.03 s | 38 |
| 7v7 Dido (`ally-lightCruiser-2`) | 12,819.77 m | 102.55 s | 112.53 s | 291 |
| 7v7 Nürnberg (`ally-lightCruiser-3`) | 5,694.21 m | 102.55 s | 112.53 s | 159 |
| 7v7 Cleveland (`ally-lightCruiser-4`) | 7,020.04 m | 102.55 s | 200.00 s | 618 |
| 7v7 Yamato (`ally-battleship-5`) | 2,623.31 m | 102.55 s | 202.52 s | 245 |
| 7v7 King George V (`ally-battleship-6`) | 10,352.57 m | 102.55 s | 112.53 s | 276 |

These observations show that companions are not globally idle at deployment. They do not negate the later prolonged grounding described next.

## Blocking navigation finding

The fleet-grounding guard considers a team with at least two surviving ships. It records consecutive simulated time when **every** survivor has `navigationZone === "grounded"` and speed magnitude below 0.25 knots. A continuous interval of 30 seconds or more fails the smoke check. This is a test acceptance threshold, not a change to simulation rules.

- **5v5 failure:** the last two allied survivors, Tashkent and Yamato, are simultaneously grounded below 0.25 knots for **167.47 seconds**. The battle eventually ends by objective score, so the clock is not infinite, but movement/navigation is obstructed for nearly three minutes. The test deliberately remains red.
- **7v7 warning beyond the aggregate guard:** the enemy team's longest all-survivors-grounded interval is 28.00 seconds, below that guard's threshold. Nevertheless, enemy Yamato is continuously classified as grounded for **1065.07 seconds** (17 min 45 s), having travelled only 1383.65 m across the entire twenty-minute battle. A passing aggregate assertion must not be read as satisfactory individual navigation.

Additional longest single-ship continuous grounded intervals:

| Case | Ship | Longest grounded interval |
| --- | --- | --- |
| 5v5 | allied Tashkent | 170.02 s |
| 5v5 | allied Yamato | 206.85 s |
| 5v5 | enemy Tashkent | 239.27 s |
| 5v5 | enemy Cleveland | 312.63 s |
| 5v5 | enemy Yamato | 468.30 s |
| 7v7 | allied Cleveland | 210.08 s |
| 7v7 | allied Yamato | 321.28 s |
| 7v7 | allied King George V | 216.78 s |
| 7v7 | enemy Dido | 246.33 s |
| 7v7 | enemy Cleveland | 214.83 s |
| 7v7 | enemy Yamato | 1065.07 s |
| 7v7 | enemy King George V | 583.10 s |

Single-ship intervals measure navigation classification while alive; unlike the aggregate guard they do not additionally require speed below 0.25 knots. This report establishes the symptoms and fixed-seed reproductions, not a proven root cause. A navigation owner should inspect those cases before claiming that fleets reliably avoid or recover from islands. The test/docs author made no AI, map, balance or simulation modifications in this smoke-test work package.

## Source identification

SHA-256 captured immediately after the run. The test file's only post-run correction was making optional `output.hullDamage` explicit with `?? []` for TypeScript; `LocalBattleSession` returned that array in the actual run, so this did not change observed simulation behavior.

```text
01a5991eca9616ea2057d87a566678cbd330bd1d7e666ca69e9f80e5ab811245  src/sim/config.ts
c7f662832db7d4c9f792e540d241b509b8306ccde5f4e3bc908d98a00b9dda21  src/sim/simulation.ts
810a4cd7eaf34f0e65d23d927819bf6feb70e5e06a3f47fdb554b837036f32b5  src/controllers/ruleBasedAi.ts
9eeea8d27bcf68a0682d08e800a8791016ad3e9c40cc371f8057f5f414c28afa  src/maps/atollMap.ts
d90eb2f6dfc506a9498ce9a41da19afbb02c39562ae434898540b2c2511e4434  src/ships/mainBatteries.ts
5e1fa75c9dd21b1d25312349c73d7bdb763b7103c89c046cc35882a94d3bc2b2  src/session/localBattleSession.ts
d2c08e737af797d12f601cf0d31a983a267b727dfb7a52306b8736dfaef3bf3d  tests/prototypeBattleSmoke.test.ts
```

TypeScript `npx tsc --noEmit`: passed after the test typing correction. `git diff --check`: passed. No commit, push, material download or desktop build was performed for this work package.

## Still outside this evidence

Human controls, visual readability, audio, frame rate, whole-game menus/rewards, desktop packaging, LAN/network behavior and a multi-seed balance study remain separate acceptance gates. This report does not claim those checks passed.

## Post-repair verification

### Causes and bounded repair

The original route planner sampled only 220/430/700/1000 m ahead and considered a forward ±90-degree fan. It could miss near-shore hazards or a blocked segment between samples. It also had no astern recovery, while friendly-collision avoidance could replace the chosen heading without an additional near-shore throttle check.

The terrain contact resolver separately treated any hull-padding overlap at the start of a step as a collision at fraction zero, including movement directly away from shore. This prevented legitimate astern propulsion from freeing an already-overlapping hull margin.

The repair adds:

- A full 16-direction route fan, 25/65/120 m near-shore samples and continuous segment hazard checks using the existing deterministic terrain shape. Routing remains on the controller's existing 0.4-second planning cadence.
- Controller-local `AiNavigationRecovery`, checked at most twice per simulated second during normal operation. It reduces throttle when forward clearance is shorter than the braking/lookahead envelope, and commands the existing `-0.25` astern throttle plus normal rudder control to leave contact. Recovery holds a course long enough to make real progress rather than repeatedly alternating every frame. State is controller-local, not a new LAN field.
- A narrowly guarded contact exit: both the starting center and the requested step must remain off blocked terrain; the step is limited to `max(2 m, hull padding)`; clearance from every already-overlapped hull margin must strictly increase at all four substeps; another blocker cannot be entered; the map boundary cannot be crossed. A long move through an island, a move deeper into a margin, or movement from a dry-land center is rejected. This is ordinary local movement out of an overlap, **not** a teleport, collision-disable switch or cross-island escape.
- Normal battle time is clamped to exactly 1200 seconds when the accumulated time reaches the final tick within a 1e-6-second floating-point tolerance. Developer mode remains exempt as before. The existing twenty-minute assertion was not relaxed; the smoke test now requires exactly 72,000 updates for the full-clock control.

No ship top speed, acceleration/braking constants, turn authority, damage values, AI information access, terrain geometry, spawn location, seed or loadout was changed. Braking and reversing are generated input commands and therefore still use normal movement/grounding rules.

### Same-seed results

| Case | Result | Duration | Opposing hull damage: player / enemy | Maximum whole-fleet grounded interval | Maximum individual grounded interval |
| --- | --- | --- | --- | --- | --- |
| 5v5, seed 464129 | `player-won`, `time` | 1200 s | 6422.35 / 2873.45 | 0 s on both teams | 0.05 s |
| 7v7, seed 464641 | `enemy-won`, `score` | 1016 s | 6435.05 / 5347.99 | 0 s on both teams | 0.05 s |
| Full-clock 5v5 control, seed 466943 | `draw`, `time` | 1200 s / 72,000 steps | None | None | None |

All four allied companions in 5v5 and all six in 7v7 still move, acquire enemies and fire. Both teams deal actual attributed opposing hull damage. Representative enemy Yamato's longest grounded interval changes from 1065.07 seconds to zero; its 7v7 path length changes from 1383.65 m over twenty minutes to 2570.22 m in the shorter 1016-second match. This is symptom removal for the same inputs, not a balance comparison: changed navigation naturally changes targeting, damage, score and winner timing.

The strengthened long-running tests now reject **any individual ship** grounded for 30 consecutive seconds, in addition to the original whole-fleet guard. The original problematic seeds remain unchanged.

New focused tests in `tests/aiNavigation.test.ts` verify local outward exit versus inward/cross-island/dry-land rejection, genuine reverse displacement through `stepSimulation`, a normal AI escaping contact while its center stays navigable, read-only recovery planning and its cached half-second behavior. Existing high-speed shoreline collision/damage and shell interception tests remain unchanged and pass.

Final exact-clock re-verification: **6/6 tests passed in 58.45 wall seconds**, including both representative matches, the full-clock control, both launch checks and the fast final-tick boundary regression. Both twenty-minute cases finish at exactly **1200 seconds after 72,000 fixed updates**. The representative 5v5, 7v7 and control runs took 20.54, 27.85 and 9.21 wall seconds respectively. These are server/headless runtime observations, not isolated CPU benchmarks or desktop frame-rate claims.

Focused navigation/terrain/fleet/balance-lab/smoke regression: **31 passed, 3 optional slow checks skipped** across five files. This includes the existing unchanged balance-lab twenty-minute limit assertion. An earlier seven-file navigation/terrain/fleet/main-battery/secondary-battery/battle-setup/session run passed **55/55**. `npx tsc --noEmit` and `git diff --check` also passed after the exact-clock fix. Full-project regression and human-play acceptance remain the parent task's separate checks.

### Current source hashes

```text
01a5991eca9616ea2057d87a566678cbd330bd1d7e666ca69e9f80e5ab811245  src/sim/config.ts
e49450a8582f492bdf8fafe01d9557305319564004ba43a44eee71e73da1cf9b  src/sim/simulation.ts
726b549c7d94507da709215a90a8e2e758e9bef5d5884e21a647c6d1dd830bfa  src/sim/aiNavigation.ts
5ff5188229587f09b11391fd51311d54d3efe5fe7939436a3db5c97fdae645cd  src/controllers/ruleBasedAi.ts
a99e3d7b85a4f9d75846bf29301be0283a71edc09b3c4ca39fc968f29c43487c  src/maps/atollMap.ts
273416fb2376212527aa7db74d991307331ad691364a388d1cf155c7c1668170  tests/prototypeBattleSmoke.test.ts
1c655ae87310c8f924e88bf9251395685153eb149f983746ec5360a331568e8f  tests/aiNavigation.test.ts
```
