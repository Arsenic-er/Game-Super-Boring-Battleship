# Dock slots and low-quality rendering budget — 2026-10-07

## Status and scope

Working changes on `codex/v072-historical-models`, based on `8e2e710`.
Package version remains 0.7.9. This is not a tagged release or a new Windows package.
All editing, builds, tests and evidence stayed in /home/ubuntu/battleship on
GPU-821560. No files were downloaded to Windows, no Git push was performed, and
the separate asset repository remained clean.

The owner provisionally accepted the material-B preview. Its water, ship contact
and sailing wake still live in experiments/material-b, separate from production
battles. This change does not silently enable that artwork in the game.

## Behavior accepted by automated checks

- Clicking a real dock component selects its physical slot. The equipment drawer
  supports automatic placement and explicit occupied or empty slots.
- A shared slot resolver drives the candidate ghost, action label and installation.
  Invalid explicit indices do not silently replace slot zero.
- Owned-copy limits, compatibility, credits, saved builds and minimum departure
  requirements remain enforced. Sparse drafts can be saved but do not become
  sea-ready merely by selecting an aft slot.
- All seven locales include the slot controls. Compact landscape retains the
  picker without horizontal page overflow.
- Pending, failed and superseded model loads cannot expose the old ship's hover
  targets. Same-plan model reuse remains interactive. A loadout change cancels
  a cached pointer-down component before pointer-up.
- Production low quality limits the framebuffer to at most 1280 x 720 pixels in
  area, preserving aspect ratio and the existing minimum scaling factor of 1.35.
  Medium remains CSS-native. DOM HUD sizing is unchanged.
- Resize, quality changes, high DPR and temporarily hidden canvases share the same
  policy; scaled framebuffer dimensions cannot feed back into CSS-size estimates.

## Final verification

Tests were deliberately split into regular and slow integration groups:

| Check | Result |
| --- | --- |
| Vitest excluding balanceLab, two workers | 1,083 passed; 5 existing skips |
| balanceLab alone, one worker | 8 passed |
| Total across the two non-overlapping groups | 1,091 passed; 5 existing skips |
| Real dock browser regression | 14 passed; no page errors |
| Real rendering-budget browser regression | 13 passed; no page errors or GL errors |
| TypeScript and production Vite build | Passed |
| git diff --check | Passed |

The initial untouched full-suite run had one 10-second balance-lab timeout, not an
assertion mismatch. Independent reruns passed without changing a timeout or
assertion. The final isolated file took 46.30 seconds; its four-battle batch took
29.21 seconds against a 30-second limit. This timing margin is still narrow and
does not establish that the default concurrent npm test invocation is reliable.
The existing large-bundle warning also remains.

Browser evidence uses isolated Chromium/Babylon with SwiftShader and independent
test storage. It is not a native Windows, real Surface/mobile GPU FPS, touch-input,
portrait-layout or two-physical-PC LAN certification. Render-budget QA invokes
the real launch/quality handlers programmatically, not through physical touch.

Observed framebuffer examples:
- 2880 x 1920 CSS viewport: 1175 x 783 low-quality framebuffer.
- 844 x 390 CSS viewport at DPR 3: 625 x 288.
- 390 x 844 CSS viewport at DPR 3: 288 x 625.

## Reproduction and server evidence

From /home/ubuntu/battleship with project-local Node on PATH:

```sh
export PATH="$PWD/.tools/node/bin:$PATH"
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
npm run build
node scripts/qa/dock-install-regression.mjs
node scripts/qa/render-budget-regression.mjs
git diff --check
```

Run the slow balance tests without simultaneous browser/build work.

Server-only evidence:
- .qa/continue-20261007-suite.log
- .qa/continue-20261007-balance.log
- .qa/continue-20261007-build.log
- .qa/dock-slots-current/report.json
- .qa/render-budget-20261007/report.json

Both browser reports marked their servers closed. Ports 5282, 5284, 5285 and 5291
had no listeners at handoff. No permanent preview service was enabled.

## Next development priorities

1. Fleet AI: cover-aware positioning, delayed shared spotting and multiple targets.
2. Paired-seed balance samples across destroyers, heavy ships and mixed fleets.
3. Separate real-hardware acceptance for Surface/mobile performance and two-PC LAN.
4. Keep historical models and aircraft attack refinements incremental; do not
   describe the current simplified models or payload simulation as full replicas.
