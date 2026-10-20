# AI braking consistency — 2026-10-21

## Development-branch scope

Use one read-only positive-headway stopping-distance calculation for terrain
lookahead and objective-station approach. Include current engine damage,
installed acceleration performance and the existing navigation time scale.
The previous estimates omitted the first two factors and imposed a minimum
braking rate. Actual propulsion, rudder, damage, sensors, guns, fleet priorities,
reverse recovery and the 1,200-second match limit are unchanged.

The helper describes continuous zero-throttle distance with damage held
constant, not an astern-braking model or a turn trajectory. A destroyed engine
still has the simulator's forward drag. Active nonzero forced speed, invalid
braking data and zero braking do not produce a false finite stopping promise.
Infinite distance keeps terrain queries bounded but forbids positive throttle
in cruising and recovery reorientation. Planning never edits actual velocity.

## Direct evidence

A Yamato at 8 kn, 1% engine health and .5 acceleration multiplier previously
assumed 56.12 m to stop; the matching physical estimate is 246.42 m. Its terrain
lookahead changes from 173.16 to 363.46 m. At a real support station 350 m away,
both teams now request zero throttle for this weak propulsion case, while the
healthy comparison retains its .24 approach. Those station tests establish
the current decision, not an entire successful docking trajectory.

Four fixed-step braking experiments cover Fletcher, Cleveland, Yamato and
Richelieu. Only automatic engine repair is frozen so the tested damage stays
constant. Continuous predictions bound actual travelled distance within one
initial simulation step. Additional tests cover cache cadence, read-only
state, finite query cost, damaged/disabled/forced propulsion and public
reorientation boundary inputs; boundary fixtures are not historical replays.
The original eight integration checks produce five failures and three passes
against the exact 2442f6b call sites before the correction.

## Alternatives not shipped

Limited forward creep at the historical a5 pose saved only about 24 seconds
but caused 176–182 throttle restarts. It is rejected. A safe astern-turn probe
cut that isolated maneuver from 505.40 to 249.35 seconds using real physics,
but starts a fresh healthy ship directly in a QA maneuver, not the original
AI state. It does not establish a production fix.

An exact old full-session trace shows a5 naturally enters reverse at 223.35 s
and leaves at 463.55 s, the existing 240-second cap, with its bow still blocked.
Thus the isolated probe cannot justify describing this as an early-clearance
handoff defect. No cap extension, new reverse retry, nearest-heading shortcut
or performance buff is included.

## Verification

- 2,052 regular tests pass, including 32 new checks (22 kinematics and ten
  integration checks); eleven opt-in cases are skipped, not passed. The two
  balance-report entrypoints are excluded. Six explicit prototype checks and
  the production build pass; the existing large-bundle warning remains.
- Eleven real-main/render-loop browser checks pass with zero errors. Their
  temporary service is confirmed closed. This is not native Windows, LAN or
  mobile/Surface performance verification.
- Twelve actual 5v5/7v7 fleet-support sessions cover clear, rain and fog weather
  on both spawn sides at seed offset 211. All meet the existing basic movement,
  opposing damage, weapon-release and terminal-state-freeze checks. All 144 ship
  appearances emit main-gun shells (20,052 total). Matches last 1,001.87–1,200 s:
  nine time, two destruction and one score ending. Maximum reported continuous
  grounding is .05 s; this is not full-hull clearance proof. Loaded source
  manifests match the final working tree in both six-session processes.
- Exact 2442f6b controller/navigation modules are loaded in memory for five
  old/new scenario comparisons without replacing the checkout. The original
  default/fog and mirrored/clear terminal hashes reproduce the previous record.
  Additional old rain cases investigate all three candidate late-stop survivors.

In default 7v7 fog, a5's last-300-second travel changes from zero to 2,324.97 m,
with cruising throughout that window; its longest stop changes from 730.50 to
29.53 s. Main-gun count remains 72. This is a whole-battle outcome with changed
paths, contacts and damage, not proof of a universally improved turn planner.

Three candidate survivors still travel zero metres after 900 s:

| Rain case | Candidate evidence | Old-version comparison |
| --- | --- | --- |
| Default 5v5 a3 Edinburgh | Blocked reorientation for 300 s; hull 12.40%, engine 87.84%, steering 87.25%; damaged withdrawal, no late shells | Old same-length surviving window travels 1,865.26 m. This is a newly observed late-stop regression; damage and route changes confound direct causality. |
| Mirrored 5v5 a3 Edinburgh | Blocked reorientation for 300 s; hull 66.27%, engine 88.26%, steering 87.55%; 114 late shells | Old ship sinks at 669.57 s, so there is no comparable late surviving window. |
| Mirrored 7v7 a6 Bismarck | Blocked reorientation until the 1,082.9 s ending; engine and steering 100%; 24 late shells | Old game lasts 1,200 s and also contains a long stop, but later resumes. Unequal windows do not establish improvement. |

These observations are not explained by disabled propulsion. They prevent
claiming overall AI improvement or completed navigation acceptance. The
corrected braking model is retained on the development branch; no main merge,
stable release or broad AI-readiness approval is made.

## Limits and next work

This remains naval-rule-based heuristic AI, not a reproduction of World of
Warships' private implementation or a full hydrodynamic simulation. A corrected
distance does not supply a continuously safe turn trajectory. The 800/480 m
query caps and half-second planning cache remain bounded approximations.

Long coastal turns, route continuity across changing fleet orders and complete
hull sweep validation still need work. An auxiliary conservative capsule check
overlaps shoal margins for about 44 s in an older b5 reconstruction even though
the existing centre-line terrain collision reports no grounding. This is a
geometry-validation gap to investigate, not proof of collision-free hull motion
or an exact physical collision count. No existing acceptance thresholds were
relaxed.

Raw evidence remains ignored under .qa/coastal-maneuver-20261021/. Only source,
tests and condensed records enter Git. Assets are unchanged; no main merge,
version/tag change, native Windows/device-performance claim or local download.
Temporary browser QA closes its own service.
