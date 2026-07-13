# Design QA — Grey Sea Action 0.5.0 dock

- Source visual truth: `C:\Users\jiang\.codex\generated_images\019f5647-7d38-70d3-9530-38bf92b6ea2b\exec-dd661151-01c9-48e0-9b3a-e0507c157648.png`
- Implementation screenshot: `C:\Users\jiang\Documents\战舰\.v050-edit\dock-implementation-stable.png`
- Combined comparison evidence: `C:\Users\jiang\Documents\战舰\.v050-edit\dock-design-comparison-final-vertical.png`
- Viewport: 1440 × 1024 CSS pixels
- State: main menu / 船坞 / 全部组件 / destroyer DD-01

## Findings

- No actionable P0/P1/P2 findings remain.
- [P3] The live Babylon dock ship uses fewer small deck fittings than the concept render. This is intentional for the first low-GPU implementation; the important silhouette, stepped bridge, funnels, mast, torpedo assembly, forward/rear gun positions and modular callouts are present.
- [P3] The implementation uses Font Awesome military/mechanical icons instead of the concept's bespoke raster item art. Icons are sharp, consistent and avoid placeholder graphics; bespoke component thumbnails can be added later without changing the inventory model.

## Required fidelity surfaces

- Fonts and typography: passed. Consolas / Microsoft YaHei military pixel hierarchy is consistent; headings, small telemetry copy and rarity labels remain legible.
- Spacing and layout rhythm: passed after iteration. The 1440 × 1024 frame fills the viewport without horizontal overflow; low-height layouts use a dedicated compact breakpoint.
- Colors and visual tokens: passed. Deep navy, cyan instrument lines, muted purple, gold and red-gold match the selected visual direction.
- Image quality and asset fidelity: passed for the production constraint. The central visual is an actual interactive 3D ship preview, not placeholder or CSS art.
- Copy and content: passed. Chinese labels, component families, hull compatibility, rarity hierarchy and slot counts match the approved system.

## Focused comparison evidence

The full-view comparison was supplemented by direct inspection of the store guarantee panel, dock inventory/detail panel and side-gun locked state. No additional crop was needed because those controls are readable at the captured desktop size.

## Comparison history

1. Initial implementation: P1 — `.game-menu-card.start-card` specificity kept the menu at 680 px and produced horizontal overflow. Fix: override with `.game-menu-card.command-center` at 1420 px maximum width. Post-fix evidence showed card width 1408 px and scroll width 1402 px at a 1440 px viewport.
2. First dock pass: P1 — the preview camera cropped the bow and three inventory rows pushed the selected-component details below the primary viewport. Fix: camera radius 155 → 184, inventory maximum height 330 → 226, item height 90 → 70.
3. Low-height pass: P2 — 1280 × 720 screens required internal scrolling before the install action. Fix: add a max-height 800 compact layout, reduce hull/inventory rows and size the dock/store to available panel height.
4. Performance pass: P2 — the hidden dock scene rendered continuously. Fix: suspend hidden rendering and cap visible dock preview rendering at 20 FPS.

## Primary interactions tested

- Enter store; perform ten-draw; supply tickets decreased 120 → 110.
- Purple guarantee reached 10 / 10 on the tenth draw.
- Drawn equipment appeared in inventory.
- Category filtering and empty side-gun inventory state worked.
- Destroyer side-gun slot displayed locked.
- Purple magazine installed and persisted in menu state.
- Sea trials launched with the equipped Mk.II gun.
- Equipped magazine changed observed reload to 6.9 seconds.
- Browser console warnings/errors checked: none.
- Automated tests: 29 passed.

## Implementation checklist

- [x] Store draw and guarantee loop
- [x] Local inventory and profile migration
- [x] Hull slot compatibility
- [x] Interactive 3D dock preview
- [x] Component filter, detail and equip loop
- [x] Battle performance modifiers
- [x] Responsive low-height layout
- [x] Console and interaction verification

## Follow-up polish

- Replace Font Awesome component pictograms with dedicated pixel-art item renders when the final art pipeline is ready.
- Add additional swappable hull assets after light cruiser and battleship gameplay exists.

final result: passed
