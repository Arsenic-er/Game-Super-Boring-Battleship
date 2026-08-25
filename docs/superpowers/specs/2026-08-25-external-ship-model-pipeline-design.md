# External Ship Model Pipeline Design

Date: 2026-08-25

## Goal

Replace simplified procedural hull presentation one ship class at a time without allowing an unlicensed, malformed, or oversized model to break combat, damage simulation, saved loadouts, dock previews, or low-end performance.

## Approved constraints

- The authoritative workspaces remain `/home/ubuntu/battleship` and `/home/ubuntu/battleship-assets` on `ubuntu@150.65.181.188`.
- Runtime ship art uses binary `.glb` only. Blender/FBX source files stay in the private asset repository.
- Never import models ripped from commercial games. Every external model requires a source URL, creator, licence, download date, checksum, and modification history.
- The existing procedural fleet remains a permanent fallback.
- Delivery policy updated for 0.7.0: Windows builds are complete game directories built
  on the server, verified, and copied to the user's PC as the one latest local directory.
  This supersedes every earlier package-retention and web-handoff instruction.
- User-visible validation uses the packaged desktop game; the handoff contains no web
  endpoint, forwarding command, or server login command.
- Single-player battles have a 20-minute hard limit and are tuned toward a 15–20 minute normal duration.

## Recommended architecture

### Asset repository

Each ship lives at `ships/<ship-class-id>/` with source/licence records and validated runtime exports:

```text
ships/fletcher/
  manifest.json
  provenance/
    LICENSE.txt
    SOURCE.md
  source/
    fletcher.blend
  exports/
    lod0.glb
    lod1.glb
    lod2.glb
```

Only `manifest.json`, the three GLBs, and required attribution notices are mirrored into the game repository under `public/assets/ships/<ship-class-id>/`.

### Manifest contract

`ShipAssetManifest` records:

- schema version and exact `ShipClassId`;
- creator, source URL, licence identifier, redistribution permission, download date, SHA-256, and modification notes;
- metres, `+Y` up, `+Z` bow, root scale `1`, zero root rotation, waterline origin;
- LOD file names and triangle/material/texture budgets;
- required named hardpoints;
- simplified collision and damage-zone volumes separate from render meshes.

Blocking errors reject a package. Budget overages, incomplete provenance, missing LODs, missing hardpoints, invalid dimensions, or a render mesh used as a collider are blocking errors. Non-critical naming or optional metadata issues are warnings.

### Runtime boundary

`ShipVisualFactory` is the only code path allowed to create visible hulls. It selects a validated external GLB when registered and available, otherwise creates the current procedural hull. Both combat and dockyard consume this factory.

External loading is asynchronous and isolated from simulation. The simulation continues to own position, collision, armour, compartments, weapons, firing arcs, and damage. A model load error is reported once and falls back without preventing battle startup.

### Hardpoints and weapons

The imported hull exposes transform nodes for main batteries, torpedoes, AA, secondary guns, depth charges, bridge, mast, funnels, wakes, and damage effects. Project-owned modular weapons attach to these transforms. Per-class gameplay definitions still determine mount count, firing arcs, reload, muzzle velocity, shell count, and damage.

The first complete benchmark is Fletcher. Cleveland validates cruiser-scale secondary/AA layouts; Yamato validates capital-ship scale, armour-zone alignment, large turrets, and long-distance LOD switching.

### Collision and damage

Visual meshes are never physics colliders. The manifest describes simple bow, central hull, bridge, machinery, magazine, and stern volumes. Existing simulation collision and armour rules remain authoritative. Developer mode can display these volumes for alignment checks.

### LOD and performance

| Level | Triangle budget | Materials | Intended use |
|---|---:|---:|---|
| LOD0 | 30k–45k | <= 6 | Dock and near combat |
| LOD1 | 10k–15k | <= 4 | Normal combat |
| LOD2 | 2k–4k | <= 2 | Distance and low quality |

The preferred atlas is 1024 px with point sampling. LOD thresholds are based on projected size/distance and quality mode. Missing lower LODs reject the asset rather than silently rendering LOD0 everywhere.

## Failure behaviour

- Unknown schema version: reject during validation.
- Missing or unverifiable licence: quarantine in the asset repository; never mirror to the game.
- Missing file/checksum mismatch: reject during validation.
- Runtime fetch, parse, or node-resolution failure: log once, dispose partial resources, create procedural fallback.
- Missing optional hardpoint: warn and hide the optional component.
- Missing required hardpoint: reject the package.
- Saved profiles remain compatible because they store ship/equipment IDs, not model paths.

## Verification

- Pure manifest validation tests cover valid, malformed, over-budget, incomplete provenance, missing hardpoint, and collision/render alias cases.
- NullEngine tests cover external-selection and procedural-fallback behaviour without network access.
- Combat and dock tests assert the same visual factory and component hardpoint mapping.
- Lifecycle tests assert partial-load and ship disposal release nodes, meshes, materials, and textures.
- Visual checks cover menu, dock, setup, battle, scope, tactical map, and developer view at 1440x900 and 1280x720.
- Full gate: `git diff --check`, `npm test -- --run`, `npm run build`, and
  `npm run assets:ships:validate -- public/assets/ships`, followed by a verified
  complete Windows directory build.

## Delivery order

1. Contract and validator.
2. Runtime registry and safe fallback.
3. Shared combat/dock visual factory.
4. Hardpoint and collider adapters.
5. Licensed Fletcher benchmark.
6. Cleveland and Yamato benchmarks.
7. Remaining classes, balance tuning, AI/terrain work, and complete-directory release.
