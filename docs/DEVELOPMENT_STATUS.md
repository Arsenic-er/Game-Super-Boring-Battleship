# Condensed Development Status

Last updated: 2026-08-06

This is the single condensed handoff record. Do not store sub-agent transcripts,
temporary patches, or duplicate source trees in the project workspace.

## Source of truth

- Server: `ubuntu@150.65.181.202`
- Project: `/home/ubuntu/battleship`
- Branch: `main`
- Game repository: `Arsenic-er/Game-Super-Boring-Battleship`
- Asset repository: `Arsenic-er/Game-Super-Boring-Battleship-Assets`
- Stack: TypeScript, Vite, Babylon.js, Vitest
- Test URL: `http://127.0.0.1:4174/`
- Tunnel: `ssh -N -L 4174:127.0.0.1:4174 ubuntu@150.65.181.202`

The local Windows folder is not a canonical development copy. Use it only for
server access, browser testing, and short-lived transfer staging.

## Product direction

- World War II 3D naval combat with realism tempered for playable pacing.
- Finish single-player human-versus-AI gameplay before LAN, multiplayer, or RL AI.
- Follow World of Warships-style combat logic without monetized progression.
- Players command aircraft groups but do not directly pilot aircraft.
- Prefer low GPU cost. A Windows desktop build remains the release target.
- Bold pixel UI. Supported locales: zh-Hans, zh-Hant, en, ja, es, de, ru.

## Implemented baseline

- Fifteen historical classes: five destroyers, five light cruisers, five battleships.
- Main guns, torpedoes, secondaries, AA, depth charges, magazines, engines, steering.
- Dockyard, armory, inventory, non-paid supply acquisition, and local profile saves.
- Unique equipment cards and live 3D dock preview for selected equipment.
- Exact identities for all eight equipment categories survive into battle state.
- Combat models render per-model secondaries, AA, depth charges, and torpedo launchers.
- HE/AP, citadels, saturation, reload, traverse, dispersion, armor zones, and modules.
- Historical per-class torpedo tube and broadside counts drive physical salvo sizes.
- Collision, percentage-based flooding/fire/repair, manpower, and recoverable-health bars.
- Smoke, hydro, depth charges, torpedo aiming, and underwater torpedo wakes.
- Dawn Atoll now hosts a declarative 3v3 mixed-fleet mission with zero-speed,
  deep-water spawns separated by at least five kilometres.
- Fleet AI uses role-specific engagement bands, formation anchors, visible-contact
  target priority, low-health withdrawal, spotting, and lost-contact silhouettes.
- Zoomable tactical map and RTS-style air guard, intercept, patrol, and strike orders.
- Developer mode: free equipment, entity spawning, speed controls, module debug,
  ship control transfer, aircraft spectating, omniscient views, and 16-ship /
  24-squadron default performance guardrails.
- Reduced combat HUD, hold-Tab details, naval instruments, and dedicated scope view.
- Ocean, sky, volumetric smoke, fire, splashes, shell trails, and naval audio.
- Living friendly ships render as distinct cyan markers on both tactical-map scales.

## Quality baseline

- Version: `0.6.6`
- Tests: 368 passing; two offline balance reports intentionally skipped.
- Production build: passing.
- Worst auxiliary-equipment test fixture: no more than 70 meshes.
- Fifty loadout rebuilds return mesh, node, and material counts to baseline.
- Projectile reset and ordinary removal share one tested trail-disposal path,
  including all torpedo wake planes.
- The balance lab supports class-specific standard loadouts, paired mirrored spawns,
  batch matrices, citadel telemetry, tracking telemetry, and repeatable CLI reports.
- Latest feature set: 3v3 mission, role-aware fleet AI, lifecycle guardrails,
  friendly tactical-map markers, and layered transient/pressure/echo main-gun audio.

## Balance calibration snapshot

- First post-rebase matrix: 32 battles, four matchups, paired physical spawn mirrors.
- Generic five-mount destroyer gun DPM is now about 3,000-3,663 instead of 14,595-21,774.
- Secondary ranges are 2.4-2.95 km and remain below compatible main-battery ranges.
- Native torpedo warning windows are roughly 10-12 seconds; hydro extends them to about 31-35 seconds.
- Fletcher mirror gun hit rates were about 18-20%; torpedo damage share was about 13% combined.
- Open findings: Kagero standard equipment is too weak against Fletcher, and larger paired samples
  are required to separate controller-seed/team bias from map-spawn bias on heavy ships.


## Next priorities

1. Capture 0.6.6 visual-regression baselines for menu, dock, combat, scope,
   tactical map, and developer mode at 1440x900 and 1280x720.
2. Establish external-model, hardpoint, material, and LOD pipelines with Fletcher,
   Cleveland, and Yamato as the three benchmark ships.
3. Run at least 100 paired seeds per mirror matchup; rebase Kagero versus Fletcher
   and heavy-ship hit rates without hiding real mission timeouts.
4. Calibrate the 3v3 mission toward a 6-9 minute median and at least 70% non-timeout endings.
5. Show the complete installed external loadout in the dock, not only one candidate.
6. Add terrain cover use, delayed shared spotting, and two-to-three objective scenarios.
7. Package the Windows EXE only after the single-player gameplay loop is stable.

## Key recent commits

- `b606efb`: installed equipment rendered in combat.
- `93f9941`: unique equipment art and live dock previews.
- `0dd4742`: free developer equipment loadouts.
- `a6b6f86`: developer spectating and two-sided fleet AI.
- `de4614d`: playable Dawn Atoll battle map.
- `8ae5a2e`: reduced combat HUD and hold-Tab details.

## Delivery gate

1. `git diff --check`
2. `npm test -- --run`
3. `npm run build`
4. Confirm HTTP 200 from `http://127.0.0.1:4174/`.
5. Commit as `Arsenic-er <302726993@qq.com>`.
6. Push to GitHub only when the user explicitly requests it.
