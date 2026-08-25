# LAN Co-op Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver version 0.7.0 with one host and one guest playing cooperatively against host-controlled AI over a Windows LAN.

**Architecture:** Keep `stepSimulation` unchanged and wrap it in local, host and client battle sessions. Electron main/preload owns UDP discovery and WebSocket transport; renderer sessions own validated lobby and gameplay state. The host advances the sole authoritative `BattleState` and sends player-scoped snapshots.

**Tech Stack:** TypeScript 7, Vitest 4, Babylon.js 9, Electron, Node `dgram`, `ws`, HTML/CSS, electron-builder.

**Spec:** `docs/superpowers/specs/2026-08-25-lan-coop-multiplayer-design.md`

## Global Constraints

- Version 0.7.0 supports exactly two human players on the player team; AI fills every other ship slot.
- UDP discovery uses port `47777`; WebSocket hosting tries `47778..47788` in ascending order.
- Simulation remains 60 Hz, guest input is accepted at no more than 30 messages per second, and snapshots publish at 10 Hz.
- UDP packets are at most 1 KiB; WebSocket application messages are at most 64 KiB.
- Only the host calls `stepSimulation`; clients never resolve combat outcomes.
- `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` remain enabled.
- Browser preview exposes disabled LAN hosting/search controls with a desktop-required explanation.
- Multiplayer copy is translated for `zh-CN`, `zh-TW`, `en`, `ja`, `es`, `de`, and `ru`.
- Validation is desktop-package-only. Completed user-visible batches copy one complete Windows game directory to `C:\Users\jiang\Documents\战舰\release\battleship-latest-windows-x64` and atomically replace the previous local directory after verification.
- Production behavior follows strict red-green-refactor TDD and each task is committed by `Arsenic-er <302726993@qq.com>`.

---

### Task 1: Extract the local authoritative battle session

**Files:**
- Create: `src/session/battleSession.ts`
- Create: `src/session/localBattleSession.ts`
- Modify: `src/main.ts`
- Test: `tests/localBattleSession.test.ts`

**Interfaces:**
- Consumes: `BattleState`, `ControlCommand`, `FIXED_STEP`, `observe`, `stepSimulation`, and `RuleBasedAi`.
- Produces:

```ts
export interface BattleStepOutput {
  state: BattleState;
  shots: readonly ShotEvent[];
  impacts: readonly ImpactEvent[];
  airEvents: readonly AirCombatEvent[];
}

export interface AuthoritativeBattleSession {
  readonly role: "local" | "host";
  readonly state: BattleState;
  step(humanCommands: ReadonlyMap<string, ControlCommand>, dt?: number): BattleStepOutput;
  reset(state: BattleState): void;
}

export class LocalBattleSession implements AuthoritativeBattleSession {
  readonly role = "local" as const;
  constructor(state: BattleState, options?: { includeDeveloperAi?: boolean });
  step(humanCommands: ReadonlyMap<string, ControlCommand>, dt?: number): BattleStepOutput;
  reset(state: BattleState): void;
}
```

- [ ] **Step 1: Write the failing local-session tests**

```ts
it("advances the authoritative state once and preserves human commands", () => {
  const state = createInitialState(17, "battle");
  const session = new LocalBattleSession(state);
  const command = { ...zeroCommandFor(state.ships[0]), throttle: 1 };
  session.step(new Map([["player", command]]), FIXED_STEP);
  expect(state.time).toBeCloseTo(FIXED_STEP);
  expect(state.ships.find(({ id }) => id === "player")!.throttle).toBe(1);
});

it("generates AI commands for every live uncontrolled combat ship", () => {
  const state = createInitialState(17, "battle");
  const session = new LocalBattleSession(state);
  session.step(new Map([["player", zeroCommandFor(state.ships[0])]]), FIXED_STEP);
  expect(state.ships.find(({ id }) => id === "enemy")!.aiDecision).toBeDefined();
});
```

- [ ] **Step 2: Run the focused test and verify missing-module failure**

Run: `npx vitest run tests/localBattleSession.test.ts --reporter=verbose`

Expected: FAIL because `LocalBattleSession` does not exist.

- [ ] **Step 3: Implement the session and route the existing fixed-step loop through it**

Move AI-controller lifecycle and `stepSimulation` invocation from `src/main.ts` into `LocalBattleSession`. Keep input collection, rendering, perception, audio and menus in `src/main.ts`. Do not alter simulation rules.

