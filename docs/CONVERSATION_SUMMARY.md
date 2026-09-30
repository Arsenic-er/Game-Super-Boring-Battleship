## Latest operational decision — 2026-10-01

The owner requested recovery on the newest server recorded in the “嘿嘿嘿” project.
GPU-821560 is now the development host; canonical paths and verified recovery hashes
are recorded in `SERVER_RECOVERY_2026-10-01.md` and `DEVELOPMENT_STATUS.md`.
Continue using subagents for bounded work. Build on the server, deliver one latest
unpacked Windows folder, preserve real AppData saves and leave no persistent preview
service. The next completed small feature is dockyard component hover outlines;
this is not a new ship-model rebuild, balance change or automatic Git push.

# Conversation Summary and Product Memory

Last condensed: 2026-09-17

Project owner: **Arsenic-er / koko**

Canonical game repository: `Arsenic-er/Game-Super-Boring-Battleship`

Canonical asset repository: `Arsenic-er/Game-Super-Boring-Battleship-Assets`

This document preserves the decisions and recurring user feedback from the long
development conversation. It intentionally does not reproduce raw chat messages,
sub-agent transcripts, temporary patches, credentials, or repeated status updates.

## 1. Core product direction

### Server retirement request (2026-09-17)

- Push the complete latest game and source assets to their separate existing repositories.
- Only after an independent remote restore check, remove this project's server directories.
- Keep the owner's single local 0.7.7 Windows folder and real saves untouched.
- Restore the game from `codex/v072-historical-models`, not the older default `main`.
- Follow `SERVER_RETIREMENT_2026-09-17.md`; raw transcripts and caches are not project memory.

### Approved port direction (2026-09-14)

- User selected sunny-harbor UI concept 1 and requested smooth, interruptible UI motion.
- Start in the dockyard; keep instructions in Help, not always visible on the first screen.
- Component names appear only on hover over real 3D geometry. Keep real equipment/save logic.
- User authorized a temporary isolated server-side automated browser when the in-app browser connection failed; close test services afterward.
- Continue delivering one latest unpacked Windows directory; keep real user saves intact.

- A lightweight 3D World War II naval-combat game for ordinary PCs.
- Realism is the reference point, but pacing and readability may be compressed in
  the style of World of Warships.
- Preserve the complete single-player human-versus-AI loop while expanding the
  shipped two-player LAN co-op mode; online multiplayer, submarines, and
  reinforcement-learning training remain later work.
- An unpacked Windows x64 game directory is the release and local-test target. Players
  extract its ZIP completely and launch the EXE without an installer; the EXE, `resources`
  directory and DLL files must remain together.
- Visual identity: detailed low-cost 3D/pixel hybrid, bold pixel UI, clear silhouettes,
  bright readable weather, and replaceable ship modules rather than permanent block models.
- Monetization is out of scope. Progression, research, supply tickets, procurement,
  equipment and saved builds must be achievable through play or developer tools.
- Supported interface and repository languages: Simplified Chinese, Traditional
  Chinese, English, Japanese, Spanish, German, and Russian.

## 2. Canonical development workflow

- Development source of truth is the Linux server, not the Windows staging folder.
- Server project: `/home/ubuntu/battleship` on `ubuntu@150.65.181.188`.
- Server asset archive: `/home/ubuntu/battleship-assets`.
- Development integration branch is `main`; current unmerged model work is in
  `codex/v072-historical-models`, worktree `~/battleship/.worktrees/v071-first-voyage`.
- The owner explicitly approved upload/testing through `ubuntu@100.97.101.5`,
  the confirmed Tailscale address of the same GPU-273312 host.
- Validation is performed through tests and packaged desktop builds. User-facing
  handoff contains no web endpoint, forwarding command, or server login command.
- Every completed development batch must copy one verified complete Windows game
  directory to the user's PC.
- Only the latest local `battleship-latest-windows-x64` game directory should be retained;
  the previous directory may be atomically replaced after a new package is verified.
- Git commits must use `Arsenic-er <302726993@qq.com>` so the public contributor list
  attributes project work only to the owner.
- Push only when explicitly requested. Never commit tokens, credentials, caches,
  dependencies, generated build directories, EXEs, release ZIPs, or transient tunnel files.

## 3. Combat and handling decisions

### Latest visual direction

- Reconstruct different hulls, components and aircraft from historical references,
  rather than merely changing colour or scaling the same block model.
- Preserve lightweight original procedural geometry, modular loadouts, existing
  saves and gameplay values. Approximate/interpretive details must be labelled.
- Check real dockyard and battle screenshots as well as unit tests; an active mesh
  count alone is not evidence that the player can see a complete model.

### Ships and movement

