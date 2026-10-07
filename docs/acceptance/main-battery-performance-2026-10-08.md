# Main battery simulation performance

The 2026-10-08 continuation reduces repeated main-battery derivation without
changing gameplay tuning. The former slow-batch timeout passed twice with its
original 30-second limit. This is server CPU validation, not Surface or phone FPS.

## Changes

- AI derives its battery once per command and passes range/velocity into its
  private fire-control helpers.
- Ship movement reuses one derivation for ammo switching and traverse. The firing
  path passes the same definition through muzzle/elevation helpers and passes the
  dispersion multiplier directly. Public helper signatures, dynamic heading/aim
  reads, random draws and shell ordering are unchanged.
- Installed-slot geometry reuses matching aggregate data and derives each other
  upgrade once per invocation. No cross-call cache is introduced; in-place
  equipment changes and developer overrides take effect immediately.
- Twenty-two new tests compare the old derivation algorithm across all fifteen
  hulls, mixed/empty/sparse slots, mismatched counts, fallback equipment, developer
  overrides and independent derived objects.

## Verification

Baseline game source: `cda6837460f89c606c779c2e0042d3aaddfde8cd`.
Runtime: Node 24.21.0 on GPU-821560. CPU sampling attributed approximately 26.3%
inclusive time to one effective-main-battery call tree. Inclusive samples overlap;
this is not an additive whole-program cost breakdown.

The same profiler harness ran seeds 900–903 to the configured 1,200-second cap.
Whole battle telemetry, terminal-state fingerprints and batch aggregate compared
equal with strict deep equality. One paired, profiled run took 32,940 ms before
and 27,623 ms after: 16.1% lower wall time. This pair is evidence for this workload,
not a general or hardware-frame-rate guarantee.

- 1,258 regular tests passed; five existing opt-in skips.
- All eight slow balance tests passed. The batch test took 25,522 ms.
- A separate batch-only repeat passed in 26,584 ms; its seven name-filtered tests
  are not additional product skips. No timeout or assertion was relaxed.
- TypeScript and production Vite build passed. The existing approximately 2.01 MB
  main chunk warning remains.
- Eleven actual-main browser visibility/lifecycle checks passed with zero page
  errors; the temporary loopback server closed.
- The isolated material preview separately passed type checking, its build and
  nineteen motion/wake tests before publication. It remains outside production.

Evidence stays in ignored server directories `.qa/publish-20261008/`,
`.qa/balance-performance-baseline-cda6837/`,
`.qa/balance-performance-optimized-1/` and `.qa/multi-contact-20261008/`.

## Reproduction

```sh
export PATH="$PWD/.tools/node/bin:$PATH"
# Capture before an implementation change, then compare afterward.
node scripts/qa/balance-performance.mjs baseline
node scripts/qa/balance-performance.mjs candidate baseline
npx vitest run tests --exclude tests/balanceLab.test.ts --maxWorkers=2
npx vitest run tests/balanceLab.test.ts --maxWorkers=1
npm run build
node scripts/qa/multi-contact-regression.mjs
```

Run timing checks serially, without concurrent build/browser workloads. The
profiler creates no listener and closes its Vite module loader. It writes only
ignored server-side outputs and refuses identical baseline/output labels.

## Published checkpoint and remaining work

The owner-authorized checkpoint before this optimization was pushed normally:
game `cda6837` on `codex/v072-historical-models`; private assets `4e4d587` on
`main`. The asset receipt preserves 257 verified mappings including 20 historical
evidence files, with no new binary art. Both author and committer are Arsenic-er.

This continuation changes no art, package version, save format, weapon balance or
release tag. Device FPS, native Windows packaging acceptance and two-machine LAN
validation remain separate. Next gameplay work is contact-loss retargeting,
objective/late-battle behavior and broader paired-seed fleet balance.