- [ ] **Step 4: Verify focused and existing simulation behavior**

Run: `npx vitest run tests/localBattleSession.test.ts tests/simulation.test.ts tests/fleetAi.test.ts tests/airRtsCommand.test.ts --reporter=verbose`

Expected: all selected tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session src/main.ts tests/localBattleSession.test.ts
git commit -m "Extract authoritative local battle session"
```

### Task 2: Define and validate the LAN protocol

**Files:**
- Create: `src/net/protocol.ts`
- Create: `src/net/messageValidation.ts`
- Create: `src/net/networkFingerprint.ts`
- Test: `tests/netProtocol.test.ts`

**Interfaces:**
- Consumes: `ControlCommand`, `FleetSize`, `WeatherId`, `ShipClassId`, and saved-build slot identifiers.
- Produces:

```ts
export const LAN_PROTOCOL_VERSION = 1;
export const LAN_DISCOVERY_PORT = 47777;
export const LAN_GAME_PORTS = [47778, 47779, 47780, 47781, 47782, 47783, 47784, 47785, 47786, 47787, 47788] as const;

export interface LanEnvelope<T extends LanMessageType, P> {
  protocolVersion: 1;
  gameVersion: string;
  contentHash: string;
  roomId: string;
  sequence: number;
  sentAt: number;
  type: T;
  payload: P;
}

export type LanMessage = DiscoveryProbe | RoomAnnouncement | JoinRequest |
  JoinAccepted | JoinRejected | LobbyUpdate | ReadyRequest | StartMatch |
  InputFrame | PlayerSnapshot | PeerDisconnected | ReturnToLobby;

export function parseLanMessage(value: unknown): LanMessage | undefined;
export function encodeLanMessage(message: LanMessage, maxBytes?: number): string;
export function validateRemoteCommand(value: unknown): ControlCommand | undefined;
```

- [ ] **Step 1: Write failing protocol behavior tests**

Cover a valid round trip, wrong protocol rejection, oversized payload rejection, non-finite aim coordinates, throttle/rudder clamping, unknown enums, stale negative sequence numbers, and a room announcement whose WebSocket port is outside the allowed range.

```ts
expect(parseLanMessage(validJoinRequest)).toEqual(validJoinRequest);
expect(parseLanMessage({ ...validJoinRequest, protocolVersion: 2 })).toBeUndefined();
expect(() => encodeLanMessage(validJoinRequest, 8)).toThrow(/message-too-large/);
expect(validateRemoteCommand({ ...validCommand, throttle: 7 })?.throttle).toBe(1);
expect(validateRemoteCommand({ ...validCommand, aimPoint: { x: NaN, y: 0, z: 0 } })).toBeUndefined();
```

- [ ] **Step 2: Run the protocol tests and verify they fail because exports are missing**

Run: `npx vitest run tests/netProtocol.test.ts --reporter=verbose`

- [ ] **Step 3: Implement discriminated messages and hand-written runtime validators**

Use explicit property checks and allow lists. `networkFingerprint.ts` exports the package version plus a deterministic content identifier that changes with protocol-visible catalog/schema revisions; it must not hash local profiles or absolute paths.

- [ ] **Step 4: Run protocol and TypeScript verification**

Run: `npx vitest run tests/netProtocol.test.ts --reporter=verbose && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/net tests/netProtocol.test.ts
git commit -m "Define validated LAN multiplayer protocol"
```

### Task 3: Implement the room directory and two-player lobby state machine

**Files:**
- Create: `src/net/roomDirectory.ts`
- Create: `src/net/lobbyState.ts`
- Test: `tests/roomDirectory.test.ts`
- Test: `tests/lobbyState.test.ts`

**Interfaces:**
- Consumes: validated `RoomAnnouncement`, saved-build descriptors, and the protocol fingerprint.
- Produces:

```ts
export interface DiscoveredRoom {
  roomId: string;
  roomName: string;
  hostName: string;
  address: string;
  port: number;
  playerCount: 1 | 2;
  capacity: 2;
  phase: "lobby" | "in-match";
  lastSeenAt: number;
}

export class RoomDirectory {
  ingest(room: DiscoveredRoom): void;
  expire(now: number, maxAgeMs?: number): void;
  list(): readonly DiscoveredRoom[];
}

