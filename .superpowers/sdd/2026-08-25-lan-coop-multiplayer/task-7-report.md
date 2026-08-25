# Task 7 report

## Takeover state (2026-08-25)
- Remote worktree: `/home/ubuntu/battleship/.worktrees/lan-multiplayer`
- Base HEAD at takeover: `9c508a2`
- Previous agent left uncommitted partial edits that were preserved in place and audited before any new changes.

### Modified tracked files at takeover
- `src/main.ts`
- `src/render/gameView.ts`
- `src/ui/hud.ts`
- `src/ui/multiplayerMenu.ts`
- `src/ui/tacticalMap.ts`

### New untracked files at takeover
- `src/net/clientBattleSession.ts`
- `src/net/lanMultiplayerRuntime.ts`
- `src/net/reconciliation.ts`
- `src/net/snapshotBuffer.ts`
- `tests/clientBattleSession.test.ts`
- `tests/networkReconciliation.test.ts`

### Initial focused verification at takeover
Run on 2026-08-25:

```bash
npx vitest run tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts --reporter=verbose
```

Result:
- `tests/clientBattleSession.test.ts`: 5 tests passed
- `tests/networkReconciliation.test.ts`: 3 tests passed
- Total: 8 / 8 tests passed

### Initial audit notes
- The client interpolation / reconciliation layer was already implemented and passing its focused tests.
- The remaining risk area is runtime integration rather than the pure client algorithm: bridge identity binding, host-targeted send semantics, menu placeholder replacement, and multiplayer-specific pause / render / disconnect behavior.

## Runtime integration follow-up (2026-08-25)
- Extended the desktop LAN bridge and preload API with host-side `connectionId` events plus optional targeted send routing.
- Bound guest identity to the authenticated host websocket connection instead of trusting inbound payload `peerId` fields for ready/input/return flows.
- Localized the new multiplayer runtime error strings (`局域网联机桥不可用。`, `创建房间失败。`, `加入房间失败。`, `离开房间失败。`) and removed stale runtime-wiring placeholder strings from active locale coverage.
- Fixed a leftover `target` reference in `src/ui/tacticalMap.ts` so the multiplayer contacts refactor compiles and builds cleanly.

### Verification after takeover changes (2026-08-25)
```bash
npx vitest run tests/netProtocol.test.ts tests/roomDirectory.test.ts tests/lobbyState.test.ts tests/lanBridge.test.ts tests/multiplayerMenu.test.ts tests/i18n.test.ts tests/hostBattleSession.test.ts tests/replicationView.test.ts tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts tests/playerInput.test.ts tests/combatCamera.test.ts tests/tacticalMap.test.ts --reporter=verbose
npm run build
```

Result:
- 13 test files passed
- 160 tests passed
- Production build passed

## Independent-review remediation (2026-08-26)

Two independent reviews of `f4005fe` found client prediction, snapshot-stall,
runtime validation, lobby refresh, replicated-effects, localization, and bridge
connection-ownership gaps. The remediation was implemented test-first.

### Client/render corrections
- Reconciliation now runs while local inputs remain unacknowledged; the 5 m /
  20 m / 10 degree blend, converge, and snap thresholds are no longer bypassed.
- Snapshot playback uses the 120 ms interpolation delay, bounded dead reckoning
  through 500 ms after the newest receive time, heading wrap, single-snapshot
  velocity projection, and a stable freeze at the 500 ms boundary.
- Replicated projectiles, torpedoes, aircraft, shots, impacts, and air events are
  cloned into the guest battle view. Anonymous render-safe identifiers/defaults
  replace fields intentionally redacted by the server; no hidden source state is
  reconstructed.
- GameView accepts server-filtered guest projectiles, while main routes newly
  replicated shot/impact/air events once to GameView, audio, HUD, and tactical map.

### Runtime/transport corrections
- Lobby snapshots are pushed from the runtime into GameMenus/MultiplayerMenu for
  both host and guest changes, causing an immediate localized rerender without a
  local button action.
- A second raw websocket client is closed with `room-full` while the active guest
  socket and its targeted-send connection ID remain intact.
- Incoming messages now require the exact protocol/game/content fingerprint,
  valid room binding, monotonic per-connection sequence, and an allowed message
  type for the current join/lobby/match state. Host guest identity stays bound to
  the bridge connection ID.
- Manual IPv4 join uses a constrained pending-room request and can rebind only on
  a valid `join-accepted` containing the local guest identity and a valid lobby.
  `start-match` is ignored until join acceptance and an ordered in-match lobby.
- Malformed JSON and rejected asynchronous subscribers are contained without an
  unhandled rejection.
