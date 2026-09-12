# Aircraft motion model — 0.7.6

## Why this replaced 0.7.5

The previous formation renderer could show delayed turns, but its authoritative
leader still travelled at a fixed horizontal speed with a separately clamped
altitude. A very slow, small altitude oscillation did not make that a flight
model. Weapon release also depended mainly on a phase timer. This revision
changes simulation guidance, integration and release eligibility together.

## References reviewed

- [Vazgriz FlightSim](https://github.com/vazgriz/FlightSim) and its
  [autopilot article](https://vazgriz.com/892/creating-a-flight-simulator-in-unity3d-part-4-autopilot/):
  altitude/climb/pitch control cascades, heading/bank guidance and bounded flight
  response. The Unity project is MIT-licensed; it is a reference, not a dependency.
- [Yuka](https://github.com/Mugen87/yuka) and its
  [steering examples](https://mugen87.github.io/yuka/examples/): path following,
  cohesion, separation and pursuit. MIT-licensed JavaScript, but generic steering
  alone does not supply aircraft dynamics.
- [OpenSteer](https://opensteer.sourceforge.net/stref.html): useful formation and
  steering vocabulary, not a complete fixed-wing flight controller.
- [JSBSim](https://github.com/JSBSim-Team/jsbsim): a nonlinear six-degree-of-freedom
  flight-dynamics engine. Its aircraft definitions and integration/tuning cost are
  beyond this lightweight naval-game increment.

These are primary project/author sources reviewed on 2026-09-13. No third-party
source code or assets were copied, and no flight-library dependency was added.
The TypeScript implementation is independent and uses conventional point-mass
flight equations and game-specific guidance.

## Implemented contract

1. Mission guidance chooses a destination, altitude, optional flight-path pitch
   and target speed. It never directly sets an aircraft's position.
2. The integrator bounds bank, roll rate, pitch rate, climb/dive angle and
   acceleration by aircraft role. Coordinated turn rate is `g*tan(bank)/Vh`.
   Horizontal and vertical travel both derive from airspeed and pitch; gravity
   and induced turn drag influence speed. Integration uses steps of at most
   1/120 second with a bounded catch-up interval.
3. Fighters can approach above a target, converge on its observed altitude and
   climb through an overshoot turn. Interception requires a three-dimensional
   forward firing cone; proximity alone no longer means a hit.
4. Bombers align, descend toward a release gate, release when the projected
   ballistic footprint reaches the aim point, then fly clear and climb before
   turning home. Bombs inherit the releasing aircraft's velocity.
5. Torpedo bombers descend to low altitude and level out before release. The
   release window checks altitude, bank, pitch and horizontal range. Aerial
   torpedoes still enter the existing waterborne simulation directly; a separate
   falling-torpedo/entry-impact model is not included here.
6. Patrol guidance follows a feasible orbit with a role/speed-dependent minimum
   radius. Normal cruise may remain level: there is no perpetual sine-wave motion
   added merely to make the aircraft look busy.
7. Conservative look-ahead terrain corridors request a climb before the group
   reaches island mountains. This uses cached zone bounds, not per-tick terrain
   mesh sampling or a vertical teleport to the mountain's height.
8. The visible leader matches the authorized simulation/contact sample. Each
   wingman integrates its own speed, pitch, bank and position toward a delayed
   moving formation station. Offsets are navigation goals, not a rigid transform.
   Surviving plane count remains the actual group count; no cosmetic extra planes.
9. LAN snapshots carry optional flight state only through the existing visibility
   filter. Stable-ID aircraft interpolate XYZ, heading, bank, pitch and speed.
   Old snapshots remain valid; anonymous enemies are not given inferred identities.
10. Automatic recovery reserves route and manoeuvre time instead of waiting for a
    fixed 35-second remainder. Horizontal travel/half-turn and descent/full-circle
    re-entry budgets run in parallel, with attitude settling, landing and safety
    margins. Total fuel and the tight recovery gate are unchanged.

## Boundaries and follow-up work

- This is a lightweight point-mass model, **not** a validated historical 6-DOF
  aerodynamic simulator. Flight-path pitch equals velocity inclination; angle of
  attack, stalls, spins, control-surface forces and wind turbulence are not modelled.
- Parameters distinguish fighter, dive-bomber and torpedo-bomber roles; they are
  game tuning values, not per-airframe historical flight-test measurements.
- Individual wingmen have independent visible flight states, but combat damage,
  ammunition and orders remain squadron-level. This is not independent per-plane
  tactical AI or a distributed multi-agent combat simulation.
- Weapon projectiles still originate from the authoritative squadron's aggregate
  release pattern, not each independently rendered wingman's exact rack position.
  Per-plane authoritative release hardpoints are follow-up work; private renderer
  state must never be read back into combat simulation to fake this coupling.
- Recovery is the existing map-edge abstraction, not carrier deck landing physics.
- Terrain anticipation is conservative clearance guidance, not general obstacle
  pathfinding; arbitrary developer teleports inside a mountain are unsupported.
- Release timing and intercept opportunities change combat outcomes. Existing
  damage values, ammunition quantities and economy were not rebalanced in this
  increment. Moving-target and mixed-fleet playtests remain important tuning work.

See `acceptance/0.7.6-flight.md` for executed tests, visual evidence and delivery.