export interface LobbyPlayer {
  peerId: string;
  commanderName: string;
  role: "host" | "guest";
  build?: LanBuildDescriptor;
  ready: boolean;
  connected: boolean;
}

export class HostLobby {
  constructor(config: HostLobbyConfig);
  join(request: JoinRequestPayload): JoinResult;
  leave(peerId: string): void;
  setBuild(peerId: string, build: LanBuildDescriptor): LobbyResult;
  setReady(peerId: string, ready: boolean): LobbyResult;
  canStart(): boolean;
  start(): LobbyResult;
  snapshot(): LobbySnapshot;
}
```

- [ ] **Step 1: Write failing directory and lobby tests**

Test de-duplication by room ID, three-second expiry, stable room sorting, exact two-player capacity, mismatched fingerprint rejection, invalid build rejection, readiness reset when a build changes, and start refusal until both players are ready.

- [ ] **Step 2: Verify both suites fail before implementation**

Run: `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts --reporter=verbose`

- [ ] **Step 3: Implement pure directory and lobby classes**

Use injected `now` values in tests rather than timers. Reconstruct compatibility from catalog IDs; never trust numeric client stats.

- [ ] **Step 4: Verify directory, lobby, saved-build and loadout policy tests**

Run: `npx vitest run tests/roomDirectory.test.ts tests/lobbyState.test.ts tests/savedBuilds.test.ts tests/loadoutPolicy.test.ts --reporter=verbose`

- [ ] **Step 5: Commit**

```bash
git add src/net/roomDirectory.ts src/net/lobbyState.ts tests/roomDirectory.test.ts tests/lobbyState.test.ts
git commit -m "Add LAN room and lobby state machines"
```

### Task 4: Add the secure Electron UDP and WebSocket bridge

**Files:**
- Create: `desktop/preload.cjs`
- Create: `desktop/lanBridge.cjs`
- Create: `src/net/lanBridge.ts`
- Modify: `desktop/main.cjs`
- Modify: `src/vite-env.d.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/lanBridge.test.ts`

**Interfaces:**
- Consumes: encoded LAN envelopes from Task 2.
- Produces the preload API:

```ts
export interface BattleshipLanApi {
  capabilities(): Promise<{ desktop: true; canHost: true; canDiscover: true }>;
  createRoom(request: { announcementJson: string }): Promise<{ port: number }>;
  updateAnnouncement(announcementJson: string): Promise<void>;
  closeRoom(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send(messageJson: string): Promise<void>;
  subscribe(listener: (event: LanBridgeEvent) => void): () => void;
}
```

- [ ] **Step 1: Write failing bridge tests against loopback resources**

Test selecting the first free port, moving to the next port when occupied, rejecting payloads over 64 KiB, emitting a connect/message/disconnect sequence, closing every socket idempotently, and reporting unsupported capability when `window.battleshipLan` is absent.

- [ ] **Step 2: Run the bridge tests and verify missing bridge failure**

Run: `npx vitest run tests/lanBridge.test.ts --reporter=verbose`

- [ ] **Step 3: Implement the bridge**

Install `ws` as a runtime dependency. Keep all Node APIs in Electron main. The preload exposes only the listed methods through `contextBridge`; it never exposes `ipcRenderer`, sockets, filesystem, shell, process or arbitrary channel names.

- [ ] **Step 4: Verify bridge tests, build and Electron package contents**

Run: `npx vitest run tests/lanBridge.test.ts --reporter=verbose && npm run build`

Expected: tests PASS and the production renderer compiles without Node polyfills.

- [ ] **Step 5: Commit**

```bash
git add desktop src/net/lanBridge.ts src/vite-env.d.ts package.json package-lock.json tests/lanBridge.test.ts
git commit -m "Add secure Electron LAN transport bridge"
```

### Task 5: Add multiplayer room search and lobby menus

**Files:**
- Create: `src/ui/multiplayerMenu.ts`
- Modify: `src/ui/gameMenus.ts`
- Modify: `src/i18n/gameLocale.ts`
- Modify: `src/style.css`
- Modify: `src/pixel.css`
- Modify: `src/main.ts`
- Test: `tests/multiplayerMenu.test.ts`
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Consumes: `BattleshipLanApi`, `RoomDirectory`, `LobbySnapshot`, local profile builds.
- Produces callbacks `onCreateRoom`, `onSearchRooms`, `onManualJoin`, `onLeaveRoom`, `onReady`, and `onStartRoom` without expanding single-player `GameLaunchRequest`.

- [ ] **Step 1: Write failing menu-state and localization tests**

Test that multiplayer is a distinct mode card; Search Rooms refreshes and expires results; room cards expose name/host/players/ping/version/join; manual addresses require literal IPv4 and a port from `47778..47788`; browser capability disables create/search but not navigation; lobby requires a ready build; and every new source string is translated in all seven locales.

- [ ] **Step 2: Run focused UI-state and i18n tests and verify red**

Run: `npx vitest run tests/multiplayerMenu.test.ts tests/i18n.test.ts --reporter=verbose`

- [ ] **Step 3: Implement the multiplayer UI as a separate component**

The multiplayer screen has `创建房间`, `搜索局域网房间`, `手动输入 IP`, `刷新`, a scroll-contained room list, explicit empty/error/loading states, and a two-slot lobby. Preserve current armory, dock and single-player setup behavior.

- [ ] **Step 4: Run focused tests and production build**

Run: `npx vitest run tests/multiplayerMenu.test.ts tests/i18n.test.ts tests/battleSetup.test.ts tests/savedBuilds.test.ts --reporter=verbose && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/ui/multiplayerMenu.ts src/ui/gameMenus.ts src/i18n/gameLocale.ts src/style.css src/pixel.css src/main.ts tests/multiplayerMenu.test.ts tests/i18n.test.ts
git commit -m "Add LAN room search and lobby menus"
```

### Task 6: Build the host-authoritative co-op session and scoped snapshots

**Files:**
- Create: `src/net/hostBattleSession.ts`
- Create: `src/net/replicationView.ts`
- Modify: `src/sim/scenarios.ts`
- Modify: `src/sim/types.ts`
- Test: `tests/hostBattleSession.test.ts`
- Test: `tests/replicationView.test.ts`

**Interfaces:**
- Consumes: `LocalBattleSession`, accepted host/guest commands, validated lobby builds, `observe`, and the dawn-atoll scenario.
- Produces:

```ts
export class HostBattleSession implements AuthoritativeBattleSession {
  readonly role = "host" as const;
  readonly state: BattleState;
  readonly assignments: ReadonlyMap<string, string>;
  acceptInput(peerId: string, frame: InputFramePayload, receivedAt: number): InputAcceptance;
  step(hostCommand: ControlCommand, dt?: number): HostStepOutput;
  disconnectGuest(now: number): void;
}

export function replicationViewFor(
  state: Readonly<BattleState>,
  controlledShipId: string,
  serverTick: number,
  lastProcessedInputSequence: number,
): PlayerSnapshotPayload;
```

- [ ] **Step 1: Write failing authority and information-boundary tests**

Test one host plus one guest assigned to distinct allied ships; the host alone advances time; stale or over-rate guest input is rejected; guest input affects only its assigned ship; guest cannot supply damage/position; all other ships receive AI; a hidden enemy full `ShipState` is absent from the guest snapshot; and visible contacts/events are present.

- [ ] **Step 2: Verify the new suites fail before implementation**

Run: `npx vitest run tests/hostBattleSession.test.ts tests/replicationView.test.ts --reporter=verbose`

- [ ] **Step 3: Implement co-op assignments, authority and replication**

Extend scenario construction with explicit human build descriptors while preserving existing single-player defaults byte-for-byte for equivalent inputs. Publish snapshots every six simulation ticks for 10 Hz output.

- [ ] **Step 4: Run authority, scenario, detection and simulation tests**

Run: `npx vitest run tests/hostBattleSession.test.ts tests/replicationView.test.ts tests/scenarios.test.ts tests/playerPerception.test.ts tests/simulation.test.ts --reporter=verbose`

- [ ] **Step 5: Commit**

```bash
git add src/net/hostBattleSession.ts src/net/replicationView.ts src/sim/scenarios.ts src/sim/types.ts tests/hostBattleSession.test.ts tests/replicationView.test.ts
git commit -m "Add authoritative two-player co-op battle session"
```

### Task 7: Add the client session, interpolation and runtime integration

**Files:**
- Create: `src/net/clientBattleSession.ts`
- Create: `src/net/snapshotBuffer.ts`
- Create: `src/net/reconciliation.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/hud.ts`
- Modify: `src/ui/gameMenus.ts`
- Test: `tests/clientBattleSession.test.ts`
- Test: `tests/networkReconciliation.test.ts`

**Interfaces:**
- Consumes: `PlayerSnapshotPayload`, bridge events, local `PlayerInput.command`, and rendering state.
- Produces:

```ts
export class ClientBattleSession {
  readonly role = "client" as const;
  submitLocalCommand(command: ControlCommand, now: number): InputFrame;
  receiveSnapshot(snapshot: PlayerSnapshotPayload, receivedAt: number): SnapshotAcceptance;
  renderState(now: number): ReplicatedBattleView;
  disconnect(reason: LanDisconnectReason): void;
}

export function reconciliationMode(positionErrorMeters: number, headingErrorDegrees: number):
  "blend" | "converge" | "snap";
```

- [ ] **Step 1: Write failing client and reconciliation tests**

Test monotonically increasing input sequence numbers, rejection of stale snapshots, 100–150 ms interpolation, freeze after 500 ms without a snapshot, blend below 5 m, converge from 5–20 m, snap above 20 m or 10 degrees, no client-side damage mutation, and disconnect state propagation.

- [ ] **Step 2: Verify focused tests fail before implementation**

Run: `npx vitest run tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts --reporter=verbose`

- [ ] **Step 3: Implement client state and integrate all runtime roles**

`src/main.ts` selects local, host or client session. Host and client send through the bridge. Multiplayer Escape opens a local overlay without setting the host simulation paused; sea trials and single player retain current pause behavior. Disable developer entity mutation in multiplayer.

- [ ] **Step 4: Run client, input, camera, map and build verification**

Run: `npx vitest run tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts tests/playerInput.test.ts tests/combatCamera.test.ts tests/tacticalMap.test.ts --reporter=verbose && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/net/clientBattleSession.ts src/net/snapshotBuffer.ts src/net/reconciliation.ts src/main.ts src/ui/hud.ts src/ui/gameMenus.ts tests/clientBattleSession.test.ts tests/networkReconciliation.test.ts
git commit -m "Integrate LAN client synchronization and recovery"
```

### Task 8: Complete disconnect handling, loopback acceptance and 0.7.0 delivery

**Files:**
- Create: `tests/lanCoopIntegration.test.ts`
- Create: `docs/LAN_MULTIPLAYER.md`
- Modify: `docs/GAME_DESIGN.md`
- Modify: `docs/DEVELOPMENT_STATUS.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: complete lobby, host, client and transport interfaces from Tasks 1–7.
- Produces: a versioned 0.7.0 Windows directory build, an optional ZIP of that complete directory, and a repeatable two-instance Windows smoke procedure.

- [ ] **Step 1: Write the failing end-to-end loopback test**

The test creates a host room and guest client over loopback, completes the handshake and ready flow, starts a deterministic battle, sends guest throttle/rudder/fire input, verifies both sides converge on the same authoritative tick and result view, disconnects the guest, and verifies AI takes over within five simulated seconds.

- [ ] **Step 2: Run the integration test and verify red before the final wiring**

Run: `npx vitest run tests/lanCoopIntegration.test.ts --reporter=verbose`

- [ ] **Step 3: Complete lifecycle wiring, documentation and versioning**

Set package version to `0.7.0`. Document Windows private-network firewall prompts, AP isolation, manual IPv4 fallback, host/guest steps, the absence of host migration/reconnect, and a two-instance acceptance matrix. Do not start or document a browser preview service as a LAN host.

- [ ] **Step 4: Run full verification and produce the server package**

Run:

```bash
git diff --check
npm test
npm run build
npm run assets:ships:validate -- public/assets/ships
npm run desktop:dist
```

Expected: zero test failures, a successful production build, a valid ship catalog, and `release/win-unpacked/Super Boring Battleship Game.exe` plus `resources`, DLLs and unpacked game-asset directories with non-zero size.

- [ ] **Step 5: Commit and copy only the latest game directory to the user's PC**

```bash
git add tests/lanCoopIntegration.test.ts docs README.md package.json package-lock.json
git commit -m "Prepare LAN co-op 0.7.0 release"
```

On the local PC, stage the verified directory beside the current package, then atomically replace the older `battleship-latest-windows-x64` directory only inside `C:\Users\jiang\Documents\战舰\release` with:

`C:\Users\jiang\Documents\战舰\release\battleship-latest-windows-x64`
