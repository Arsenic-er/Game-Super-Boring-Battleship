# Condensed Development Log

Last updated: 2026-09-13

Historical archive baseline: `96fcd51` (`0.6.12`).
Historical model rebuild base: `6f1fbb2`; input-fix base: `d0dba77`; active version `0.7.6`.

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
