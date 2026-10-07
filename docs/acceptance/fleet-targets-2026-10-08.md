# Fleet target coordination

## Scope

LocalBattleSession now coordinates eligible AI ships on both teams, including the
LAN host path. Package version remains 0.7.9 on codex/v072-historical-models.
All source, builds and evidence stay on GPU-821560. Artwork, assets, weapon damage,
accuracy, save formats and UI layout are unchanged.

## Implemented rules

- Assign only from each ship's valid local optical contacts. Another observer's
  sightings and radio-only reports cannot supply firing targets. Controller-side
  membership checking and the existing acquisition/identity-reset gates remain.
- Reuse screen, escort and line roles, with own-role engagement bands and the
  actual equipped main-battery range. No unseen enemy class or live enemy state
  is looked up.
- Apply a progressive friendly-load cost rather than hard target uniqueness.
  Comparable threats attract distributed fire; a single useful target or a
  severely damaged observed target can still receive concentrated fire.
- Normally hold a target for ten seconds, then require a meaningful score
  improvement before switching. Lost local contact, close self-defense and
  substantially inferior/out-of-range choices can interrupt the hold. Near-range
  noise uses a continuous penalty rather than a discontinuous range threshold.
- Plan at the sensor interval with immediate roster/contact/identity/threat
  invalidation. Cap retained state at 64 observers and 64 local candidates each.
  Overflow preserves tactically important candidates, including close threats.
  Valid reverse speeds, malformed samples and deterministic duplicate handling
  have regressions; returned assignments cannot mutate internal reservations.
- Human commands retain priority and release AI reservations immediately.
  Destroyed/removed AI, team/equipment changes, reset and backwards time clear
  affected state. Human aim is not inferred as a target reservation.
- Existing optical, torpedo, navigation, friendly-collision and repair logic
  remains in control. Coordination telemetry records whether a local target is
  assigned and how many eligible friendly AI share it.

Independent review caught early occupancy-cost saturation, which stranded six
ships in a 5:1 allocation after a second comparable target appeared. Progressive
costs now pass both initial and late-arrival 3:3 cases without periodic switching.

## Verification

- Regular suite: 1,236 passed, five existing opt-in skips.
- New focused coverage included above: 24 coordinator and nine real-session/
  controller integration tests.
- TypeScript, production build and git diff --check passed.
- Existing actual-main browser regression: 11 passed, zero page errors. Temporary
  browser/server closed; port 5286 has no listener.
- Full production-session battle smoke: both 5v5 and 7v7 passed.
- Separate legacy balanceLab: seven passed, one 30-second timeout at 30.073 s.

The slow batch bypasses LocalBattleSession and therefore does not validate the
new allocator. Its preceding checkpoint passed at 29.802 s; earlier runs also
timed out. No assertion, duration or timeout was relaxed. This is not an all-green
full-suite result. The existing large-bundle build warning remains.

### Full battle results

- 5v5, seed 464129: 1,200 simulated seconds, player score lead at time limit;
  first damage at 97.67 s, all ten ships fired. Maximum simultaneous assigned
  targets were 4 per team; longest individual grounding was 0.03 s.
- 7v7, seed 464641: enemy score victory at 1,051.22 s (17 min 31 s);
  first damage at 160.82 s, all fourteen ships fired. Maximum simultaneous assigned
  targets were 6 per team; no ship grounded.
- Server headless wall times were 29.05 s and 33.43 s. These are not device FPS.
  The highest per-ship coordinated target-change counts were 45 and 67,
  including changes after contact loss. Stable fixed-contact fixtures pass, but
  dynamic contact-loss churn still needs calibration.
- These two seeds validate execution, not fleet win-rate balance. Player proxy
  input remains human-authoritative and is deliberately outside allocation.

## Reproduction

From /home/ubuntu/battleship with the project-local Node runtime on PATH:

```sh
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npm run build
PROTOTYPE_BATTLE_SMOKE=1 npx vitest run tests/prototypeBattleSmoke.test.ts --maxWorkers=1 -t "AI fleets navigate"
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
node scripts/qa/multi-contact-regression.mjs
git diff --check
```

Run long phases separately. Logs are in .qa/fleet-targets-20261008; browser report
and screenshots remain in .qa/multi-contact-20261008. Pattern-filtered smoke skips
are not additional failures or additions to the regular suite's five skips.

No Git push, release tag, Windows delivery, local download or persistent preview.
Next: profile the narrow slow-batch timing margin; calibrate target churn,
objective advancement and late-game decisions using broader paired seeds.
