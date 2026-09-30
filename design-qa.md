# Sunny-port implementation — design QA

final result: passed

## Visual truth and evidence

- Approved source: `.qa/port-077/approved-reference.png` (conversation ImageGen result `exec-8b000980-3d5d-44d1-902b-ceed12210091.png`).
- Final implementation: `.qa/port-077/component-hover.png`, `.qa/port-077/port-wide.png`.
- Source and implementation: 1672 × 941 pixels; CSS viewport 1672 × 941, deviceScaleFactor 1. No density conversion or browser chrome.
- State: sunny dockyard, J-class selected, actual default loadout; hover capture identifies the real aft main gun. The source illustrates a fore-gun hover. That target-position difference is expected, not an alignment defect.
- Both source and final implementation were opened together in the same image-comparison tool input. The source and intermediate failure capture were likewise opened together before fixes.
- Responsive evidence: `.qa/port-077/port-1280.png` (1280 × 720) and `port-1024.png` (1024 × 640), both 1×.
- Additional states: equipment, loadouts, voyage, battle-setup, multiplayer, store, codex, English/German/Russian port screenshots in the same evidence directory. Seven languages were exercised through the real language selector.
- Focused inspection: the full-resolution source and implementation made the title/nav, component tooltip and bottom selector legible in the same comparison input. Those three regions were inspected directly; a separate cropped artifact was not needed.

## Findings and iteration history

1. **P1: ship too small and wrong initial angle.** The first 1280-wide capture occupied roughly 420 px of ship width, and the bow pointed upper-right. Replaced loose axis-aligned-box framing with cached real-vertex perspective fitting, corrected target centering, and changed initial view to alpha .55 / beta 1.30. Final real models occupy approximately 83% of the available canvas width at the compact viewport, without clipping masts; 15 hulls and four aspects are unit-covered. Final captures show the intended dominant center/right ship and lower-right bow.
2. **P2: opaque gray ship-thumbnail backgrounds.** Re-rendered all 15 existing real ship models with transparent backgrounds; did not substitute stock ships. Final captures show separate readable hull silhouettes without gray rectangles.
3. **P2: inherited navigation border and a bright canvas rectangle.** Removed the old tab-strip border; cleared the transparent WebGL canvas to RGBA 0/0/0/0 so premultiplied-alpha composition does not add a blue rectangular tint. Post-fix full-view comparison has no canvas-edge seam.
4. **P2: closing a drawer could return focus to its own hidden close button.** Kept focus ownership on the opening control and stopped restoring focus into hidden/inert ancestors. Real browser Escape and close-button tests pass.
5. **P2: rapid reversal restarted opacity from an endpoint.** New transitions start from the current computed opacity/transform, cancel previous work and ignore obsolete completion callbacks. Unit tests cover interruption, reduced motion and runtimes without Web Animations; browser seven-toggle stress test passes.
6. **Route regression prevention:** Escape is handled by the existing menu controller so nested battle preparation/LAN pages close before leaving mode selection. Help and settings remain available without putting instructions on the initial port screen.
7. **P2: incomplete first-frame model on native Windows.** A native screenshot caught ready turrets before the hull shader was ready. The preview now stays transparent until the complete scene is ready, then fades in over 350 ms; it does not stop the render loop needed to compile shaders. Re-captured `.qa/port-077/initial-complete-hull.png` shows the full Fletcher hull on first presentation. Initial boot and subsequent class changes use the same gate; reduced-motion users get immediate presentation when ready.

## Required fidelity surfaces

- **Fonts/typography:** uses the established bold Fusion pixel font and its existing fallback/license pipeline. Cream title, smaller subtitle, left navigation and primary gold action retain the reference hierarchy. Long western-language titles wrap; seven-language text remains functional. The illustrative logo font is not passed off as the exact runtime font.
- **Spacing/layout rhythm:** left navigation, center/right interactive model, low ship selector, lower-right departure action; 1024/1280/1672 controls fit the viewport. Dense equipment/build controls are independently scrollable on-demand drawers.
- **Colors/tokens:** sunny blue harbor, cream/gold actions, navy drawers. New backdrop follows the approved empty-harbor art direction. No global scanline filter added.
- **Image/asset quality:** original generated empty harbor plus actual 3D meshes and transparent game-model thumbnails. The illustrative reference vessel is much more detailed than the current game model; preserving the actual editable model is an intentional scope constraint of this UI release, not a claim of model-art parity. This release does not rebuild hull geometry or turn the backdrop into a 3D harbor.
- **Copy/content:** real captain name, class/loadout and inventory data; only hovered component is named. Help text is behind Help. Existing first-voyage onboarding remains opt-in at single-player entry, not an initial-screen instruction wall.

## Interaction evidence

13 browser checks pass: clean startup, drawer Escape/focus, close-button focus, rapid toggles, actual-mesh hover, hover exit, mode navigation, 1280/1024 containment, profile preservation, all seven locales, armory/codex navigation, and preparation/LAN-directory reachability. Browser console errors and failed requests: zero. The test uses isolated Chromium storage and closes its temporary loopback server. SwiftShader timings are not a hardware gaming-FPS claim.

## Remaining non-blocking refinements

- Resolved in 0.7.8: restrained depth-tested outlines supplement the real component tooltip. They target one installed slot and clear on exit/drag/zoom. See `docs/acceptance/0.7.8-dock-hover.md`; `.qa/port-078/outline-hover.png`, `outline-1280.png`, `outline-1440.png` and the native Windows capture were visually inspected.
- P3: further hull detail, flags, water-contact shading and a dynamic 3D harbor are future art/rendering work; the ship remains fully interactive, not an image overlay.
- OS-specific input and packaged asset checks are recorded separately in `docs/acceptance/0.7.7-port.md`.

All actionable UI P0/P1/P2 findings listed above have been fixed and re-captured. No assertion of pixel-identical ship geometry or stable 60 FPS is made.
