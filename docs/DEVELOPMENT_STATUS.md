# Condensed Development Status

Last updated: 2026-09-13

This is the current operational handoff. Product decisions are preserved in
`CONVERSATION_SUMMARY.md`; milestone history is preserved in `DEVELOPMENT_LOG.md`.
Do not store raw sub-agent transcripts, temporary patches, duplicate source trees,
credentials, caches or generated builds in the repositories.

## Source of truth

- Server: `ubuntu@100.97.101.5` (Tailscale on the same GPU-273312 host; public IPv4 remains 150.65.181.188)
- Game project: `/home/ubuntu/battleship`
- Asset project: `/home/ubuntu/battleship-assets`
- Active worktree: `/home/ubuntu/battleship/.worktrees/v071-first-voyage`
- Active branch: `codex/v072-historical-models`, based on `6f1fbb2`
- Game repository: `Arsenic-er/Game-Super-Boring-Battleship`
- Asset repository: `Arsenic-er/Game-Super-Boring-Battleship-Assets`
- Stack: TypeScript 7, Babylon.js 9, Vite 8, Vitest 4, Electron
- Server preview service: disabled; LAN validation uses packaged desktop instances.

The Windows workspace is not a canonical development copy. Use it only for browser
testing, server access and short-lived transfer staging.

## Product direction

- Lightweight World War II 3D naval combat with realistic foundations and compressed pacing.
- Complete single-player human-versus-AI gameplay and the first two-player LAN co-op slice before PvP, Internet multiplayer, submarines or RL AI.
- World of Warships-style combat logic without paid monetization.
- Players command aircraft groups but do not directly pilot aircraft.
- Bold pixel UI; supported locales: zh-Hans, zh-Hant, en, ja, es, de and ru.
- An unpacked Windows x64 game directory is the default test and release target; a ZIP of that complete directory is the optional distribution artifact.
- Single-player battles use a 20-minute hard limit and are tuned toward a 15–20 minute normal duration.
- Windows directory packages are built on the server; only the latest verified `battleship-latest-windows-x64` directory is copied to the local PC.

## Current input fixes — 0.7.3

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
