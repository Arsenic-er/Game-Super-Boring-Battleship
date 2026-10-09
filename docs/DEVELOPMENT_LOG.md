## 2026-10-10 — Capture routes and station firing maneuvers

Capture ships use bounded, cached terrain routes with hull/draft clearance.
Intermediate waypoints remain transit targets; invalid cached corridors hand
control to cautious terrain recovery until the two-second replan deadline.
Four real-motion island-barrier tests complete capture, and two more exercise
corridor departure and recovery handoff.

Near-coast reverse recovery now brakes, checks forward clearance and retains
a safe exit heading before resuming travel. A test reconstructed from a rounded
stall-log pose removes the old repeated reverse/forward loop. It is not a replay
of the original full battle. Boundary and heavy-ship turn regressions also pass.

Stationary cappers with forward-only guns can make a low-power turn to open a
firing arc while staying inside the objective. Aim noise, gun statistics,
perception and higher-priority safety rules are preserved. Richelieu tests
produce real shots at about 157.38 seconds.

All 1,491 regular/balance tests passed with five existing opt-in skips, plus
production build and eleven actual-main browser checks. Eight full fleet cases
passed runtime assertions; every ship fired and maximum grounding was 0.05 s.
Enemy wins nevertheless changed from three to seven of eight. Symmetric-control,
equivalent-loadout calibration is next; general balance is not certified.

Evidence and limitations: acceptance/ai-capture-maneuver-2026-10-10.md.
The temporary browser server closed. No art/assets, local downloads, Windows
package, version bump or release tag. All work remains on GPU-821560.

## 2026-10-10 — Weapon intent, navigable support and saved-build coverage

AI main guns now use their own range-bounded noisy aim solution rather than a
torpedo intercept. A preparing launcher selects the torpedo slot and waits for
real alignment. The complete main-gun solution reserves the movement step before
firing; weapon statistics and optical authority are unchanged. Nineteen of the
twenty-one new weapon checks fail against the old controller; all now pass.

Support stations now check static terrain, draft, route and the complete arrival
band, using a bounded two-second planner. A failed intermediate full battle
revealed a separate stationary braking dead zone: Yamato stopped 264.77 m from
a reachable station outside its 220 m arrival band. Removing the fixed support
braking allowance lets it reach the band and hold safely. Capture behavior and
the original movement-test threshold were preserved.

Real saved Cleveland and North Carolina magazine-refit fixtures exercise normal
profile, research, purchase, equipment and save APIs without free resources.
Eight final full battles across configurations and spawn sides passed; every
ship fired, and the longest grounding episode was 0.05 s. Seven reached twenty
minutes; one ended on score at 19:03. Outcomes do not establish general balance.

All 1,438 regular/slow tests passed with five existing opt-in skips; production
build and eleven actual-main browser checks passed with zero page errors.
The temporary test server closed. Details and remaining capture-routing and
forward-gun maneuvering limits: acceptance/ai-weapon-support-2026-10-10.md.

No art/asset change, local download, Windows package, version bump or release
tag. All development and evidence remain on GPU-821560.

## 2026-10-10 — Steering failure handoff and spawn calibration

An off-zone AI with destroyed steering now releases its capture reservation
immediately. In-zone disabled ships still count, and restored ships rejoin
without stealing valid held duties. Both-team real-session tests reproduce
the old failure and verify that a healthy replacement physically completes
capture while the disabled ship cannot turn.

Added an opt-in test-only 180-degree spawn-side swap that preserves team,
equipment, RNG and internal formations without moving terrain. Eight paired
5v5/7v7 cases passed with every ship firing, no sustained grounding and identical
reported simulation telemetry before/after the steering fix. All reached the
twenty-minute limit; broader balance and match-pacing acceptance remain open.

All 1,374 regular/slow tests passed with five existing opt-in skips, plus
production build and eleven actual-main browser checks with zero page errors.
The temporary test server closed. Details: acceptance/fleet-calibration-2026-10-10.md.
No art/assets, local downloads, Windows package, version bump or release tag.

## 2026-10-08 — Bounded fleet capture duties and late battle decisions

Added public-information objective coordination to the local/host session.
Normally one healthy AI captures, with at most two assigned during contest or
deadline pressure; others approach role-specific support positions. Human
takeover, death, severe damage and off-zone destroyed propulsion release duties.
Twelve-second task retention is separate from fresh per-update issue timestamps.

