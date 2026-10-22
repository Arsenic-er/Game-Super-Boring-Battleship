# Condensed Development Status

Last updated: 2026-10-23

This is the current operational handoff. Product decisions are preserved in
`CONVERSATION_SUMMARY.md`; milestone history is preserved in `DEVELOPMENT_LOG.md`.
Do not store raw sub-agent transcripts, temporary patches, duplicate source trees,
credentials, caches or generated builds in the repositories.

## Source of truth

- Active server: GPU-821560, `ubuntu@100.64.214.54` over Tailscale; public IPv4
  `150.65.181.212`. Local SSH alias: `gpu-821560-ts`.
- Recovery checkpoint: `SERVER_RECOVERY_2026-10-01.md`. Both repositories were
  restored from `backup-2026-09-17` and every tracked file matched its recorded hash.
- GPU-273312 and its nested worktree paths are retired; do not reconnect there.
- Game project: `/home/ubuntu/battleship`
- Asset project: `/home/ubuntu/battleship-assets`
- Active checkout: `/home/ubuntu/battleship` (no nested worktree on this server).
- Project-local runtime: `export PATH="$HOME/battleship/.tools/node/bin:$PATH"`.
- Active branch: `codex/v072-historical-models`; recovery baseline `2a6c473`.
- Game repository: `Arsenic-er/Game-Super-Boring-Battleship`
- Asset repository: `Arsenic-er/Game-Super-Boring-Battleship-Assets`
- Stack: TypeScript 7, Babylon.js 9, Vite 8, Vitest 4, Electron
- Server preview service: disabled; LAN validation uses packaged desktop instances.

The Windows workspace is a remote-control endpoint only. As of 2026-10-03, all
development, builds, tests and artifacts stay on the server. Do not create local
staging or download packages/source/logs without fresh explicit consent. See
`AGENTS.md`; this overrides the older automatic local-delivery workflow.

## Current battle duration decision — recorded 2026-10-20

The owner accepts twenty-minute battles. Keep the existing 1,200-second limit;
reaching it and resolving by score is a normal outcome, not a failed match.
Do not increase damage, scoring speed or forced pressure merely to reduce time
endings. Earlier goals for at least 70% non-timeout outcomes are superseded.
Improve useful activity instead: safe shoal recovery, meaningful navigation,
contact reacquisition and valid opportunities to engage. Legitimate concealment,
withdrawal, repair and reloading are not automatically inactivity defects.

## Latest working changes — 2026-10-23: explicit recovery; long-run gate still fails

- Add an opt-in arrest/settle/retreat/low-speed-turn/rejoin controller.
  The six-second steering-brake stage now advances by executed time and
  cannot be extended by replanning. Recovery waits for actual speed and
  rudder to settle, checks a complete astern/turn-and-stop proposal, then
  freshly confirms every applied tick.
- Ordinary tiny helm-tracking changes no longer starve queued recovery.
  External astern orders and emergencies keep priority. Material state
  changes, unexpected motion, non-60 Hz steps and budget exhaustion reject
  the old sequence. Failed/exhausted recovery is not recorded as success.
- The neutral-lock real-session fixture now moves 86.92 m in sixty seconds,
  with 21.26 m net displacement, no full-hull contact in that interval and
  41.91 m actual travel in its last thirty seconds. It is still in recovery,
  not back under ordinary navigation.
- Do NOT enable this experiment in normal gameplay: both strict 240-second
  fixtures fail. Neutral-lock first contacts terrain at 125.47 s after the
  recovery deadline hands back to old navigation. The damaged 565 s approach
  contacts at 8.05 s because natural repairs repeatedly invalidate its
  frozen-parameter recovery. Neither run completes a verified rejoin.
- Keep the original sixty-second script and its thresholds. Add the stronger
  scripts/qa/coastal-recovery-acceptance.mjs opt-in gate, including real
  post-step displacement and swept/full-body contact checks. A failing
  laboratory gate returns failure; it is not counted as a passing unit test.
- Final regular suite: 2,275 passes, including sixteen new recovery tests;
  eleven existing opt-in tests skipped. Build and independent review pass.
  The strict 240 s activation gate remains failed, with matching source hashes.
- Next address safe continuation during repair and bounded recovery failure
  handoff, then repeat long-run and natural fleet acceptance. Do not enable
  full-hull collision resolution independently of those navigation fixes.
  See acceptance/coastal-recovery-2026-10-23.md.
- Default single-player/LAN behavior, main 8ef5b84, assets 4e4d587, version/tag,
  twenty-minute limit and disabled preview state remain unchanged. No download.

## Previous checkpoint — 2026-10-23: budgeted planning; activation rejected

- Physical maneuver checks are now resumable at every motion or geometry work
  item. Ten prior complete-result fixtures match across three slice schedules.
- Add an instance-local round-robin scheduler with shared per-tick ceilings,
  fresh current-pose confirmation, bounded queues and lifecycle cancellation.
  The experimental guard considers actual final helm/throttle and braking
  tails; it is available only through explicit source-level laboratory opt-in.
- Do NOT enable the guard in ordinary gameplay. The 565 s approach brakes
  before contact, but a different real-session Edinburgh pose remains parked
  for sixty seconds (.05 m travel), and longer approaches still cycle throttle.
  Fourteen near-coast ships consume 7.67–7.84 ms at the server 95th percentile,
  with 974/1,000 frames exhausting the geometry budget. Low-end performance
  remains unverified; activation is rejected.
- Reproduce the unmet gate with:
  node scripts/qa/coastal-maneuver-acceptance.mjs --experimental-terrain-maneuvers
  It deliberately retains a failing useful-movement assertion; no expected-fail
  or skipped test is counted as gameplay acceptance.
- 2,259 regular tests, including 87 new regressions, pass; build, six
  explicit prototype checks and eleven browser checks pass.
  All twelve full default fleet sessions retain identical terminal states and
  navigation metrics versus bd508ef, with zero experimental prediction work.
  The centre-only collision gap and three old rain late-stops remain open.
- Next: explicit checked escape/recovery handoff, stable throttle decisions and
  lower sustained planning cost, then repeat the natural-session gates.
  See acceptance/incremental-coastal-planning-2026-10-23.md.
- Development branch only; main 8ef5b84 and assets 4e4d587 unchanged.
  Twenty-minute limit, version/tag, local delivery and preview state unchanged.

## Previous checkpoint — 2026-10-23: exact prospective maneuver checks

- Live movement now shares an extracted propulsion/helm kernel with unchanged
  arithmetic. New snapshot-only checks integrate actual final throttle/rudder
  commands at 60 Hz and can verify the complete neutral-control braking tail.
- Whole-hull half-second envelopes include every intermediate pose; ambiguous
  batches refine into individual sweeps. Explicit motion/geometry limits
  return incomplete rather than approving an untested suffix.
- Reproduced the rejected natural Edinburgh approach: at 565 s it can stop
  safely in 7.4667 s, while holding its order collides after 8 s; at 570 s even
  immediate braking collides. This is a verified pre-contact planning window.
- New AI order selection and full-hull physical collision remain disabled.
  The centre-only collision gap and three known late-stop rain cases remain.
  Fourteen-ship/three-candidate synchronous batches reached 122.42 ms on the
  server; next integrate near-coast activation, staggered candidate work and
  safe neutral-helm/astern alternatives after final tactical controls.
- 2,172 regular tests, six prototype checks, build and eleven browser checks pass. All twelve full
  fleet terminal hashes/navigation metrics match 3e98d41 exactly; 63 new
  tests cover parity, physical trajectories, budgets and batch refinement.
