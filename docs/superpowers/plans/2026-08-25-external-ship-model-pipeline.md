# External Ship Model Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a licence-gated GLB ship pipeline with deterministic validation, safe procedural fallback, shared combat/dock integration, and a Fletcher-first benchmark path.

**Architecture:** A pure TypeScript manifest contract and validator guard all runtime assets. A shared `ShipVisualFactory` owns external selection and procedural fallback while simulation physics, weapons, and damage remain independent. External GLB support is lazy-loaded and no unverified model enters the game repository.

**Tech Stack:** TypeScript 7, Babylon.js 9, Vite 8, Vitest 4, Electron, Node.js 24.

**Spec:** `docs/superpowers/specs/2026-08-25-external-ship-model-pipeline-design.md`

## Global Constraints

- Runtime accepts `.glb` only; `.blend` and `.fbx` stay in the asset repository.
- A traceable redistribution licence and SHA-256 are mandatory.
- Procedural models remain the permanent fallback.
- Render meshes never become simulation colliders.
- LOD0/1/2 budgets are 45k/15k/4k maximum triangles and 6/4/2 maximum materials.
- Work stays on `main` on `ubuntu@150.65.181.188`; push only on explicit request.
- Delivery policy updated for 0.7.0: build the complete Windows game directory on the
  server, verify it, then replace the user's latest local directory; a ZIP is optional.
  This supersedes every earlier package-retention and web-handoff instruction.
- Battle hard limit is 20 minutes; balancing target is 15–20 minutes.

---

### Task 1: Update operational constraints and battle duration

**Files:**
- Modify: `docs/DEVELOPMENT_STATUS.md`
- Modify: `docs/SHIP_MODEL_PIPELINE.md`
- Modify: `src/sim/config.ts`
- Test: `tests/simulation.test.ts`

**Interfaces:**
- Produces: `BATTLE_DURATION_SECONDS === 20 * 60` for the existing simulation end condition.

- [ ] Add a simulation test that advances a neutral battle across the old ten-minute boundary and proves it remains active until the twenty-minute boundary.
- [ ] Run the focused test and confirm it fails because the current limit is ten minutes.
- [ ] Change the constant to `20 * 60` and update operational documentation to `.188`, complete-directory delivery, and the 15–20 minute target.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit as `Arsenic-er <302726993@qq.com>`.

### Task 2: Define and validate the ship-asset manifest

**Files:**
- Create: `src/render/shipAssetManifest.ts`
- Create: `tests/shipAssetManifest.test.ts`
- Create: `public/assets/ships/README.md`

**Interfaces:**
- Produces: `ShipAssetManifest`, `ShipAssetValidationIssue`, `ShipAssetValidationResult`, `validateShipAssetManifest(input: unknown): ShipAssetValidationResult`.

- [ ] Write failing table-driven tests using literal fixtures for a valid Fletcher manifest, malformed schema, missing provenance, non-GLB LOD, over-budget LOD, missing required hardpoint, and a collider that aliases a render node.
- [ ] Run `npm test -- --run tests/shipAssetManifest.test.ts` and confirm failures are caused by the absent contract.
- [ ] Implement strict parsing and deterministic issue codes without touching Babylon.js.
- [ ] Run the focused test and refactor only after green.
- [ ] Document the game-repository runtime directory format.
- [ ] Commit.

### Task 3: Add an offline asset-validation command

**Files:**
- Create: `scripts/validate-ship-assets.mjs`
- Create: `tests/shipAssetValidatorCli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `manifest.json` files under a supplied root.
- Produces: `npm run assets:ships:validate -- <root>` with exit code `0` on valid packages and `1` on blocking errors.

- [ ] Write a failing CLI integration test using temporary valid and invalid package directories and assert exit code plus JSON report shape.
- [ ] Run the focused test and confirm the command is missing.
- [ ] Implement the smallest Node CLI that reads manifests, verifies listed files and SHA-256 values, and prints deterministic JSON.
- [ ] Add the package script and run focused tests.
- [ ] Run the command against the initially empty runtime ship directory; empty is valid with zero packages.
- [ ] Commit.

### Task 4: Add the external-model registry and selection policy

**Files:**
- Create: `src/render/shipModelRegistry.ts`
- Create: `tests/shipModelRegistry.test.ts`

**Interfaces:**
- Produces: `registeredShipModel(id: ShipClassId, quality: QualityLevel): RegisteredShipModel | undefined` and `selectShipLod(distanceMeters: number, quality: QualityLevel): ShipLod`.

- [ ] Write failing tests that prove unregistered ships use no external asset, invalid manifests cannot register, low quality never selects LOD0, and long distance selects LOD2.
- [ ] Run the focused test and confirm the registry does not exist.
- [ ] Implement an immutable registry with Fletcher/Cleveland/Yamato entries disabled until validated files exist.
- [ ] Run focused tests and refactor after green.
- [ ] Commit.

### Task 5: Implement a safe asynchronous visual factory

**Files:**
- Create: `src/render/shipVisualFactory.ts`
- Create: `tests/shipVisualFactory.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `createShipHullVisual(request: ShipHullVisualRequest): Promise<ShipHullVisualResult>` where result source is `external` or `procedural` and owns a `dispose()` method.
- Consumes: injected external loader and procedural builder so tests use real factory behaviour without network mocks.