- Battles start at engine order zero for both combat and sea trials.
- Real ship speeds are the baseline, with moderate compression so a match does not stall.
- Gradual rudder shift, speed loss under hard turn, engine/steering damage, collision
  volume, and location-dependent ramming damage are required.
- Current roster target is five historical destroyers, five light cruisers, and five
  battleships. Slot counts should broadly match historical layouts while starter ships
  need only the equipment required to sail and fight.
- Destroyers emphasize speed, manoeuvrability, torpedoes and anti-submarine depth charges.
  Cruisers and battleships receive larger gun/secondary/AA layouts but no depth charges yet.

### Gunnery

- `1` selects main guns, `Space` fires, and `Q` switches HE/AP.
- Shells must have visible flight time, readable trajectory, dispersion, impact effects,
  reload percentage, and a punchier layered firing sound.
- Two aim references are required: the mouse/fire-control aim and the current physical
  turret/barrel direction.
- A turret may fire before it finishes traversing, using its actual current direction,
  but it must obey structural dead zones and cannot shoot through its own ship.
- Multiple barrels must produce the correct number of projectiles rather than one
  combined shell.
- Damage model includes armour angle, HE penetration, AP ricochet, fuse/overpenetration,
  citadels, compartments, saturation, modules, fire and flooding.
- AI must not be perfectly accurate. It uses noisy sampled contacts, tracking delay,
  dispersion and target-loss behaviour rather than firing with omniscient precision.

### Torpedoes and ASW

- `2` selects torpedoes; torpedoes may be fired without first entering a dedicated aim mode.
- Narrow/wide spread, firing arcs, visible physical launcher traverse, arming distance,
  historical model trade-offs, lead prediction, reserve salvos and damageable launchers
  are part of the baseline.
- Torpedo wakes must remain visible above the underwater weapon while respecting detection.
- Destroyers can equip depth charges and use `G` to drop an aft pattern against underwater targets.

### Damage control

- Hull health uses absolute and recoverable portions, like a fighting-game recoverable bar.
- Damage and repair are progressive rather than instantaneous.
- `H` diverts crew to hull recovery; available manpower changes repair speed.
- Fire, flooding and module repair compete for limited damage-control manpower.
- Flooding affects buoyancy/health recovery and can produce continuing damage until controlled.

## 4. Camera, aiming and input decisions

- Moving the mouse rotates the camera during play; no click-and-drag requirement.
- Vertical camera movement is inverted relative to the earliest prototype.
- In active play the operating-system cursor is hidden and pointer lock keeps control
  inside the window. The cursor appears when paused, on tactical UI, or in developer panels.
- `R` toggles a dedicated scope interface; `R` again or `Esc` exits it.
- Scope camera and transparency must prevent the ship's superstructure from blocking the view.
- The scope reticle and normal fire-control line must derive from the same aim solution.
- The camera must be able to look above the horizon and must not move behind an open
  developer UI panel.
- `Esc` should close the most local overlay first; it must not silently cancel an already
  confirmed air order when leaving the tactical map.

## 5. Tactical map, spotting and fleet AI

- The round minimap is always available; clicking the whole minimap or pressing `M`
  opens the full tactical map. `Esc` closes it.
- Full map supports mouse-wheel zoom from local detail to battlefield overview.
- Friendly ships are shown with distinct cyan markers. Live enemies, stale contacts and
  last-known positions use different presentation.
- Detection is not instant or omniscient. Line of sight, range, smoke, firing bloom,
  terrain and sampled sensor updates determine contact.
- A target leaving sight should transition to a fading outline/last-known marker rather
  than instantly disappearing.
- Dawn Atoll is the first real terrain map: irregular reefs, shallow sandbars, navigable
  channels and high islands that block sight and gunfire. Circular placeholder islands
  are not an acceptable final terrain style.
- Friendly and enemy surface AI use roles, formation anchors, engagement ranges,
  target priority, withdrawal, spotting and reacquisition. Future work should deepen
  terrain-cover use, delayed team spotting and multi-objective tactics.

## 6. Fleet aviation decisions

- `3` selects aviation command; the player commands squadrons but never directly pilots them.
- RTS interaction is inspired by classic real-time strategy controls:
  - left-drag box selection;
  - right-click movement;
  - `Shift` plus right-click for additive target selection;
  - `C` opens guard, intercept, patrol and surface-strike orders;
  - drag/right-click gestures select areas or groups depending on the active order.
- Aircraft choose guns, bombs or aerial torpedoes according to squadron role and target.
- Formations must not look like five rigid objects at one altitude. Each aircraft needs
  role-aware offsets, altitude variance, bank/turn behaviour and independent attack timing.
- Developer view must allow following a squadron or aircraft to inspect its decision-making.

## 7. Economy, armory and dockyard decisions