Assigned cappers now override stale search, distant chase and formation
following, slow inside the zone, and return to support after safe capture.
Torpedo/collision/terrain safety and damaged withdrawal remain higher priority.
Urgency uses travel, full neutralization/capture time, current scores and a
projected late defeat even when currently leading. Sea trials are excluded.

All 1,357 regular/slow tests passed with five existing opt-in skips; 23
coordinator, 18 navigation/session and 17 metric checks were added. Four paired
5v5/7v7 battles passed: every ship fired, no sustained grounding, and physical
contesting increased in these seeds. All still reached the twenty-minute cap,
so general balance and match pacing are not certified. Build and eleven
actual-main browser checks passed with zero page errors.

Corrected the old gun-bracketing test's attribution: its apparent accuracy
regression came from player automatic secondaries, not the enemy main gun.
Original sample-size and hit-rate limits remain unchanged. Details and paired
results: acceptance/fleet-objectives-2026-10-08.md. No art/asset mutation, local
download, package version/release tag or persistent preview.

## 2026-10-08 — Optical contact loss and identity-specific reacquisition

Fixed a same-scan loss/return path that could restore the old firing lock.
Loss now immediately clears acquisition and torpedo sample pairs. Known targets
retain only 24-second identity recognition: two fresh observations reacquire a
previously tracked ship; a new or expired identity needs four. Radio, cached
snapshots and hidden true positions cannot grant or prolong firing authority.
The history is bounded to 64 IDs and resets with the battle.

Added 22 controller, five real-sensor/session and six diagnostic regressions.
Three session regressions fail against the exact ca2d4ed baseline and pass with
the fix. All 1,299 regular/slow tests passed with five existing opt-in skips;
the slow batch passed in 22.463 s without a relaxed limit. Build and eleven
actual-main browser checks passed with zero page errors.

Both full 5v5/7v7 cases passed, every ship fired and neither had sustained
grounding. Both candidate battles reached the twenty-minute limit; 7v7 no longer
ended at the baseline's 17:31 score win. Target-switch totals did not uniformly
decrease, so objective/late-game behavior and broader paired-seed calibration
remain next. These two seeds are not a general balance acceptance.

Details: acceptance/ai-reacquisition-2026-10-08.md. All work and evidence stay on
the server; no artwork changes, asset mutation, local download, Windows package,
release tag or persistent preview.

## 2026-10-08 — Published checkpoints and main battery CPU reuse

Pushed the verified gameplay/dock/isolated-material checkpoint as game cda6837,
and refreshed the private asset source archive as 4e4d587. The latter validates
257 mappings, preserves 20 historical evidence files, and adds no binary artwork.
Existing GitHub credentials were used transiently over SSH; none were stored.

CPU profiling then identified repeated main-battery derivation in AI, movement
and firing. Reuse now stays within each synchronous call and installed-slot
derivation, preserving live equipment changes without a global cache. Twenty-two
regressions cover all fifteen hulls and mutable/sparse loadouts.

Four fixed-seed battles have exactly matching telemetry, terminal fingerprints
and aggregate results before/after. One profiled pair fell from 32.94 s to
27.62 s (16.1%). All 1,266 tests passed across regular and separate slow suites,
with five existing opt-in skips. The formerly timing-out batch passed twice,
25.522 s and 26.584 s, against the unchanged 30 s limit. Build and eleven
actual-main browser checks passed. This is server CPU evidence, not mobile FPS.

See acceptance/main-battery-performance-2026-10-08.md. No local downloads,
persistent preview, release tag or production material-preview integration.

## 2026-10-08 — Coordinated fleet target selection

Both teams now distribute AI fire over each ship's own optical contacts. The
allocator reuses hull roles and equipped main-battery range, preserves valid
claims during a ten-second acquisition window, and permits self-defense and
damaged-target focus. It cannot turn radio reports into visible/firing contacts.
Human takeover, death/removal and battle reset release reservations.

Progressive occupancy replaces a saturating penalty that could leave six ships
permanently split 5:1. Initial and late-arriving equal targets now pass stable
3:3 cases. Continuous range costs also avoid needless retargeting at the gun-range
boundary. State is bounded and normal planning is sensor-interval cached.

