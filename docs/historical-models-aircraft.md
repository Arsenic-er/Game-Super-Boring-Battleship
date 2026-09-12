# Historical carrier aircraft: original low-polygon studies

## Scope and status

Six original, procedural aircraft silhouettes replace the former box-and-cross stand-ins. These are gameplay-distance visual studies, not manufacturing drawings or flight-dynamics models. No third-party game geometry, textures, photographs, or museum image assets are embedded.

The five-argument `createAirSquadronGeometry(scene, id, team, role, capacity)` interface and each plane's `{ root, body, propeller }` remain intact. The nose points along +Z, +Y is up, and the propeller turns about Z. Existing formation poses, flight AI, speed, targeting, damage, network messages and serialization are untouched. Profile IDs and years exist only on render metadata.

The player/enemy default chooses an American/Japanese *visual support group*. It is not a rule assigning nationalities to player ships, commanders, or mixed fleets. Dates below represent the appearance period selected for the preset, not a universal first-service date.

**Handoff status:** uploaded to the authorized development worktree. The existing aircraft suite plus the historical suite pass all 33 tests, and `npx tsc --noEmit` passes (2026-09-12). Each of the six presets was tested with capacities 1, 6 and 10: two shared geometries per squadron, three material submeshes per aircraft, fewer than 2,500 static triangles, outward fuselage/upper-wing normals, and metre-scale bounds preserved in translated world coordinates. Real Chromium/SwiftShader WebGL screenshots also found and drove a fix for wing insignia clipping; the corrected roundels/stars now conform to individual wing-skin triangles rather than hovering on a horizontal plane.

## Presets

| ID / appearance period | Length × span (m) | Recognition features |
| --- | --- | --- |
| `f6f-3-hellcat` / 1943 | 10.21 × 13.04 | Broad radial cowling, deep fuselage, low tapered wing, large fin, compact raised canopy |
| `a6m2-zero` / 1941 | 9.06 × 12.00 | Slim fuselage, black radial cowling, long rounded Model 21 wing tips, framed single-seat canopy |
| `sbd-2-dauntless` / 1941 | 9.957 × 12.649 | Broad center wing, tandem greenhouse, rear flexible gun, red perforated dive-brake representation, centerline bomb/crutch |
| `d3a1-val` / 1941 | approximately 10.20 × 14.37 | Rounded tapering wings, tandem canopy, fixed spatted undercarriage, rear gun, centerline bomb |
| `tbf-1-avenger` / 1942 | approximately 12.471 × 16.510 | Large deep fuselage, broad wing, long forward canopy and separate dorsal gun turret, internal torpedo-bay outline |
| `b5n2-kate` / 1941 | 10.30 × 15.50 | Slender body, long three-place greenhouse, broad tapered wing, external aerial torpedo and rear gun |

## First-party source register

Research was performed through Exa search and Jina page extraction under the agent-reach workflow, checked on 2026-09-12. The linked institutions' text and photographs informed the original hand-authored geometry; no image/model downloads are required at runtime.

