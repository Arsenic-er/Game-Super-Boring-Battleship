# Developer AI decision diagnostics — 2026-10-20

## Scope

Expose the selected ship's navigation plan, main-gun intent and pre-command
mount readiness in the existing developer panel. Keep the normal battle HUD
unchanged. Provide Simplified/Traditional Chinese, English, Japanese, Spanish,
German and Russian labels. Legacy missing fields display unknown, not a
fabricated clear path or successful firing state.

Navigation is a detached snapshot of the last actual half-second planning pass.
Repeated reads do not query terrain or advance planning. A cache-period urgent
interrupt can clear the internal exit commitment while the displayed snapshot
still describes the previous plan; its label explicitly says "last plan".
Only reorientation snapshots include forward-corridor and held-exit facts.

Gunnery explanations reuse existing decision facts. They distinguish selected
torpedoes, withdrawal concealment, smoke, cover, absent local tracking, range,
arc, salvo window, missing/disabled guns and reloading. Hardware readiness is
sampled before movement, ammo-command application and actual firing. Thus a
fire request may coexist with reloading or disabled guns and does not prove a
shell was spawned. Reload time is the existing earliest legal healthy mount
timer, not a new health-scaled estimate. Missing eligible mounts have no ETA.

No movement, sensor, damage, accuracy, firing-policy, scoring or duration change.
LAN snapshots continue omitting all AI decision information; client commands
cannot inject it. The account/profile format is unchanged. Nested simulation
and diagnostic copies isolate the new objects and reason arrays.

## Two original cases, diagnosed before editing

Seed offset 211, paired 7v7 fleet-support calibration:

| Case, final 300 s | Same-frame finding | Conclusion |
| --- | --- | --- |
| Default sea-fog, a5 Richelieu | Zero movement; reorientation throughout; 347.06 m actual-bow corridor blocked 153–173 m ahead; zero local tracking | Long conservative coastal turn, not fire refusal or an arrival-throttle bug |
| Mirrored clear, b2 Cleveland | 29.067 s tracking, all during damaged concealment withdrawal; 7.183 s also in range and salvo window; no fire intent | Existing withdrawal suppression, not broken guns or reload |

For a5 the upstream objective throttle is .88, not zero; navigation alone
limits it to zero. Two friendly-avoidance intervals total 42.483 s. The bow
turns a net 45.934 degrees; no held exit or boundary override is responsible.
At the first sampled pose, a nearer 40–45 degree short exit is clear for
347 m but meets the same shoal within 428–507 m along a 1 km ray. The selected
farther heading is clear over that longer horizon. No nearest-exit shortcut
was implemented. The retained reverse-start timer does not identify when
reorientation began; the trace starts at 900 s with it already active.

For b2, hull health is 2.636–12.072% during the tracked interval; healthy loaded
mounts are available. At 1096.967 s it reaches the 31% withdrawal threshold,
clears retreat/cover, then has no local track for the remaining 103.033 s.
This does not justify removing concealment policy.

Passive pre-edit replay hashes match the prior ordinary sessions:
- a5: `99b6a3c3f4b7930d44e92589aae7327fc7f81afbd1dfe7151e6b2ecf43b3eb6c`
- b2: `e49dfb055f2986b9e003a1b19d1c43acd3b6cb18435dcd2164a5da7252547871`

The prolonged safe-turn case remains open. Explaining it does not make its
pacing acceptable or establish fleet-wide engagement acceptance.

## Verification

- 2,020 regular tests pass, including eight balance-lab tests and 31 new
  diagnostics regressions (eight navigation, twelve gunnery/isolation/network,
  eleven formatting/localization). Eleven opt-in tests are skipped, not counted
  as passing; the two balance-report entrypoints are excluded.
- Six explicit prototype checks pass, including actual 5v5/7v7 sessions and a
  complete 1,200-second no-input clock control. Production build passes; the
  existing large-bundle warning remains.
- Thirteen isolated Chromium checks exercise the real developer panel with
  synthetic telemetry: selected entity changes, seven-language switching,
  missing-field fallback, intent versus readiness and hidden-panel behavior.
  This is UI fixture verification, not physical AI or device performance proof.
  Eleven existing real-main/render-loop contact checks also pass, zero errors.
- Two old/new full 7v7 fleet-support pairs use exact c78d12b controller/navigation
  loaded in memory, without replacing the checkout. The pre-change baseline
  terminal hashes also match the earlier ordinary sessions. Only the two new
  nested telemetry fields are omitted from command/state comparisons; older
  AI decisions, perception, RNG and all other state remain included.

| Pair | Commands per version | Commands, 19 checkpoints, 21 terminal fields and canonical JSON |
| --- | ---: | --- |
| Default / sea-fog | 605,290 | Identical |
| Mirrored / clear | 704,521 | Identical |

Both versions complete 72,000 steps and settle normally at 1,200 seconds in
each pair. The normalized terminal hashes equal the pre-edit hashes above.
Raw candidate hashes differ because they include the new telemetry; they are
not claimed identical. Source manifests are stable throughout each run.

In the candidate mirrored run, all 1,744 late tracking frames for b2 explicitly
report withdrawal plus cover and no main-gun request. The other 16,256 frames
report no stable local track. These counts use the new live diagnostics, not
the synthetic UI fixture. The default candidate was already running when
extra diagnostic counters were requested, so it was not repeated merely to
collect them. This bounded parity evidence does not prove universal behavior
or performance equivalence across all possible states.

## Evidence and delivery

Ignored server evidence: `.qa/reengagement-followup-20261020/`.
Navigation/firing traces, parity scripts/manifests and browser screenshots stay
there; only source, tests and this condensed record enter Git. Independent
review found no gameplay/RNG/replication regression within this scope.

Assets are unchanged. No main merge, tag, version bump or local download.
Temporary browser services are closed. Surface/mobile FPS, native Windows and
physical two-PC LAN validation remain outstanding.
