# Condensed Development Status

Last updated: 2026-08-22

This is the current operational handoff. Product decisions are preserved in
`CONVERSATION_SUMMARY.md`; milestone history is preserved in `DEVELOPMENT_LOG.md`.
Do not store raw sub-agent transcripts, temporary patches, duplicate source trees,
credentials, caches or generated builds in the repositories.

## Source of truth

- Server: `ubuntu@150.65.181.188`
- Game project: `/home/ubuntu/battleship`
- Asset project: `/home/ubuntu/battleship-assets`
- Branch: `main`
- Game repository: `Arsenic-er/Game-Super-Boring-Battleship`
- Asset repository: `Arsenic-er/Game-Super-Boring-Battleship-Assets`
- Stack: TypeScript 7, Babylon.js 9, Vite 8, Vitest 4, Electron
- Test URL: `http://127.0.0.1:4174/`
- Tunnel: `ssh -N -L 4174:127.0.0.1:4174 ubuntu@150.65.181.188`

The Windows workspace is not a canonical development copy. Use it only for browser
testing, server access and short-lived transfer staging.

## Product direction

- Lightweight World War II 3D naval combat with realistic foundations and compressed pacing.
- Complete single-player human-versus-AI gameplay before LAN, multiplayer, submarines or RL AI.
- World of Warships-style combat logic without paid monetization.
- Players command aircraft groups but do not directly pilot aircraft.
- Bold pixel UI; supported locales: zh-Hans, zh-Hant, en, ja, es, de and ru.
- Portable Windows x64 build remains the release target.
- Single-player battles use a 20-minute hard limit and are tuned toward a 15–20 minute normal duration.
- Windows portable packages are built and retained on the server; Codex does not copy them to the local PC.

## Current archived baseline

- Version: `0.6.12`
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

## Quality baseline

- Most recent complete verification before this archive: 386 tests passed and two offline
  balance reports were intentionally skipped.
- TypeScript/Vite production build passed.
- Worst auxiliary-equipment fixture remains under the established 70-mesh guardrail.
- Repeated loadout rebuild and projectile/torpedo-trail disposal paths have lifecycle tests.
- Balance lab supports class loadouts, paired mirrors, batch matrices, citadel/contact telemetry
  and repeatable CLI reports.

## Known limitations

- Procedural ship geometry is still visibly simplified; no external ship model has passed
  the licence/provenance gate.
- Dockyard preview does not yet show the complete installed external-quality loadout.
- Terrain-cover behaviour, shared spotting delay and multi-objective fleet tactics need depth.
- Kagero standard equipment is weak against Fletcher in the current balance snapshot.
- Heavy-ship and mixed-fleet matrices need larger paired samples to separate seed/team/spawn bias.
- A current Windows portable build has not yet been archived for `0.6.12`.

## Resume priorities

1. Capture visual-regression baselines for menu, dock, setup, combat, scope, tactical map
   and developer mode at 1440x900 and 1280x720.
2. Establish external-model, hardpoint, material and LOD pipelines using Fletcher,
   Cleveland and Yamato as benchmark ships.
3. Run at least 100 paired seeds per important matchup and rebase Kagero/Fletcher plus
   heavy-ship hit/timeout behaviour.
4. Calibrate mixed-fleet missions toward a 15–20 minute normal duration and at least 70% non-timeout endings.
5. Show the complete installed loadout in dockyard preview.
6. Add terrain-cover use, delayed shared spotting and two-to-three objective scenarios.
7. Package Windows on the server only after the gameplay loop and visual baseline stabilize.

## Delivery gate

1. `git diff --check`
2. `npm test -- --run`
3. `npm run build`
4. Confirm HTTP 200 from `http://127.0.0.1:4174/`.
5. Commit as `Arsenic-er <302726993@qq.com>`.
6. Push only when the user explicitly requests it.