- See acceptance/physical-maneuver-prediction-2026-10-23.md. No engine, rudder,
  weapon, sensor or twenty-minute-limit changes. Development branch only;
  main remains 8ef5b84, assets remain 4e4d587, no local download or preview.

## Previous checkpoint — 2026-10-23: shared hull geometry; integration withheld

- Add the existing .48L/.55B collision OBB as a shared geometry source, plus
  conservative full-body terrain/motion query helpers and thirty regressions.
  Ship/ship projection reuses the same dimensions without changing its math.
- Full-body terrain resolution and the new AI stern guard are NOT enabled.
  Their experimental integration produced twenty assertion failures and two
  concurrent-QA timeouts; three of twelve natural fleet cases failed the
  grounding gate, with continuous grounding up to 768.78 s. No old test or
  threshold was weakened to accept that result.
- Preserve the complete rejected patch, source hashes and replays on the
  server. The playable terrain/AI logic is restored to ef52dcd. Existing
  centre-only collision gaps and the three known rain late-stops remain open.
- Next: validate whole-hull forward/reverse turning trajectories during route
  selection, then reconnect physics and recovery together. Terminal rejection
  alone is not navigation. Keep propulsion, rudder, sensors and twenty-minute
  endings unchanged.
- 2,109 regular tests, six prototype checks, build and eleven browser checks
  pass. Twelve final full-session terminal states and navigation metrics match
  ef52dcd exactly; this confirms no new gameplay behaviour, not AI acceptance.
- See acceptance/hull-geometry-foundation-2026-10-23.md. Development remains
  on codex/v072-historical-models; main stays 8ef5b84, assets unchanged.

## Previous checkpoint — 2026-10-22: preserve useful recovery turns

- A blocked low-speed candidate reversal can retain an earlier still-safe exit
  after at least 20 degrees of continuous same-direction physical turn. Normal
  slow turns only record history; they do not lock a heading. Emergencies,
  discontinuity and unsafe corridors invalidate the added state.
- History-derived commitments revalidate a padded 1 km corridor on every real
  replan, including after position changes. Ordinary commitments keep their
  existing rules. Fifteen new regressions include a real atoll case where the
  near corridor is clear but a shoal lies farther ahead.
- One bounded production-physics fixture releases and continues for 30 s /
  160 m with scripted route inputs. In the actual rain Edinburgh replay the
  wrong left turn is avoided and detected bow overlap clears, but translation
  remains zero by the twenty-minute ending. Do not call this complete escape.
- Twelve final full-session comparisons retain all 144 main-gun participants,
  the same six late-silent survivors and the same three rain late-stop cases.
  Ten terminal states match; two battles change through coupled navigation,
  contact and damage. No general AI-readiness approval is made.
- 2,079 regular tests, six explicit prototype checks, build and eleven browser
  checks pass; eleven opt-in suite cases remain skipped. See
  acceptance/ai-recovery-turn-continuity-2026-10-22.md.
- Next: unify terrain constraints with actual hull geometry and safe turn
  trajectories. Current centre-only terrain sweeps miss bow overlap, do not
  roll back heading, and run before ship/ship displacement. These remain
  separate open physics/navigation work; no collision margin or rudder buff.
- Development stays on `codex/v072-historical-models`; main remains `8ef5b84`.
  Assets, version/tag and local delivery are unchanged; no persistent preview.

## Previous checkpoint — 2026-10-21: main synchronized; withdrawal interruption contract

- On the owner's request, fast-forwarded and pushed `main` from `e5f6bd7`
  to `8ef5b84` (34 commits). No branch was deleted or history rewritten.
  Continued work stays on `codex/v072-historical-models`; this is a checkpoint,
  not a stable-release or whole-AI acceptance declaration.
- Persistent damage no longer repeatedly invalidates recovery. Entry into
  withdrawal and a changed/expired/acquired known threat invalidate once;
  collision and reacted-to torpedo threats retain continuous priority.
  Same-target optical-to-memory continuity does not reset the recovery.
- Twelve new regression cases cover the controller event contract and a
  one-shot interruption during the navigation cache. Regular suite: 2,064
  passes, eleven opt-in skips; six explicit prototype checks, build and eleven
  browser checks pass. Temporary browser service is closed.
- All twelve complete 5v5/7v7 clear/rain/fog replays match the `8ef5b84`
  canonical terminal state and recorded navigation metrics. The same 144
  ship appearances fire 20,052 main-gun shells. This provides no evidence of
  improved coastal movement: all three known rain late-stop cases remain.
- Exact damaged-Edinburgh tracing reduces last-300-second interruptions from
  18,000 frames to fifteen real target switches, but retains zero travel,
  zero committed exits and identical controls/physics in all 18,000 frames.
  Do not describe the contract repair as a successful unsticking fix.
- A separate healthy-Edinburgh trace loses an earlier still-safe exit after
  52.17 degrees of right-turn progress and commits to a large left turn.
  Its bow corners also overlap a shallow shoal despite a deep-water centre.
  Next: preserve useful turn progress while revalidating real escape corridors,
  and validate full-hull swept clearance. Neither issue is fixed here.
- See acceptance/ai-withdrawal-recovery-2026-10-21.md. Twenty-minute endings,
  propulsion, rudder, damage, weapons, sensors and reverse caps are unchanged.
  No asset, version/tag, native-device acceptance or local download changes.

## Previous checkpoint — 2026-10-21: physical braking consistency, navigation acceptance open

- Terrain lookahead and objective approach now share the real positive-headway
  zero-throttle estimate, including engine damage and acceleration equipment.
  The weak-engine Yamato counterexample is 246.42 m, not the old 56.12 m.
  Infinite stopping distance cannot authorize positive navigation thrust;
  actual inertia remains in the simulation.
- No propulsion/rudder, weapons, sensor, scoring, reverse-recovery or duration
  rule changed. Experimental astern-turn and forward-creep plans are not
  shipped. The 240 s reverse cap and all existing test thresholds remain.
- Verification: 2,052 regular tests, six explicit prototype checks, build and
  eleven browser checks pass. Twelve full fleet-support sessions meet basic
  battle gates; 144/144 ship appearances fire main guns. Five exact old-version
  scenarios provide comparison evidence. See
  acceptance/ai-braking-consistency-2026-10-21.md.
- This is NOT overall AI acceptance: fog a5 resumes 2.3 km of late travel, but
  three rain-case survivors remain stationary in blocked reorientation.
  Default 5v5 a3 is a new late-stop outcome versus the same surviving old
  window; another old comparator had already sunk and one ends later.
  Working engines/rudders do not justify dismissing these as damage-only.
- Next: reproduce those rain navigation failures, then integrate safe turn
  trajectories and complete hull-sweep checks with existing fleet priorities.
  Centre-line collision and bounded heading rays are not sufficient proof.
  Keep twenty-minute endings normal. This checkpoint entered main on the
  owner's subsequent request; see the latest section. No stable release,
  asset/version/tag or local delivery was made at this checkpoint.

## Previous checkpoint — 2026-10-20: developer AI decision diagnostics

- The developer panel now explains the selected ship's last navigation plan,
  main-gun intent and pre-command mount readiness in all seven languages.
  Normal battle HUD and gameplay rules are unchanged. A fire request is not
  a successful shot; reload and disabled-gun restrictions can coexist with it.
- Missing legacy telemetry stays unknown. Navigation snapshots retain the
  existing half-second planning cadence; reading them never plans or queries
  terrain. Nested snapshots are detached, and LAN replication still omits AI
  policy information rather than disclosing enemy decisions.
