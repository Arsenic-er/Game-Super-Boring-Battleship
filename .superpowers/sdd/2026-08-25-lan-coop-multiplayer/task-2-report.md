# Task 2 report — Define and validate the LAN protocol

Date: 2026-08-25
Base: `45a7df2f3462456f7848a4317e439aa1feb1281a`
Commit: final HEAD commit with message `Define validated LAN multiplayer protocol`

## Red

- Added `tests/netProtocol.test.ts` first.
- Ran:
  - `npx vitest run tests/netProtocol.test.ts --reporter=verbose`
- Observed expected failure before implementation:
  - `Cannot find module '../src/net/networkFingerprint'`

## Green

- Implemented:
  - `src/net/protocol.ts`
  - `src/net/messageValidation.ts`
  - `src/net/networkFingerprint.ts`
- Added explicit allow-list validation for:
  - envelope version/type/room ID/sequence/timestamp
  - room announcement port range and discovery port
  - build descriptor slot keys and bounded slot arrays
  - remote command finite aim point, enum allow-lists, and throttle/rudder clamping
- Implemented deterministic fingerprinting from protocol-visible schema/catalog identifiers only:
  - package version
  - protocol/message/phase constants
  - fleet sizes
  - weather IDs
  - ship class IDs
  - saved-build slot keys
- Confirmed it does not include local profile contents or machine paths.

## Verification

- Focused test after implementation:
  - `npx vitest run tests/netProtocol.test.ts --reporter=verbose`
  - Result: 1 file passed, 9 tests passed
- Full task verification:
  - `npx vitest run tests/netProtocol.test.ts --reporter=verbose && npm run build`
  - Result: focused suite passed and production build succeeded
- Formatting / patch hygiene:
  - `git diff --check -- src/net tests/netProtocol.test.ts`
  - Result: clean

## Mid-course fix

- `npm run build` initially failed on a TypeScript-only issue in `src/net/messageValidation.ts`:
  - a shared `envelope` object used `satisfies LanMessage` before per-type narrowing
- Fixed by removing the premature `satisfies` constraint and re-running the focused suite plus build.

## Files changed

- `src/net/protocol.ts`
- `src/net/messageValidation.ts`
- `src/net/networkFingerprint.ts`
- `tests/netProtocol.test.ts`

## Self-review

- The validator sanitizes by reconstruction rather than trusting incoming object shape.
- `validateRemoteCommand` keeps only the surface-ship fields Task 2 needs and rejects invalid enums/non-finite vectors.
- `RoomAnnouncement` rejects ports outside `47778..47788`.
- Negative or otherwise invalid sequence numbers are rejected before payload use.
- Fingerprinting is deterministic and limited to protocol-visible schema data.

## Review fix-up (2026-08-25)

### Red

- Added new focused tests for:
  - preserving `airMission`
  - preserving `airMissions`
  - rejecting malformed / oversized air mission payloads
  - rejecting extra own enumerable keys on envelopes, payloads, commands, and nested objects
  - exposing a canonical fingerprint source that includes protocol-visible catalog and slot-schema data
- Re-ran:
  - `npx vitest run tests/netProtocol.test.ts --reporter=verbose`
- Observed expected failures:
  - extra envelope/payload keys were still accepted
  - `validateRemoteCommand` dropped `airMission` / `airMissions`
  - malformed air mission payloads were not rejected
  - canonical fingerprint source was not exported and did not cover enough protocol-visible content

### Green

- Extended `validateRemoteCommand` to reconstruct and validate:
  - `airMission`
  - `airMissions`
  - `perception`
  - `aiDecision`
- Added exact-key allow-lists for:
  - LAN envelopes
  - every message payload shape in Task 2
  - `ControlCommand`
  - nested `Vec3`, air mission area, build descriptor, and lobby/player helper objects
- Expanded fingerprint input to cover stable protocol-visible data:
  - sorted `EQUIPMENT_CATALOG` identifiers and compatibility / bonus fields
  - `SHIP_CLASSES` slot counts, starter slots, torpedo launcher schema
  - `minimumSeaReadySlotCounts(...)` outputs per ship class
- Exported `LAN_FINGERPRINT_SOURCE` for direct verification.

### Review-fix verification

- `npx vitest run tests/netProtocol.test.ts --reporter=verbose`
  - Result: 1 file passed, 17 tests passed
- `npx vitest run tests/netProtocol.test.ts --reporter=verbose && npm run build`
  - Result: focused suite passed and production build succeeded
- `git diff --check -- src/net tests/netProtocol.test.ts .superpowers/sdd/2026-08-25-lan-coop-multiplayer/task-2-report.md`
  - Result: clean

### Review-fix summary

- Fixed silent loss of remote aircraft mission commands.
- Enforced exact-key protocol validation instead of permissive object acceptance.
- Broadened the deterministic LAN fingerprint to track the actual protocol-visible equipment and loadout schema.