- Armory and warehouse share one top-level menu with internal procurement/inventory views.
- Inventory lists must scroll inside a bounded panel rather than lengthening the entire page.
- Every equipment component has its own readable card art; rarity appears in the card border,
  not merely as a plain colour label.
- Equipment categories include main guns, torpedoes, secondaries, AA, depth charges,
  magazines, engines and steering. Historical model names replace generic colour-only items.
- Ship type controls compatible slots and slot counts.
- Dockyard 3D preview must visibly update when equipment changes.
- Automatic fitting deterministically selects the best compatible owned equipment.
- Every newly available ship receives a minimum seaworthy starter loadout and a usable
  standard build so battle setup never immediately fails for missing essential equipment.
- Saved ship builds are locally persistent and selectable during single-player battle setup.
- Developer mode bypasses ownership and price checks and exposes all equipment immediately.

## 8. Menus, HUD and presentation decisions

- Clicking Single Player opens a battle-preparation screen rather than immediately starting.
- Preparation chooses fleet size/composition, weather and a saved player ship build.
- Weather is a compact dropdown. Clear sunny weather is the maximum-visibility reference,
  with additional weather profiles derived from it rather than replacing it.
- Combat HUD should show only critical weapon and ship-status information by default.
- Hold `Tab` for detailed combat information and controls; releasing it closes the panel.
- Do not overlap hold-Tab panels with the permanent naval instrument cluster.
- Bottom-left instruments resemble a ship dashboard and show engine order, speed, heading,
  rudder and hull condition. Low-value explanatory text near the reticle is removed.
- Top capture/score progress belongs at the top edge of the screen.
- Bold Fusion Pixel is the preferred interface font.
- UI button sounds currently offer three synthesized candidates: bridge relay,
  mechanical lever and pixel radiotelegraph. They share the normal volume/mute controls.

## 9. Developer mode requirements

- Open from `F3` and expose module health, compartment health, hull/recoverable health,
  engine order, actual speed and other runtime values.
- Unlimited ammunition, no reload delay, all weapons/equipment free, and adjustable speed.
- Spawn/remove friendly and enemy ships or aircraft while respecting performance caps.
- Show collision volumes and force damage/repair states.
- Transfer player control to another ship, return to the player ship, or spectate aircraft.
- Developer UI interaction freezes background camera input and releases the cursor.

## 10. Art, models, effects and audio

- Current models are modular procedural geometry, not final-quality historical meshes.
- Ship silhouettes, bow/foredeck integrity, superstructure materials, gun counts and fitted
  component visibility have repeatedly been identified as the largest visual weakness.
- Future external models are allowed only after author, source URL, exact licence,
  redistribution terms, download date and original archive hash are documented.
- Hull, bridge, mast, guns, torpedo launchers, AA, secondaries and collision meshes must
  remain replaceable so upgrades can visibly change the ship.
- Establish LOD0/LOD1/LOD2 and separate render meshes from physics colliders.
- Effects baseline: transparent readable water, bright sky/atmospheric perspective,
  3D smoke, fire, muzzle flash, shell trail, impact splash and torpedo wake.
- Audio baseline: engine telegraph bells, turret machinery, ocean ambience, intermittent
  seabirds, layered cannon transient/pressure/echo, explosions and selectable UI cues.

## 11. Known limitations and next design questions

- Replace or substantially rebuild procedural hulls for Fletcher, Cleveland and Yamato
  as benchmark external-model pipelines.
- Validate every installed component in the full dockyard preview, not only the active candidate.
- Expand fleet composition rules and scenario objectives after 3v3 stability.
- Deepen terrain navigation, cover seeking, shared spotting delays and tactical withdrawal.
- Run larger paired-seed balance matrices; current open balance concern is Kagero versus Fletcher.
- Tune normal battles toward the 15–20 minute target with fewer timeout endings.
- Capture visual-regression baselines at 1440x900 and 1280x720.
- Produce and publish a fresh Windows directory build, optionally delivered as a ZIP, only
  after the current single-player loop and asset pipeline are stable.

## 12. Resume checklist after server migration

1. Clone both repositories.
2. Use the project-local Node.js 24.x runtime and run `npm ci` in the game repository.
3. Read this file, `docs/DEVELOPMENT_STATUS.md`, `docs/DEVELOPMENT_LOG.md`,
   `docs/ARCHITECTURE.md`, and the asset repository's `PAUSE_HANDOFF.md`.
4. Run `npm test -- --run`, `npm run build`,
   `npm run assets:ships:validate -- public/assets/ships`, and
   `npm run desktop:dist`; verify the complete Windows directory before handoff.
5. Confirm the seven-language menu, battle setup, dock/armory, battle, tactical map,
   scope and developer mode before changing systems.
6. Preserve the two-repository boundary: buildable runtime assets remain in the game
   repository; editable/source/high-resolution art belongs in the private asset repository.