- Exact passive replays close two firing-cause questions: fog a5 has no local
  contact and a blocked 347 m bow corridor while turning; clear b2 deliberately
  suppresses fire throughout its damaged tracking interval. The former's slow
  coastal maneuver remains an unresolved pacing issue, not a new oscillation.
  A nearer short-corridor exit meets the same shoal farther ahead and is not
  accepted as a safe shortcut.
- Verification: 2,020 regular tests, six prototype checks and build pass;
  thirteen developer-panel and eleven existing render-loop browser checks pass.
  Both full 7v7 old/new pairs have identical normalized commands and terminal
  states, retaining all older AI/perception data. Evidence is recorded in
  acceptance/ai-decision-diagnostics-2026-10-20.md.
- Next: improve long coastal maneuvers using physically safe route continuity,
  with full-session evidence; do not relax hull clearance or grant radio fire.
  Twenty-minute score endings remain normal. No assets/main/tag/version/local
  delivery changes; native Windows, physical LAN and device FPS remain untested.

## Previous checkpoint — 2026-10-20: blocked recovery heading stabilization

- A verified exit is retained only after an adjacent, low-speed, blocked-bow
  candidate reversal. Moving recovery and stable slow turns do not start a
  commitment. Unsafe corridors, boundaries, new reverse, completion and
  collision/torpedo/damage emergencies invalidate it; physics is unchanged.
- Nineteen navigation and eight priority regressions pass. Six natural
  reconstructions release after 366–503 seconds, then move normally for
  thirty seconds with zero grounding. Exact old navigation never releases
  in the same final 600-second observation; no existing tests were relaxed.
- The originally stationary b5's complete replay matches the ordinary
  candidate hash. Its final-five-minute helm reversals fall 32→0 and travel
  rises 0→641 m; sixteen actual shells follow valid new local contacts.
  Another late reverse remains, so this is not general navigation acceptance.
- Twelve paired battles retain firing from all 144 ship appearances; shells
  change 18,825→19,005 but late silent survivors worsen 9→14. Ten identities
  are newly silent, including five previously sunk. Eight new cases lack
  local contact; damaged weapons/rudders explain some, not all. Do not mark
  fleet-wide engagement accepted or disguise this result with aggregate shots.
- Next: same-frame evidence for healthy stationary/slow-turning a5 in
  7/default/fog and intermittently tracking, withdrawing b2 in
  7/mirrored/clear. Do not grant radio-only firing or bypass coastal clearance.
- Verification: 1,989 suite tests (including eight balance-lab), six prototype
  checks, twenty-two full fleet sessions, build and eleven browser checks pass.
  Six label controls match canonical hashes; temporary preview closed.
- Source/tests/records only; assets/main/tag/version/local delivery unchanged.
  See acceptance/ai-recovery-heading-2026-10-20.md. Surface/mobile FPS and
  physical two-PC LAN testing remain outstanding.

## Previous checkpoint — 2026-10-20: AI ammunition commitment

- Same-frame tracing establishes the rain Richelieu's late firing failure:
  all 1,267 fire requests hit two reloading mounts. It loaded AP, chose HE
  again 1.15 seconds later and consumed the next natural firing window.
  Passive tracing reproduces the baseline final state exactly.
- AI now follows real loaded/pending ammunition, finishes a change and
  acknowledges it only after a real main-gun shot before reconsidering.
  Old-ammo partial volleys while pending do not falsely acknowledge new ammo.
  Human commands and new controllers synchronize with actual state.
- Twelve regressions pass and the exact old controller fails all twelve.
  Four controlled public-contact cases change from zero to sixteen shells
  in 120 seconds with identical tracking/fire-intent durations and unchanged
  forty-second reload. These are not full optical replay or shop-flow tests.
- Twelve paired full sessions retain zero never-fired ships out of 144.
  Late silent survivors change 16→9 and shells 17,716→18,825, with local
  regressions: seven new silent survivors, two retained and fourteen removed.
  Four removals sink; ten survive and fire. Healthy stationary tracking/
  radio-search cases remain open, not dismissed as survival bias.
- Six label controls match complete normalized hashes; four independent fog
  sessions pass. Eleven primary matches settle normally at twenty minutes,
  one ends by destruction; maximum continuous grounding remains 0.05 s.
  The diagnosed ship sinks earlier in the changed battle, so the controlled
  regressions—not its missing late trace—establish the actual policy repair.
- Existing per-mount reload/global ammo interaction can delay a staggered
  switch while old shells still fire. No claim that all switches now finish
  promptly. Player controls, damage, optics, salvo randomness, terrain
  rules, score and match duration are unchanged.
- Verification: 1,954 regular tests, eight isolated balance tests, six
  prototype checks, twenty-two complete sessions, build and eleven browser
  checks pass. Temporary preview closed; large-bundle warning unchanged.
- Next: same-frame terrain/navigation/firing-arc evidence for 5/default/rain
  Richelieu a4 and 7/mirrored/rain b5, plus radio-search stopping; do not
  grant firing authority from radio or remove safety constraints.
- Server-only; assets/main/tag/version/local delivery unchanged. Evidence:
  acceptance/ai-ammo-commitment-2026-10-20.md. Surface/mobile FPS and physical
  two-PC LAN testing remain outstanding.

## Previous checkpoint — 2026-10-20: bounded battleship shoal recovery

- Battleships retain verified reverse steering until there is sufficient exit
  space instead of handing off after a fixed short retreat. Existing engine,
  stern-clearance, boundary and reorientation guards remain; smaller hulls
  keep their previous thresholds. No steering or speed modifiers changed.
- Four real-session counterexamples cover both teams and two headings. The
  longest stationary interval in the first recovery falls from 339/387 s to
  0.20 s; all four then sail normally for sixty seconds and over 300 m.
  The same final assertions fail on the exact old navigation source.
- This is a local recovery correction, not general navigation acceptance.
  The full 480-second fixtures later encounter another coastal segment and
  record a 0.05-second contact. The 240-second handoff threshold applies only
  to an ungrounded initial reverse phase, not the whole recovery state.
- In twelve matched full battles, all 144 ship appearances still fire main
  guns, but final-300-second silent survivors rise from 13 to 16 and shells
  fall from 19,631 to 17,716. Ten normal time endings and two destructions are
  recorded; twenty-minute score settlement is explicitly accepted.
- Six team-label controls match exact normalized hashes; four independent
  fog sessions pass. No maximum continuous grounding exceeds 0.05 seconds.
  Some new silent survivors reflect battle damage or survival changes, but
  healthy reacquisition/engagement gaps remain and are recorded, not dismissed.
- Verification: 1,942 regular tests, eight balance tests, six prototype checks,
  twenty-two full sessions, build and eleven browser checks pass. An initial
  balance fixture hit its existing 10-second wall-clock limit; the unchanged
  eight-test retry passes. No assertions or limits were relaxed. Temporary
  preview closed; large-bundle warning unchanged.
- Next: sample same-frame contact, ammunition/reload, firing arc and rejected
  shot reasons for 7/default/rain Richelieu a5; separately improve later
  coastal navigation. Do not claim a reload bug from sparse snapshots or
  grant fire authorization from radio reports.
- Server-only checkpoint, no assets/main merge/tag/version bump/local delivery.
  Evidence and limits: acceptance/shoal-recovery-2026-10-20.md. Device FPS and
  physical two-PC LAN checks remain outstanding.

## Previous checkpoint — 2026-10-15: capture progress and late battle diagnostics

- Capture duty no longer counts repeated backtracking as progress. Stable
  route identities retain per-route best distances through replanning and
  waypoint advancement; new routes alone grant no extra stall grace.
  History is bounded without eviction; no-substitute recovery retains duty.