Validation: 1,236 regular tests passed (five existing opt-in skips), including
24 allocator and nine integration regressions. Build and 11 actual-main browser
checks passed. Full 5v5/7v7 production-session smoke passed: all ships fired,
peak assigned targets were 4/4 and 6/6; 7v7 ended on score at 17 min 31 s and
5v5 reached the twenty-minute limit. These are two seeds, not balance proof.

The separate legacy balance suite had seven passes and one 30-second timeout
(30.073 s). No limits or assertions were relaxed. Dynamic contact-loss target
churn and slow-batch profiling remain follow-ups. Details:
acceptance/fleet-targets-2026-10-08.md. All work remains on the server; no artwork
changes, asset changes, Git push, local download or persistent preview.


## 2026-10-08 — Independent enemy contacts and visibility

Local and LAN-host frames now keep one optical tracker per enemy and supply all
contacts to ship rendering and tactical maps. Contact acquisition, silhouettes,
dead reckoning and expiry no longer depend on the current HUD target. HUD
selection is stable, favors live confirmed targets and uses observer-relative
distance hysteresis. Radio-only reports remain outside player optical contacts.

Shells, muzzle effects and firing audio now match their own source ID. A visible
enemy no longer exposes the distant shots of hidden enemies. Nearby hazards use
the current observing ship, including a surviving ally after the original ship
sinks. Sea trials, developer omniscience and guest server filtering are preserved.

Validation: 1,203 regular tests plus eight separately run balance tests passed,
with five existing opt-in skips. Eleven actual-main browser checks and the
production build passed. The unchanged slow batch took 29.802 seconds against
30 seconds, so previous timing failures remain a performance risk.

Details and reproduction: acceptance/multi-contact-2026-10-08.md. All work and
evidence remain on the server. No art changes, asset changes, Git push, local
download, release tag or persistent preview. Next: AI target deconfliction and
the narrow slow-batch performance margin.


## 2026-10-08 — Fleet radio search and island withdrawal (working changes)

Continued the production AI line without changing the provisionally accepted
material-B preview or deploying it into normal battles.

- Both teams now exchange local ship sightings through a controller-owned radio
  network: three-second delivery delay, fifteen-second observation TTL, copied
  snapshots, receiving-ship ranges, source cleanup and bounded deterministic queues.
  Human-controlled scouts also contribute. Reports only guide AI search and do
  not enter local sensor contacts, secondary fire control, air target authority
  or LAN replication. Session reset clears the radio state.
- A target identity change resets optical acquisition even within one scan and
  with an identical observation timestamp. Both rule AI and player perception
  must reacquire a different target; AI also discards its old torpedo samples and
  fire-control solution.
- Damaged AI can choose reachable island cover from its observed target position.
  The planner evaluates at most 64 local candidates and is cached for two seconds.
  It checks draft, complete straight route, stopping clearance and conservative
  observer heights. Nearby arrival triggers slow approach; only verified cover
  at the current position permits holding. Navigation recovery and immediate
  torpedo/collision avoidance retain precedence.
- Independent review caught and corrected low-eye-height false cover; integration
  tests also prevent stopping before a hull actually crosses the protected edge.
  Actual fixed-step movement tests cover turning toward cover and braking without
  grounding. It is still a local single-threat planner, not all-threat or global
  tactical routing.

Validation: 1,137 regular tests passed (five existing opt-in skips), build passed,
and full 5v5/7v7 twenty-minute simulation smoke tests passed. Slow balanceLab had
seven passes and one repeated 30-second batch timeout; this is not an all-green
full-suite result. Details are recorded in acceptance/fleet-ai-2026-10-08.md. Package version stays 0.7.9; no release tag,
package download, Git push, asset replacement or persistent preview was made.

Next observed UI defect: local/host main.ts still supplies a single target tracker
to presentation, so multiple locally detected enemies can be omitted. Follow-up
should keep independent per-ID acquisition/memory, without making radio reports
live visible enemy models.

## 2026-10-07 — Explicit dock slots and low-quality pixel budget (working changes)

Resumed the production gameplay/UI line after the owner provisionally accepted
material-B static and sailing previews. Those remain under experiments/material-b;
the normal battle entry still uses its existing art. No additional local download,
asset replacement or Git push is part of this work.

