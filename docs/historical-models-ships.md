# Historical hull reconstruction — 0.7.2 work in progress

Status on 2026-09-12: **UPLOADED; FOCUSED NULLENGINE VERIFICATION PASSED; SCOPED WEBGL VISUAL REVIEW COMPLETE**. The user's explicit approval restored upload/testing through 100.97.101.5 to the feature worktree. All 20 historical-hull tests passed on the development server. All 15 live-equipped hulls have been rendered and their corrected three-quarter contact sheets reviewed. The final equipment-shell/support correction was checked separately on all five battleships with full common equipment slots: the renders completed without browser errors and their contact sheet was visually reviewed. Geometry counts below describe the hull-only implementation; software-renderer timings are not hardware GPU certification.

## Scope and ownership

Original source geometry only. No commercial game model, downloaded mesh, museum image, texture scan or third-party mesh is shipped. The hull implementation owns `src/render/shipHullVisual.ts`, `historicalShipProfiles.ts`, `historicalShipGeometry.ts`, `tests/historicalShipGeometry.test.ts` and this document. Shared materials, weapons, aircraft, simulation, classes and the main renderer are outside this work package.

The three-dimensional shapes are low-poly interpretations of broad historic recognition features, **not museum-certified reconstructions or measured shipyard lines**. The class registry's existing era strings are preserved. The `breadths`, bridge heights, funnel rake angles, working-deck offsets and structural thicknesses are authored approximations. Sources with later dates are explicitly not evidence that a particular 1939/1940 radar or AA arrangement existed.

## Architecture and contracts

- The public `createProceduralShipHull` API and returned `root`, `bodyMeshes`, `rudder`, `propellers` remain intact. The caller still owns the parent root and its non-uniform scale.
- Hull coordinates use a 112-by-11 normalized baseline. Construction happens in metre space and vertex positions are divided by `beam/11`, `deckHeight/8`, `length/112` before they enter the existing parent coordinate system. The shader therefore receives the same world dimensions without a second hull scale.
- Fifteen independent profiles supply waterline breadths, sheer, forecastle breaks, stern shapes, bridge forms, funnels, masts, aviation arrangements and shaft count.
- Bridge forms use continuous cores with navigation rooms, panes, thin galleries and bridge wings; they do not scale down an identical solid box at every height. The Japanese pagoda has non-monotonic cantilever platforms around a continuous core. German wedge, French tower, early rounded US destroyer and British open navigation bridges use different massing.
- Static faces are appended directly to five material buckets. There is no scene mesh per railing, window or steam pipe and no additional material allocation. All 15 classes measured five static draw meshes and 3,048–4,098 static triangles, below the fewer-than-12-draw/15,000-triangle budget.
- Continuous metre-space planar UVs replace per-triangle full-atlas UVs. No new textures are introduced. Materials are supplied by the caller and are not disposed by this adapter.
- Weapons are not baked into the hull. Fixed structural barbettes remain when equipment slots are empty; each starts 0.08 m inside the local interpolated crowned/sheered deck and ends 0.2 m below its shared hardpoint base, overlapping the equipment roller ring without covering the pivot. Its radius is approximately 0.429 times the metre-space mount diameter. Per-seat `baseY`/`topY` and height are recorded and tested. Installed equipment, previews and animation continue through the existing loadout adapter.
- Protected main-battery locations are read from `getMainBattery`/`mainBatteryMountLocalPosition`; clearance radius uses the metre-space mount diameter, never a second root-scale multiplier. Major bridge/funnel placement checks these locations and already placed major buildings, preferring a small aft adjustment. Funnel bounds include the wider foot and the complete aft-raked casing; their feature centres describe these bounds. Requested and actual positions are recorded in `root.metadata.features`; this is an inspectable rendering adaptation, not a simulation mutation. All 15 main-mount/major-building clearance checks pass.
- Masts intentionally may be integrated into bridge structures; they are not required to avoid the buildings that support them. Aircraft cranes, boats and rigging remain simplified visual fittings, not usable gameplay entities.
- Propellers and rudder retain real animated nodes; the model uses 2/3/4 shafts by class profile. A nonrotating inverse-scale frame precedes the animated rotations; the Yamato regression confirms constant world-space blade radius at four rotation angles. Propeller leaf edges are included rather than representing each blade by two disconnected front/back polygons. The tests check triangle validity and winding, **not global watertightness or absence of all self-intersections**.

