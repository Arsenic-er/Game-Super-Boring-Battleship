# AI ammunition commitment — 2026-10-20

## Accepted scope

AI ships finish a requested ammunition change and use the newly loaded
ammunition before considering another automatic change. A real main-gun
shot acknowledges use; an intent rejected by reload, damage or geometry
does not. The AI follows actual loaded/pending state, including external
changes and a fresh controller taking over an already loaded ship.

This changes only RuleBasedAi. Player Q controls, ammunition-switch/reload
simulation, damage, gun traverse, fire authorization, contact requirements,
salvo-window probabilities and decision cadence are unchanged. The existing
ammunition-decision RNG draw is retained even while switching is deferred.
The accepted twenty-minute limit and normal score settlement remain.

## Same-frame diagnosis

Baseline 9fe66e6, seed 0x71701 + 211, default 7v7 rain-squall:
Richelieu calibration-a-5 was alive but fired no shells in the final 300
seconds. Passive instrumentation records all 18,000 frames in that window.
The real command and telemetry agree on 1,267 fire frames (21.1167 seconds).
Every one is rejected because both mounts are still reloading; none is
rejected for range, structural arc or gun health.

The instrumented final canonical state exactly matches the original:
26dfe554137f953c32030cde12298b0b9f3c8093d2d60c3d2432ed81b24014e5.
The observer does not add perception/RNG calls or alter commands/state.

| Match time | Actual event |
| --- | --- |
| 1105.02–1126.15 s | Tracking with loaded guns and valid arcs, but no natural salvo window |
| 1126.15 s | AI requests HE to AP; current reload duration is about 43.105 s |
| 1169.25 s | AP finishes loading |
| 1170.40 s | Only 1.15 s later, AI starts changing back to HE |
| 1173.58 s | A natural fire window opens during the new reload |
| 1193.05 s | AI requests loaded AP, cancelling pending HE but retaining about 20.44 s reload |
| 1200 s | Normal score settlement; no late shells |

The AI reevaluated ammunition every 18–26 seconds while this battleship
needed over forty seconds to switch. Its choices could consume legitimate
firing windows. The earlier ready-but-no-window interval is not itself a
defect; this fix does not force a salvo or bypass aim uncertainty.

## Counterexamples and boundaries

Twelve tests in tests/aiAmmoCommitment.test.ts pass on the candidate. Loading
the exact old controller from 9fe66e6 through a test-only override makes all
twelve fail behavioral assertions, not missing APIs or timeouts.

Four primary cases cover both teams and separate range/aspect changes.
Public contact stimuli deliberately alternate at twenty-second intervals;
these are isolated policy tests, not physically reconstructed enemy paths
or a complete optical-perception replay. Complete AI commands, including
movement, go through the real simulation. Private AI timers, fire flags,
reload completion and ammunition counts are not injected.

| Per 120-second primary case | Old | New |
| --- | ---: | ---: |
| Actual main-gun shells | 0 | 16 |
| First AP change request | 7.52 s | 7.52 s |
| First actual AP shot | None | 60.47 s |
| Cancelled incomplete changes | 3 | 0 |
| Tracking duration | 112.48 s | 112.48 s |
| Fire-intent duration | 21.10 s | 21.10 s |

The forty-second weapon reload is unchanged. Further tests cover no contact,
target replacement, invalid arc, disabled guns with real fire intent but no
shells, a partial old-HE volley during pending AP, actual AP firing in the
same frame the change completes, and actual human commands/new-controller
synchronization. A public reloadMultiplier of 1.2 exercises a genuine
48-second switch, not the shop/equipment-installation workflow. The takeover
test does not claim full LocalBattleSession controller lifecycle coverage.

## Adjacent limitation

Ammunition is global to the ship but reload timers are per mount. Existing
simulation can let an early-ready mount fire old ammunition while another
is still loading, delaying the moment when all mounts are ready to commit
the new type. Keeping a pending choice may prolong this existing behavior.
It does not disable old-ammunition firing and is not the all-zero-shell
failure fixed here. The AI refreshes its pending-shot baseline so those
old shots cannot falsely acknowledge the new ammunition. This change does
not claim that every staggered-mount switch completes promptly; that needs
a separate simulation/player-facing design and regression.

## Full-battle comparison

Twelve paired 5v5/7v7 clear/rain/fog sessions at seed offset 211 retain
identical initial surface and air manifests. All 144 ship appearances fire
main guns. Main-gun shells increase from 17,716 to 18,825; final-300-second
silent survivors decrease from sixteen to nine, but individual cases regress.

