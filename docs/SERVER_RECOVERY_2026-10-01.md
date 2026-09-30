# Server recovery — 2026-10-01

## Active workspace

- Host: **GPU-821560**, Ubuntu 22.04, x86_64.
- SSH: `ssh gpu-821560-ts` (`ubuntu@100.64.214.54`); public IP `150.65.181.212`.
- Game: `/home/ubuntu/battleship`, branch `codex/v072-historical-models`.
- Assets: `/home/ubuntu/battleship-assets`, branch `main`.
- No persistent game preview service is enabled. Other projects/services are untouched.

The connection details were recovered from the owner's designated latest server
conversation and verified against the connected hostname. The old GPU-273312
directories were intentionally deleted after the September backup and are not used.

## Verified recovery baseline

Both fresh clones match `backup-2026-09-17` and pass `git fsck --full`:

| Repository | Commit | Tracked files | Bytes |
| --- | --- | ---: | ---: |
| Game | `2a6c473f32dd97a39980ce3d36b2a6244793dddf` | 360 | 21,349,720 |
| Private assets | `33d9c6f7a7ef259e20bd7ad87e2e6b43d2f30d55` | 281 | 52,927,658 |

Every tracked file was rehashed against the retirement receipt. All 225 entries in
the source-asset mirror also pass their stored byte-length and SHA-256 checks.
The existing local Windows 0.7.7 directory and real player saves were not used as
source code or altered during recovery. No credential value is recorded here.

## Isolated development tools

Node.js 24.21.0 was downloaded from nodejs.org and verified using its SHA256 manifest.
It resides in `.tools/`; `npm ci` restored the committed game dependency lockfile.
Set the runtime/cache environment before building:

```sh
cd ~/battleship
export PATH="$PWD/.tools/node/bin:$PATH"
export ELECTRON_CACHE="$PWD/.tools/electron-cache"
export ELECTRON_BUILDER_CACHE="$PWD/.tools/electron-builder-cache"
npm test -- --maxWorkers=1
npm run build
npm run desktop:dist
```

The unchanged baseline passed 981 tests with 5 existing skips in the serial run
(94.77 seconds). An earlier two-worker run reached the existing balance-batch
30-second timeout; no assertion, duration limit or simulation behavior was changed.
Playwright 1.55.1 and extracted Chromium runtime libraries are isolated in `.qa/`.
The newer browser CDN timed out; the compatible pinned browser downloaded correctly.
No global Node installation, apt installation, GPU change or service change was made.

Development continues with the existing port interaction refinement, not new multiplayer,
submarine or reinforcement-learning scope. See `acceptance/0.7.8-dock-hover.md` for
the new build's checks and delivery status; this file records the recovery baseline.
