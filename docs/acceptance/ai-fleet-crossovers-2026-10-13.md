# Fleet identity and update order calibration

This continuation separates three experimental variables: the side of the
atoll where a fleet starts, the IDs that determine its controller randomness
and tie breaking, and the array order in which ships update. The controlled
benchmark still gives opposing ships equivalent equipment and the same
production session AI path.

A direct logic defect was reproduced independently of shooting randomness:
a screen or escort chose the first friendly battleship in its observation
list. Reordering that list could reverse its rudder command without changing
any ship position or tactical condition. Friendly collision threats with equal
closest-approach distance also depended on list order.

## Stable friendly choices

Screens and escorts now choose the nearest living, finite, non-self friendly
battleship. Exact distance ties use stable ID ordering. Collision navigation
still prioritizes the smallest closest-approach distance; ties now use the
earliest closest approach, then stable ID. Neither selection mutates its input.
Capture duties, acquired local targets, torpedo evasion and existing safety
thresholds retain their precedence. Weapon statistics and random streams are
unchanged.

The new 28-check regression suite produces 14 failures and 14 passes against
the exact controller from 35d1952, loaded through a read-only test alias. All
28 pass with the fix. In one old-source Fletcher case, merely reversing the
two friendly battleships changes desired heading from +0.63755 to -0.98742 rad
and rudder from +0.79694 to -0.82. Both orders now produce identical commands.

An independent read-only review found no blocking issue. Nearest-anchor
selection has no hysteresis: two moving battleships at near-equal distances
might still induce switching. A time-progressing crossover fixture is the next
way to assess that behavior; this patch does not invent a retention duration.

## Identity and array order are separate variables

The test helper adds two explicit controls, both disabled by default:

- `swapFleetIdentities` exchanges each paired A/B ship ID and nothing else.
  It crosses all ID-derived controller/sensor randomness and ID tie breakers,
  not randomness alone.
- `rosterOrder` permutes only the ship array: A then B, B then A, or interleaved.
  A and B denote the original spatial cohorts, even when IDs or team labels
  are exchanged.

Existing spawn-side and team-label controls remain independent. Tests compare
complete fresh states, equipment hashes, seeds, identities, positions and
manifests, including combined transformations. Reordering is not normalized
out of the exact state hash because it is the experimental variable.

The production player-facing factory, saved loadouts and session controller
eligibility are unchanged. No equipment or weapon balance multiplier is
adjusted by these controls.

## Remaining simulation order sensitivity

A read-only 5v5 experiment at seed 464129 retained identical per-ship state
for the first 92.5167 seconds when only the ship array was reversed.
The first difference at 92.5333 seconds was in projectile data. A two-Fletcher
simultaneous-salvo case reproduced the cause: main guns consume a shared
simulation RNG sequentially, so array order changes which ship receives each
spread sample. The final RNG state after both salvos was unchanged.

The session does collect all observations before controller commands and
steps the simulation only after all commands are ready. Although observation
self fields refer to live ship state, the audited controllers do not mutate
that state while producing commands. No cross-controller self-state leak was
demonstrated.

These observations do not establish an average win-rate bias. This change
does not replace the RNG architecture, globally sort every physics phase, or
claim that arbitrary roster permutations produce identical battles. Multi-ship
collision resolution, equally distant secondary targets and exact projectile
contact ties also remain order-sensitive cases for separate investigation.

## Full battle results

The final matrix contains 32 primary surface-only battles: two seed offsets
(17 and 79), 5v5 and 7v7, default/mirrored placement, normal/swapped fleet IDs,
and A-first/B-first processing. The concrete seeds are 464146 and 464208 for
5v5, and 464658 and 464720 for 7v7. Every case uses clear weather and the
default-Fletcher-led mixed fleet, not an all-Fletcher fleet. Opponents have
equivalent paired equipment. Interleaving is covered by state/short-session
tests, not by this full-battle matrix.

All 32 passed the original operational assertions. Every ship actually fired;
all cases ended on the 1,200-second time limit, and maximum individual
grounding was 0.05 s. The tests still require local target acquisition, travel,
coordination, opposing damage, firing majorities, finite state and a frozen
terminal clock. No threshold or timeout was relaxed.

P/E denote the player/enemy labels, not a human-controlled fleet. Scores are
rounded to two decimals for display; full reports retain exact state hashes.