- Runtime/HUD multiplayer notices use stable Simplified-Chinese source strings
  translated for Simplified/Traditional Chinese, English, Japanese, Spanish,
  German, and Russian.

### Added/expanded tests
- `tests/lanMultiplayerRuntime.test.ts`: host connection identity, room/fingerprint/
  sequence/state gates, secure manual join, pushed lobbies, malformed frames.
- `tests/clientBattleSession.test.ts`: pending-input reconciliation modes,
  two-snapshot and single-snapshot extrapolation/freeze, replicated visual state.
- `tests/lanBridge.test.ts`: real two-client active-guest preservation.
- `tests/multiplayerMenu.test.ts`: external lobby rerender and seven-locale notices.

### Verification after review remediation (2026-08-26)

```bash
npm test -- --run tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts tests/lanMultiplayerRuntime.test.ts tests/lanBridge.test.ts tests/multiplayerMenu.test.ts tests/netProtocol.test.ts tests/lobbyState.test.ts tests/hostBattleSession.test.ts tests/replicationView.test.ts tests/gameLocaleHud.test.ts tests/i18n.test.ts
npm test
node --check desktop/lanBridge.cjs
npm run build
git diff --check
```

Result:
- Focused regression: 11 files, 94 tests passed.
- Full suite: 63 files passed, 2 report suites skipped; 511 tests passed,
  2 report tests skipped.
- CommonJS syntax check passed.
- Production TypeScript/Vite build passed (existing large-chunk advisory only).
- Whitespace diff check passed.

## Second independent-review remediation (2026-08-26)

A second review of `5f7a88d` identified an exploitable multiplayer-menu HTML
injection path, guest loadout loss, incomplete visual-event replication, event
loss between 60 Hz simulation ticks and 10 Hz snapshots, and an incomplete
pending websocket handshake lifecycle. These items were reproduced with failing
tests before implementation.

### Security and transport hardening
- Escaped every dynamic multiplayer-menu text and attribute insertion, including
  remote room IDs/names, host/commander names, game versions, lobby build names,
  local saved build names, and editable input values. Regression payloads cover
  raw image/SVG handlers and quote-based attribute injection.
- Split host websocket state into one pending handshake and one accepted guest.
  Pending handshakes expire after 4.5 seconds, can receive only targeted join
  responses, require explicit runtime promotion after a validated join, and can
  be closed by connection ID. A newcomer can replace neither pending nor accepted
  state; accepted targeted sends remain bound to the original socket.
- Host runtime now immediately closes invalid pending handshakes. Once accepted,
  malformed protocol and over-frequency input violations are counted in a
  per-connection two-second window and close the offender at five violations.
- Every host disconnect unconditionally clears sequence and violation state before
  guest fallback handling. A guest disconnect during join resolves immediately
  instead of waiting for the four-second application timeout.
- The bridge API, IPC controller, preload surface, and browser-facing TypeScript
  contract now expose explicit `acceptConnection` and targeted `closeConnection`
  operations.

### Authoritative loadouts and visual replication
- Host human ships now derive the complete runtime loadout from validated lobby
  slots: historical main gun/torpedo IDs, mount counts, secondary/AA/depth-charge
  configuration, installed component identities, and performance modifiers.
- Scoped snapshots expose the same visible loadout for self and friendlies only;
  hostile contacts still contain no ship internals. The guest reconstructs these
  fields through the existing build validator and also carries its validated
  lobby build into client-session startup.
- Replicated shots now retain depth-charge kind, weapon source, and air weapon;
  impacts retain projectile/ammunition/weapon metadata; air events retain their
  server-filtered team and weapon data even when source identity is anonymous.
  Missing team data is dropped rather than guessed.
- Host sessions accumulate each player's already-filtered visual events across the
  six simulation ticks between snapshots, publish them once, and clear the batch
  only after snapshot creation.

### Verification after second review remediation (2026-08-26)

```bash
npm test -- --run tests/lanMultiplayerRuntime.test.ts tests/lanBridge.test.ts tests/multiplayerMenu.test.ts tests/clientBattleSession.test.ts tests/hostBattleSession.test.ts tests/replicationView.test.ts
npm test
node --check desktop/lanBridge.cjs
node --check desktop/preload.cjs
npm run build
git diff --check
```

Result:
- Focused regression: 6 files, 63 tests passed.
- Full suite: 63 files passed, 2 report suites skipped; 523 tests passed,
  2 report tests skipped.
- Both CommonJS entry points passed syntax checks.
- Production TypeScript/Vite build passed (existing large-chunk advisory only).
- Whitespace diff check passed.

## Third independent-review remediation (2026-08-26)

A third review of `f8b6153` found transactional join rollback gaps, incomplete
guest socket cleanup, missing transport-level websocket rate accounting, and
four omitted authoritative air-event fields. Each issue was first reproduced by
a failing regression test.