Dock equipment can now target a physical mount instead of implicitly replacing
slot zero. Clicking an actual installed component carries its slot index into the
equipment drawer; the drawer also offers automatic placement and explicit slots,
including empty hardpoints. The shared pure resolver drives both the candidate
ghost and the inventory-checked transaction. Unchanged copies, saved blueprints,
credits and other mounts stay untouched. Sparse drafts remain drafts and do not
bypass the existing minimum departure requirements. Five new UI phrases have
all seven translations.

The production low-quality renderer now caps 3D pixel count near 1280x720 while
retaining its old minimum 1.35 scale. Medium stays CSS-native; DOM/HUD sizing is
unchanged. Construction, quality changes and window resizing share one policy;
DPR does not multiply the budget and hidden canvases do not feed scaled dimensions
back into the next resize. Actual server Chromium checks cover Surface-sized CSS
viewports, DPR3 phone-sized viewports and repeated resizing, not real device FPS.

Initial untouched full-suite baseline: 1,016 passed, five skipped, one 10-second
balance-lab timeout. That same file passed 8/8 independently, and the individual
case passed again in 9.06 seconds. No business assertion or timeout was weakened.
Final checks: 1,083 regular tests plus eight isolated balance tests passed, with
five existing skips. Fourteen dock and thirteen rendering-budget browser checks
passed with no page errors. TypeScript/build and whitespace validation passed;
all temporary QA services were closed. Full evidence and limitations are recorded
in acceptance/dock-slots-2026-10-07.md.
The package version remains 0.7.9 until a separately validated release is cut.

## 2026-10-04 — Hold-to-show aiming readout

The third-person green reticle, angle scale and bearing/range readout are now
hidden by default. Hold the middle mouse button to reveal them; release it to
hide them. R optical sights, wheel ranging, map zoom and ballistic guides retain
their existing behavior. The control hint lives only in the Tab help panel and
is translated into all seven supported languages.

The hold clears on suppression, reset, blur, hidden document, pointer cancellation
or pointer-lock loss. Pause, maps, developer UI and inactive battles also gate
visibility. Mouse button events preserve chorded clicks; pointer-lock recenter
movement can report zero buttons and must not be mistaken for an actual release.
Added 14 input regressions and one localization regression. Fifteen production
browser checks passed with no page errors, using an isolated server-side save.
Browser evidence remains in `.qa/aim-readout/`; no screenshots or packages were
downloaded to the owner machine for this change.

The full run passed 1,016 tests with five existing skips; the unchanged balance
batch alone hit its 30-second timeout. A serial rerun of that file and the five
input/localization suites passed all 38 tests without relaxing any timeout or
assertion.

## 2026-10-03 — Consistent dock installation, 0.7.9

Continued development entirely on GPU-821560 and updated the working agreement to
stop automatic local downloads and staging. A code audit found candidate ghosts
and install wording used the first empty slot while the transaction replaced slot
zero for new models. Extracted one shared target resolver without changing policy;
owned-copy exhaustion now disables the button. Existing seven-language strings,
saved blueprints, economy and combat behavior are preserved.

Added 14 focused regressions and an actual-browser install/preview harness. Final
suite: 1002 passed, five existing skips; 44 focused tests, six installation-flow
checks and 18 production-port checks passed. One unchanged balance-batch test hit
its 30-second timeout during the initial run with packaging in parallel; serial
rerun passed without changing assertions or timeouts. Windows output remains on
the server; no local EXE test/download. See `acceptance/0.7.9-dock-install.md`.

## 2026-10-01 — New-server recovery and component hover, 0.7.8

Recovered the game branch and private assets from `backup-2026-09-17` onto
GPU-821560, using the server details in the owner's “嘿嘿嘿” project. Verified
every tracked file and all 225 asset-mirror entries. Development now uses canonical
`~/battleship`, not the old nested worktree, with isolated project-local tools.

Finished the remaining dockyard hover-outline refinement with a bounded subagent:
only the actually hovered installed mount is outlined; internal compartments do not
gain misleading visible machinery. Restored prior mesh properties on cleanup and
covered 30 lifecycle repetitions. No combat, economy, save or imported-art change.
988 tests, 18 browser checks and 11 native Windows checks passed; the server-built
0.7.8 folder replaced the one local latest package after complete hash verification.
See `acceptance/0.7.8-dock-hover.md`. No remote push or main merge was performed.

