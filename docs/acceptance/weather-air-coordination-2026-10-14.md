# Weather aware fleet aviation acceptance

The 2026-10-14 continuation fixes autonomous aviation ownership, optical weather
and terrain rules, team-dependent patrol steering, and terminal local/host
sessions. It extends the existing equal-loadout surface calibration with real
fleet-support resources. It does not change ship equipment, weapon damage,
anti-aircraft range, scoring, terrain, weather art or the locked clear-sky look.

## Rules now enforced

- The authoritative session chooses which live ships are AI-controlled. Those
  ships can dispatch their owned aircraft regardless of team label. Human and
  developer takeover suppress new automatic orders. Explicit orders for a
  squadron cannot be overwritten by an automatic order in the same tick.
- Aviation target selection and validation use one pre-movement ship state.
  All pending orders are validated before any ship moves, fires or lays smoke.
- Air-to-surface, ship-to-air and air-to-air optical ranges use the existing
  weather visibility multiplier. Ship-to-air and air-to-air also test real
  terrain elevation. Friendly positions remain authoritative. Enemy contacts
  stop refreshing outside visibility; existing air contact expiry stays five
  seconds. Anti-aircraft damage rules are unchanged.
- A missing or sunk controller cannot supply ship-borne visual contacts.
  An aircraft may still use its own valid observation; deleting its controller
  no longer throws an unknown-ship error.
- Patrol and search handedness comes from the existing stable squadron ID seed,
  not the player/enemy label. No extra random draw or mutable field was added.
- Finished local and host sessions return empty frame events without running
  sensors or AI. Hosts also stop advancing network ticks and publishing old
  snapshots. The actual transition frame is still delivered once, and reset
  clears old commands/events and resumes simulation.

## Regressions

Twenty autonomous-aviation tests cover both teams, authoritative takeover,
explicit orders, pre-movement order validation, dead/deleted controllers and
actual two-sortie fighter/bomber cycles with living controllers. Twenty-four
weather tests exercise three optical paths in clear, squall and fog conditions,
historical contacts, real mountain occlusion, high-altitude and open-sea
positive controls, and friendly navigation.

Sixteen calibration tests preserve the default surface fixture, paired real
equipment/resources, controller identity, map-edge recovery points, side
rotation and label normalization. Three of those run actual sixty-second
sessions through aircraft deployment and patrol. Six maneuver tests directly
cover both patrol/search phases for all three aircraft roles.

Five local-terminal and three host-terminal tests verify exact state hashes,
one-time final events, no extra host snapshots and fresh reset state. The
existing asynchronous LAN stale-publication test now blocks the actual terminal
snapshot instead of relying on repeated post-result steps to generate one;
its disconnect/session-clear assertions remain intact.

Against exact prior source from 9313620:

| Isolated old source | Cases | Failures | Passing controls |
| --- | ---: | ---: | ---: |
| Simulation and local session, initial 20-second calibration variant | 65 | 43 | 22 |
| Patrol/search maneuver direction | 6 | 6 | 0 |
| Host terminal handling with the new local guard retained | 3 | 2 | 1 |

The full-session label audit caught a difference that the initial twenty-second
check missed: the first changed flight state appeared at 27.333 seconds when a
fighter entered patrol. The permanent session regression now runs sixty seconds.
A terminal-state hash assertion also caught post-result sensor/AI mutation;
full object diff formatting was replaced with the same complete-state digest
comparison to keep failure reports bounded.

## Complete battles

Twelve scenarios cover 5v5 and 7v7, clear/rain-squall/sea-fog, and both spawn
sides. Each side uses three production support squadrons: six fighters, five
dive bombers and five torpedo bombers, totaling six squadrons and thirty-two
aircraft per battle. Aircraft control IDs are rebound to the paired flagship;
no developer resource multipliers or scripted combat commands are used.
The experiment enables support in 5v5 as an explicit stress fixture; it does
not change normal battle composition.