- Sixteen coordinator and seven route-identity tests pass. The exact old
  coordinator fails four real-route loop counterexamples by assertion.
- Passive late windows distinguish local acquisition/tracking, gun disability,
  fire intent and tactical phases; at most three detached snapshots expose
  own aim/reload/arcs. Same-time terminal updates do not duplicate counts.
- This is not general pacing acceptance: twelve paired battles retain zero
  never-fired main batteries, but silent final-300-second survivors rise
  from 9 to 13 and shells change from 19,729 to 19,631. Eleven still time out;
  one ends by destruction at 743.38 seconds. Initial manifests match in all
  twelve; six label controls retain exact normalized final hashes.
- Verification: 1,931 regular tests, eight isolated balance tests, six prototype
  checks, twenty-two complete sessions, build and eleven browser checks pass.
  One concurrent regular test hit its 5-second wall-clock limit; the unchanged
  serial suite passes. Temporary preview closed; bundle warning unchanged.
  Evidence: acceptance/capture-progress-2026-10-15.md.
- Next: separately reproduce low-visibility support retreat/firing arcs,
  reverse-to-reorient shoal recovery, and reacquisition/reload behavior.
  Do not remove terrain safety or allow radio contacts to authorize fire.
  Normal 15-20 minute pacing and geographic balance remain open.
- Server-only checkpoint; no assets, local download, Windows delivery, main
  merge, tag, version bump or material-B integration. Physical device FPS and
  two-PC LAN remain outstanding.

## Previous checkpoint — 2026-10-15: weather-aware support participation

- Support stations use public weather and reserve their stopping band in rain
  and fog. Healthy support ships can search bounded legitimate radio/memory
  reports without crossing the capture disk; local acquisition and safety
  priorities remain. No weapon, scoring or player-control changes.
- Runtime weather changes immediately invalidate surface optical samples.
  Legacy observations default to clear weather; hydro and RNG behavior remain.
- Test-only pacing reports separate main-gun shells from all other fire,
  capture from support duty, local contact from estimated opportunities, and
  actual 15/17.5-minute milestones from missing post-terminal ones.
- In twelve same-seed paired cases, zero-main-gun ship appearances fall from
  11 to zero out of 144; final-five-minute silent survivors fall from 25 to nine.
  Initial surface/air manifests match in all cases. Six label-only controls
  retain exact normalized final hashes. Four independent fog cases also pass.
- Final verification: 1,889 regular tests, eight balance tests, six prototype
  checks, twenty-two complete sessions, build and eleven actual-main browser
  checks pass. Temporary preview closed; bundle warning unchanged. Evidence:
  acceptance/weather-support-pacing-2026-10-15.md.
- Pacing is still open: eleven primary cases end at twenty minutes and one
  destruction ends at 743.38 seconds. Normal 15–20 minute duration and >=70%
  non-timeout outcomes are not accepted. North still wins seven of twelve;
  no claim of geographic balance. Next: late-window contact/shot inactivity
  and objective-pressure analysis, keeping radio distinct from optical locks.
- No assets, local download, Windows delivery, main merge, tag or material-B
  integration; package remains 0.7.9. Physical Surface/mobile FPS and two-PC
  LAN remain outstanding.

## Previous checkpoint — 2026-10-14: aircraft command and observation continuity

- A missing, sunk or wrong-team controller yields its surviving aircraft as
  a stable command group to the nearest eligible same-team AI. Human owners
  are not displaced; existing tasks, resources and recovery sources remain.
  Ready aircraft can dispatch immediately under the successor.
- LAN enemy aircraft require recipient-team optical contacts. Stable aircraft
  IDs and original contact timestamps now reach client presentation, map
  selection and server-validated interception. Lost tracks retain observed
  state for five seconds; no hidden live position or controller shortcut.
  Enemy commands remain private and unseen impacts can remain anonymous.
- Client hidden-controller aliases survive array reordering. Enemy interpolation
  never extrapolates beyond the newest observed fix. LAN content fingerprint
  changed, so participants need matching builds; package remains 0.7.9.
- Mountains block continuous AA and flak. Open-sea damage, weapon ranges and
  weather rules retain their previous values.
- All 1,832 regular tests, eight balance tests, six prototype checks, eighteen
  full aviation/weather sessions, build and eleven actual-main browser checks
  pass. Twelve geographic cases include 57 squadron handoffs; six label-only
  controls match exact unrounded normalized final state. Maximum continuous
  grounding is 0.05 s. Temporary preview closed, bundle warning unchanged.
  Evidence: acceptance/air-command-continuity-2026-10-14.md.
- Next: geographic balance and timeout-heavy pacing; all full scenarios still
  reach twenty minutes. Carrier-deck recovery safeguards await actual carrier
  support; current production uses map-edge recovery. Runtime weather changes
  may wait one surface sensor sample. Real Surface/mobile FPS and physical
  two-PC LAN remain outstanding. Opposite-team DOM-map behavior is not accepted
  by the recipient-team data-path tests.
- No assets, local download, Windows delivery, main merge, tag or material-B
  integration. Only concise development/acceptance records are retained in Git.

## Previous checkpoint — 2026-10-14: weather-aware fleet aviation

- Aviation dispatch follows authoritative AI ownership for either team; human
  takeover and explicit squadron orders take priority. Orders and target
  validation sample the same pre-movement ship state. Dead or deleted
  controllers no longer supply ship vision or cause unknown-ship crashes.
- Air-to-surface, ship-to-air and air-to-air optics respect weather visibility.
  Air contacts also respect terrain elevation while preserving friendly
  navigation and the existing five-second historical-contact expiry.
- Patrol/search direction uses a stable squadron ID seed, not team labels.
  A full-session crossover exposed the old bias at 27.333 seconds, beyond the
  original twenty-second regression; the retained session check now runs sixty.
- Finished local and host sessions stop sensor/AI mutation, duplicate effects,
  repeated network snapshots and tick advancement. The actual terminal frame
  remains deliverable once; reset starts clean. The LAN asynchronous-publication
  fixture now tests that real frame rather than depending on duplicate playback.
- Eighteen full weather/aviation sessions pass: twelve geographic cases plus
  six label-only controls. Each control matches the exact unrounded normalized
  final state after 72,000 steps. Both teams launch and attack; maximum continuous
  grounding is 0.05 s. All end at twenty minutes and north wins eight of the
  twelve geographic cases, so map fairness and timeout-heavy pacing remain open.
- All 1,733 regular plus eight balance tests, six prototype checks, build and
  eleven actual-main browser checks pass. Thirteen opt-in cases are skipped in
  the regular invocation. Temporary preview closed; the existing bundle warning
  remains. Evidence: acceptance/weather-air-coordination-2026-10-14.md.
- Next: aircraft command succession after controller loss, LAN aircraft
  visibility and terrain-aware AA, then broader geographic/pacing calibration.
  Runtime weather changes may wait one ship-sensor sample; fixed starting weather
  is covered. Real Surface/mobile FPS and physical two-PC LAN remain outstanding.
  No assets, local download, Windows delivery, main merge, tag or version bump.
  Package stays 0.7.9 and material-B stays isolated.

## Previous checkpoint — 2026-10-14: route-aware capture duties

- Capture assignment now ranks verified full sailing routes, not just straight
  distance. Two station-specific navigators per eligible observer are sampled
  every four seconds, with at most 64 cached observers and no searches inside
  sorting. The existing route planner and ship steering remain unchanged.