## 2026-09-17 — Two-repository retirement backup

Prepared the 0.7.7 game branch and private asset repository for server retirement.
Refreshed the source-asset mirrors, condensed recovery instructions and final QA
evidence. Kept generated builds/caches out of Git. Both pushed checkpoints must pass
independent fresh-clone verification before the two project directories are removed;
the local Windows game and AppData saves remain untouched. See
`SERVER_RETIREMENT_2026-09-17.md`. No game logic changed.

## 2026-09-14 — Sunny dockyard, 0.7.7

Implemented approved concept 1 in the real game. Added on-demand drawers, seven-locale
port navigation, component hover picking, smooth cancellable transitions and stable
orbit-camera damping. Cached actual model vertices for perspective framing; all 15 hulls
remain inspectable across window sizes. Rendered transparent thumbnails from real models
and generated an original empty-harbor backdrop. Kept core equipment, saves, battle,
tutorial and LAN routes. See `acceptance/0.7.7-port.md`, `PORT_UI_ASSETS.md` and root
`design-qa.md`. No raw subagent transcript is needed to continue development.

# Condensed Development Log

Last updated: 2026-10-03

Historical archive baseline: `96fcd51` (`0.6.12`).
Historical model rebuild base: `6f1fbb2`; input-fix base: `d0dba77`; active version `0.7.9`.

This is a milestone log derived from the Git history and the long development
conversation. It is intentionally more compact than a commit-by-commit transcript.

## 2026-09-13 — Three-dimensional aircraft flight and attack guidance

- Revisited primary FlightSim, Yuka, OpenSteer and JSBSim references after the user
  identified that formations still moved mechanically on a horizontal plane.
  Independent lightweight TypeScript implementation; no copied source or assets.
- Replaced fixed-XZ-speed/separate-height movement with a bounded point-mass
  autopilot: bank-driven turns, pitch-derived vertical velocity, roll/pitch rates
  and speed/energy response. Stable cruise replaces artificial altitude wobble.
- Added role-specific approach, dive/low-level run and climbing egress. Release
  requires a physical window; bombs inherit aircraft velocity. Interception now
  checks a 3D firing cone. Launch/recovery no longer hover while their phase runs.
- Each visible wingman integrates its own flight state toward delayed formation
  stations. LAN interpolates optional authorized flight state without revealing
  hidden enemies or inventing identities for anonymous contacts.
- Continuous visual QA exposed full-wing overlap during pull-out. Wider stable-side
  formations and bounded look-ahead separation guidance fixed the demonstrated
  trajectories without pushing aircraft positions apart. Actual-SIM OBB and
  30/60 Hz regressions cover dive-bomber and torpedo-bomber sorties.
- Fixed an introduced recovery regression: fixed35s reserve could exhaust fuel
  during a physically flown approach. Route/turn/altitude-aware early recall keeps
  the original fuel quantity and 90m landing gate; far/near recovery and moving-target
  sorties are tested together to avoid excessively premature recalls.
- Conservative terrain look-ahead requests an early climb rather than teleporting
  aircraft above mountains. Recovery remains map-edge based; this is not 6-DOF
  aerodynamics, individual-plane combat AI or carrier landing physics.
- Model scope, primary references and verification are recorded in
  `AIR_FLIGHT_MODEL.md` and `acceptance/0.7.6-flight.md`.
- Final delivery:956 application tests passed,5 existing skipped; both real-SIM
  sortie videos passed full-wing separation and whole-group camera framing.
  Ten native Windows checks passed;0.7.6 replaced the single local latest directory,
  with117 post-install file hashes verified and real saves preserved. No Git push.

## 2026-09-13 — Training map contacts, independent aircraft and horizon

- User clarified missing test enemies meant map markers. Added a training-only map
  adapter for live enemies; normal sensor/AI information and 3D visibility unchanged.
- Replaced rigid group rotation with bounded per-aircraft flight history, delayed
  trajectories and physically oriented pitch/bank. A 30/60 fps regression exposed
  tangent jitter; exponential heading response fixed it without relaxing thresholds.
- Real UI launch inspection found six/five/five aircraft, not a general count=one
  bug. Distinct meshes, propellers, casualty counts and focused views are verified.
