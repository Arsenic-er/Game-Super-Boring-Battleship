# Task 8 report

## Test-first loopback acceptance (2026-08-26)

Added `tests/lanCoopIntegration.test.ts` as a deterministic two-player LAN
acceptance boundary. The test uses the real `HostLobby`, `HostBattleSession`,
`ClientBattleSession`, replication view, and JSON protocol encoder/parser.

### RED evidence

The initial focused run completed join, ready and start, accepted guest
throttle/rudder/fire input, and produced a host result snapshot. It then failed
at the guest presentation boundary:

```text
expected 'running' to be 'player-won'
tests/lanCoopIntegration.test.ts:237
```

The authoritative battle result was not part of the scoped snapshot, so a guest
could never show the same result as the host.

### Minimal implementation

- Added optional, enum-validated `status` and `endReason` fields to the player
  snapshot schema so existing fixtures remain compatible while newly generated
  snapshots always carry battle outcome.
- `replicationViewFor` now copies the authoritative result fields.
- `ClientBattleSession` reconstructs the result into its render-safe
  `BattleState`, allowing the existing HUD result view to match the host.
- The strict decoder still rejects unknown keys, invalid status values and
  invalid end reasons.

### Acceptance coverage

- Full host-lobby join request, two-player ready flow and start transition.
- Guest throttle, rudder and fire input accepted by the authoritative host.
- Guest and host converge on the same server tick and objective scores.
- Guest disconnect hands the existing ship to AI immediately and an AI decision
  is present inside five simulated seconds.
- A real host guest-view snapshot is serialized, parsed and fed to the client.
- Non-default main gun, torpedo, installed components and all performance
  multipliers survive reconstruction.
- HUD main-battery and torpedo range inputs resolve identically on host and
  guest.
- Scoped shell, torpedo and complete visible air-event metadata survive without
  exposing unreplicated state.
- Guest status and end reason match the authoritative result snapshot.

Focused GREEN result:

```text
tests/lanCoopIntegration.test.ts: 2 passed
protocol/replication/client focused regression: 23 passed
```

## Version and documentation

- Set `package.json` and `package-lock.json` to `0.7.0`.
- Added bilingual `docs/LAN_MULTIPLAYER.md` covering Windows Private-network
  firewall permission, AP/client isolation, automatic discovery, manual IPv4,
  host/guest procedures, desktop-only hosting, disconnect behavior, unsupported
  host migration/reconnect, troubleshooting and a two-instance matrix.
- Updated `README.md`, `docs/GAME_DESIGN.md` and
  `docs/DEVELOPMENT_STATUS.md` for the 0.7.0 authoritative two-player co-op
  baseline and latest-only local package policy.

## Full verification

Executed from `/home/ubuntu/battleship/.worktrees/lan-multiplayer`:

```bash
git diff --check
npm test
npm run build
npm run assets:ships:validate -- public/assets/ships
npm run desktop:dist
```

Results:

- Diff whitespace validation passed.
- Full Vitest suite: 64 files passed, 2 report suites skipped; 539 tests passed,
  2 report tests skipped.
- TypeScript and Vite production build passed. The existing Vite large-chunk
  advisory remains non-fatal.
- Ship package validation returned `valid: true`.
- Electron Builder 26.15.3 completed the Windows x64 portable target on Linux.
  The current package uses Electron's default icon; this is a non-fatal release
  presentation limitation.

## Server artifact

```text
Path: /home/ubuntu/battleship/.worktrees/lan-multiplayer/release/battleship-0.7.0-windows-x64.exe
Size: 105,667,201 bytes
Type: PE32 executable (GUI), Intel 80386, Windows, NSIS self-extracting archive
SHA-256: 132ccfa0bab338427459725c37773262c3439a80b275d715ee86c8ac601ba571
```

The automated loopback gate is complete. The documented two-computer Windows
matrix remains the final physical-router smoke procedure because this Linux
build environment cannot emulate a user's Windows firewall and Wi-Fi AP
isolation settings.

## Final release-blocker correction (2026-08-26)

The whole-branch review found one browser-startup blocker and five LAN release
contract gaps. Each correction was driven by a focused failing regression before
the implementation changed.

### Additional RED evidence

The first focused run exposed ten failures. Representative failures were:

```text
browser LAN startup: LAN bridge is only available in the desktop app
terminal transition: expected snapshots.size to be 2, received 0
post-match lifecycle: runtime.publishHostStep is not a function
host endpoint: expected 192.168.1.88:47779, fields absent
pending mismatch: expected targeted version/content rejection, received none
minimum loadout: all-null forged build was accepted
```

The integration result assertion now consumes the terminal snapshot emitted by
the exact transition step. It no longer advances an already completed battle by
six ticks to reach the normal snapshot cadence.

A second review pass deliberately exposed two further lifecycle/catalog gaps:

```text
late guest match-ended: expected the current lobby, connection was closed
combat fingerprint: armor/weather/simulation/air changes did not change the hash
```

Follow-up RED cases also covered a guest-first return whose reply send rejects
and a guest disconnect during post-match that previously left a ghost seat.

