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