- An off-zone duty with sixty seconds of insufficient progress can pass to a
  reachable ally. Progress requires both 20 m of real hull displacement and
  route reduction. Longer replans do not renew the clock; replaced ships receive
  a finite sixty-second retry deprioritization. No-alternative recovery and
  healthy in-zone disabled hulls retain their existing roles.
- Two-ship station assignment respects reachability and preserves valid stations.
  Replacement pairing cannot be undone by re-sorting. Twenty-three coordinator
  tests pass versus nineteen failures on exact old coordinator source; eighteen
  route-distance tests and four actual-session tests also pass. Real sessions
  verify the selected reachable ship captures and a developer-limited slow
  ship hands off without immediately taking the duty back.
- Sixteen full surface cases passed across four seeds per size, 5v5/7v7 and both
  spawn sides. All ships fired, maximum continuous grounding was 0.05 s, and all
  ended at twenty minutes. Two label-reversal controls retain exact normalized
  final-state hashes after 72,000 steps. North/south wins remain 11/5 across the
  paired set before and after; map balance is not accepted as complete.
- All 1,659 regular plus eight balance tests, six original prototype checks,
  production build and eleven actual-main browser checks passed. Seven opt-in
  cases remain skipped in the regular invocation. Temporary preview closed.
- Next: broader weather/aviation calibration and continued geographic-side
  analysis. Real Surface/mobile FPS and physical two-PC LAN acceptance remain
  outstanding. Evidence: acceptance/capture-route-progress-2026-10-14.md.
  No art/assets, local download, Windows package, version bump or release tag;
  package stays 0.7.9 and material-B stays isolated.

## Previous checkpoint — 2026-10-14: multi-ridge visibility and reverse recovery

- Fixed a real one-way terrain visibility leak: concave-island rays now check
  later land intervals, not just the first low lobe. Navigation retains its
  first-shore fast path; 1,500 fixed navigation queries match the old source.
  Twelve geometry and eight real-sensor regressions pass, including reversed
  teams/order and open-sea positive controls.
- Reverse recovery validates actual hull-margin clearance through concave
  shoals before backing up. It selects bounded alternative exit headings and
  uses zero throttle when the current stern cannot clear its stopping path.
  Destroyed engines do not imply instant braking; damaged engines use actual
  braking response. Ten new recovery tests pass against eight old-source failures.
- All eight final 5v5/7v7 clear-weather surface cases passed across offsets
  211/503 and both spawn sides. Every ship fired, maximum continuous grounding
  was 0.05 seconds, and every battle ended at twenty minutes. The two label-only
  controls matched exact normalized full-state hashes after 72,000 steps each.
  Northern fleets still won five of eight, unchanged from the baseline; these
  paired deterministic cases do not establish general map balance.
- All 1,614 regular tests and eight separate balance tests passed, with seven
  opt-in skips in the regular invocation. Six original prototype smoke tests,
  production build and eleven actual-main browser checks passed. The temporary
  browser server closed. These checks do not substitute for real Surface/mobile
  FPS measurements or physical two-PC LAN acceptance.
- Geographic fairness remains open: the coordinator still uses straight-line
  capture-candidate distance, not routed distance or sustained progress.
  A nearer ship can retain a duty while recovering; frozen-state evidence is
  not proof of prolonged real-session starvation. Next: route-aware assignment
  and progress-based handoff, then weather/aviation and human difficulty.
- Evidence: acceptance/terrain-visibility-recovery-2026-10-14.md. No terrain/art
  asset changes, local downloads, Windows package, version bump or release tag.
  Package remains 0.7.9; material-B stays isolated. Physical Surface/mobile FPS
  and two-PC LAN acceptance remain outstanding.

## Previous checkpoint — 2026-10-13: fleet identity/order crossovers

- Friendly formation now chooses the nearest living valid battleship rather
  than the first observation. Exact ties use stable IDs. Collision-risk ties
  prefer the earlier closest approach, then ID; tactical safety priorities,
  weapon statistics and random streams are unchanged.
- Added independent paired-identity and roster-order calibration controls.
  Complete-state tests verify that IDs/order do not accidentally change
  placement, teams, equipment or seeds. A/B remain the original spatial cohorts.
- All 32 full clear-weather surface cases passed across two seeds per size,
  5v5/7v7, both spawn sides, identity assignments and A/B update orders.
  Every ship fired, maximum grounding was 0.05 s, and all ended at twenty minutes.
  Two further label-reversal controls matched exact normalized final-state
  hashes after 72,000 steps each.
- Player/enemy-labelled fleets won 17/15, but northern/southern spawns won
  23/9. These correlated variants do not establish general balance. Next:
  broaden geographic-side route/objective calibration, then weather/aviation
  and human difficulty. Shared simulation RNG and some physics ties remain
  order-sensitive; nearest-anchor hysteresis is also not yet implemented.
- 1,584 regular plus eight balance tests passed, with seven opt-in skips in
  the regular invocation. Original prototype smoke six, production build,
  and eleven actual-main browser checks passed. Temporary browser service closed.
  The 28 friendly-order checks fail 14/pass 14 against 35d1952 and all pass now.
- Evidence: acceptance/ai-fleet-crossovers-2026-10-13.md. No art/assets,
  local downloads, Windows package, version bump or release tag. Package stays
  0.7.9; material-B remains isolated. Physical Surface/mobile FPS and two-PC LAN
  acceptance remain outstanding.

## Previous checkpoint — 2026-10-10: symmetric calibration

- Removed enemy-only optical resampling from unused aviation updates. Empty/
  unavailable squadrons and fighter guard orders no longer advance a surface
  sensor cache unnecessarily; actual ready strike aircraft retain automatic
  sensed-target orders. No detection ranges, damage or aiming noise changed.
- Added a separate equal-equipment surface-fleet benchmark. Both fleets use
  the complete production session AI path with no human proxy, neutral IDs,
  independent cloned ship state and rigidly opposed formations. Equipment
  manifests and exact final-state hashes make the comparison reproducible.
- Fourteen full runs passed: twelve configuration/seed/spawn-side cases and
  two label-reversal controls. Each control ran 72,000 steps; normalized
  unrounded final states matched exactly. All ships fired; maximum grounding
  was 0.05 s. Eleven primary cases reached twenty minutes; one ended at 1199.32 s.
- Enemy-labelled fleet B won nine of twelve primary cases; the original
  southern spawn won seven. This is not a 50% win-rate or human-difficulty
  acceptance. Next: cross over fleet identities and update order across more
  seeds, then weather/aviation and separate human-player calibration.
- 1,522 regular plus eight balance tests passed (seven opt-in skips in the
  regular invocation), plus all six original prototype smoke tests, production
  build and eleven actual-main browser checks. The temporary server closed.
  Exact old-source sensor regressions: six fail/two pass; fixed source: eight pass.
- Evidence: acceptance/ai-symmetric-calibration-2026-10-10.md. No art/assets,
  local downloads, Windows package, version bump or release tag. Package stays
  0.7.9 and material-B remains isolated. Physical Surface/mobile FPS and two-PC
  LAN acceptance remain outstanding.

## Previous checkpoint — 2026-10-10: capture routes and firing stations

- Capture ships now route around island barriers with hull/draft clearance,
  bounded graph caching and a hard two-second replan cadence. Unsafe cached
  corridors hand off to cautious physical recovery, not an unchecked cap heading.
- Reverse recovery brakes before forward travel and checks a hull-scaled exit
  corridor. Slow steerage turns the bow clear; boundary recovery retains its
  inward heading until safely clear. A reconstructed coast-stall test reaches
  the objective without repeating the old reverse/forward loop.
- Stopped capture ships with forward-only guns can turn within the safe capture
  interior to engage a tracked stern target. Noisy aim remains; safety and damage
  responses retain priority. Real Richelieu fixtures fire without leaving the zone.