## Era / recognition matrix and source evidence

Research used the installed agent-reach Exa route and Jina page reading. Only public catalogue records and public historical descriptions were read; archive images were not downloaded into the project. The following source records were retrieved during this task. The code's detailed dimensions are author approximations, not measurements extracted from these records.

| Class / chosen game era | Intended recognition features | Evidence and limits |
| --- | --- | --- |
| Fletcher / 1942 | Early rounded bridge, flush working deck, two separated mildly raked funnels | [NHHC Fletcher archive](https://www.history.navy.mil/our-collections/photography/us-navy-ships/alphabetical-listing/f/uss-fletcher--dd-445-dde-445--0.html); [archived US naval photo captions, 19-N-31243/31245, July 1942](https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/sh-usn/usnsh-f/dd445.htm). Later square-bridge ships are not substituted. |
| J class / 1939 | Single broad funnel, low Admiralty navigation bridge, long low afterdeck | [IWM A 29614, Jervis, 1945](https://www.iwm.org.uk/collections/item/object/205160838). Later reference establishes family recognition only; a 1939 full-profile primary record remains a research gap. |
| Kagerō / 1939 | Enclosed Japanese bridge, unequal raked funnels, fine cruiser stern | Exact 1939 museum/archive record not yet established. [Shiranui 1939 photo context](https://en.wikipedia.org/wiki/Japanese_destroyer_Shiranui_(1938)) is secondary discovery only. The NHHC `NH 48201` search result is the **1899** Kagero and was rejected. Do not claim museum-verified 1939 fittings. |
| Type 1936A (Z23) / 1942 | Flared bow, angular bridge wings, paired large funnels | [Bundesarchiv technical drawings guide](https://www.bundesarchiv.de/im-archiv-recherchieren/archivgut-recherchieren/nach-themen/technische-zeichnungen-militaerischer-herkunft-bis-1945/) identifies the RM 25 plan collection, not a reviewed Z23 1942 plate. Ship-specific original-photo/plan verification remains outstanding. |
| Tashkent / 1941 | Long leader hull, rounded streamlined forward building, conspicuously raked funnels/masts | [Central Naval Museum model record](https://navalmuseum.ru/collection/ship/modeli?id=1501) identifies a Tashkent model labelled 1937; [historic-photo archive and 1941 rearmament chronology](https://navsource.narod.ru/photos/03/270/index.html) gives the later fit. The museum's model-year label is not treated as proof of 1941 detail. |
| Cleveland / 1942 | Tall enclosed bridge, paired stacks, quarterdeck hangar hatch and twin catapults | [NHHC Cleveland archive](https://www.history.navy.mil/our-collections/photography/us-navy-ships/alphabetical-listing/c/uss-cleveland--cl-55-0.html); [NH 55173 and 19-N-31741 captions](https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/sh-usn/usnsh-c/cl55.htm). |
| Edinburgh / 1939 | Town-group block bridge, widely spaced stacks and transverse catapult/hangars | [IWM aerial view, October 1941](https://www.iwm.org.uk/collections/item/object/205016008); [IWM A 5026 aircraft-handling record](https://www.iwm.org.uk/collections/item/object/205139282). These are later than the chosen 1939 fit; exact radar and light AA omitted. |
| Nürnberg / 1935 | Slender cruiser hull, forward tower, unequal stacks, central catapult and clear aft gun field | [IWM A 28472, 1945](https://www.iwm.org.uk/collections/item/object/205159825) is a later whole-ship reference; [Bundesarchiv RM 25 guidance](https://www.bundesarchiv.de/im-archiv-recherchieren/archivgut-recherchieren/nach-themen/schwere-und-mittlere-kampfschiffe-der-reichs-und-kriegsmarine-1919-1945/) records available ship documents. Exact 1935 fittings not certified. |
| Agano / 1942 | One trunked raked funnel, tall narrow bridge, aviation working deck | [October 1942 photograph discovery](https://ww2db.com/photo.php?color=all&list=search&foreigntype=S&foreigntype_id=474); [CombinedFleet chronology](https://www.combinedfleet.com/agano_t.htm). These are specialist secondary references; primary museum provenance remains a gap. No 1943 radar is added. |
| Dido / complete 1940 design | Compact bridge behind forward gun field, two narrow funnels, no catapult | [IWM A 9265, February 1941](https://www.iwm.org.uk/collections/item/object/205143130). The game's complete design is retained, not a claim that every sister's delivered armament matched it. |
| North Carolina / 1941 | Fine bow, narrow high tower and two stacks, stern catapults | [NHHC North Carolina](https://www.history.navy.mil/our-collections/photography/us-navy-ships/battleships/north-carolina-bb-55.html). Commissioned in 1941; source archive spans later service too, so fine AA/radar fit remains simplified. |
| King George V / 1940 | Low sheer, massive navigation block, broad paired funnels, midships aviation | [IWM A 1486, 1940 dry dock](https://www.iwm.org.uk/collections/item/object/205015966). Do not import later removal of the aviation arrangement into the 1940 profile. |
| Bismarck / 1940 | Atlantic bow, armoured conning body, one large funnel and aft tripod | [Bundesarchiv Bismarck technical drawing reference RM 25/231 image 0004](https://www.bundesarchiv.de/im-archiv-recherchieren/archivgut-recherchieren/nach-themen/technische-zeichnungen-militaerischer-herkunft-bis-1945/). Full shipyard plan has not been measured or reproduced. |
| Yamato / 1943 | Broad hull, pagoda core/galleries, steeply raked funnel, stern handling rails | [Kure museum dimensions](https://yamato-museum.com/yamato-data/), [museum model methodology](https://yamato-museum.com/en-lp/). Museum confirms 263 m × 38.9 m and reconstruction methods; its displayed model must not be assumed to depict every 1943 fitting. This draft does not reproduce a 1945 AA forest. |
| Richelieu / completed 1943 refit | All-forward gun field, faceted tower, raked funnel/mast assembly, no operational catapult model | [IWM A 20300, October 1943 at Oran following American refit](https://www.iwm.org.uk/collections/item/object/205152783). Whole-ship form reference; refit-specific detail and stern arrangement require image review. |

Museum/archival photographs may have separate reuse restrictions; they are references only. Links do not grant a licence to ship their pixels or reproduce another modeller's mesh. This source matrix makes incomplete provenance visible instead of substituting generic museum home pages as proof.

## Known integration and historical limits

1. The root owner's DD main-hardpoint revision is integrated: the hull tests now read the revised historical forward/aft groups. This hull package does not own those shared battery edits.
2. The root owner's Agano correction to `[.29, .17, -.29]`, with the second mount raised, is integrated. This profile's bridge is aft of B mount at `.07`. Its raked funnel is moved aft 6.5 m by the conservative building-clearance rule; this visible approximation needs screenshot review.
3. Root scaling is preserved for API compatibility, including the game's existing deck heights. These are not waterline/draft measurements. Future migration to a single uniform metre-space root should be a separate coordinated renderer/simulation change.
4. Buildings are clear of main mounts by conservative plan-view bounds, but the algorithm does not certify every possible rotated gun barrel envelope, torpedo/AA slot or developer overflow loadout. All three hull families need full-loadout screenshot review. Overlap telemetry records the adjusted positions.
5. The inherited non-uniform root contract is cancelled before rudder/propeller rotation; constant propeller radius is tested. Shaft machinery, draft and rudder hydrodynamics are still simplified, not physically exact machinery reconstructions.
6. Small boats, rails, scuttles, crane structure and funnel steam pipes are recognition-scale approximations. No interiors, lifeboat rigging simulation, radar sweep animation, rigging physics or new gameplay entities are added.
7. Model-builder tests cannot establish silhouette quality. Real Chromium/SwiftShader galleries now cover all 15 live-equipped hulls. The original `.qa/historical-models/full-ships/report.json` contains three requested views per class; its first three-quarter camera setup was later found incorrect, so that image is not accepted as the requested angle. The subsequent `.qa/historical-models/final-threequarter/report.json` asserts the camera angles and provides the reviewed three-quarter baseline across all 53 hull, equipment and aircraft models. These are actual WebGL images, but not a hardware GPU performance result.

## Measured geometry and verification

Measured with `HULL_GEOMETRY_REPORT=1` on the development server. Total hull meshes/triangles include animated rudder and propeller meshes, but exclude equipment and aircraft. Each class has exactly five static material meshes.

| Class | Static triangles | Total hull triangles | Total hull meshes |
| --- | ---: | ---: | ---: |
| Fletcher | 3286 | 3466 | 10 |
| J class | 3048 | 3228 | 10 |
| Kagerō | 3190 | 3370 | 10 |
| Type 1936A | 3238 | 3418 | 10 |
| Tashkent | 3226 | 3406 | 10 |
| Cleveland | 4098 | 4430 | 14 |
| Edinburgh | 4014 | 4346 | 14 |
| Nürnberg | 3762 | 4018 | 12 |
| Agano | 3612 | 3944 | 14 |
| Dido | 3686 | 4018 | 14 |
| North Carolina | 3982 | 4314 | 14 |
| King George V | 3886 | 4218 | 14 |
| Bismarck | 3728 | 3984 | 12 |
| Yamato | 3956 | 4288 | 14 |
| Richelieu | 3264 | 3596 | 14 |

Nonzero major-building adjustments: Type 1936A aft funnel −5 m; Cleveland forward funnel −2 m; Edinburgh forward/aft funnels −3.5/+1.5 m; Agano funnel −6.5 m; Dido forward funnel −0.5 m; Yamato funnel −1 m. Kagerō/Type 1936A aft masts move +2.5/+2 m. All other requested/actual offsets are zero. These are recorded compromises to preserve current gameplay hardpoints, not newly asserted historical measurements.

Run on `/home/ubuntu/battleship/.worktrees/v071-first-voyage`, never build the desktop locally:

Completed on 2026-09-12 after the local-deck barbette adjustment: `npx tsc --noEmit`, the five-file hull/shipGeometry/loadoutVisualPlan/dockLoadoutRenderer/gameViewVisualSession run (**56/56 passed**, 8.25 s), and `git diff --check`. An earlier six-file run exposed two shared mainBattery muzzle-height expectations affected by the concurrent metric-equipment/elevation change; those were reported to the shared-code owner and are not represented as passing here. The following command remains the combined integration recheck:

```sh
npx tsc --noEmit
npx vitest run tests/historicalShipGeometry.test.ts tests/shipGeometry.test.ts tests/loadoutVisualPlan.test.ts tests/dockLoadoutRenderer.test.ts tests/gameViewVisualSession.test.ts tests/mainBattery.test.ts --reporter=verbose --no-file-parallelism
git diff --check
```

The historical geometry suite has 20 test cases: complete era/profile fixtures; funnel/aviation/shaft fixtures; 15 class builds checking finite coordinates, nondegenerate triangles, LH normal agreement, independent side/keel/end-cap outward normals and deck +Y normals, index validity, exact world hull length/beam, static budgets, main barbette bases and major-building/main-mount clearance; unique geometry signatures; public API, rudder movement, disposal and shared-material ownership; constant propeller world radius. All 20 passed. TypeScript also passed. The dock regression's obsolete greater-than-20-mesh assertion was replaced with complete geometry membership, nonempty indices/vertices, finite positions and working rudder/propeller nodes; fewer meshes is intentional batching, not missing ship parts.

An intermediate independent-normal assertion used each bow-cap vertex's X sign and failed on a correctly forward-facing triangle spanning the centreline. Diagnosis identified Fletcher vertex 531 in the bow cap, after side vertices 0–503 and stern cap 504–521. The corrected independent test uses the physical outward direction of each surface: sides ±X, keel −Y, stern −Z, bow +Z. This does not relax the requirement for the actual deck to face upward.

Visual evidence scope: the original full-ship gallery records 15 classes with requested three-quarter, side and top views; the corrected-camera three-quarter baseline is the primary reviewed view. Final equipment-specific rechecking is recorded separately in `.qa/historical-models/final-accepted-battleships/report.json`: all five battleships rendered successfully after the shell/support fix, with 42-58 actual draw calls and 9,224-13,786 total assembled triangles. Direct contact-sheet review confirms closed gunhouses, preserved main-battery scale and visibly supported AA/secondary positions in that view; no new blocking visual defect was found. The tall support columns are schematic accommodations to existing equipment hardpoints, not measured historical platform reconstructions. Neither report claims every empty/interleaved loadout, all close-up details, waterline behavior or animated propeller view was visually certified. Gallery processes close their temporary loopback Vite service; no persistent preview is required.

Full regression, release packaging, interactive dock/battle checks and performance acceptance are tracked by the release owner separately. A NullEngine pass or Chromium SwiftShader CPU-submit timing is not a GPU benchmark. Those outcomes must be recorded from their own evidence, not inferred from this isolated geometry gallery.
