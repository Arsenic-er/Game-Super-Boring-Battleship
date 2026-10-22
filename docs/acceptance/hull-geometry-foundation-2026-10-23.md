# Full-hull geometry foundation — 2026-10-23

## Delivered scope

Add a shared horizontal collision footprint using the existing ship/ship OBB:
half-length .48L and half-beam .55B. Ship/ship projection now reads those
dimensions from one helper with the same arithmetic. No existing terrain
resolver or AI decision path calls the new full-body constraint.

The helper checks hull edges, containment in both directions, complete-hull
map bounds, translation and rotation. Cached coast polygons carry an explicit
chord-error bound; profile segments align with radial-profile knots. The
swept envelope includes rotational chord error. A bounded query stops at the
last verified pose instead of accepting an untested remainder.

Existing overlap can leave only through a per-zone, decreasing-overlap path
that does not add occupied terrain in the conservative polygon domain. When
a combined movement/turn fails, a separately certified complete outward
translation may retain the old heading. This is a conservative collision OBB,
not the rendered ship mesh, exact time of impact or a general escape planner.

Thirty helper tests cover edge crossings with clear corners, an island inside
the hull, hull containment, draft thresholds, intermediate rotation, raw
multi-turn headings, large-step budgets, map edges, old-overlap exits and
rejections, and cache reuse. Independent review found a sub-metre radius
mismatch with the existing analytic terrain normalization; the helper now
uses the same effective minimum radius and includes the exact counterexample.
Actual map radii are unchanged.

## Rejected integration experiment

The first integration constrained physical movement and heading, recomputed
accepted distance and turn rate, and rechecked ship/ship separation against
terrain. An additional AI guard checked the actual stern braking corridor
with the shared hull. Eight physical integration cases and five controller
cases passed, but that was insufficient for release.

The complete regular run produced 22 failures: twenty assertion failures and
two five-second test timeouts during concurrent QA. No existing assertion or
threshold was weakened. Twelve complete 5v5/7v7 fleet-support sessions across
both spawn sides and clear/rain/fog exposed three failed battle cases:

| Case | Ship | Continuous grounding |
| --- | --- | ---: |
| Default 7v7 clear | calibration-a-4 | 627.00 s |
| Default 7v7 clear | calibration-a-5 | 175.08 s |
| Default 7v7 fog | calibration-a-5 | 99.28 s |
| Mirrored 7v7 fog | calibration-b-6 | 768.78 s |

These are natural new sessions, not just manually embedded legacy hulls.
Terminal collision rejection cannot compensate for a planner that still
chooses centre-line routes and turns without checking the complete hull.
The experiment is therefore not enabled or presented as a gameplay fix.

Two old Cleveland recovery poses also expose a separate migration issue.
One has three analytic hull corners 3–20 m inside shallow terrain despite an
80 m deep centre. Its current-heading forward and reverse steps are both
blocked. Another can back out 23.8 m, then the ten-metre minimum braking
query rejects the remaining roughly six metres of available travel. Changing
a centre-grounding assertion alone would conceal these unresolved behaviours.

The complete experimental patch and source hashes remain on the server under
`.qa/hull-contact-20261022/`; rebuilding its three changed production modules
from the patch matches the archived hashes. Both 45-module experimental
session manifests match that archived candidate, not the final foundation.
Patch SHA256:
`81d53bf14015d38a900c5329640983d41cf0e47fdf3f05e3efe8401645682b7d`.
Raw QA, temporary indexes and experimental patches are not repository artifacts.

## Next integration gate

1. Validate prospective forward/reverse turning trajectories using this shared
   hull before selecting a route; leave room to brake and turn before contact.
2. Resolve contact-side recovery and finite low-speed braking consistently.
   A new motion must be physically reachable, not just point toward a clear
   distant endpoint. Do not increase rudder, engine, weapon or sensor strength.
3. Re-enable full-body physics only with the existing recovery tests and all
   twelve full-session gates passing. Preserve the twenty-minute limit and
   treat normal score/time endings as valid.

The centre-only terrain gap and the three previous rain late-stop cases
remain open in the playable build. This checkpoint does not repair them.

## Verification and delivery

- Frozen-source regular run: 2,109 tests pass, eleven opt-in cases skipped;
  the two offline balance-report entrypoints are excluded. No existing tests
  were changed. The thirty new helper tests also pass separately.
- Six explicit prototype checks and the production build pass. The existing
  greater-than-500 kB bundle warning remains.
- Eleven actual-main browser checks pass with zero errors; the isolated
  browser/service closed and port 5286 is not listening.
- Twelve final foundation sessions match ef52dcd exactly in canonical terminal
  state and all recorded navigation metrics. Both 45-module manifests match
  the final source tree. All 144 ship appearances still fire 20,288 main-gun
  shells. This is preservation evidence, not an AI improvement claim.
- The final helper SHA256 is
  `97381486e2345ca5d74f2d21e0147979d5aa755e2f349a060210dbe76900bb97`;
  its tests are
  `c8fcf943661499152aa2e76d789fdc8fa8811e78454284d4387100cc967ab180`.
- Development branch only; main remains 8ef5b84. No asset/version/tag or local
  package delivery. All work and QA remain on the server.

The final acceptance does not include native Windows, LAN or mobile/Surface
performance. Server geometry microbenchmarks are not device frame-rate evidence.