- 1,483 regular plus eight balance tests passed (five existing opt-in skips),
  along with production build and eleven actual-main browser checks. The
  temporary server closed. Fifty-three new regressions were added.
- Eight full 5v5/7v7 cases passed runtime checks: every ship fired, both sides
  dealt damage, and maximum individual grounding was 0.05 s. Seven ended at
  twenty minutes; one ended by destruction at 18:33.85.
- Enemy wins changed from three to seven of eight cases. This is not accepted
  overall balance. The existing human-slot AI proxy lacks the other ships'
  fleet coordination; equipment and seeds also limit the comparison.
  Next: equivalent-loadout, symmetric-control fleet calibration, then broader
  seed/weather/aircraft cases and separate human-player assessment.
- Evidence: acceptance/ai-capture-maneuver-2026-10-10.md. No new art, asset
  mutation, local download, Windows package or release tag. Package stays 0.7.9;
  material-B stays isolated. Surface/mobile FPS and physical two-PC LAN
  acceptance remain outstanding.

## Previous checkpoint — 2026-10-10: weapon intent and support stations

- AI torpedo preparation now selects the torpedo slot and waits for actual
  launcher alignment. Main guns no longer receive torpedo intercept points.
  Final noisy main-gun lead stays inside the equipped firing interval, including
  one fixed movement step. Optical authority, noise and weapon stats are unchanged.
- Supporting ships now choose reachable water stations with draft, approach and
  full arrival-band clearance. Searches are bounded and cached for two seconds;
  stale unsafe routes fall back to physical navigation. Distant ships cannot
  claim an unreachable support station as completed.
- Fixed a real Yamato stationary braking dead zone outside its support arrival
  band. The regression requires actual arrival and five seconds safely stopped;
  the existing full-battle movement threshold remains unchanged.
- Added opt-in real saved-build coverage for starter Cleveland and upgraded
  North Carolina. Research, purchase, equipment and save APIs are used without
  injected resources; the player's default ship and normal factory are unchanged.
- Eight full 5v5/7v7 configuration/side cases passed. Every ship fired; maximum
  individual grounding was 0.05 s. Seven ended at twenty minutes, one at 19:03
  on score. This limited matrix is not a general win-rate or pacing acceptance.
- All 1,430 regular plus eight balance tests passed (five existing opt-in skips),
  as did the production build and eleven actual-main browser checks. The
  temporary server closed. Evidence: acceptance/ai-weapon-support-2026-10-10.md.
- No new art, asset mutation, local download, Windows package or release tag.
  The checkout remains 0.7.9; material-B stays isolated.
- Next: capture routes around island barriers and hull maneuvering for stopped
  ships with forward-only guns; then broader seeds/weather/aircraft calibration.
  Real Surface/mobile FPS and physical two-PC LAN acceptance remain outstanding.

## Previous checkpoint — 2026-10-10: steering handoff

- Destroyed off-zone steering now releases an AI capture duty immediately, just
  like destroyed propulsion. Already-in-zone disabled ships still contribute;
  restored ships rejoin without preempting a valid held duty.
- Both-team real-session regressions prove healthy ships take over on the next
  simulation step and complete capture; the old coordinator fails both cases.
- Opt-in test-only spawn-side rotation preserves identities, equipment, RNG and
  formation spacing while keeping terrain fixed. Normal player spawns are unchanged.
- Eight 5v5/7v7 cases across two seeds per size and two sides passed. All ships
  fired, every side dealt damage, longest grounding was 0.05 s, and all ended
  at twenty minutes. Reported simulation telemetry matches the previous
  checkpoint in all eight paired cases; general win-rate balance is unproven.
- 1,366 regular plus eight balance tests passed, with five existing opt-in skips.
  Build and eleven actual-main browser checks passed; the temporary server closed.
  Evidence: acceptance/fleet-calibration-2026-10-10.md.
- No new art, asset mutation, local download, Windows package or release tag.
  The checkout remains 0.7.9; material-B stays isolated.
- Next: broaden hull/loadout and seed coverage, then assess late-game capture
  and scoring changes from measured evidence. Surface/mobile FPS and physical
  two-PC LAN acceptance remain outstanding.

## Previous working changes — 2026-10-08

- Production AI now receives delayed, expiring friendly sighting reports for search
  only. It still requires its own optical acquisition to fire. Both teams and
  human-controlled scout sources use the same authority-side rules.
- Target changes no longer inherit the previous ship's optical/firing lock.
- Damaged ships can use nearby reachable island cover, with conservative sight
  heights, draft/route checks and physical slowdown/holding. Planning is bounded
  and cached, and does not query unobserved enemy positions.
- Verification and limits: acceptance/fleet-ai-2026-10-08.md. This remains an
  untagged 0.7.9 working checkout; all work and evidence stay on the server.
- Local/host presentation now maintains independent contacts per enemy ID,
  including acquisition, outlines, loss and expiry. All detected ships reach
  GameView and both maps; the HUD keeps one stable primary target.
- Projectile and muzzle/audio visibility use their own source contact. Near
  hazards follow the current observing ship after the original ship sinks.
  Radio-only reports and hidden true poses remain isolated.
- Both teams now coordinate AI targets from each ship's own local contacts,
  using hull-role/range suitability, progressive friendly-load costs and a
  ten-second normal hold. Human commands retain priority; radio does not grant
  firing authority. Six-ship initial/late-target split and stability are tested.
- Published checkpoint: game cda6837 on codex/v072-historical-models and private
  assets 4e4d587 on main. Asset receipt ASSET_MIRROR_2026-10-08.json verifies 257
  mappings; material-B stays isolated and no binary art was added.
- Performance continuation reuses main-battery derivations within each AI,
  movement/firing and slot-resolution call, without cross-call caching. Four
  fixed-seed full-battle telemetry/fingerprint/aggregate comparisons are equal;
  one profiled pair improved from 32.94 s to 27.62 s (16.1%).
- The CPU reuse checkpoint is published as ca2d4ed; its paired evidence remains
  in acceptance/main-battery-performance-2026-10-08.md.
- Optical loss now immediately invalidates firing authority, including same-scan
  loss/return. A successfully tracked identity is remembered for 24 seconds and
  needs two fresh observations to reacquire; new/expired targets need four.
  Radio and repeated/stale samples cannot refresh recognition or grant a lock.
  Torpedo sample pairs are cleared on loss/switch, and history is capped at 64.
- Optical checkpoint verification: 1,291 regular tests plus eight separately run balance
  tests passed, with five existing opt-in skips. The slow batch passed at
  22.463 s against the unchanged 30-second limit. Build and eleven actual-main
  browser checks passed with zero page errors. Three new real-session regressions
  fail against the exact ca2d4ed controller and pass on the current candidate.
- Full 5v5/7v7 smoke passed: all ships fired, neither had sustained grounding,
  and both reached the twenty-minute limit. Target-switch totals did not
  uniformly decrease; the 7v7 candidate did not reproduce the prior 17:31 score
  victory. See acceptance/ai-reacquisition-2026-10-08.md for limits and evidence.
- Fleet capture coordination now normally reserves one healthy AI, at most two
  under contest/deadline pressure, and keeps other ships at support distances.
  Capture duties override old search/chase/formation headings and brake inside
  the zone. Twelve-second duty retention is separate from command freshness.
- Deadline logic uses public score/clock/capture state, including a current lead
  that enemy scoring would erase. Human takeover, death, heavy damage and
  destroyed off-zone propulsion release duties; sea trials are excluded.
