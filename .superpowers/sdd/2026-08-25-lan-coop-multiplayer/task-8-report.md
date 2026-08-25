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