Seeds are 0x71501 + 211 for 5v5 and 0x71701 + 211 for 7v7. Default and mirrored
placements rotate the physical cohorts; terrain stays fixed. Geographic winner
and total launches / surface weapon-release events are:

| Size | Weather | Default winner | Mirrored winner | Launches default / mirrored | Releases default / mirrored |
| --- | --- | --- | --- | --- | --- |
| 5v5 | Clear | South | North | 7 / 9 | 4 / 4 |
| 5v5 | Squall | North | North | 8 / 8 | 4 / 4 |
| 5v5 | Fog | South | South | 9 / 8 | 4 / 5 |
| 7v7 | Clear | North | North | 8 / 8 | 4 / 4 |
| 7v7 | Squall | North | South | 10 / 8 | 4 / 4 |
| 7v7 | Fog | North | North | 12 / 10 | 4 / 4 |

All twelve finish at the twenty-minute limit. Both teams launch aircraft,
release at least two surface-attack salvos and damage opponents, with a firing
majority of ships. Every ship travels over 100 m and receives fleet duties;
maximum continuous grounding is 0.05 seconds. Not every individual ship fires
in every case.

Six additional label-only reversal runs match the exact normalized, unrounded
final-state digest of the six default-side scenarios after 72,000 steps each.
That is eighteen accepted complete sessions, not eighteen independent seeds.
North wins eight of the twelve geographic cases. These results do not establish
map balance or eliminate the existing timeout-heavy match pacing.

## Verification and reproduction

Final checks: 1,733 regular tests and eight balance tests pass; thirteen opt-in
tests are skipped in the regular run. Six original prototype smoke tests,
production build and eleven actual-main browser checks pass. Browser checks
report zero errors and close their temporary loopback service. The existing
large-bundle build warning remains.

Run on GPU-821560 in /home/ubuntu/battleship with the project Node runtime:

```sh
export PATH="$HOME/battleship/.tools/node/bin:$PATH"
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
FLEET_AIR_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=211 npx vitest run tests/fleetAirCalibrationBattle.test.ts --maxWorkers=1
FLEET_AIR_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=211 PROTOTYPE_SPAWN_SIDE=mirrored npx vitest run tests/fleetAirCalibrationBattle.test.ts --maxWorkers=1
FLEET_AIR_CALIBRATION=1 PROTOTYPE_SEED_OFFSET=211 FLEET_CALIBRATION_LABEL_SWAP=1 npx vitest run tests/fleetAirCalibrationBattle.test.ts --maxWorkers=1
PROTOTYPE_BATTLE_SMOKE=1 npx vitest run tests/prototypeBattleSmoke.test.ts --maxWorkers=1
npm run build
node scripts/qa/multi-contact-regression.mjs
```

Server-only evidence is under .qa/air-weather-20261014/: accepted-default,
accepted-mirrored, accepted-label-swap, accepted-regular, accepted-balance,
accepted-prototype, accepted-build and accepted-browser logs. Older exploratory
and pre-orbit-fix logs are not acceptance results. Exact-source checks are in
baseline-final.log, maneuver-label-exact.log and host-baseline.log.

## Remaining work

1. A sunk aviation controller does not transfer its squadrons to a living ally.
   Returning aircraft can remain ready because there is no authorized controller,
   not because rearming is stuck.
2. LAN aircraft replication still uses its older visibility filter; this round
   verifies authoritative targeting, not complete client-side aircraft hiding.
3. Anti-aircraft damage still does not independently test terrain occlusion.
   Optical concealment is not yet a guarantee of protection from AA.
4. Runtime weather changes may retain a ship optical cache until the next
   2.5-second sample. Fixed starting weather is covered here.
5. More geographic seeds, human difficulty and non-timeout endings remain
   balance work. Real Surface/mobile rendering and physical two-PC LAN
   acceptance are separate from these server checks.

All sources, evidence and build output stay on the server. Package remains
0.7.9; material-B stays isolated. No art/assets change, Windows delivery,
local download, main merge, tag or persistent preview service.
