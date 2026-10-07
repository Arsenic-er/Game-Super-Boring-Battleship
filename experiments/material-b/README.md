# B — isolated material scene

## Current status — sailing preview (accepted provisionally 2026-10-07)

The owner accepted the latest static ship/sea preview as a provisional baseline
("先这样吧"). Continuing development does not imply permission to replace the
production materials. This revision remains an isolated art-direction experiment;
no production code, public assets, game profile, save or package was changed.

- Five camera presets, including a wake-inspection view; camera translation follows
  the ship without forcing its yaw onto the user's orbit.
- Smooth demonstration presets: stopped, 8 kn, 18 kn and a 12 kn turn.
  This bounded route is not the game's propulsion or steering simulation.
- Speed-dependent bow/side/stern wash plus a world-space historical trail.
  Stopping ends new emissions; previously emitted foam fades over 42 seconds.
- One shared 128x128 procedural foam mask, no new render targets, at most two
  extra draws and 1,464 triangles. Pausing avoids repeated wake vertex uploads.
- TypeScript, isolated Vite build and 20 real-browser checks pass. The GPU A/B
  wake toggle changes 4,664 pixels (0.507% of the budget canvas) at the tested
  cruising pose; GL error is zero. Original water/contact regression checks pass.
- All 19 persistent Vitest tests pass: 10 for deterministic motion and 9 for wake
  lifecycle, paused-buffer uploads and low-frequency anchor interpolation.
- Temporary preview and browser close after validation. Screenshots and reports
  stay on the server. No local download or Git push was performed in this turn.
- The owner viewed the sailing comparison and accepted this art as a provisional
  baseline on 2026-10-07. It remains separate from the production entry point.
  Software-rendered checks are NOT phone/Surface FPS or sustained thermal evidence.

## Initial validation history (superseded by the current status)


- TypeScript and the isolated Vite build pass.
- Server Chromium / SwiftShader renders all three views without console, shader,
  page or network errors.
- Nine automated checks cover rendering, real GPU uniform values / GL errors,
  visible and animated water pixels, the packaged Chinese font, no RTT,
  geometry/pixel budgets, orbit, wheel zoom, resolution modes and a
  landscape mobile-sized layout.
- At 1440×900 CSS pixels the budget mode renders 1214×758 pixels.
  Overview: 36 draws, 26,940 active triangles; water: 8,192 triangles.
  These counts are diagnostic, not a frame-rate guarantee.
- Environment self-check: all 1,080 sampled coast points lie at sea level
  (maximum absolute error < 1e-26); inland/outside heights and mesh disposal pass.
- The first real capture failed visual review: the sea was nearly a flat colour,
  clouds were outside the camera view and Chinese preview labels lacked a font.
  This is not an approved production material; owner approval is still required.
- PNG captures and the report are server-only under .qa/material-b/.
  No production files, public textures, saves or normal package outputs were changed.
## Purpose

A review-only, actual Babylon.js scene for the selected soft/natural material
direction. It reuses the game's J-class hull and installed-equipment factories,
but does not load the game entry point, battle simulation, profile or saves.

## Boundaries

- All development, rendering, artifacts and tests stay on GPU-821560.
- No production source, public asset or game configuration is replaced.
- This directory is not an entry point in the normal game or Windows package.
- Preview-only procedural terrain, sky and water are not approved production art.
- No claim about Surface/mobile FPS follows from a server software-rendered image.
- Do not start a persistent preview or download a package without owner direction.

## Run on the server

From /home/ubuntu/battleship, with .tools/node/bin on PATH:

```sh
npx tsc -p experiments/material-b/tsconfig.json --noEmit
npx vite build --config experiments/material-b/vite.config.ts
npx vitest run experiments/material-b/shipMotion.test.ts experiments/material-b/shipWake.test.ts
node experiments/material-b/check.mjs
```

The browser check starts a loopback-only temporary preview, uses an isolated
browser context, captures the real WebGL scene and closes browser/server on exit.
Build: .qa/material-b-dist/. Evidence: .qa/material-b/.

For a specifically requested interactive session, Vite can serve this entry with:

```sh
npx vite --config experiments/material-b/vite.config.ts
```

It binds 127.0.0.1:5285; access requires an explicitly opened SSH tunnel.

## Visual controls

Overview / shore / water / ship / wake camera presets, drag or touch orbit, wheel
or pinch zoom, animation pause, sailing presets, an explicit ship reset, and a
resolution comparison switch. Stop slows the ship continuously; reset intentionally
returns it to the starting pose and clears the old trail. The default canvas
uses at most roughly 1280×720 pixels, preserving the viewport aspect ratio.
DOM labels remain at display resolution. The native-resolution comparison does
not represent the mobile budget.

## Low-cost approach