| Seed offset | Spawn | IDs swapped | Order | 5v5 winner / P:E scores | 7v7 winner / P:E scores |
|---|---|---|---|---|---|
| 17 | default | no | a-then-b | E / 492.75:1316.62 | E / 837.54:993.25 |
| 17 | default | no | b-then-a | E / 285.87:1773.41 | P / 837.71:267.42 |
| 17 | default | yes | a-then-b | E / 336.38:963.63 | E / 819.21:1025.29 |
| 17 | default | yes | b-then-a | P / 920.75:470.41 | E / 436.21:814.27 |
| 17 | mirrored | no | a-then-b | P / 770.21:57.50 | P / 814.27:436.21 |
| 17 | mirrored | no | b-then-a | P / 963.63:336.38 | P / 1056.84:662.71 |
| 17 | mirrored | yes | a-then-b | P / 1773.41:285.87 | P / 998.83:621.45 |
| 17 | mirrored | yes | b-then-a | P / 1316.62:492.75 | P / 1484.42:328.25 |
| 79 | default | no | a-then-b | E / 930.96:935.17 | P / 966.42:833.82 |
| 79 | default | no | b-then-a | P / 1171.08:815.88 | E / 436.53:1410.09 |
| 79 | default | yes | a-then-b | P / 953.79:577.04 | E / 694.79:1278.51 |
| 79 | default | yes | b-then-a | E / 366.71:1216.12 | E / 240.87:1895.90 |
| 79 | mirrored | no | a-then-b | P / 1216.12:366.71 | P / 1895.90:240.87 |
| 79 | mirrored | no | b-then-a | E / 534.75:1121.04 | E / 910.66:951.96 |
| 79 | mirrored | yes | a-then-b | E / 815.88:1171.08 | P / 1196.34:976.21 |
| 79 | mirrored | yes | b-then-a | P / 935.17:930.96 | E / 833.82:966.42 |

Player-labelled fleet A won 17 cases and enemy-labelled fleet B won 15.
The geographically northern starting fleet won 23; the southern fleet won 9.
ID cohort A and the first-processed spatial cohort each won 17. Holding all
other factors fixed, winners changed in 7/16 identity pairs, 9/16 order pairs,
and 11/16 spawn-side pairs.

These are correlated deterministic variants of four numeric seeds, not 32
independent samples from a player population. They do not certify a 50% win
rate, equal map-side difficulty, causal RNG bias or human difficulty. Northern
spawn/terrain interactions warrant broader-seed route and objective analysis
next. All matches timing out also leaves earlier decisive pacing unproven.
Weather and aviation need separate follow-up matrices.

Two additional label-only controls at offset 17/default/normal IDs/A-first
ran 72,000 steps each. Reversing labels back yielded identical unrounded full
final-state hashes:

- 5v5: ad02eff2cb42cc5ea4ecd75a4005f095986fba649667e6818457aa4072c80e54
- 7v7: 1777ed16055946912ebae73141639df980dc1a09b12a9b3b05932bb4b3e5937b

Four exploratory identity/order battles ran against 35d1952 before the fix.
They are not pooled with the final 32. Detailed reports and verification logs
are retained only on the server under .qa/fleet-crossovers-20261013; old-source
regressions are under .qa/friendly-order-20261013.

## Verification

- 1,584 regular tests passed across 134 files; seven opt-in cases were skipped
  in the regular invocation. The 34 crossover checks and 28 friendly-order
  regressions are included in that total.
- All eight balance-lab checks passed separately. The existing percentile
  batch took 22.570 s against its unchanged 30-second limit.
- All six original prototype smoke checks passed, including the separate
  human-slot proxy fixture. Its results are not pooled with the symmetric
  fleet experiment.
- Production TypeScript/Vite build passed. The pre-existing large-bundle
  warning remains; this is not a measured device-performance improvement.
- Eleven actual-main browser checks passed with zero page errors, covering
  multiple contacts, independent contact loss, observer changes and test-mode
  markers. The temporary loopback server closed; no persistent preview was
  enabled.
- Source review and git diff whitespace validation passed.

No physical Surface/mobile FPS, native packaged Windows session or two-PC
LAN acceptance was performed. Those remain separate gates.

## Reproduction

```sh
export PATH="$HOME/battleship/.tools/node/bin:$PATH"
npx vitest run tests/fleetCalibrationCrossovers.test.ts tests/aiFriendlyOrder.test.ts --maxWorkers=1
FLEET_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=17 FLEET_CALIBRATION_IDENTITY_SWAP=1 FLEET_CALIBRATION_ROSTER_ORDER=b-then-a npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
FLEET_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=79 PROTOTYPE_SPAWN_SIDE=mirrored FLEET_CALIBRATION_ROSTER_ORDER=a-then-b npx vitest run tests/fleetCalibrationBattle.test.ts --maxWorkers=1
```

All code, build output and diagnostic logs remain on GPU-821560. The asset
repository, textures and isolated material-B preview are unchanged. No local
download, persistent preview service, Windows package, version bump or release
tag is included. The working package remains 0.7.9.
