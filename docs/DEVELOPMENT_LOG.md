# Condensed Development Log

Last updated: 2026-08-22

Current archived game commit before this documentation update: `96fcd51` (`0.6.12`)

This is a milestone log derived from the Git history and the long development
conversation. It is intentionally more compact than a commit-by-commit transcript.

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
4. Tune the mixed-fleet match toward a 6–9 minute median and at least 70% non-timeout endings.
5. Deepen terrain navigation, cover use, delayed shared spotting and multiple objectives.
6. Show complete installed loadouts in the dockyard 3D preview.
7. Package a new portable Windows build only after the single-player loop and visual
   baseline remain stable.