- Softened the ocean/sky seam with weather-colour sky blending and a water-only
  height-scaled fog band. No new rendering pass, external art or gameplay fog change.
- 851 tests passed, five skipped; real-render acceptance and Windows delivery are
  recorded in `acceptance/0.7.5-fleet-horizon.md`. Development/build remain on server.

## 2026-09-13 — Official Babylon WaterMaterial integration

- User selected Babylon's official WaterMaterial after comparing four references.
- Pinned materials to the existing 9.16.1 engine; replaced scrolling RGB ocean
  and thin box strips with refractive/reflective water and original seamless normals.
- Camera-centred graded mesh keeps both normal layers and displacement in world
  coordinates; simulation-time binding works at fixed dt and pauses with the game.
- Low/medium use bounded offscreen resolution, refresh rate and nearby ship lists.
  Sky, terrain and approved underwater entities have explicit render lists;
  ocean, hidden contacts, smoke and UI effects cannot recursively reflect themselves.
- Shallow terrain is an actual submerged seabed, not a translucent surface overlay.
  Ship/torpedo wakes and underwater transitions sample the rendered wave height.
- Full volumetric depth absorption and breaking-wave foam are not provided by the
  selected official material. Do not describe this as a finished submarine renderer.
- No simulation balance, saved-game format, LAN protocol or control bindings changed.
  Validation and delivery evidence is recorded in `acceptance/0.7.4-water.md`.
- Native acceptance exposed a pre-existing CSS hover/press transform that moved
  the capture-recovery button out from under its click. Its centred hit area is
  now stable; the pointer-lock controller did not need changes.
- 823 unit tests passed, five skipped; 11 water scenes plus an actual moving
  torpedo-wake check passed. Ten native Windows checks passed on Intel Iris Xe.
  The final 117-file directory was hash-verified and replaced local 0.7.3 with
  0.7.4. Real saves were preserved and all temporary test services were closed.

## 2026-09-13 — Combat mouse capture and aircraft patrol dragging

- Removed unlocked client-coordinate mouse-look. Battle start/resume requests
  actual Pointer Lock; loss/rejection has a localized trusted-click recovery.
  Map, pause and developer menus keep a free pointer and do not drive the camera.
- Patrol drags now use the two endpoints as a diameter. Preview and simulation
  share midpoint, radius limits and map projection; normal selection stays a
  rectangle. The C palette closes after choosing a mode without clearing it.
- Added behavior, real-browser and real-game input regression coverage. Detailed
  evidence and limitations are in `acceptance/0.7.3-input.md`.
- Kept binary transport tests separate from the Vitest application test runner.
- Final verification: 818 application tests passed, five skipped; eight transport
  tests passed. Nine native Windows EXE input checks passed, and all 117 local
  files match the server manifest. The one latest local release is now 0.7.3;
  actual saves were untouched. No remote push was performed for this batch.

## 2026-09-12 — Historical model rebuild

- Rebuilt fifteen hull silhouettes with continuous deck/bridge structures,
  class-specific bows/sterns, funnels/masts and supported main-gun hardpoints.
- Rebuilt six WWII aircraft families with differentiated wings, cockpits, gear
  and three-blade propellers; projected wing markings onto the wing surfaces.
- Added historical equipment profiles, separate internal inspection machinery
  and metre-space rotating mounts. Shared visual/simulation muzzle geometry
  prevents distorted traverse and offset shell origins.
- Added topology, dimensions, mixed-loadout, disposal and muzzle-alignment tests
  plus a filtered actual-WebGL model inspection script.
- Kept Windows directory distribution, separate unpacked assets and all seven
  language guides. No paid assets or extracted commercial game models added.
- Detailed acceptance is kept in `acceptance/0.7.2-historical-models.md`,
  not in raw sub-agent transcripts.
- Final verification: 794 application tests passed, five skipped; eight binary
  transport tests passed. TypeScript, archive/dependency validation and actual
  native Windows dock/sea-trials checks passed. All 117 local release files match
  the server build by SHA-256; the single latest local directory is now 0.7.2.
- No actual AppData save was changed. No new third-party binary asset was added,
  and no remote Git push was requested or performed for this batch.

## Phase 1 — Minimum viable naval prototype

