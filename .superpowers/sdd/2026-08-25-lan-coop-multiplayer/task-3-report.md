# Task 3 report

## Red
- Added `tests/roomDirectory.test.ts` and `tests/lobbyState.test.ts` first.
- Verified the initial red state with:
  - `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts --reporter=verbose`
- The first meaningful red was `ERR_MODULE_NOT_FOUND` for `../src/net/roomDirectory` and `../src/net/lobbyState`, confirming the task was still unimplemented.
- During green, one false start came from over-applying dockyard sea-ready minimum rules to LAN builds; the focused tests exposed that valid protocol-shaped LAN builds must be judged by catalog IDs and ship-class compatibility, not by local readiness thresholds.

## Green
- Implemented `src/net/roomDirectory.ts` with:
  - room-id de-duplication that preserves stable order for ties,
  - default 3-second expiry with inclusive boundary handling,
  - lobby-first alphabetical sorting,
  - cloned ingest input and frozen list snapshots.
- Implemented `src/net/lobbyState.ts` with:
  - fixed host + single guest capacity,
  - game-version/content-hash join checks,
  - duplicate/full-room rejection,
  - LAN build normalization from validated descriptor shape + equipment catalog compatibility,
  - ready reset on build changes,
  - start gating on both players being connected, ready, and holding valid builds,
  - explicit leave/phase behavior (`lobby` / `in-match` / `closing`),
  - frozen lobby snapshots.
- Verified with:
  - `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts --reporter=verbose`
  - `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts tests/savedBuilds.test.ts tests/loadoutPolicy.test.ts --reporter=verbose`
  - `npm run build`

## Self-review
- Kept build validation scoped to protocol-safe shape and catalog compatibility so the lobby does not import local inventory/ownership assumptions into remote peers.
- Preserved immutable boundaries on both directory listings and lobby snapshots so UI code cannot accidentally mutate host state.
- Re-checked that only Task 3 files were added and that no pre-existing tracked files were modified.
- Known trade-off: room sorting is deterministic and stable for current UI needs (phase, room name, host name, insertion order), but if product requirements later want recency-first discovery ordering, the comparator will need a dedicated update.

## Commit
- Commit message: `Add LAN room and lobby state machines`

## Review round 2

### Red
- Added a new `HostLobby` regression test that proves `snapshot()` was only shallowly freezing `build`: the `build` object itself was frozen, but `build.slots` and its category arrays were still mutable.
- Added a table-driven `RoomDirectory` regression test that proves invalid discovery payloads were being accepted into the directory: hostname/IPv6 addresses, non-allow-listed ports, out-of-range player counts, wrong capacity, invalid phase, empty/overlong text fields, and negative/non-finite `lastSeenAt`.
- Verified the failing state first with:
  - `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts --reporter=verbose`
- The expected failures were:
  - `Object.isFrozen(frozenBuild.slots)` returning `false`, and
  - `RoomDirectory.ingest(...)` returning `undefined` / accepting invalid records.

### Green
- Hardened `HostLobby` snapshot immutability by deep-cloning and freezing:
  - `build`,
  - `build.slots`, and
  - each category array within `slots`.
- Hardened `RoomDirectory.ingest()` to validate and reject invalid room records before storage. It now returns `boolean`:
  - `true` when the room is accepted,
  - `false` when the room is rejected.
- Validation now enforces:
  - IPv4-literal `address` only,
  - `port` in `LAN_GAME_PORTS`,
  - `playerCount` of `1 | 2`,
  - `capacity === 2`,
  - `phase` of `lobby | in-match`,
  - bounded non-empty `roomId`/`roomName`/`hostName`,
  - finite non-negative `lastSeenAt`.
- Verified with:
  - `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts --reporter=verbose`
  - `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts tests/savedBuilds.test.ts tests/loadoutPolicy.test.ts --reporter=verbose`
  - `npm run build`

### Self-review
- The new directory validation stays local to Task 3 and does not broaden trust assumptions elsewhere in the LAN stack.
- Returning `boolean` from `ingest()` gives callers a diagnosable contract while remaining source-compatible with existing call sites that only rely on side effects.
- Snapshot immutability is now deep enough to block both object-property assignment and array mutation (`push` / index writes) without leaking shared references back into host state.

### Commit
- Review fix commit message: `Harden LAN room validation and lobby snapshots`

## Review round 3

### Red
- Added a focused `RoomDirectory` regression test for non-canonical IPv4 octets.
- Verified the failing state first with:
  - `npx vitest run tests/roomDirectory.test.ts --reporter=verbose`
- The intended red was:
  - `001.002.003.004` being accepted when it should be rejected.
- The regression also covers:
  - invalid single-octet leading-zero forms: `01`, `00`, `000`
  - valid canonical octets: `0`, `10`, `255`
  - invalid replays with the same `roomId` not overwriting an already accepted canonical room.

### Green
- Tightened IPv4 validation so each octet must be either:
  - exactly `0`, or
  - a non-zero-prefixed decimal string matching `[1-9]\d{0,2}`
- Numeric range is still enforced with `<= 255`.
- This rejects forms like `001.002.003.004` and `010.2.3.4` while preserving canonical literals such as `0.0.0.0`, `10.2.3.4`, and `255.255.255.255`.

### Verification
- `npx vitest run tests/roomDirectory.test.ts --reporter=verbose`
- `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts tests/savedBuilds.test.ts tests/loadoutPolicy.test.ts --reporter=verbose`
- `npm run build`

### Commit
- Final IPv4 normalization fix commit message: `Reject non-canonical LAN room IPv4 literals`