One opaque water pass without reflection/refraction render targets. A static
depth mask provides shallow-water colour and shore foam; a small normal texture
animates finer ripples. Terrain uses mesh vertex colour and baked directional
shading. A single sky sphere provides gradient and sparse moving cloud masks.
No volumetric cloud, ray tracing, dynamic shadow map or post-processing pipeline.

The scene deliberately omits fleet AI, combat particles and multiplayer. Whole-game
mobile performance and sustained thermal behavior still require device tests.

## Revision after the first visual rejection

The original water shader declared controls and fogInfo as vec4, but the code
bound them with ShaderMaterial.setFloats, which calls uniform1fv. WebGL rejects
that type mismatch, leaving the uniforms at zero. This disabled wave detail,
highlights, coastal foam and water fog despite successful TypeScript/build checks.
The fix uses cached Vector4 values and setVector4 / uniform4f. Browser QA now reads
the actual GPU uniforms, checks gl.getError(), and verifies tonal variation and
time-dependent pixel changes in an open-water region.

Cloud groups were also outside the overview camera frustum, and low-elevation
fading weakened the little visible cloud area. The revised sky places clouds
inside the actual camera projection. The lab loads the existing game font so
Chinese text works in the headless server browser.

The camera, ship model, geometry budget and no-RTT rule stay unchanged for the
before/after visual comparison. All preview files remain isolated from production.

## Second capture review

The corrected same-camera capture was visually inspected. Water now has visible
irregular highlights and ripples, shore colour is clearer, the hard sea/sky seam
is softened, and clouds appear in-frame. The water-region luminance standard
deviation measured 7.38/255; time 9 to 17 changed RGB samples by 2.73/255 on average.
All nine browser checks passed; no GPU uniform/GL errors were reported.
Draws and active triangles stayed at 36 / 26,940 in overview, with zero RTTs.

Remaining art limitations: clouds still look simplified/flat, mountain shapes and
rocky shore detail do not yet match the concept art. This revision demonstrates
the actual material changes; it is not final art approval or device FPS evidence.
Production files remain untouched. Temporary QA preview was stopped.

## Water realism refinement (2026-10-04)

Owner found the ripple coverage too artificial. An independent visual review
identified uniform bright wrinkles, weak scale separation and a narrow bright
coastal rim. The first calming pass was rejected on visual inspection: it left
near water too flat and made distant waves into long bands.

The retained pass uses broken medium-scale normals with a weaker fine layer,
earlier distance attenuation for BOTH texture and interpolated geometric normals,
water-like Schlick Fresnel with F0 .02, no fixed sky-colour floor, and reduced,
more concentrated highlights/foam. Broad geometry displacement remains only
0.30 m total amplitude, with CPU heightAt and GPU shader generated from one WAVES
array. No added textures, render targets, draws or triangles.

Real-browser checks passed (9). Open-water luminance variation decreased from
7.38 to 3.63/255 while animation still changes pixels (mean RGB difference 1.46/255
from time 9 to 17). The final same-camera PNG was visually inspected: fewer
bright wrinkles, calmer patches and smoother distant detail. This is a visual
iteration pending owner approval, not a claim of physically accurate water or
mobile FPS. Game source/assets/configuration were not modified.

## Ship / sea integration preview (2026-10-04)

Owner found the ship visually detached from the new water. Read-only geometry
audit confirmed the hull already intersects y=0: max draft about 1.69 m, deck
edge about 4.53 m. The J-class hull is 108.7 m long; sea-level maximum half-beam
is 4.741503 m. No draft or geometry adjustment was made.

A lab-only shipAppearance adapter reuses the existing atlas, softens filtering,
compresses excessive texture contrast, reduces the dirty-brown cast and balances
textured hull/deck against untextured superstructure. The shader constants are
numeric defines so hull/deck cannot incorrectly share a cached effect. A narrow
hull-only sea-coloured wet-paint cue is applied before fog; all materials remain
opaque. Atlas/GPU image reuse and NPOT mipmaps were verified in server WebGL.

The water contact cue follows 14 measured y=0 stations including the flat stern,
rather than a hull-sized ellipse. It is a local artistic cue, NOT a real projected
shadow or reflection: weak absorption fades by 1.6 m outside the silhouette, with
sparse low-contrast lapping in a much narrower band. It adds no wake to a stopped
ship, no RTT, no water texture fetch or draw. The previous sea parameters remain
unchanged. This is a J-class-specific prototype profile, not a general fleet API.

A fixed ship-closeup camera was added for BEFORE/AFTER inspection. Eleven browser
checks pass. Contact enabled/disabled comparison changes 3,428 pixels (0.373% of
the canvas), GL error 0; overview remains 36 draws / 26,940 triangles / zero RTT.
The image was visually inspected: material colour is more coherent; the hull's
hard edge is still simplified and the result remains a prototype requiring owner
judgment, not final art or mobile performance approval. Production files/saves
were untouched; only the explicitly approved single local PNG was overwritten.