- Selected a lightweight browser-first TypeScript/Babylon.js architecture with a later
  Electron Windows target.
- Implemented one World War II destroyer, basic propulsion/rudder handling, one main-gun
  type, visible ballistic arcs, player-versus-AI battle and unlimited sea trials.
- Established `R` toggle scope, `Space` firing, mouse-look, progressive reload and slower,
  ship-like movement.
- Reduced AI certainty by adding aim error, tracking delay and dispersion instead of
  allowing every salvo to hit.

## Phase 2 — Damage, collision and usability

- Added physical collision volumes and location-dependent ramming damage.
- Added compartments, modules, fire, flooding, manpower-limited damage control and
  recoverable hull health; `H` performs progressive recovery.
- Added a developer diagnostic panel for health, modules, speed and collision testing.
- Corrected pointer-lock behaviour: cursor hidden during active play, restored on pause/UI.
- Built minimap/full-map flow, `M` shortcut, zoomable map and scope/camera refinements.
- Reduced permanent HUD clutter and moved detailed information behind hold-`Tab`.

## Phase 3 — Modular weapons and progression

- Introduced local captain profile, dockyard, equipment slots, upgrades and saved data.
- Added historical equipment identities for main guns, torpedoes, secondaries, AA,
  depth charges, magazines, engines and steering.
- Replaced cash/gacha progression with research, deterministic procurement, battle-earned
  resources and free supply tickets.
- Added unique equipment card artwork and live 3D dockyard preview changes.
- Merged Armory and Warehouse into a single menu with separate internal views.
- Added bounded inventory scrolling, automatic optimal fitting and minimum seaworthy
  starter builds for newly selected ships.

Key commits:

- `93f9941` — equipment artwork and live dock previews.
- `0dd4742` — free developer equipment loadouts.
- `dfd9ac5` — merged armory/inventory and automatic loadouts.
- `bd9defd` — localization-safe re-rendering and bounded warehouse scrolling.

## Phase 4 — Historical fleet expansion and weapons

- Expanded the roster to five destroyers, five light cruisers and five battleships.
- Added per-class hull, armour, main-battery, secondary-battery and torpedo definitions.
- Added independently traversing main turrets, structural dead zones, correct physical
  shell counts, per-class firing ranges and automatic secondaries.
- Added HE/AP penetration, angle/ricochet, fuse overpenetration, citadel and saturation logic.
- Added destroyer depth charges, smoke, hydroacoustic search and four historical torpedo
  loadouts with distinct range/speed/damage/reload/wake trade-offs.
- Fixed torpedo firing without requiring scope mode and added visible underwater wakes.

Key commits:

- `bd9a75a` — fifteen historical ship classes and ASW slots.
- `5d86567` — playable destroyer depth charges.
- `166fd0c` — automatic cruiser/battleship secondaries.
- `139246b` — historical cruiser/battleship main batteries.
- `5b935ea` — armour and calibre penetration models.
- `6025fbf` — independent main battery turrets.

## Phase 5 — Fleet aviation

- Added command-only carrier aviation; the player directs AI squadrons instead of piloting.
- Implemented RTS box selection, right-click movement, guard, patrol, interception and
  surface-strike orders plus map command UI.
- Added squadron role/loadout decisions for fighters, dive bombers and torpedo bombers.
- Added individual aircraft offsets, turn/bank/altitude variation and status presentation.
- Added developer spectating for aircraft and two-sided fleet AI inspection.

Key commits:

- `a526f9e` — command-only air-operations foundation.
- `3c1461a` — RTS-style air-command layer.
- `041c341` — air strike and defence resolution.
- `70f7f96` — surface-strike tracking and fitted AA.
- `6c27d41` — lightweight aircraft visuals and status.

## Phase 6 — Maps, spotting, AI and scenarios

- Built the irregular Dawn Atoll battlefield with deep water, shallow reefs, sandbars,
  islands and mountainous line-of-sight cover.
- Replaced omniscient target access with sampled optical contacts, noise, acquisition,
  loss, search and reacquisition.
- Added smoke/firing concealment, stale last-known silhouettes and shared perception
  across HUD, scope, tactical map and AI firing gates.
- Added two-sided surface fleet AI with role engagement bands, formations, target priority,
  withdrawal and visible-contact constraints.