| Spawn | Fleet | Weather | Old late silent survivors | New | Old shells | New |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Default | 5v5 | Clear | 0 | 0 | 1426 | 1600 |
| Default | 5v5 | Rain | 0 | 2 | 1356 | 1348 |
| Default | 5v5 | Fog | 1 | 0 | 1087 | 1177 |
| Default | 7v7 | Clear | 0 | 0 | 2195 | 2112 |
| Default | 7v7 | Rain | 3 | 1 | 1481 | 1955 |
| Default | 7v7 | Fog | 4 | 1 | 1224 | 1482 |
| Mirrored | 5v5 | Clear | 3 | 0 | 1378 | 1494 |
| Mirrored | 5v5 | Rain | 0 | 0 | 877 | 1042 |
| Mirrored | 5v5 | Fog | 0 | 0 | 1081 | 1033 |
| Mirrored | 7v7 | Clear | 0 | 1 | 2562 | 2398 |
| Mirrored | 7v7 | Rain | 0 | 3 | 1619 | 1510 |
| Mirrored | 7v7 | Fog | 5 | 1 | 1430 | 1674 |

Eleven sessions end normally by score at 1,200 seconds; mirrored 5v5 rain
ends by destruction at 1,138.98 seconds. These are accepted outcomes, not a
target to optimize away. Maximum continuous grounding remains 0.05 seconds.
Six team-label controls match exact normalized complete-state hashes.

The candidate's passive 7/default/rain replay exactly matches its ordinary
uninstrumented final state:
b258ea2bb1095c9e5e2f0e2b6b726d6674cb0653e9b9ce86b36b3417b1b7c050.
However, the originally diagnosed Richelieu now sinks around 805.27 seconds,
so there are no candidate frames for it after 900 seconds. Its overall
main-gun shells change from eighty to seventy-two. The full-battle result
cannot demonstrate that exact original late sequence being repaired; the
controlled old/new regressions establish the policy correction. The changed
battle has 1,955 versus 1,481 total shells, and 183 versus thirty after
900 seconds, with different survival, positions and damage. These totals
are not proof of overall tactical balance or causation for every ship.

## Remaining participation work

The sixteen-to-nine silent-survivor change contains seven additions, two
retained cases and fourteen removals. Four removed ships sink in the new
battle; ten still survive and fire during its late window. Of the seven
additions, six survive in both versions and one is a new survivor. None of
the nine records main-gun-disabled time in the final window.

Some additions are damaged ships withdrawing without local contact:
5/default/rain Edinburgh a3 starts the window at roughly 3% hull;
7/mirrored/clear Bismarck b6 withdraws for 239.47 seconds. The newly surviving
7/mirrored/fog Edinburgh b4 withdraws for 232.24 seconds, tracks for 9.98
seconds and requests fire for only 0.02 seconds. These facts do not establish
the exact cause of every non-shot.

More concerning are healthy navigation/contact cases:
- 5/default/rain Richelieu a4 tracks for 159.51 seconds but has no fire
  intent. The 900/1,050-second snapshots share a position; it moves only
  about 48 m by the final snapshot, where both structural arcs are blocked.
- 7/mirrored/rain Richelieu b5 tracks for 104.15 seconds with no fire intent.
  All three snapshots share a position; the locally tracked 900/1,200-second
  snapshots have both structural arcs blocked.
- In that same battle, healthy a5 Richelieu and a6 Bismarck have no local
  contact; a6's final two snapshots are stationary at the same position.
- Retained 7/default/rain Richelieu b5 is fully healthy with both guns
  ready, but stationary at all three snapshots with radio/searching only.
  Retained 7/default/fog b5 instead moves and reverses without local contact.

Sparse snapshots do not prove that every tracked frame has blocked arcs.
Next isolate real same-frame navigation, terrain constraints, local contact
and structural firing arcs for the two tracking-without-intent Richelieus;
separately investigate radio-guided search stopping. Do not authorize shots
from radio reports or remove terrain safety to conceal the issue.

Four independent seed-offset-zero fog sessions also pass: no never-fired
main batteries, zero/zero/one/two late silent survivors in default 5v5/7v7
and mirrored 5v5/7v7, and no continuous grounding over 0.05 seconds. This
bounded sample is not acceptance of general balance, all navigation or
physical low-end-device performance.

## Verification and delivery

Final checks pass 1,954 regular tests (thirteen opt-in skips), eight isolated
balance tests, six prototype checks, twenty-two full fleet sessions, production
build and eleven actual-main browser checks. The twelve new tests and
ninety-nine targeted existing weapon/reacquisition tests are subsets of the
regular suite, not additional test counts. No timeouts/assertions were relaxed.
Browser errors are zero and the temporary preview is closed. The existing
over-500-kB bundle warning remains. These checks do not establish physical
Surface/mobile frame rates or two-computer LAN behavior.

Production change: src/controllers/ruleBasedAi.ts only. Tests and concise
records are tracked; raw diagnostic evidence remains server-only under
.qa/fire-intent-20261020. summary.json and frames.jsonl preserve the original
passive trace; candidate-* preserves the changed battle separately.
ammo-final.log, ammo-final-old-red.log and ammo-types-final.log preserve the
focused green/red/type checks. final-211-* and final-0-fog-* plus
comparison-summary.json cover the full matrix; regular-final.log,
balance-final.log, prototype-final.log, build.log and browser.log cover the
remaining final checks.

Publication is on codex/v072-historical-models only. Assets are unchanged;
no main merge, tag, version bump or local download. Code, builds, logs and
evidence stay on the designated server.
