# AI optical loss and reacquisition

The 2026-10-08 continuation fixes firing-lock reuse after contact loss and adds
short-lived, identity-specific recognition. It changes neither equipment values
nor fleet assignment policy. Both teams use the same production controller.

## Behavior and boundaries

- Losing the selected local optical contact immediately clears acquisition and
  the firing window, including loss inside one 2.5-second sensor interval.
  A cached snapshot returning during that interval cannot restore the old lock.
- A new target requires four fresh observation intervals. A successfully tracked
  identity remembered for at most 24 seconds requires two fresh intervals on
  return. Switching A -> B -> A preserves recognition of A, not its firing lock.
- Only successful local tracking refreshes recognition. Repeated, stale, future
  or regressing samples and radio reports cannot extend it. The bounded history
  stores at most 64 IDs and primitive observation timestamps.
- Torpedo estimates discard pre-loss and cross-target sample pairs. Hidden actual
  positions do not enter reacquisition or search steering. Battle reset discards
  all recognition, including reused entity IDs.

## Verification

Baseline controller: `ca2d4edeedecdfe7baf349af858d32d93279561b`.
Runtime: Node 24.21.0 on GPU-821560.

- Twenty-two controller regressions cover scan boundaries, repeated/invalid
  samples, target changes, interrupted acquisition, expiry, radio isolation,
  copied inputs, bounded history and torpedo estimates.
- Five integration regressions use real `observe` and `LocalBattleSession`.
  They cover both teams, within-scan gun-bloom changes, identity switching,
  expiry/reset and independence from hidden enemy movement. Replacing only the
  controller with the exact baseline makes three of these five tests fail;
  all five pass on the candidate.
- Six test-only telemetry checks distinguish loss, local target switching,
  contact return and incomplete acquisition. Metrics do not write production
  state or consume randomness. The instrumented baseline preserves its previous
  selected gameplay results exactly.
- 1,291 regular tests and eight separately run balance tests passed: 1,299 total,
  with five existing opt-in skips. The slow batch took 22.463 seconds against
  its unchanged 30-second limit.
- TypeScript/Vite build passed. The existing approximately 2.01 MB main-chunk
  warning remains.
- Eleven actual-main browser visibility/lifecycle checks passed with zero page
  errors. The temporary loopback server closed afterward.

The full-battle smoke additionally ran two fixed-seed production-session battles.
It substitutes AI only for player keyboard input; allied/enemy controllers use
the normal session. These two cases are not a broad balance result.

| Match / seed | Baseline ending | Candidate ending | Candidate first damage | Candidate ships firing |
| --- | --- | --- | --- | --- |
| 5v5 / 464129 | Player win, 20:00 time limit | Player win, 20:00 time limit | 97.67 s | 10 / 10 |
| 7v7 / 464641 | Enemy win, 17:31 score | Enemy win, 20:00 time limit | 162.78 s | 14 / 14 |

Candidate maximum individual grounding episodes were 0.05 seconds in both
matches. Both sides were still causing damage near the end. The candidate 7v7
spent approximately 211 seconds under player objective ownership and 704 under
enemy ownership; it did not reproduce the baseline's earlier score victory.

Target-switch and acquisition-interruption totals did **not** uniformly fall.
Different acquisition decisions change later trajectories and match duration.
This work establishes correct lock authority and identity recognition, not a
general reduction in AI churn or faster objective completion. Telemetry fields
named `reacquired` count local contact returns, not completed firing locks.

## Reproduction and evidence

```sh
export PATH="$PWD/.tools/node/bin:$PATH"
npx vitest run tests/aiReacquisition.test.ts tests/aiReacquisitionSession.test.ts tests/opticalSmokeMetrics.test.ts --maxWorkers=1
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 npx vitest run tests/prototypeBattleSmoke.test.ts -t "AI fleets navigate" --maxWorkers=1
npm run build
node scripts/qa/multi-contact-regression.mjs
```

Run long timing checks serially. Logs remain in ignored server directory
`.qa/optical-reacquisition-20261008/`; browser evidence remains in
`.qa/multi-contact-20261008/`. The ignored baseline loader reads the exact
controller from Git without reverting working files.

Next: objective approach and late-game urgency, followed by broader paired-seed
fleet calibration. Real Surface/mobile frame rates and two-physical-PC LAN
acceptance remain separate. No art, asset repository, package version, save
format, release tag or Windows package changed. No files were downloaded locally.
