# LAN Co-op Multiplayer Design

## Goal

Version 0.7.0 adds a two-human-player LAN co-op mode. One player creates a room, another Windows desktop client discovers or joins it, both select locally saved ship builds, and the host runs the authoritative battle against AI. The feature must preserve the existing single-player and sea-trials modes.

## Product scope

The 0.7.0 slice includes:

- one host and one guest on the player team;
- AI fills all other allied and enemy fleet slots;
- create room, search room, manual `IPv4:port` join, lobby, build selection, ready state, start, battle, results, return to lobby;
- UDP broadcast discovery on port `47777` and WebSocket room traffic on the first free port in `47778..47788`;
- protocol, game-version and content-fingerprint rejection before lobby admission;
- host-authoritative simulation, damage, detection, scoring, RNG and AI;
- client input upload, player-scoped snapshots, remote interpolation and local display prediction;
- guest disconnect converts the guest ship to AI within five seconds;
- host disconnect returns the guest to the multiplayer menu with an explicit reason;
- multiplayer Escape menus never pause the host simulation;
- Simplified Chinese, Traditional Chinese, English, Japanese, Spanish, German and Russian UI copy;
- a Windows portable build. Browser builds expose the multiplayer UI but explain that LAN discovery and hosting require the desktop build.

The 0.7.0 slice excludes PvP, more than two humans, Internet matchmaking, NAT traversal, host migration, mid-match joining, mid-match reconnection, spectators, chat, voice and dedicated servers.

## Architecture

The existing simulation remains the source of truth. `stepSimulation(state, commands, FIXED_STEP)` is called only by a local or host session. A client session never resolves damage or advances the authoritative simulation.

The Electron main process owns UDP and WebSocket resources. A sandboxed preload exposes a narrow `window.battleshipLan` API; `nodeIntegration` stays disabled and `contextIsolation` stays enabled. Renderer code validates every message again before it reaches lobby or battle state.

The host renderer owns `HostBattleSession`: it gathers local input, validated guest input and AI commands, advances at the existing 60 Hz, and publishes 10 Hz player-scoped snapshots. Clients send input at 20 Hz and immediately when a discrete action changes. WebSocket provides reliable ordered delivery; each application message still carries a sequence number so stale input and snapshots can be rejected.

## Discovery and room lifecycle

Hosts broadcast a room announcement every second and respond directly to discovery probes. Search results are keyed by `roomId`, refreshed by timestamp, and expire after three seconds.

Room states are `advertising`, `lobby`, `starting`, `in-match`, `post-match`, and `closing`. A lobby has exactly two human slots: host and guest. Each slot contains a peer ID, commander name, validated ship build descriptor and ready flag. The host cannot start until both slots have a build and both players are ready.

## Protocol and trust boundary

Every envelope contains `protocolVersion`, `gameVersion`, `contentHash`, `roomId`, `sequence`, `sentAt`, `type`, and a type-specific payload. The renderer accepts at most 64 KiB per WebSocket message and 1 KiB per UDP discovery packet. Guest input is rate-limited to 30 messages per second and clamps throttle, rudder, aim point and enum fields before use.

Clients submit catalog identifiers and slot arrays, never numeric combat stats. The host reconstructs and validates the loadout. Clients never submit position, hull, module health, damage, hit, score, detection, projectile or RNG outcomes.

Snapshots contain the assigned ship's authoritative state, friendly ships, visible enemy contacts, visible projectile/torpedo/aircraft presentation, objective state, match clock, important events, `serverTick`, and `lastProcessedInputSequence`. They do not expose hidden enemy `ShipState` objects.

## Rendering and reconciliation

Remote ships, aircraft and torpedoes render from a 100–150 ms snapshot buffer. Short gaps may be extrapolated; after 500 ms without a new snapshot the remote entity freezes rather than drifting indefinitely.

The client predicts only the displayed movement of its own ship and immediate gun feedback. It never predicts hits or damage. Position errors below 5 m blend back, errors from 5–20 m converge quickly, and errors above 20 m snap. Heading errors above 10 degrees snap.

## Failure behavior

- Lobby guest disconnect: remove the guest slot.
- Match guest disconnect: after three seconds mark disconnected and within five seconds hand the ship to `RuleBasedAi`.
- Host disconnect: stop the client session, close multiplayer overlays, and show a localized disconnect reason.
- Port conflict: try the next WebSocket port through `47788`, then return `port-unavailable`.
- Discovery blocked: keep manual IPv4 join available.
- Version or content mismatch: reject before lobby entry with the exact mismatch category.
- Malformed or over-rate input: discard it; repeated violations disconnect the peer without crashing the host.

## Delivery and testing

Pure protocol, lobby, session, snapshot and reconciliation code is exercised with Vitest. Transport tests use loopback sockets with dynamically allocated test ports; UDP discovery behavior is also covered by pure packet/directory tests so CI does not depend on broadcast routing. A manual two-instance desktop smoke checklist covers Windows firewall and real LAN behavior.

At each completed development batch, the server builds the portable Windows executable and copies it to `C:\Users\jiang\Documents\战舰\release\battleship-latest-windows-x64.exe`, deleting older local game packages. The server preview service remains stopped and no browser test link is delivered.
