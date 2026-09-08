# 0.7.1 playable-prototype acceptance

Date: 2026-09-08. Development and packaging location: server worktree `~/battleship/.worktrees/v071-first-voyage`, branch `codex/v071-first-voyage`.

## Delivered application loop

- Fresh profile: first-voyage briefing, optional real 1v1 clear-weather tutorial (30 m travelled, R aiming, actual main-battery shot, M map opening). It can be skipped/resumed/replayed; requesting replay in a running battle queues the next voyage.
- Existing profile v6 migrates to v7 without discarding funds, inventory, saved builds or progress. Experienced accounts are not forced through onboarding.
- Dockyard editing, read-only saved-build inspection and selected battle flagship are separate. Solo battle launches exactly the selected saved build, never a silent editable-loadout fallback.
- Eight equipment categories and their ordered hardpoints are shared between dockyard and combat; candidate ghosts are independent, internal modules have projected markers, asynchronous rebuilds are atomic and old session models are disposed.
- Local solo result includes player-attributed actual damage, main-battery/torpedo hits, sinkings, time, scores, rewards and balances. Settlement UUIDs make replayed results idempotent. LAN and sea trials are ineligible; developer mutations invalidate rewards, inspection alone does not.
- Failed reward storage retains an immutable pending transaction; profile mutation is locked until the same transaction saves. Sea trials remain usable. The UI explicitly warns that closing the application loses an unsaved pending reward.
- Keyed equipment, voyage and LAN guidance text supports Simplified/Traditional Chinese, English, Japanese, Spanish, German and Russian. LAN wire schemas were not changed.

## Verification

- Full final default suite: **710 passed, 5 skipped**, 78 passed test files and two opt-in report files skipped. The skipped long prototype tests were also separately enabled: six prototype checks passed, including real 5v5/7v7 runs and a full-clock control.
- `docs/acceptance/PROTOTYPE-BATTLE-0.7.1.md` records fixed seeds, exact attribution, navigation failures discovered, fixes and repeat measurements. 5v5 reaches the time limit at exactly 1200 seconds / 72,000 fixed steps; the tested 7v7 ends on score at 1016 seconds. These are representative cases, not a universal balance guarantee.
- `scripts/smoke-first-voyage.mjs`: real browser input completes all four tutorial steps; result/dock/menu/relaunch lifecycle, all seven locales, 1440×900 and 1280×720 layouts, quota failure across menus/sea trials, and successful retry were exercised. No page exceptions. Terminal outcomes and quota failure are deliberately injected into browser responses, not shipped game code. Software-WebGL resolution is temporarily lowered during movement checks; this is not a GPU performance benchmark.
- Visual inspection found and fixed a 2037-pixel-tall dock canvas hidden below the viewport; lists now scroll independently and the actual canvas fits in the screen. Pending-storage notices reserve space instead of blocking mode buttons.
- TypeScript, desktop CommonJS syntax and ship-asset manifest validation pass. Windows directory is generated with Electron Builder on the server; `scripts/validate-release.mjs` verifies version, unpacked assets and development-only dependency exclusion and creates SHA-256 inventory. Transfer/startup outcome is recorded separately at local handoff.

## Windows handoff verified

- Packaged version: 0.7.1 (`ProductVersion` 0.7.1.0), 117 files, 474,759,038 bytes extracted. ZIP: 165,695,706 bytes; 7-Zip integrity test passed.
- Every transferred file matched its server SHA-256 inventory. Local latest directory was replaced only after validation and successful EXE startup; the previous release and transfer ZIP were then removed. Existing real-player AppData saves were not opened or modified by QA.
- Native Windows EXE tested with a separate temporary profile and the default graphics backend. `file:///.../app.asar/dist/index.html` loaded, all seven language options existed, Node integration was disabled, and the sandboxed desktop LAN bridge returned hosting/discovery capabilities. The fresh tutorial, skip-to-setup, dock canvas bounds and latest English labels passed with no renderer exceptions.
- A forced software-graphics startup probe timed out; it is not counted as a pass. The normal graphics-backend startup passed. The server software-WebGL browser test is likewise not evidence of native GPU performance.
- No Battleship preview listener was left running. Other projects' services were not stopped.

## Boundaries and next work

- This is a lightweight naval-combat prototype, not a feature/content equivalent of World of Warships. Existing playable hull families are destroyer, light cruiser and battleship (15 historic classes); carrier hulls and submarines are not implemented. Air groups use AI-controlled fleet support.
- Hulls remain procedural. The external-model catalogue is valid but currently empty; no new licensed external GLB pack was imported in this milestone. Further silhouette, topology, material and animation work remains.
- Two-player LAN co-op exists and has simulated transport/desktop-bridge tests. **Two separate Windows PCs, firewall behavior and real Wi-Fi/LAN loss/recovery still need hands-on acceptance.** Do not mark this passed based on single-machine tests.
- Existing dependency findings are documented in `DEPENDENCY-AUDIT-0.7.1.md`; production npm audit has no reported packages, but that does not certify the bundled Electron/Chromium runtime. No broad dependency upgrade was performed.
- No persistent Battleship preview service or local development dependency tree is needed to run the release. Keep the complete extracted directory and launch its EXE; AppData saves are separate.

## Development handoff

Key decisions and code history belong in this report, the approved design/implementation plan, and Git. Do not keep verbose disposable subagent transcripts as the only development memory. The cleanup of old logs performed before this milestone did not remove source, assets, main-task history or unfinished conclusions.