- [Smithsonian: Grumman F6F-3K Hellcat collection entry](https://airandspace.si.edu/collection-objects/grumman-f6f-3k-hellcat/nasm_A19610107000). Overall object dimensions include 1,021 cm length and 1,304 cm span. The article identifies the larger radial engine, low wing, enlarged tail, 1942 prototype and 1943 production. The preset is a wartime F6F-3 silhouette, **not** a copy of the museum aircraft's later drone paint scheme. The catalog has mixed F6F-3/F6F-5 descriptive metadata, so minor variant-specific fittings are not asserted.
- [Smithsonian: Mitsubishi A6M Zero Fighter](https://airandspace.si.edu/stories/editorial/mitsubishi-a6m-zero-fighter), 2020. Informs the lightweight wing/body construction and compact engine/cockpit relationship. [National Museum of the USAF: A6M2 Zero](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196313/mitsubishi-a6m2-zero/) identifies the museum aircraft as an A6M2 and provides historical context and photographic shape evidence. [Pearl Harbor Aviation Museum: How Fast Was the Zero?](https://www.pearlharboraviationmuseum.org/news/blog-archives/how-fast-was-the-zero/) distinguishes Model 11/21 from later shortened-wing models. This preset uses the long rounded Model 21 silhouette; the exact 9.06/12.00 m envelope remains a nominal modeling input, not a measurement of a museum airframe.
- [National Naval Aviation Museum / NHHC: SBD Dauntless BuNo 2106](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/s/sbd-dauntless-buno-2106.html). The listed 32 ft 8 in length and 41 ft 6 in span convert to approximately 9.957 and 12.649 m. [NNAM: SBD-2 Dauntless](https://navalaviationmuseum.org/sbd-2-dauntless/) explains perforated dive flaps and identifies the preserved SBD-2. We select SBD-2 rather than silently labeling SBD-2 reference geometry as SBD-3.
- [Pearl Harbor Aviation Museum: Our Newest Acquisition](https://www.pearlharboraviationmuseum.org/news/blog-home/our-newest-acquisition/), 2024. The D3A restoration article explicitly notes that recovered parts come from multiple aircraft and that exact variant identification is under study. It is a general D3A silhouette reference, **not** proof that the restoration is a D3A1. [Planes of Fame: Aichi D3A2](https://planesoffame.org/aircraft/plane-D3A2) is a genuine Val reference, unlike the museum's separately labeled BT-15 movie conversion; its variant dimensions are not copied into D3A1. The D3A1 numerical envelope remains approximate pending a directly verified variant-specific engineering table.
- [NNAM: TBM Avenger](https://navalaviationmuseum.org/tbm-avenger/) describes the 1941 prototype and internal bomb bay. [NHHC / NNAM: TBM Avenger](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/t/tbm-avenger.html) supplies a 40 ft 11 in length and 54 ft 2 in span. The TBF-1 preset uses this closely related Avenger family envelope as an explicitly approximate visual reference; it does not claim that all TBM fittings are TBF-1 fittings. The dorsal turret and deep fuselage are retained; a historically incorrect externally slung full torpedo is avoided.
- [Pearl Harbor Aviation Museum: Nakajima B5N2 Kate Type 97-3 Carrier Attack Aircraft at Pearl Harbor](https://www.pearlharboraviationmuseum.org/news/blog-archives/nakajima-b5n2-kate-type-97-3-carrier-attack-aircraft-at-pearl-harbor/), 2017. Variant comparison gives 15.5 m span and 10.3 m length and documents the long crew canopy and radial-engine/cowling differences. [PHAM: The Bombs of the Second Wave](https://www.pearlharboraviationmuseum.org/news/blog-archives/the-bombs-of-the-second-wave/) associates Type 91 aerial torpedoes with B5N2 and 250 kg bombs with D3A1.

## Rendering construction and deliberate simplifications

- Fuselages/cowlings use elliptical station lofts, wings use cambered airfoil sections with taper, rounded tips and dihedral, and fins use thin shaped solids. The six profiles use different station coordinates, not just different scale or paint.
- Each body is one mesh with two submeshes: vertex-colored paint and opaque dark glossy canopy glazing. Each independently rotating propeller is one mesh containing three pitched/tapered blades and a spinner. Nominal cost: **three material draws per plane**; no transparent glass sorting or texture fetches. All static body and propeller indices together must remain **below 2,500 triangles per aircraft**.
- Every squadron owns one body geometry and one propeller geometry. Its remaining aircraft are clones sharing these geometries and material objects. There is no global cache that can become invalid when another squadron is removed. Ownership-root disposal explicitly includes MultiMaterial children and also covers plain `root.dispose()`.
- Three-blade propellers are real silhouette geometry, not a two-bar cross or a motion disc. Propeller color and pitch are readable approximations rather than exact manufacturer blade-section drawings.
- Canopies are opaque and contain no crew/interior. Frames are slightly exaggerated to remain visible at formation distance. Engine cylinders, rivets, fabric ribs, control linkages, radio wires, wing-fold mechanics and working landing-gear animations are omitted.
- The Val retains its fixed main undercarriage. The five retractable-gear types show a clean flight configuration because this interface has no landing-gear state. Existing flight phases are not repurposed or modified.
- Dauntless dive brakes are nearly closed red panels with dark inset discs representing perforations; the discs are not literal cut-through holes. Neither dive brakes nor payload objects animate independently.
- Bombs and the Kate's torpedo have shaped bodies and tail fins. The Avenger's torpedo is modeled inside the closed belly with visible bay-seam cues, not as external ordnance. These parts remain attached visual identification cues: they do not encode current ammunition or create additional shots. Exact bomb marks and fuze details are not claimed.
- Basic national roundels/stars are procedural painted geometry and selected period palettes are generalized. They do not reproduce any particular pilot's aircraft, unit marking, serial number, or exact paint chip. No tactical team tint is added to the aircraft mesh.

## Verification results and visual evidence scope

Preserve the existing `tests/aircraftGeometry.test.ts`, add `tests/historicalAircraftGeometry.test.ts`, then run on the development server:

```sh
npx vitest run tests/aircraftGeometry.test.ts tests/historicalAircraftGeometry.test.ts
npx tsc --noEmit
```

The new suite's 30 cases pass alongside the 3 existing cases. It checks six unique presets at capacities 1/6/10, local and translated world-space envelopes, finite/index-valid vertex data, outward fuselage and upper-wing normals, three-blade metadata, submesh and triangle budgets, shared geometry/material identity, independent propeller rotation, empty capacities, another live squadron surviving disposal, and 50 replacement cycles with scene resource counts returning to baseline. Both plain root disposal and the game's forced-material disposal path are covered. Six new marking tests verify every projected triangle vertex and centroid is exactly 4 mm (roundel) or 7 mm (star over roundel) above the true wing skin. TypeScript also completes without errors.

Real WebGL measurements after the insignia fix: Hellcat 1,540 triangles; Zero 1,642; Dauntless 2,184; Val 2,372; Avenger 1,990; Kate 2,158. All six issue three actual draw calls. Reports and screenshots are generated with `node scripts/inspect-historical-models.mjs --kind aircraft`; they use the game's exact CLEAR_DAY_RENDER lighting and a neutral isolation background. The QA script is outside the production entry graph and closes its own loopback Vite service. CPU submit timings from SwiftShader are not hardware gaming FPS measurements.

The original `.qa/historical-models/aircraft-fixed/report.json` records all six corrected-insignia presets with requested three-quarter, side and top views. The gallery's initial three-quarter camera setup was subsequently found incorrect; those initial images are not accepted as the requested angle. The later `.qa/historical-models/final-threequarter/report.json` asserts the camera angles and includes all six aircraft in the 53-model corrected three-quarter pass. Its aircraft contact sheet has been visually reviewed: the six silhouettes, canopy attachment and repaired roundels/stars are readable at that view. All six aircraft retain three actual draw calls and the triangle counts above. No aircraft geometry was changed by the subsequent equipment-shell/support fix, so these images were not redundantly rerendered.

This is scoped image acceptance, not certification of every camera angle or runtime state. Aircraft visibility fading, formation readability during play, mission-transition disappearance/recreation and hardware gaming performance require their own runtime evidence. The 33 passing aircraft tests and Chromium SwiftShader gallery are complementary checks; neither alone proves those behaviors. The D3A1 envelope and Avenger-family-to-TBF reference caveats above remain explicit historical limitations.
