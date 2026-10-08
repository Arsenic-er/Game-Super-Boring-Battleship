# Fleet objective navigation

The 2026-10-08 continuation gives both AI fleets bounded capture duties and
public-score deadline awareness. Assigned cappers no longer abandon the objective
to chase stale radio/optical positions, distant targets or formation anchors.
Weapon statistics and optical acquisition requirements are unchanged.

## Capture and support duties

The local/host battle session assigns normally one healthy AI to capture and at
most two when the zone is contested, the opponent is capturing, or the scoring
deadline is urgent. Healthy ships already inside take precedence; otherwise
distance and bounded destroyer/cruiser/battleship role preferences determine the
choice. Support ships approach role-specific positions outside the capture disk.

A duty normally stays with its ship for twelve seconds. Human takeover, removal,
death, severe damage and an off-zone destroyed engine immediately release it.
An immobilized ship already inside may still contribute to capture. Off-zone
human ships do not reserve a future capture job; healthy humans already inside
count toward current occupation. Planning retains at most 64 eligible AI IDs.

Capture stations are separated, and ships brake before arrival rather than
steaming through the circle. Once ownership is safe, cappers return to support:
the objective continues scoring without a permanent garrison. Torpedo evasion,
close-quarters retreat, friendly collision avoidance, terrain recovery and
heavy-damage withdrawal keep precedence. A stopped station-holder can use bounded
propulsion to separate from an overlapping stationary friend.

Urgency uses the public twenty-minute clock, scores, owner/capture progress, and
the ship's own approximate travel time. It accounts for neutralizing and taking
an enemy-owned zone, and for a current lead that continued enemy scoring would
erase before time expires. It never reads hidden enemy positions, health or
occupant counts. Sea trials do not receive scoring-objective duties.

## Verification

Baseline controller and session: `31743f5631ec91509d32e38b513b106b8f25c244`.
All work ran on GPU-821560 with Node 24.21.0.

- 23 coordinator tests cover role/distance ranking, one/two-ship bounds, public
  deadlines, retained duties, refreshed issue times, human participation,
  engine failure, reset, team symmetry and read-only deterministic inputs.
- 18 controller/session tests cover navigation precedence, preserved firing
  restrictions, support separation, damage/evasion/reverse priorities, hidden
  enemy invariance and sea-trials gating. Real simulation moves a ship from
  500 m outside, slows it inside, completes the 25-second capture and releases
  the duty within 180 seconds. Eleven of these checks fail with the exact old
  controller/session sources; all eighteen pass with the candidate.
- 17 test-metric checks cover physical in-zone ship-seconds, contested time,
  scoreboard gains after 900 seconds and validated optional seed offsets.
- 1,349 regular tests and eight separately run balance tests passed: 1,357 total,
  with five existing opt-in skips. The balance batch took 21.388 seconds against
  its unchanged 30-second limit; the representative 15–20 minute check passed.
- TypeScript/Vite build passed. The existing main-chunk warning remains
  (approximately 2.017 MB minified).
- Eleven actual-main browser checks passed with zero page errors; the temporary
  loopback server closed.

The existing gun-bracketing test incorrectly aggregated all shell impacts,
including the stationary player's automatic secondary battery. Diagnostic
attribution found the candidate's 31 hits were all player secondary shots; the
enemy main gun had zero hits and eighteen splashes (baseline zero/fourteen).
The test now attributes both hits and misses to the tested enemy main gun. Its
minimum sample and below-50-percent assertions are unchanged. Radio-only fixture
tests explicitly use sea trials to isolate search behavior from capture duties.

## Paired full battles

Four fixed-seed production-session battles ran before and after the changes.
Only keyboard input is replaced with a player AI proxy; all other controllers
use the production session. Every ship fired, both sides caused damage, and the
maximum individual grounding episode was 0.05 seconds in all candidate cases.
All baseline and candidate cases ended at the twenty-minute time limit.

| Match and seed | Baseline contested seconds | Candidate contested seconds | Baseline points after 15 min, player / enemy | Candidate points after 15 min, player / enemy |
| --- | ---: | ---: | ---: | ---: |
| 5v5, 464129 | 55.67 | 95.55 | 750 / 0 | 0 / 750 |
| 7v7, 464641 | 15.05 | 114.05 | 0 / 750 | 0 / 750 |
| 5v5, 464130 | 42.13 | 278.07 | 750 / 0 | 458.50 / 166.54 |
| 7v7, 464642 | 33.35 | 281.67 | 750 / 0 | 60.04 / 565.00 |

Contested seconds measures simultaneous physical presence of both teams, not
flag ownership. Late points include every scoreboard source, including destroyed
ships. Increased contesting in these four cases does not establish general
balance, equal win rates or shorter matches; final outcomes changed and every
case still reached the cap. Broader seed, hull-role and spawn-side calibration
remains next.

## Reproduction and evidence

```sh
export PATH="$PWD/.tools/node/bin:$PATH"
npx vitest run tests/fleetObjectiveCoordinator.test.ts tests/fleetObjectiveNavigation.test.ts tests/objectiveSmokeMetrics.test.ts --maxWorkers=1
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 npx vitest run tests/prototypeBattleSmoke.test.ts -t "AI fleets navigate" --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 PROTOTYPE_SEED_OFFSET=1 npx vitest run tests/prototypeBattleSmoke.test.ts -t "AI fleets navigate" --maxWorkers=1
npm run build
node scripts/qa/multi-contact-regression.mjs
```

Run full battles and timing checks serially. Evidence stays in ignored server
directory `.qa/objective-navigation-20261008/`; final paired candidate logs are
`candidate-final-offset0.log` and `candidate-final-offset1.log`, compared with
`baseline-offset0.log` and `baseline-offset1.log`. Browser evidence is in
`.qa/multi-contact-20261008/`. Name-filtered battle-test exclusions are not extra
product skips.

This remains an untagged 0.7.9 working checkout. No art, asset repository, save
format, Windows package or local download changed. Surface/mobile frame rates
and two-physical-PC LAN acceptance remain separate.
