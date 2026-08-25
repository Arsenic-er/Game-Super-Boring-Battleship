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
