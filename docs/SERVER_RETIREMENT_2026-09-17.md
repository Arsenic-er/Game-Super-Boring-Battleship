# Server retirement checkpoint — 2026-09-17

## Durable source of truth

The owner requested pushing the game and assets to their existing repositories,
then clearing only this project's files from the expiring server. Do not resume
from the old server paths or assume the repository's default branch is current.

- Game: `Arsenic-er/Game-Super-Boring-Battleship`, branch
  `codex/v072-historical-models`; release version **0.7.7**.
- Assets: private `Arsenic-er/Game-Super-Boring-Battleship-Assets`, branch `main`.
- Both repositories receive the `backup-2026-09-17` checkpoint tag after review.
- Last delivered game commit before this documentation checkpoint: `5cc4c05`.
- This operation does not merge or force-push `main`, publish a release, or modify
  the owner's local game directory or real AppData saves.

## What is preserved

Game source, lockfile, build/packaging scripts, all runtime resources, seven-language
documentation, condensed product memory and development history are in the game
repository. The private asset repository retains original art, licenses, generators,
current procedural ship/equipment/aircraft/material/audio source mirrors, runtime
exports and a small set of final visual acceptance references.

Final 0.7.7 package manifest and native/browser QA reports are committed under
`docs/acceptance/evidence/0.7.7/`. The complete local Windows directory has 133 files
and 479,393,957 bytes; all hashes were checked after delivery. The last full suite
passed 981 tests with 5 existing skips; final Windows regression passed 10 checks.
No gameplay or dependency changes are part of this backup checkpoint.

Generated EXEs/ZIPs, dependency folders, browser profiles, caches, old delta bases,
temporary patches and raw agent transcripts are not source assets and are excluded.
The user's verified local 0.7.7 Windows folder remains available; a new server can
rebuild from the committed lockfile. Do not expect byte-identical rebuilt binaries.

## Restore on the next server

```sh
git clone --branch codex/v072-historical-models https://github.com/Arsenic-er/Game-Super-Boring-Battleship.git ~/battleship
git clone https://github.com/Arsenic-er/Game-Super-Boring-Battleship-Assets.git ~/battleship-assets
cd ~/battleship
npm ci
npm test -- --maxWorkers=2
npm run build
npm run assets:ships:validate -- public/assets/ships
npm run desktop:dist
```

Use Node.js 24.x. The asset clone requires the owner's existing GitHub authorization.
Read `CONVERSATION_SUMMARY.md`, `DEVELOPMENT_STATUS.md`, `DEVELOPMENT_LOG.md`,
`acceptance/0.7.7-port.md` and the asset repository's `PAUSE_HANDOFF.md` first.
Keep development inside the new `~/battleship` directory and use sub-agents. Deliver
only one latest unpacked Windows folder locally; do not restart a persistent preview
service unless requested. Preserve the existing saves and two-player LAN behavior.

## Deletion gate and boundary

Before deletion, independently clone both pushed repositories, verify exact remote
commit/tag identities, check Git object integrity, and compare their checked-out
tracked files against the server source. Resolve every uncommitted or unique source
file first. Only `/home/ubuntu/battleship` and `/home/ubuntu/battleship-assets` may be
removed. Never remove other projects, shared tools/caches, SSH/Tailscale credentials,
the home directory, or anything on the owner's PC.