- Added declarative mixed-fleet 3v3 scenarios, zero-speed starts, kilometre-scale separation,
  capture progress, scores and objective victory.

Key commits:

- `de4614d` — playable Dawn Atoll map.
- `5718bf7` — spotting silhouettes and refined terrain.
- `a6b6f86` — developer spectating and two-sided fleet AI.
- `3e144cd` — mixed-fleet single-player mission.

## Phase 7 — Rendering, ship presentation and audio

- Rebuilt the shared Destroyer V2 procedural model with stepped bridge, raked funnels,
  tripod mast, breakwater, lifeboats and standardized hardpoints.
- Repaired malformed bow/foredeck geometry, transparent decks, black block materials,
  gun counts and aim-view superstructure occlusion.
- Added transparent pixel water, clear and overcast sky textures, atmospheric perspective,
  bright clear-day materials, volumetric smoke, fire, splashes and projectile trails.
- Added engine telegraph, turret machinery, ocean, seabird, firing and impact audio.
- Improved main-gun sound with transient, pressure and echo layers.
- Added bridge-relay, mechanical-lever and pixel-radiotelegraph synthesized UI sound choices.

Key commits:

- `067dd35` — firing/input/scanline/block-model regression fixes.
- `751e6b9` — scope occlusion and solid deck fixes.
- `e24cf50` — naval instruments and superstructure rebuild.
- `368c0d9` — ship visuals and aviation movement refinement.
- `b23f73f` / `096fda8` — bright clear-day environment and saturation correction.
- `b02fd9e` — friendly map markers and layered gun audio.
- `96fcd51` — selectable interface sound cues.

## Phase 8 — UI, localization and battle preparation

- Added Simplified Chinese, Traditional Chinese, English, Japanese, Spanish, German and
  Russian repository descriptions and in-game localization.
- Replaced a crowded combat overlay with critical ship/weapon panels, naval instruments
  and hold-`Tab` tactical details.
- Added a dedicated scope, map zoom, developer view transfer and camera-input freezing
  while developer UI is open.
- Changed Single Player to open a battle-preparation screen with fleet size/composition,
  saved ship builds and weather selection.
- Added clear, cloud, rain, fog and storm gameplay weather profiles and compacted weather
  selection into a dropdown.
- Fixed locally re-rendered armory/dock strings returning to Chinese after language changes.

Key commits:

- `ccd3c18` — seven-language interface and repository guides.
- `8ae5a2e` — reduced battle HUD and hold-`Tab` details.
- `bf70e78` — developer sandbox and runtime entity tools.
- `f7050b2` — camera freeze while developer panel is open.
- `436af5a` — weather and single-player fleet setup.
- `959b6ed` — compact weather dropdown.

## Phase 9 — Balance and reliability

- Added deterministic simulation tests, equipment/resource lifecycle tests and a balance lab.
- Added class-specific loadouts, paired mirrored spawns, batch matrices, citadel telemetry,
  contact/tracking telemetry and CLI balance reports.
- Rebased destroyer gun DPM, secondary ranges, torpedo warning windows and AI hit rates.
- Added mesh/node/material lifecycle guardrails and projectile/torpedo-trail disposal tests.
- Latest archived test baseline before this documentation update: 386 passing, two offline
  balance reports skipped; production TypeScript/Vite build passed.

Key commits:

- `956c409` — naval combat-system rebalance.
- `b412d47` — first condensed development handoff.
- `b606efb` — installed equipment rendered in combat.

## Current continuation priorities

1. Establish licensed external-model and hardpoint pipelines using Fletcher, Cleveland
   and Yamato as benchmark hulls; create LODs and separate colliders.
2. Capture visual-regression references for menu, dock, setup, battle, scope, map and
   developer mode at 1440x900 and 1280x720.
3. Run at least 100 paired seeds for important mirror/class matchups; investigate Kagero
   versus Fletcher and heavy-ship timeout bias.
4. Tune the mixed-fleet match toward the 15–20 minute target and at least 70% non-timeout endings.
5. Deepen terrain navigation, cover use, delayed shared spotting and multiple objectives.
6. Show complete installed loadouts in the dockyard 3D preview.
7. Package a complete Windows game directory only after the single-player loop and
   visual baseline remain stable; optionally wrap that directory in a ZIP for release.