### Transactional lobby and connection lifecycle
- Host joins are now transactional across announcement refresh, the targeted
  `join-accepted` send, bridge promotion, and disconnect races. Any failure
  removes the occupied guest seat, rebuilds and publishes the authoritative
  lobby, refreshes the room announcement when possible, and clears all socket,
  sequence, join, and violation state.
- Guest `return-to-lobby` handling preserves the accepted connection ID long
  enough to close that exact websocket before removing the lobby guest or
  enabling in-match AI fallback. Repeated disconnect callbacks are idempotent,
  and a real replacement websocket can join after the guest leaves without
  relying on client-side socket closure.
- Structurally valid messages that are illegal in the current lobby/match state
  now count against the existing per-connection two-second violation window.
  The counter resets outside the window and closes the offender at five.

### Transport abuse limits and event fidelity
- Every websocket connection now has an independent one-second sliding window
  for inbound frame count and aggregate bytes. Exact count/byte boundaries are
  accepted, expired entries reset, and excess traffic is closed with a targeted
  `rate-limited` policy response.
- Binary websocket messages participate in transport accounting but are never
  exposed to the JSON protocol parser; they emit `protocol-violation` and close
  only their originating connection.
- Scoped air events now retain the already-filtered authoritative `time`,
  `orderKind`, `rejectReason`, and `lossCause` fields. The client accepts only
  enumerated combat event, mission, rejection, and loss-cause values, requires a
  finite event time, and drops invalid events or optional values instead of
  guessing replacements. Anonymous hostile events remain anonymous.

### Verification after third review remediation (2026-08-26)

```bash
npm test -- --run tests/lanMultiplayerRuntime.test.ts tests/lanBridge.test.ts tests/replicationView.test.ts tests/clientBattleSession.test.ts
npm test -- --run
node --check desktop/lanBridge.cjs
node --check desktop/preload.cjs
npm run build
git diff --check
```

Result:
- Focused regression: 4 files, 49 tests passed.
- Full suite: 63 files passed, 2 report suites skipped; 533 tests passed,
  2 report tests skipped.
- Both CommonJS entry points passed syntax checks.
- Production TypeScript/Vite build passed (existing large-chunk advisory only).
- Whitespace diff check passed.

## Fourth independent-review remediation (2026-08-26)

The final focused review of `f380614` found two client presentation defects.
Friendly ships were paired across snapshots by array position, and visual events
from the newer snapshot were exposed before the 120 ms interpolation timeline
had reached that snapshot. Both were reproduced with failing tests first.

### Client interpolation and event timeline
- Friendly interpolation now builds the previous-frame lookup by ship ID. A
  continuing ship follows only its own prior position, heading, speed, and hull
  history; a newly visible ID starts directly from its current authoritative
  values instead of borrowing another ship's trajectory.
- Validated replicated shot, impact, and air events now enter a separate queue
  keyed by their snapshot receive boundary. They remain hidden while interpolation
  alpha is below one, are released once when the delayed render timeline crosses
  the authoritative boundary, and are removed immediately after delivery.
- The same release rule works for a single snapshot, bounded extrapolation, and
  the 500 ms freeze state; repeated renders never replay an already delivered
  event.

### Verification after fourth review remediation (2026-08-26)

```bash
npm test -- --run tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts
npm test -- --run
npm run build
git diff --check
```

Result:
- Focused regression: 2 files, 19 tests passed.
- Full suite: 63 files passed, 2 report suites skipped; 536 tests passed,
  2 report tests skipped.
- Production TypeScript/Vite build passed (existing large-chunk advisory only).
- Whitespace diff check passed.

## Final interpolation and event evidence expansion (2026-08-26)

No production changes were required for this final evidence pass. The client
session regression coverage now makes the two reviewed invariants explicit:

- A friendly transition from `[A, B]` to `[B, C]` proves that missing ship `A`
  disappears, continuing ship `B` interpolates only against its own ID-matched
  history, and newly visible ship `C` starts at its authoritative state.
- Two consecutive authoritative snapshots carrying different events prove that
  the first event is released only at the first delayed boundary, the second
  only at the second boundary, and neither is replayed by repeated rendering,
  bounded extrapolation, or the post-500 ms frozen state.

### Verification after final evidence expansion (2026-08-26)

```bash
npm test -- --run tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts
npm test -- --run
npm run build
git diff --check
```

Result:
- Focused regression: 2 files, 20 tests passed.
- Full suite: 63 files passed, 2 report suites skipped; 537 tests passed,
  2 report tests skipped.
- Production TypeScript/Vite build passed (existing large-chunk advisory only).
- Whitespace diff check passed.
