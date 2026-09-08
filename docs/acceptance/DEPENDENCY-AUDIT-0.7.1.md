# 0.7.1 dependency audit — bounded triage

Date: 2026-09-08

Scope: read-only review of the current lockfile, installed dependency tree, npm advisory response, and desktop/LAN import paths. No dependency updates, `npm audit fix`, builds, exploit execution, commits, or pushes were performed during this review.

## Outcome

`npm audit --json` reported **8 affected package names: 7 high and 1 moderate**. This is not a count of eight independent advisories: several packages have multiple advisories and installed copies.

All eight packages are in the **development, installation, or packaging dependency closure**. `npm audit --omit=dev --json` returned an empty vulnerability map and zero known findings. The production dependency tree contains Babylon.js, its glTF interface dependency, Font Awesome, and `ws@8.21.3`; none was reported by that npm query.

No route from a LAN packet to any of the eight affected packages was identified in the inspected application source. This is a bounded dependency-path finding, **not proof that LAN or the desktop application is vulnerability-free**.

## High-severity packages and actual chains

Installed versions below came from `npm ls --all`. Fixed-version targets are the lowest versions outside all corresponding ranges in this audit response, and their existence was checked with `npm view <package>@<version> version`. They are proposed targets, not installed fixes.

| Package | Installed → proposed fixed target | Actual dependency chain | Relevant exposure in this project |
| --- | --- | --- | --- |
| `brace-expansion` | `1.1.16 → 1.1.18`; `2.1.2 → 2.1.4`; `5.0.7 → 5.0.9` | `electron-builder@26.15.3 → app-builder-lib → @electron/asar / @electron/universal / ejs→jake→filelist / minimatch → brace-expansion` | Resource-exhaustion expansion of attacker-controlled patterns. Build/package file matching is the relevant boundary; player LAN messages do not enter it. Both the initial advisory and its bypass must be fixed. |
| `fast-uri` | `3.1.3 → 3.1.6` | `electron-builder → app-builder-lib → ajv@8.20.0 → fast-uri` | URI normalization/host confusion, with SSRF advisories in applications that make requests based on the result. Here it is in build configuration/schema validation. A network-fetching SSRF path was not established; do not equate the advisory label with demonstrated LAN SSRF. |
| `js-yaml` | `4.3.0 → 4.3.1` | `electron-builder → app-builder-lib / builder-util / dmg-builder → js-yaml` | Quadratic CPU consumption when processing crafted YAML `!!omap`. Relevant to untrusted build configuration/input, not the game's JSON LAN messages. |
| `nanoid` | `3.3.16 → 3.3.18` | `vite@8.1.4 → postcss@8.5.17 → nanoid` | Advisory requires a zero-size custom-generator case. The inspected `postcss/lib/input.js` calls `nanoid(6)`, not a zero-size custom generator. No matching call was found in application source. Still patch the affected transitive package. |
| `postcss` | `8.5.17 → 8.5.23` | `vite@8.1.4 → postcss` | Path traversal/arbitrary `.map` file disclosure while auto-loading previous source maps from malicious CSS. Relevant when building or serving untrusted CSS/source inputs. The release loads compiled local files, not a Vite/PostCSS service. Target includes the later incomplete-fix advisory. |
| `tar` | `7.5.20 → 7.5.21` | `electron-builder → app-builder-lib → tar`; also `app-builder-lib → @electron/rebuild@4.2.0 → node-gyp@12.4.0 → tar` | Stack-overflow denial of service from crafted long-path archives with member selection. Installation/rebuild/packaging archives are the relevant input, not LAN payloads. |
| `undici` | `6.27.0 → 6.28.0`; `7.28.0 → 7.29.0` | `electron-builder → app-builder-lib → @electron/rebuild → node-gyp → undici@6`; `electron@43.1.0 → @electron/get@5.0.0 → undici@7` | HTTP retry/cache/cookie/body-handling advisories. `node-gyp/lib/download.js` imports `RetryAgent`, so retry-related download risk should not be dismissed categorically. The version-7 package is in Electron download/proxy setup. No application-level HTTP cache or shared-user proxy was identified. These package copies are not the Electron binary's embedded networking implementation. |

