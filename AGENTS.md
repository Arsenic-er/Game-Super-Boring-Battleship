# Battleship working agreement

## Server-only development (owner instruction, 2026-10-03)

- Perform all clones, dependency installs, editing, builds, tests, experiments,
  generated results and Git publishing on the designated server.
- Current canonical paths: `/home/ubuntu/battleship` and `/home/ubuntu/battleship-assets`
  on GPU-821560. The Windows machine is a remote-control endpoint only.
- Do not create local development files, repository copies, worktrees, build folders
  or caches. Do not download source, data, models, binaries, full logs or archives.
  A specific file download requires fresh explicit owner consent.
- This supersedes older automatic latest-Windows-package delivery instructions.
  Build packages on the server and report their location; do not copy them locally.
- If SSH fails, check existing SSH/Tailscale access. Do not fall back to local work.
- Local historical-file audits may be read-only; deletion requires an authorized,
  verified scope. Preserve uncertain or unique material and unrelated projects.
  Stop if the execution environment blocks deletion; do not bypass that block.
- Do not persist or print passwords/access tokens. Use existing credentials only
  for authorized publishing operations and keep them ephemeral.
- Use bounded subagents as requested by the owner; assign non-overlapping ownership.
- Runtime: `export PATH="$HOME/battleship/.tools/node/bin:$PATH"`.
- Preserve user work; commit as Arsenic-er <302726993@qq.com>, without coauthors.
