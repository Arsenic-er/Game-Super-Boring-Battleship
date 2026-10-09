# Condensed Development Status

Last updated: 2026-10-10

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
`../AGENTS.md`; this overrides the older automatic local-delivery workflow.

## Latest working changes — 2026-10-10

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
5. Calibrate mixed-fleet missions toward a 15–20 minute normal duration and at least 70% non-timeout endings.
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