The eighth package, **moderate** `@xmldom/xmldom@0.8.13`, is under `electron-builder → app-builder-lib → plist@3.1.0`; the proposed target is `0.8.15`. The advisory concerns invalid entity-reference serialization/XML fragment injection. This is a build metadata path, not a LAN parser.

## Desktop and LAN boundaries actually checked

- `desktop/main.cjs` loads local `dist/index.html`; renderer settings are `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- `desktop/lanBridge.cjs` imports Node's `dgram`, `events`, and `os`, plus `ws`. Its WebSocket room server binds `0.0.0.0` on one of ports 47778–47788; discovery uses UDP 47777. Thus LAN sockets remain a real exposure even though these eight particular findings are not on their import path.
- The LAN bridge sets a 64 KiB WebSocket payload limit, a 1024-byte discovery message limit, connection/handshake bounds, and frame/byte rate bounds. These observations are not a penetration test or a proof that every denial-of-service case is prevented.
- The release uses Electron Builder's production dependency packaging, while the renderer uses Vite's compiled output. **The newly built final `app.asar` inventory was not examined in this bounded review**; final release validation should verify that development-only package copies are absent.
- Electron is listed as a development dependency for packaging purposes but **Electron 43.1.0 is an actual shipped runtime**. `npm audit --omit=dev` does not certify the embedded Chromium/Node versions or their advisories. No claim about their vulnerability status is made here.

## Minimum proposed handling

1. In a separately authorized dependency-maintenance change, refresh only the affected transitive lockfile entries to the fixed targets above within their existing compatible ranges. Preserve both major branches of `undici` and all required major branches of `brace-expansion`; do not force all consumers onto one incompatible version. If a parent range blocks a target, update only that necessary parent after compatibility review.
2. Re-run full and production-only npm audits; inspect the lockfile diff to ensure no unrelated updates; run existing tests, build, asset checks, and Windows package smoke tests. Confirm development packages are absent from the produced runtime inventory.
3. Until then, build from trusted repository/configuration/CSS/archive inputs in a least-privilege disposable environment, avoid processing untrusted source maps or archives, and do not expose development/preview servers. Keep LAN limited to the intended private network; this does not fix build-time advisories but avoids creating an unrelated public service boundary.
4. Review the shipped Electron/Chromium/Node security baseline separately. Pinning the currently resolved Electron/Builder versions rather than `latest` is a reproducibility improvement to consider, not an implemented fix in this task.

No release-wide security certification or automatic dependency change is implied by this report.

## Evidence and advisory references

Commands run: `npm audit --json`, `npm audit --omit=dev --json`, `npm ls --all <affected packages> electron electron-builder ws`, `npm ls --omit=dev --all`, and read-only `npm view ... version` checks. Application files inspected: `package.json`, `desktop/main.cjs`, `desktop/lanBridge.cjs`; selected installed call sites: PostCSS input IDs, Electron downloader proxy setup, and node-gyp HTTP downloads.

Advisory URLs supplied by the npm audit response:

- Brace expansion: [initial resource-exhaustion advisory](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [mitigation bypass](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
- Fast URI: [host confusion](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx), [backslash introducer](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7), [IDN canonicalization](https://github.com/advisories/GHSA-5jgf-p345-68v8), [malformed IPv6](https://github.com/advisories/GHSA-f65p-4m7j-42xc), [repeated hostname decoding](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), [encoded scheme normalization](https://github.com/advisories/GHSA-jqff-g426-hqxp).
- [JS-YAML CPU consumption](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [Nano ID zero-size custom generators](https://github.com/advisories/GHSA-2v37-7h3g-55p8).
- PostCSS: [source-map path traversal](https://github.com/advisories/GHSA-r28c-9q8g-f849), [incomplete fix](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp).
- [node-tar recursion](https://github.com/advisories/GHSA-r292-9mhp-454m).
- Undici: [retry desynchronization](https://github.com/advisories/GHSA-8xcm-r25x-g524), [private-cache disclosure/crash](https://github.com/advisories/GHSA-4cwx-7wf7-3272), [CRLF injection](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5), [cache whitespace](https://github.com/advisories/GHSA-jr45-8vmc-qm54), [cookie injection](https://github.com/advisories/GHSA-v3r7-h72x-cjcm).
- [xmldom serialization](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6).