- [ ] Write failing NullEngine tests for no-registration fallback, successful external result, rejected load fallback, partial-resource disposal, and hardpoint extraction.
- [ ] Run the focused test and confirm failure because the factory is absent.
- [ ] Add `@babylonjs/loaders` matching the installed Babylon core version.
- [ ] Implement the factory with lazy GLB loader import, one-time error reporting, and cleanup before fallback.
- [ ] Run focused tests and verify no uncaught rejection.
- [ ] Commit.

### Task 6: Share hull creation between combat and dockyard

**Files:**
- Modify: `src/render/gameView.ts`
- Modify: `src/render/dockPreview.ts`
- Modify: `src/render/shipGeometry.ts`
- Create: `tests/sharedShipVisualFactory.test.ts`

**Interfaces:**
- Consumes: `createShipHullVisual` from Task 5.
- Produces: the same hull source, scale, hardpoint naming, and disposal ownership in combat and dockyard.

- [ ] Write a failing integration test that records both consumers requesting the same `ShipClassId` through the shared factory.
- [ ] Run the test and confirm current direct procedural calls cause failure.
- [ ] Replace only hull/superstructure construction; keep current weapon, wake, smoke, fire, and camera code intact.
- [ ] Preserve synchronous procedural startup while an optional external hull is prepared, swapping only after successful validation and load.
- [ ] Run focused and existing geometry/lifecycle tests.
- [ ] Commit.

### Task 7: Adapt hardpoints, LODs, and independent collision volumes

**Files:**
- Create: `src/render/shipHardpoints.ts`
- Create: `tests/shipHardpoints.test.ts`
- Modify: `src/render/gameView.ts`
- Modify: `src/render/dockPreview.ts`

**Interfaces:**
- Produces: `resolveShipHardpoints(root, manifest)` and `buildShipDebugCollisionVolumes(scene, root, manifest)`.

- [ ] Write failing tests for required transform resolution, optional mount absence, muzzle hierarchy, collision/render separation, and class-scale alignment.
- [ ] Run the focused test and confirm the adapter is absent.
- [ ] Implement transform resolution and simplified debug volumes without changing simulation hit rules.
- [ ] Attach existing project-owned weapons and effects to resolved nodes, falling back to current numeric hardpoints per missing optional node policy.
- [ ] Run main-battery, equipment-visual, collision, and lifecycle tests.
- [ ] Commit.

### Task 8: Establish the Fletcher provenance-gated benchmark package

**Files:**
- Create in asset repo: `ships/fletcher/manifest.json`
- Create in asset repo: `ships/fletcher/provenance/SOURCE.md`
- Modify in asset repo: `docs/ASSET_MANIFEST.md`
- Mirror only after validation: `public/assets/ships/fletcher/*`

**Interfaces:**
- Consumes: a model whose creator and redistribution licence can be independently verified.
- Produces: a validated Fletcher package or a documented quarantine decision.

- [ ] Research candidates using primary creator/licence pages; do not use ripped-game assets or unverifiable mirrors.
- [ ] Record source, licence, checksum, download date, and modification history before editing the model.
- [ ] If no candidate passes, commit only the quarantine report and retain procedural Fletcher.
- [ ] If a candidate passes, create LODs, atlas, hardpoints, and colliders in the private asset repo, then run `assets:ships:validate` before mirroring runtime exports.
- [ ] Verify Fletcher in dock, battle, scope, developer colliders, low quality, and disposal cycles.
- [ ] Commit game and asset repositories separately.

### Task 9: Balance and release gates

**Files:**
- Modify: `src/sim/balanceLab.ts`
- Modify: `tests/balanceMatrixReport.test.ts`
- Modify: `docs/DEVELOPMENT_STATUS.md`

**Interfaces:**
- Produces: reports that measure 15–20 minute normal matches against the 20-minute hard cap.

- [ ] Add a failing report test for the new duration target and timeout-rate fields.
- [ ] Update balance defaults without making offline 100-seed reports part of every unit-test run.
- [ ] Run at least 100 paired seeds for important matchups after model work no longer changes combat visibility.
- [ ] Capture visual references at 1440x900 and 1280x720 for menu, dock, setup, combat, scope, tactical map, and developer view.
- [ ] Run `git diff --check`, `npm test -- --run`, `npm run build`, and `npm run assets:validate`.
- [ ] Run `npm run desktop:dist` on the server, verify the complete directory, and replace
  the user's latest local directory; optionally run `npm run desktop:zip` for publication.
- [ ] Commit; push only after explicit user instruction.
