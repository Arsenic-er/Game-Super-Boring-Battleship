# 0.7.1A implementation plan

Date: 2026-09-08
Worktree: `/home/ubuntu/battleship/.worktrees/v071-first-voyage`
Base: `d03b45d` (approved design)

The user approved A → B → C and requested continuing implementation. This batch completes A, the first-voyage loop, on the server and delivers one latest Windows game directory locally.

## Work packages and ownership

1. Progression agent: Profile v7 validation/migration, bounded 128-result ledger, explicit persistence result, immutable pending settlement, profile write lock, tutorial state helpers, telemetry and local-only destruction attribution. Files: profile/localProfile, progression modules, minimal sim/session event plumbing and their tests.
2. Visual agent: Canonical ordered slot plan, complete actual dock loadout, independent candidate overlay, async replacement/disposal, combat session registry. Files: render modules and tests.
3. Locale/LAN agent: All equipment/ship-armament catalog fields in seven languages, keyed first-voyage messages, structured persistent LAN troubleshooting. Files: i18n, LAN runtime, multiplayer menu and tests.
4. Root: Main application orchestration, first-voyage briefing/cards/results/pending notice, main-menu settings access, dock controller extraction and inspect/edit/selected-build states, integration tests, documentation/version, packaging and delivery.

## Integration contracts

- LocalProfile remains authoritative only after successful persistence. Pending rewards hold one immutable transformed profile. All profile writers must pass the lock; settings use their separate key.
- New solo starts/restarts create a UUID. Pause/resume retain it. LAN and sea trials do not receive economic rewards. Developer mutation invalidates rewards for the current solo battle.
- Tutorial action completion observes 30 metres of actual travel, successful aiming, a real player main-gun shot, then opening the tactical map. It does not alter simulation rules.
- Every local frame feeds telemetry exactly once before transient events are cleared; the terminal frame freezes statistics and attempts settlement once.
- Existing ShipState.installedEquipment already retains the complete ordered arrays. Visual adapters may use those arrays directly; do not infer them from compressed mainGunId/efficiency fields. Session scopes prevent reused IDs carrying old visuals.
- Dock inspect is read-only; load copies to editable configuration; select changes the chosen battle blueprint. All starts validate and derive equipment from one chosen saved build.
- No LAN protocol, schema, snapshot cadence or revision changes. Version/content fingerprint naturally reflects package 0.7.1.

## Verification and release

- Each owner runs focused behavioural tests. Root runs full tests, TypeScript/Vite build, asset validator and desktop syntax checks after integration.
- Independent review checks persistence failures, tutorial lifecycle, full installed mounts, locale switching, LAN notice lifetime and destructive cleanup scope.
- Render at 1440×900 and 1280×720, check first-voyage/dialog/result/dock/menu layout and missing assets. Use local desktop or a temporary loopback-only automated browser harness; do not restore a persistent server preview service.
- Build fresh Windows directory and ZIP on the server. Validate archive, exact relative-file inventory and SHA-256. Copy to local sibling staging directory, validate before replacing latest; preserve the old directory until replacement has passed checks.
- Windows hidden startup smoke; leave only the final latest folder locally. Record real two-PC LAN acceptance as pending until actual hardware test evidence exists.
- Keep the feature branch; no merge or push is required by this continuation. Assets are unchanged unless the renderer produces new source assets; include source documentation in this branch.

## Completion criteria

All A features are reachable through the real menus and application lifecycle, checks pass, and the latest complete desktop directory is available locally. Report any hardware-only acceptance still pending accurately.
