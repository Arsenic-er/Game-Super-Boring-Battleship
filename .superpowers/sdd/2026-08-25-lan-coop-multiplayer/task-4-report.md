# Task 4 report

## Red
- Added `tests/lanBridge.test.ts` first.
- Verified the initial red state with:
  - `npx vitest run tests/lanBridge.test.ts --reporter=verbose`
- The first meaningful red was `ERR_MODULE_NOT_FOUND` for `../src/net/lanBridge`, confirming the Electron LAN bridge surface did not exist yet.
- Tightened the test harness once during red by moving event waits ahead of the triggering action, so the suite proves bridge behavior instead of racing on subscription timing.

## Green
- Added `desktop/lanBridge.cjs` as the Electron-main lifecycle bridge with:
  - UDP discovery on port `47777`,
  - announcement broadcast + direct probe replies,
  - first-free WebSocket host selection across `47778..47788`,
  - canonical-IPv4 `ws://` URL validation,
  - `1 KiB` UDP / `64 KiB` WebSocket string caps,
  - idempotent `createRoom` / `closeRoom` / `startDiscovery` / `stopDiscovery` / `connect` / `disconnect`,
  - event emission for `announcement`, `probe`, `connected`, `message`, and `disconnected`.
- Added `desktop/preload.cjs` to expose only the fixed LAN API through `contextBridge`, with no raw Electron or Node primitives leaked to the renderer.
- Added `src/net/lanBridge.ts` as the renderer wrapper so browser builds report unsupported capability cleanly when `window.battleshipLan` is absent and throw explicit desktop-only errors for active calls.
- Updated `desktop/main.cjs` to:
  - keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`,
  - wire the preload explicitly,
  - register fixed IPC handlers,
  - fan out bridge events to tracked renderer senders, and
  - clean up LAN resources when a sender/window is destroyed or the app hits `before-quit`.
- Updated `src/vite-env.d.ts` with the typed `window.battleshipLan` surface.
- Added runtime dependency `ws` in `package.json` / `package-lock.json`.
- Verified with:
  - `npx vitest run tests/lanBridge.test.ts --reporter=verbose`
  - `npm run build`

## Self-review
- Kept all Node and socket APIs inside Electron main / preload; the renderer only sees the typed white-listed bridge methods.
- Rejected non-canonical IPv4 URL hosts like `01.2.3.4` before any network attempt by validating the raw input string instead of relying on WHATWG URL normalization.
- Preserved main-process event forwarding across repeated window lifecycles by making `dispose()` close sockets without tearing down the bridge’s permanent event subscription.
- Used loopback-only test resources and explicit cleanup (`dispose()` / server close) so the focused suite releases every port it touches.

## Commit
- Commit message: `Add secure Electron LAN transport bridge`


## Review round 2 (2026-08-25)

### Red
- Expanded `tests/lanBridge.test.ts` before touching implementation.
- Verified the failing review state first with:
  - `npx vitest run tests/lanBridge.test.ts --reporter=verbose`
- The intended red covered all requested review items:
  - missing exported helpers for strict announcement validation / owner-isolation / preload install testing,
  - discovery probes only targeting loopback instead of LAN broadcast,
  - no periodic room-announcement broadcast,
  - no owner gating for stateful IPC,
  - no preload unsubscribe verification surface,
  - no normalized bridge `error` event on oversize WebSocket payloads.
- The focused red also reproduced the critical process-safety bug directly: oversized `ws` frames raised unhandled `RangeError: Max payload size exceeded`, proving `attachSocket()` lacked an `error` listener on both host and guest paths.
- During final verification, `npm run build` also went red once because the new TypeScript tests imported `ws` without declarations and used `Module._load` without a typed escape hatch.

### Green
- Hardened `desktop/lanBridge.cjs` with:
  - `assertLanBridgeStringPayload(...)` exported for exact `1 KiB` / `64 KiB` boundary checks,
  - `parseDiscoveryAnnouncementJson(...)` enforcing exact room-announcement envelope keys and bounded field validation,
  - LAN-broadcast discovery probes to `255.255.255.255:47777` (plus loopback for same-host coverage),
  - periodic room-announcement rebroadcasts while a room is open,
  - probe-response unicast back to the source address/port,
  - per-socket `error` listeners that normalize oversize-frame failures into bridge `error` events and terminate safely,
  - duplicate-guarded `disconnected` emission so oversize failures do not double-report.
- Added injectable factories in `createLanBridge(...)` so tests can deterministically verify broadcast targets, timer idempotence, malformed-announcement drops, and owner-isolation behavior without flaky sleeps.
- Added `createLanIpcController(...)` in `desktop/lanBridge.cjs` and updated `desktop/main.cjs` to use it, so:
  - `capabilities()` stays read-only for any renderer,
  - the first stateful caller claims ownership,
  - non-owners get `lan-owner-mismatch`,
  - bridge events go only to the owner,
  - destroying/closing the owner releases control and disposes bridge state,
  - `before-quit` performs explicit cleanup.
- Updated `desktop/preload.cjs` to export `installBattleshipLanBridge(...)` / `createPreloadApi(...)`, keeping the renderer surface unchanged while making subscribe/unsubscribe behavior testable with fake `ipcRenderer` listeners.
- Extended `src/net/lanBridge.ts` with the bridge `error` event variant.
- Added `@types/ws` to `devDependencies` so the expanded Vitest suite type-checks cleanly.
- Verified with:
  - `npx vitest run tests/lanBridge.test.ts --reporter=verbose`
  - `node -c desktop/lanBridge.cjs`
  - `node -c desktop/main.cjs`
  - `node -c desktop/preload.cjs`
  - `npm run build`

### Self-review
- Kept the preload API surface fixed; the new helper exports are CommonJS-only test hooks, not renderer-visible capabilities.
- Left room-announcement `phase` aligned with the protocol enum instead of artificially narrowing it to lobby-only states.
- Used real WebSocket peers for both oversize regression cases so the crash fix is proven against the actual `ws` runtime path, not a mock approximation.
- Re-ran focused tests after the TypeScript-only cleanup (`@types/ws`, `Module._load` typing, explicit socket parameter type) so the final green state covers both runtime and build correctness.

### Commit
- Review fix commit message: `Harden LAN bridge ownership and transport errors`
