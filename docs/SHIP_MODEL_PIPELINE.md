# Ship model pipeline

The battle and dockyard now share the same 112 m multi-station fallback hull. External art must not replace simulation collision or damage volumes.

## Coordinate and performance contract

- metres; `+Y` up, `+Z` bow, `+X` starboard;
- origin at the waterline and rotation centre; root scale 1 and zero rotation;
- LOD0 30k–45k triangles with one 1024 atlas; LOD1 10k–15k; LOD2 2k–4k;
- no more than six materials and about fifteen draw calls per ship;
- pixel style comes from low-resolution palette textures and point sampling, not a crude silhouette.

## Required hardpoints

`HP_MAIN_FWD_01`, `HP_MAIN_AFT_01`, `HP_TORPEDO_CENTER_01`, `HP_AA_PORT_01`, `HP_AA_STARBOARD_01`, `HP_BRIDGE_01`, `HP_MAST_01`, `FX_FUNNEL_01`, `FX_WAKE_PORT`, `FX_WAKE_STARBOARD`, `FX_DAMAGE_BOW`, `FX_DAMAGE_ENGINE`, and `FX_DAMAGE_STERN`.

Weapons remain project-owned modular components. Each uses `COMPONENT_ROOT / PIVOT_YAW / PIVOT_PITCH / BARREL_* / MZ_*`, so equipment upgrades change the visible weapon and its real muzzle position.

## External asset policy

Do not import models ripped from World of Warships, War Thunder, or other games. A model needs a traceable creator, a licence permitting redistribution, the original licence file, source URL, download date, checksum and modification log. CC BY assets require attribution in the in-game credits and third-party notices.

The free Fubuki candidate is quarantined because its public geometry metadata closely matches an older paid model; it must not enter the repository without provenance confirmation. The association-commissioned Kikuzuki model has clearer provenance but is far above the runtime polygon budget and would require an offline licensed download and LOD reduction first.
