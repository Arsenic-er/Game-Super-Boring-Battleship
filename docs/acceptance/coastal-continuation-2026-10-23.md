# Coastal recovery continuation — 2026-10-23

## Decision

Keep experimental terrain maneuvers **off in ordinary gameplay**. This checkpoint
starts from 5ebeece on codex/v072-historical-models. Both four-minute fixtures now
avoid whole-hull terrain contact, but neither resumes useful navigation. Safe
arrest is not successful recovery.

Development, builds, tests and evidence remain on GPU-821560 under
/home/ubuntu/battleship. No local download or permanent preview is required.

## Corrected control contract

Natural repair changes engine health by 0.032 HP per 60 Hz tick in the damaged
fixture. Previously this invalidated a recovery plan and immediately returned
the old coast-facing propulsion order; contact followed at 8.05 s.

Physical parameter changes now cancel the queued suffix and old expected pose,
retain control, and freshly check neutral throttle/helm using the current
parameters. Three measured stopped ticks still accumulate during repair;
full planning waits for parameters to remain stable for 0.25 s. The controller
does not repair, teleport or change the ship's physics.

After the existing 100 s exploration deadline, exhausted attempts or a checked
maneuver with insufficient displacement, recovery holds neutral control and
checks the ordinary forward-and-stop proposal at two-second intervals. It does
not release the old unsafe order or restart the same exploration episode.
The deadline and progress thresholds have not been increased.

Missing budget, queue capacity or an incomplete candidate is not proof that
no route exists. Such cases retain control and allow later revalidation rather
than permanently exhausting the alternatives. A missing live prefix proof is
reported as **unverified best-effort neutral**, not certified safety or rejoin.
A subsequent verified neutral prefix may legitimately be holding even while
its reason records an earlier budget failure.

Existing hard invalidations for identity, map/timeline, unexpected motion,
major order changes and unsupported timestep still terminate the episode and
hand back control. Emergency/externally requested astern controls keep priority.
Those boundaries are not certified safe by this change.

## Final strict real-session results

Normal repair remains enabled. No command or collision-corrected pose is injected
into these acceptance fixtures. Progress comes from actual post-step positions;
intended whole-hull sweeps and final whole-hull contact are independently observed.

| Metric over 240 s | Neutral lock | Damaged 565 s pose |
|---|---:|---:|
| Intended / actual unsafe ticks | 0 / 0 | 0 / 0 |
| Unverified control ticks | 0 | 0 |
| Actual path | 160.77 m | 121.97 m |
| Net displacement | 52.39 m | 15.05 m |
| Path in final 60 s | 0 m | 0 m |
| Longest interval without 1 m progress | 135.67 s | 137.67 s |
| Verified rejoins | 0 | 0 |
| Recovery episode starts | 1 | 1 |

Both cases remain **failed**. The damaged case additionally misses the 50 m net
displacement requirement. Both miss sustained movement, the maximum 30 s
no-progress interval, a verified rejoin and ten seconds of subsequent ordinary
movement. The strict script exits 1; the original short script still exits 0.

Per-frame shared work remains at most 1,024 motion steps / 64 terrain queries.
The complete runs use 103,948 / 33,036 and 68,301 / 31,562 respectively. This
is work-count evidence, not Surface/mobile frame-rate or rendering acceptance.

The strict script now counts holding as recovery ownership, excludes unverified
output from ordinary-navigation progress, and adds a zero-unverified-control
gate plus first/longest unknown diagnostics. No existing safety or progress
gate was removed or relaxed.

## Physical route investigation, not automatic recovery

A separate offline experiment freezes 5ebeece. From the neutral-lock starting
pose (1695, 1282), heading -0.5 rad, 0.3 kn and actual rudder -0.82:

1. Neutral controls for 2.6167 s reach a fully stopped, centred-rudder pose.
2. Astern throttle -0.25 and rudder -0.82 for 60 s, then neutral for 4.2333 s.
3. Forward throttle 0.18 and rudder -0.82 for 55.55 s, then neutral for 4.35 s.

At 126.75 s the ship is stopped at approximately (1626.238, 1251.318), heading
-1.58217 rad. Every segment and complete stop tail is clear. In a real session,
ordinary AI continues computing while these prescribed controls execute;
releasing the override without rebuilding the AI then produces 502.821 m
path / 492.314 m net movement over 60 s, with zero intended/actual contact and
zero shared-kernel/runtime position error.

This manually selected route is **not** an automatic planner pass. Its offline
prediction uses 7,605 motion steps / 258 geometry queries; the astern segment
alone needs 3,854 steps, above the scheduler's existing 3,600-step per-task cap.
It is not approved for live per-frame use. A second 134.8 s route provides
similar evidence, not an additional gameplay acceptance.

Next: pass the final navigation-adjusted desired heading into recovery, plan
enough turning room and a complete exit heading with bounded segmented work,
and validate ordinary AI continuation afterward. Do not merely raise the
100 s deadline or task budget to make this laboratory route fit.

## Verification and evidence

- Nine new tests in tests/aiTerrainContinuation.test.ts pass: natural repair
  in a real session; five physical-parameter changes; old generation rejection;
  temporary empty budget and fresh confirmation; retained hold past the deadline.
- Existing 38 guard/recovery tests retain their cases. Physical-change and active
  budget assertions now require current-state neutral control instead of the
  previously unsafe ordinary-order handback. Emergency, stale motion, default-off
  and lifecycle coverage remains.
- Final regular suite: 2,284 passes across 178 passing files; 11 existing opt-in
  tests skipped. Two balance-report entrypoints remain excluded as before.
  TypeScript and the final build pass; the existing large-chunk warning remains.
  No production/test edits occurred during this final run.
- Strict report: .qa/coastal-recovery-acceptance/session-acceptance.json.
- Logs and exploratory scripts: .qa/coastal-continuation-20261023/.
- Offline route-search.json SHA-256:
  9d6afd769fc93f47fd78e2d54440021cd7ee3240aae7b5e3f2d861a70d3fdd19.
- Offline route-continuation.json SHA-256:
  1afc77d7b16d9a6b41d4390e92c0d4c9ac8078ddbcdfdc9fab97d94c332d5825.

This round does not repeat the opt-in prototype/browser suites, twelve full
natural fleet comparisons, native Windows/LAN transport, or hardware testing.
Earlier results remain historical, not new evidence. Default gameplay, centre-only
terrain collision, physical parameters, weapons/sensors, the twenty-minute match
limit, main 8ef5b84, assets 4e4d587, version/tag and preview state are unchanged.