- Latest verification: 1,349 regular plus eight balance tests passed (five
  existing opt-in skips), production build and eleven actual-main browser checks
  passed. Four paired 5v5/7v7 cases all fired and avoided sustained grounding.
  Physical contesting increased in these seeds, but all still ended at twenty
  minutes. See acceptance/fleet-objectives-2026-10-08.md.
- Next: broader seed/hull-role/spawn-side fleet calibration and late-game pacing.
  General win-rate balance, real Surface/mobile FPS and two-physical-PC LAN
  acceptance remain unproven.

## Previous working changes — 2026-10-07

- Package version remains 0.7.9; active checkout contains the next dock-slot and
  rendering-budget changes. These are not a published/tagged release.
- Explicit equipment slots: real-model clicks preserve the physical mount index;
  the drawer supports automatic/explicit placement, empty slots and seven languages.
  Inventory, saved-build isolation and minimum departure checks remain enforced.
- Low quality now uses a roughly 720p 3D pixel budget on large/high-DPI displays;
  medium and native-size DOM HUD are unchanged. This is not a device-FPS result.
- Material-B art and sailing wake are accepted as a provisional preview baseline,
  still isolated in experiments/material-b and not wired into production battles.
- Do not repeat the already completed 0.7.9 default-slot consistency fix. Follow
  acceptance/dock-slots-2026-10-07.md for the current explicit-slot verification.
- No local package/source download or asset-repository mutation this turn.

## Product direction

- Lightweight World War II 3D naval combat with realistic foundations and compressed pacing.
- Complete single-player human-versus-AI gameplay and the first two-player LAN co-op slice before PvP, Internet multiplayer, submarines or RL AI.
- World of Warships-style combat logic without paid monetization.
- Players command aircraft groups but do not directly pilot aircraft.
- Bold pixel UI; supported locales: zh-Hans, zh-Hant, en, ja, es, de and ru.
- An unpacked Windows x64 game directory is the default test and release target; a ZIP of that complete directory is the optional distribution artifact.
- Single-player battles use a 20-minute hard limit and are tuned toward a 15–20 minute normal duration.
- Windows directory packages are built and kept on the server; a local download requires fresh explicit user consent.

## Current continuation — 0.7.9

- Fixed candidate-preview, action-label and installed-slot disagreement using one
  automatic slot resolver. Existing new-model replacement / same-model append rules remain.
- Unavailable owned copies disable installation; incompatible candidates do not create ghosts.
- 1002 tests passed, 5 existing skipped, 44 focused checks, six real installation-flow
  checks and 18 production port checks. An initial concurrent-package run hit the
  existing 30-second balance-batch timeout; a standalone serial rerun passed unchanged.
- Server-built Windows directory: 133 files / 479,414,908 bytes. No local download or
  native Windows retest under the new server-only agreement. Details and limitations:
  `acceptance/0.7.9-dock-install.md`.
- User authorized pushing the current game branch and private asset mirror. Preserve
  existing branch history and confirm remote hashes after normal fast-forward pushes.
- Runtime artwork/model geometry, combat balance and save format are unchanged.

## Previous continuation — 0.7.8

- Restored both exact retirement backups on GPU-821560; all 225 asset-mirror hashes match.
- Installed project-local Node 24.21.0 and clean lockfile dependencies; no global tool or
  other-project service changes. See `SERVER_RECOVERY_2026-10-01.md`.
- Added restrained outlines to the actually hovered external equipment. Slot identity,
  model occlusion and tooltip hit results are shared; internal compartments remain text-only.
- Dragging, zooming, hiding, changing loadout and disposal clear and restore outline state.
- 988 tests passed, 5 existing skips; 18 real-browser checks and 11 native Windows checks
  passed. Full verification and scope limits: `acceptance/0.7.8-dock-hover.md`.
- One latest local Windows folder: 133 files / 479,414,646 bytes, all SHA-256 verified.
  Real saves preserved; previous 0.7.7 recycled. No Git push or persistent preview service.

## Previous port release — 0.7.7

- Based on `2c9d439`; implements the approved sunny-port direction with existing interactive hulls and loadouts.
- On-demand equipment, loadout, captain and help drawers; actual-mesh hover labels; no persistent start-screen key guide.
- Interruptible 120/220 ms UI transitions, damped camera motion, cached perspective framing and transparent thumbnails for 15 real game models.
- Seven-locale port text; previous save/economy/LAN flow retained. No save migration or balance change.
- Runtime harbor art and ship thumbnails are external Windows resources. Original provenance: `PORT_UI_ASSETS.md`.
- Visual gate and precise expected deviations from the illustrative ship: project-root `design-qa.md`.
- Final tests/package/local-delivery evidence: `acceptance/0.7.7-port.md`.
- Delivered as the single local latest Windows folder: 133 files / 479,393,957 bytes,
  independently SHA-256 verified after replacement. Final native Windows checks:
  10 passed, zero errors. Complete initial hull presentation visually verified.
  Old release and isolated QA profiles recycled; real saves retained. No Git push.

## Previous flight release — 0.7.6

- Based on `6039a63`; replaces the planar authoritative flight model as well as
  formation following. Bank, pitch and airspeed determine three-dimensional travel.
- Role-specific attack guidance, physical release gates, climbing egress and
  terrain anticipation are implemented. Each visible wingman has integrated
  motion; combat resources and orders remain squadron-level.
- Authorized LAN flight interpolation is backward compatible with missing flight
  fields. No dependency, external artwork, economy or save migration was added.
- See `AIR_FLIGHT_MODEL.md` for source references and deliberate model boundaries.
  Final test, visual and local-delivery evidence is in `acceptance/0.7.6-flight.md`.
- Delivered locally:956 tests passed,5 existing skipped; two continuous real-SIM
  sortie recordings passed full-wing separation and whole-formation viewport checks.
  Ten native Windows checks passed on Intel Iris Xe.117 files /476,681,372 bytes
  were rehashed after replacing the one latest directory. Actual saves retained,
  temporary profiles/services removed; no remote Git push or external asset change.

## Previous repair release — 0.7.5

- Based on `e97d785`; map-only training contacts fix absent enemy markers without
  changing battle concealment. The user confirmed this was not a missing 3D hull.
- Aircraft now follow independent delayed world paths with tangent heading,
  frame-rate-stable bank and corrected dive pitch. Actual support launch counts
  are 6/5/5; the developer default is five. No invented aircraft or balance changes.
- Sky angular haze and a water-only camera-height fog interval soften the horizon
  while preserving the clear blue upper sky, global fog and underwater handling.
- 851 tests passed, five skipped. Acceptance, screenshots and delivery status:
  `acceptance/0.7.5-fleet-horizon.md`. No external assets, save migration or Git push.
- Delivered locally: the single latest Windows directory is 0.7.5, with all
  117 files hash-verified. Ten native checks passed; real saves preserved and
  temporary QA profiles/services removed. No persistent test URL is needed.

## Previous water release — 0.7.4

- Based on `79d9bab`, preserving the 0.7.3 input and 0.7.2 historical-model work.
- Integrated official Babylon WaterMaterial 9.16.1 with original generated
  normals, world-space waves, reflection/refraction, submerged shore and
  wave-following wakes. Low/medium use bounded rendering costs.
- See `acceptance/0.7.4-water.md` for 823 passing unit tests, 11 render cases,
  real torpedo motion and ten native Windows input/render checks on Intel Iris Xe.
- Fixed the capture-recovery button's inherited hover/press transform, which
  previously moved its hit area between mouse-down and mouse-up.
