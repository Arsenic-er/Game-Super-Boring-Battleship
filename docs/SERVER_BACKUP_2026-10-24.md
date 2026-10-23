# Server backup and development pause

Checkpoint date: 2026-10-24. The owner requested a complete project backup,
a merge into main, then a pause because GPU-821560 is expiring. No further
gameplay development or server-file deletion is part of this operation.

## Durable restore points

| Repository | Restore entry |
|---|---|
| Arsenic-er/Game-Super-Boring-Battleship | main and backup-2026-10-24 |
| Arsenic-er/Game-Super-Boring-Battleship-Assets, private | main and backup-2026-10-24; commit 7c288bed2b8da4d378768c2130526bebce6b0b99 |

The game development branch's seven commits after 8ef5b84 were fast-forwarded
into main. Its latest code checkpoint is ed4e8edf9b16fcd2cda8e4d72d64e4f445eeb0f2.
This backup commit adds handoff records only; no production code or dependencies
change. Existing branches and history remain available; no force-push is used.
The final game backup commit is identified by the annotated checkpoint tag.

The game repository preserves all current code, runtime assets, lockfile,
packaging scripts, tests, product decisions and development records. Read
CONVERSATION_SUMMARY.md, DEVELOPMENT_STATUS.md and DEVELOPMENT_LOG.md after restoring.

The asset repository preserves original art, licenses and managed source mirrors.
Its new docs/ASSET_MIRROR_2026-10-24.json verifies 257 mappings; six changed text
sources/tests were synchronized, while runtime binary assets were already current.
No current or historical tracked LFS pointers were found. Install Git LFS before
adding new files covered by its model/artwork extension rules.

## Server-only evidence preserved privately

The asset repository's backups/2026-10-24 directory contains:

- 1,216 non-cache QA files, 923,438,465 uncompressed bytes, including historical
  failure traces, scripts, screenshots, reports and QA dependency lockfiles.
- Three ordered archive parts, 134,849,872 bytes total, with individual SHA-256s.
- Twelve otherwise-unreachable candidate Git blobs: 405,156 decoded bytes,
  stored as a 116,537-byte Git pack. Six are referenced by an archived alternative
  index; normal branch pushes alone would not preserve them.
- A per-file manifest, candidate index mappings, verification script and restore
  instructions. All archived file hashes and all twelve imported objects were
  checked before publishing.

Excluded: dependency/browser/runtime caches, sysroot/deb copies, generated
preview builds and an obsolete Windows archive. They are reproducible, not unique
development records. Credentials, SSH keys, user home directories, persistent
browser profiles and real player saves are not part of this backup. Source and
archive files were not downloaded to Windows. Original server files remain.

## Restore only on the next approved server

Use full clones so historical QA references still resolve:

```sh
git clone https://github.com/Arsenic-er/Game-Super-Boring-Battleship.git ~/battleship
git clone https://github.com/Arsenic-er/Game-Super-Boring-Battleship-Assets.git ~/battleship-assets
git -C ~/battleship switch --detach backup-2026-10-24
git -C ~/battleship-assets switch --detach backup-2026-10-24
git -C ~/battleship fsck --full
git -C ~/battleship-assets fsck --full
python3 ~/battleship-assets/backups/2026-10-24/verify-backup.py
```

The private clone needs the owner's existing authorization, supplied securely.
Do not put tokens in URLs, scripts or committed files. Check the tags first; when
continuing work, switch to main or a new codex/ branch from the verified checkpoint.
Do not reconnect automatically to an expired host or create a local replacement
development environment.

Install Node.js 24.x; the verified previous runtime is 24.21.0. Keep the runtime
and caches project-local when possible. The production setup is:

```sh
cd ~/battleship
npm ci
npx vitest run tests --exclude "**/balanceReport.test.ts" --exclude "**/balanceMatrixReport.test.ts" --maxWorkers=1
npm run build
npm run assets:ships:validate -- public/assets/ships
```

For optional historical browser QA, follow the private archive README to restore
.qa first. Install its locked dependencies with
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --prefix .qa, then install the matching
Chromium under .qa/browsers with its local Playwright CLI. Linux runtime libraries
need separate installation or isolation on the new server. Main npm ci does not
install these QA tools. Do not copy old browser caches/profiles.

Only build a new Windows package on the server when requested. There is no
automatic local delivery and no permanent preview service to restore.

## Last verified gameplay state

Version remains 0.7.9 and matches last twenty minutes (1,200 seconds). The code
checkpoint passed 2,284 regular tests with eleven existing opt-in skips, plus
TypeScript and build checks. This backup-only change does not repeat those runs.

Experimental coastal maneuver control remains disabled. Two four-minute fixtures
avoid whole-hull contact but still fail sustained progress and navigation rejoin.
The known safe manually specified escape route is investigation evidence, not
automatic AI acceptance. Resume with bounded heading-aware exit planning; do not
enable it, increase physics capabilities or relax acceptance merely to finish.

## 中文交接

本轮按用户要求完成备份、合并 main 并暂停开发。两个仓库使用同名标签
backup-2026-10-24；素材库仍为私有，代码和素材都没有下载到本机。
旧服务器文件保留，此次没有授权或执行删除。

新服务器先按上述标签恢复两个完整仓库，阅读对话重点、当前状态和开发日志。
私有素材库额外保存 1,216 份非缓存 QA 资料、逐文件哈希和 12 个独有候选代码
对象，并提供无落地解压的验证脚本。依赖、缓存和旧构建包由锁文件重建。

目前版本 0.7.9，单局二十分钟。近岸脱困实验仍默认关闭：安全停车已改善，
但持续航行与重新接管还没通过，不要把人工指定成功路线当作自动 AI 完成。
等待用户指定新的服务器后再继续；不能退回本机开发或自动下载文件。