### Corrections

- Browser fallback subscriptions now return a no-op unsubscribe function, so the
  full runtime can start without Electron preload support; actual desktop-only
  operations still reject.
- `HostBattleSession` forces snapshots on every `running` to terminal transition.
  The real main loop routes every host step through `publishHostStep`, which sends
  the guest result before publishing `post-match`.
- Host and guest keep the WebSocket and room after normal results. Both ready
  flags reset, the runtime transitions through `post-match`, and either player
  can return to the same fresh lobby without rediscovery. Concurrent and late
  `match-ended` returns are idempotent; terminal sends, reply sends and
  announcement refresh failures cannot block the local state transition.
- A guest disconnect during `post-match` removes its lobby seat without closing
  the room, allowing the host to return to a usable single-seat lobby.
- Pending join requests receive targeted `version-mismatch` or
  `content-mismatch` messages before their connection is closed.
- The content fingerprint now covers the equipment, hull, armor, weather,
  simulation rules, aircraft rules, main-gun, torpedo, secondary-gun,
  historical battery, range, ship-class, minimum-loadout and reconstruction
  schema inputs used by client presentation. A one-field catalog mutation
  changes the hash.
- The desktop bridge returns its actual selected private IPv4 address and port.
  The host lobby displays and copies that endpoint, including a fallback port,
  with all new strings translated across the seven supported locales.
- Host-side join, build, ready and start boundaries enforce the same minimum
  sea-ready slot counts as local saved builds.
- Historical CRLF/trailing-whitespace defects in the reviewed release range were
  normalized.

Focused GREEN result:

```text
8 focused files passed
104 focused tests passed
```

### Fresh final verification

Executed again after the blocker corrections:

```text
git diff c8021a3 --check: passed
git diff --check: passed
npm test: 65 files passed, 2 skipped; 552 tests passed, 2 skipped
npm run build: passed
npm run assets:ships:validate -- public/assets/ships: valid true
node --check desktop/main.cjs desktop/preload.cjs desktop/lanBridge.cjs: passed
npm run desktop:dist: passed
```

Fresh server artifact (the previous executable was deleted before rebuilding):

```text
Path: /home/ubuntu/battleship/.worktrees/lan-multiplayer/release/battleship-0.7.0-windows-x64.exe
Size: 105,666,510 bytes
Type: PE32 executable (GUI), Intel 80386, Windows, NSIS self-extracting archive
SHA-256: 75e01c8fa1bd8e1786cb0d434dd6888b75a5db92c2db5271c94396a3b242d4ec
```

## Final asynchronous-boundary correction (2026-08-26)

The final whole-branch review identified three independent race and compatibility
boundaries. Deterministic regressions were added before implementation changes.

### RED evidence

The first focused RED run produced six failures across 44 tests:

```text
guest bridge connected event had no connectionId
foreign version/content mismatch rejection did not reach the pending join
forged mismatch reason was accepted despite a matching local envelope
old same-peer join rollback removed the newly reconnected guest seat
terminal snapshot continuation dereferenced a cleared host session
```

A follow-up identity audit added two more RED cases across 25 runtime tests:

```text
stale guest error/disconnected events terminated the current pending join
a bridge without a guest connectionId still opened a pending join window
```

### Corrections

- Desktop guest WebSocket events now carry one stable, monotonically allocated
  connection ID across connected, message, error and disconnected events.
- A pending join requires that non-empty connection identity. The same narrow
  identity gate is applied to response, error and disconnect processing. A
  missing identity fails before a join request or pending timeout is created.
- Foreign `version-mismatch` and `content-mismatch` rejections can cross the
  general fingerprint gate only for the expected pending connection and only
  when the rejection reason agrees with the envelope version/hash difference.
- Host-step publication captures both the session instance and a monotonically
  changing epoch. Every asynchronous continuation revalidates instance, epoch
  and host role before it can advance the match lifecycle.
- Pending host joins use a connection-scoped reservation object with a generation
  token. A delayed rollback can remove only the exact seat reservation it
  created, never a same-peer reservation from a newer connection.

### Final verification

```text
focused LAN suite: 8 files passed; 110 tests passed
final bridge/runtime focus: 2 files passed; 46 tests passed
npm test: 65 files passed, 2 skipped; 560 tests passed, 2 skipped
npm run build: passed
npm run assets:ships:validate -- public/assets/ships: valid true
node --check desktop/main.cjs desktop/preload.cjs desktop/lanBridge.cjs: passed
git diff 4767f85 --check: passed
git diff --check: passed
npm run desktop:dist: passed
independent final review: APPROVED, no remaining Critical or Important findings
```

The prior executable was deleted before the final rebuild:

```text
Path: /home/ubuntu/battleship/.worktrees/lan-multiplayer/release/battleship-0.7.0-windows-x64.exe
Size: 105,669,022 bytes
Type: PE32 executable (GUI), Intel 80386, Windows, NSIS self-extracting archive
SHA-256: 0db4318c59b82e9b49b94c900bfc619f3096546fd8344d7f29786925468988b1
```
