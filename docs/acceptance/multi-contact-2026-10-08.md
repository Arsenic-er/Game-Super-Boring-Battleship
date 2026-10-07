# Multiple enemy contact verification

## Scope

The local and LAN-host presentation paths now retain independent enemy contacts.
Package version remains 0.7.9 on codex/v072-historical-models; these are working
changes, not a tagged release. Source, tests, evidence and builds remain on
GPU-821560 under /home/ubuntu/battleship. No artwork or asset-repository changes.

## Behavior

- PlayerFleetPerceptionTracker keeps separate acquisition, loss, dead reckoning,
  reacquisition and expiry for each enemy ID. At most 64 contacts survive; fresh
  local contacts displace old memory. Invalid, future and stale samples are
  rejected. Observer, team, backwards time and battle resets clear old tracks.
- Radio reports remain search information for AI, not player optical contacts.
  Missing hidden entities do not erase their remembered tracks.
- Main local and host frame paths pass the complete contact list to GameView and
  TacticalMap. HUD target selection remains a single stable presentation choice,
  preferring confirmed live contacts and using distance hysteresis.
- Each model uses its own observed pose and outline state. A lost enemy cannot
  reveal its hidden true position, new movement, damage, smoke or wake.
- Distant shells and muzzle flashes/audio use their owner's contact, not the
  current HUD target. Nearby incoming shells remain visible; torpedo wake
  detection still uses its own detection range.
- Near-projectile detection follows the actual observing ship after the original
  ship sinks. Sea trials and developer omniscience retain their intended views.
  LAN guests retain server-filtered contact/projectile authority.

## Verification

- Final regular suite: 1,203 passed, five existing opt-in skips, two workers.
- Slow balanceLab, separately with one worker: eight passed.
- Combined executed tests: 1,211 passed; no assertions or timeouts were relaxed.
- TypeScript, production Vite build and git diff --check passed.

The actual-main Chromium regression passed 11 checks with zero page errors. It
covers two simultaneous acquisition silhouettes, two confirmed models, real map
marker pixels, nearest-target reorder, independent loss/expiry, observer and
battle resets, and sea-trials targets outside ordinary detection distance.
It uses isolated storage and deterministic sensor-time fixtures; it is not a
physical LAN connection test or a Surface/mobile FPS result.

The 15 NullEngine renderer tests invoke real syncShips/syncProjectiles behavior
and Babylon nodes, including ghost truth isolation, survivor-centered hazards,
owner-specific distant shells, resource disposal and developer/server-filtered
bypasses. The tracker adds 48 tests; three existing perception-helper regressions
were added for owner/team matching and independent torpedo detection.

The slow four-battle batch passed unchanged at 29.802 seconds against its
30-second limit. Earlier timeouts remain valid evidence of a narrow timing
margin; this run does not establish a performance fix. The existing large-bundle
build warning remains. Local/host impact-event filtering is still broader than
the guest path and is a separate follow-up.

## Reproduction and server evidence

From /home/ubuntu/battleship with the project-local Node runtime on PATH:

```sh
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
npm run build
node scripts/qa/multi-contact-regression.mjs
git diff --check
```

Run the slow balance batch separately. Browser QA starts a temporary loopback
Vite server on 5286 and closes its browser and server in finally. Final check
confirmed no listener remained. Evidence is under .qa/multi-contact-20261008:
unit-tests.log, balance-tests.log, build.log, report.json and four screenshots.

No Git push, Windows package delivery, local download or persistent preview.
Next work: AI target deconfliction, slow-batch profiling and broader paired-seed
fleet balance; physical two-computer LAN and low-end-device tests remain separate.