- The one local Windows directory is now 0.7.4: 117 files / 476,663,676 bytes,
  individually hash-verified. Real AppData saves preserved; temporary QA services
  closed. No push or new external artwork is part of this batch.
- Next visual work can refine foam, deeper-water absorption and ship wakes;
  this release is not a full submarine renderer or an FFT ocean.

## Previous input fixes — 0.7.3

- Based on `d0dba77` in the same active server worktree and branch.
- Actual Pointer Lock is required for combat mouse-look; trusted clicks restore
  lost capture, while map/pause/developer UI releases it. No window-edge-limited
  unlocked camera fallback remains. Recovery prompts support all seven locales.
- Patrol drags use endpoint midpoint/half-distance geometry shared by preview
  and submitted mission. Normal selections remain rectangular. Choosing a mode
  closes the C palette without cancelling that mode or existing orders.
- Acceptance and final Windows delivery state: `acceptance/0.7.3-input.md`.
- The complete Windows 0.7.3 directory is delivered locally and replaces 0.7.2.
  All 117 file hashes match the server. Nine native input checks passed; real
  saves and user data were preserved. No persistent test service was requested.

## Historical model rebuild — 0.7.2

- Fifteen class-specific original procedural hulls, six WWII aircraft silhouettes,
  and differentiated external/internal equipment models. See the three
  `historical-models-*.md` documents for references and approximation limits.
- Exterior weapons use metre-space geometry below non-rotating inverse-scale
  mount frames, so traversing equipment is not stretched by hull dimensions.
- Main-gun visual elevation and projectile origins share the same geometry
  helpers, including mixed/sparse slots and individual barrel offsets.
- Destroyer hardpoints remain in their physical slots when mounts are empty.
  Agano has two forward turrets and one aft turret.
- Hull/deck/structure paint is neutral rather than whole-ship team colouring;
  small accents preserve team identity.
- Installed equipment is visible in the dockyard; internal machinery appears
  only in the selected inspection view, not as objects on the combat deck.
- No imported commercial-game mesh or newly downloaded third-party binary
  asset is included. These are lightweight approximate reconstructions, not
  exact museum-grade replicas or complete refit-year studies.
- Runtime/gallery/desktop acceptance and the local delivery state are recorded
  in `acceptance/0.7.2-historical-models.md`.
- The verified 0.7.2 Windows folder has replaced the old local release. Regression
  results: 794 application tests passed, five skipped, plus eight transport tests.
  Native EXE dock/sea-trials screenshots were inspected by two reviewers. All 117
  local files match the server manifest. Real saves remain untouched.
- Remaining visual limits: approximate small fittings and auxiliary supports;
  some secondary housing silhouettes are still similar. A later localization
  pass should address the existing mixed-language runtime HUD labels. Real
  two-PC LAN validation is still separate from the desktop preload checks.

## Earlier archived baseline (2026-08-26)

- Version: `0.7.0`
- Game commit before this documentation update: `96fcd51`
- Asset baseline before this synchronization: `2d46fe1`, based on game commit `e4f51ab`.
- Fifteen historical ship classes: five destroyers, five light cruisers, five battleships.
- Main guns, torpedoes, automatic secondaries, AA, depth charges, magazines, engines and steering.
- HE/AP, citadels, saturation, reload, traverse, dispersion, armour zones and module damage.
- Collision, percentage fire/flood/repair, manpower and recoverable-health bars.
- Smoke, hydro, depth charges, torpedo aiming and underwater wakes.
- Dawn Atoll mixed-fleet scenarios with zero-speed, kilometre-scale deep-water spawns.
- Role-aware two-sided fleet AI, sampled optical contacts and fading last-known silhouettes.
- Zoomable tactical map and RTS air guard/intercept/patrol/strike orders.
- Developer sandbox with free equipment, entity creation/removal, speed/module controls,
  ship-control transfer, aircraft spectating and performance guardrails.
- Armory/warehouse internal views, bounded inventory scrolling, automatic fitting,
  minimum starter loadouts and locally saved ship builds.
- Battle-preparation screen with fleet setup, saved player build and compact weather dropdown.
- Clear/cloud/rain/fog/storm weather profiles and bright clear-day visual reference.
- Seven-language interface and repository guides.
- Three selectable synthesized UI sound styles plus naval combat/ambient audio.
- Current sound effects are synthesized with Web Audio, so no file-backed `audio` directory is emitted yet; the ASAR-unpack audio pattern is reserved for future clips.
- Two-player LAN co-op lobby with UDP room discovery, manual IPv4 fallback, authoritative host simulation, scoped 10 Hz snapshots and 30 Hz guest input ceiling.
- Host/guest lifecycle handling: guest dropout hands the ship to AI within five simulated seconds; host dropout returns the guest to the menu. Host migration and reconnect remain out of scope.
- Terminal snapshots are forced on the exact authoritative transition tick; completed matches retain the socket and room, reset readiness, and return both players to the same lobby.
- The host lobby exposes and copies the bridge-selected private IPv4 endpoint, including fallback ports when the preferred port is occupied.

## Quality baseline

- Most recent complete verification before this archive: 408 tests passed and two offline
  balance reports were intentionally skipped.
- TypeScript/Vite production build passed.
- Worst auxiliary-equipment fixture remains under the established 70-mesh guardrail.
- Repeated loadout rebuild and projectile/torpedo-trail disposal paths have lifecycle tests.
- Balance lab supports class loadouts, paired mirrors, batch matrices, citadel/contact telemetry
  and repeatable CLI reports.
- External ship packages now have a versioned manifest, strict GLB/LOD/hardpoint/collision/
  provenance validation, SHA-256 verification, a runtime catalog, Babylon GLB loading and
  procedural fallback shared by combat and dockyard views.

## Known limitations

- Procedural ship geometry is still visibly simplified. A CC BY 4.0 Fletcher source has passed
  the licence/provenance review, but its official source archive requires an authenticated
  Sketchfab download and therefore has not been imported or redistributed.
- Original historical models remain low-poly; rigging and small fittings are selectively simplified.
- Terrain-cover behaviour, shared spotting delay and multi-objective fleet tactics need depth.
- Kagero standard equipment is weak against Fletcher in the current balance snapshot.
- Heavy-ship and mixed-fleet matrices need larger paired samples to separate seed/team/spawn bias.
- A real two-computer/home-router LAN smoke run is still needed; loopback tests do not replace it.

## Resume priorities

1. Run the packaged two-computer Windows LAN acceptance matrix in `docs/LAN_MULTIPLAYER.md` across at least one home router.
2. Capture visual-regression baselines for menu, dock, setup, combat, scope, tactical map
   and developer mode at 1440x900 and 1280x720.
3. Officially download, optimize and validate the approved Fletcher source, then repeat the
   established external-model pipeline for Cleveland and Yamato.
4. Run at least 100 paired seeds per important matchup and rebase Kagero/Fletcher plus
   heavy-ship hit/timeout behaviour.
5. Keep twenty-minute score endings as normal; improve safe recovery, useful navigation and contact reacquisition rather than chasing a non-timeout quota.
6. Expand visual regression to all saved mixed/sparse loadouts and additional refit-year variants.
7. Add terrain-cover use, delayed shared spotting and two-to-three objective scenarios.

## Delivery gate

1. `git diff --check`
2. `npm test -- --run`
3. `npm run build`
4. Run the desktop LAN loopback integration test and the two-instance Windows smoke matrix.
5. Build `release/win-unpacked`, verify its EXE, `resources`, DLLs and unpacked asset directories, then record a manifest and SHA-256 for the optional release ZIP.
6. Commit as `Arsenic-er <302726993@qq.com>`.
7. Push only when the user explicitly requests it.
