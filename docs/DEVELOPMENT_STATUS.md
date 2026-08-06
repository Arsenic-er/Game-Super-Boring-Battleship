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
- HE/AP, reload, traverse, dispersion, ballistics, modules, armor zones, and damage.
- Collision, flooding, fire, repair, manpower allocation, and recoverable-health bars.
- Smoke, hydro, depth charges, torpedo aiming, and underwater torpedo wakes.
- Two-sided fleet AI, spotting, lost-contact silhouettes, and the Dawn Atoll map.
- Zoomable tactical map and RTS-style air guard, intercept, patrol, and strike orders.
- Developer mode: free equipment, entity spawning, speed controls, module debug,
  ship control transfer, aircraft spectating, and omniscient views.
- Reduced combat HUD, hold-Tab details, naval instruments, and dedicated scope view.
- Ocean, sky, volumetric smoke, fire, splashes, shell trails, and naval audio.

## Quality baseline

- Version: `0.6.4`
- Tests: 343 passing; one offline balance report intentionally skipped.
- Production build: passing.
- Worst auxiliary-equipment test fixture: no more than 70 meshes.
- Fifty loadout rebuilds return mesh, node, and material counts to baseline.
- Latest feature commit: `b606efb Render installed equipment in combat`.

## Next priorities

1. Improve hull, deck, bridge, superstructure, and turret detail; reduce blockiness.
2. Show the complete installed external loadout in the dock, not only one candidate.
3. Add per-mount main-gun visuals for cruisers and battleships; define mixed-gun rules.
4. Calibrate AA, secondary, torpedo, and depth-charge hardpoints for all 15 classes.
5. Improve fleet formations, cover use, target priority, retreat, and shared spotting.
6. Complete battle results, difficulty, economy balance, and 10-30 minute pacing tests.
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
