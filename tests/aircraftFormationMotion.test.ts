import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createAirSquadronGeometry } from "../src/render/aircraftGeometry";
import { AircraftFormationTracker, applyAircraftWorldPoses } from "../src/render/aircraftFormationMotion";
import { airVisualSnapshot, formationOffsets, type AirVisualSnapshot } from "../src/render/aircraftPresentation";
import { AIR_OPERATION_TIMING, AIR_NAVIGATION, advanceAirSquadronPhase, createAirSquadronState, deployFleetAirSupport, issueAirMissionOrder } from "../src/sim/airOperations";
import { spawnDeveloperAirSquadron } from "../src/sim/developerSandbox";
import { createInitialState, stepSimulation } from "../src/sim/simulation";
import { FIXED_STEP } from "../src/sim/config";
import type { AircraftRole } from "../src/sim/types";
import { AIR_FLIGHT_PROFILE } from "../src/sim/airFlightModel";

const snapshot = (time = 0, count = 6, role: AircraftRole = "fighter"): AirVisualSnapshot => ({
  role, phase: "outbound", position: { x: 600, y: 300, z: time * 100 }, heading: 0,
  aircraftCount: count, visibility: 1, observed: false,
});

function turningSnapshot(time: number): AirVisualSnapshot {
  const state = snapshot(time);
  if (time <= 2) return state;
  const angle = (time - 2) * 0.35;
  state.position.x += (1 - Math.cos(angle)) * 100 / 0.35;
  state.position.z = 200 + Math.sin(angle) * 100 / 0.35;
  state.heading = angle;
  return state;
}

function fly(tracker: AircraftFormationTracker, seconds: number, fps = 60) {
  let poses = tracker.update(turningSnapshot(0), 0);
  for (let frame = 1; frame <= Math.round(seconds * fps); frame += 1) {
    const time = frame / fps;
    poses = tracker.update(turningSnapshot(time), time);
  }
  return poses;
}

describe("trajectory-following visual aircraft", () => {
  it("preserves actual count and stable surviving slot identities without ghost aircraft", () => {
    const tracker = new AircraftFormationTracker("count");
    const first = tracker.update(snapshot(), 0);
    expect(first).toHaveLength(6);
    const survivors = tracker.update(snapshot(0.1, 4), 0.1);
    expect(survivors.map(({ id }) => id)).toEqual(first.slice(0, 4).map(({ id }) => id));
    expect(tracker.update(snapshot(0.2, 1), 0.2)).toHaveLength(1);
    expect(tracker.update(snapshot(0.3, 0), 0.3)).toHaveLength(0);
    expect(tracker.update(snapshot(0.4, 5), 0.4)).toHaveLength(5);
    expect(tracker.update(snapshot(0.5, Number.NaN), 0.5)).toHaveLength(0);
  });

  it("uses actual turn history, with wingmen entering the turn after the leader", () => {
    const poses = fly(new AircraftFormationTracker("turn"), 2.4);
    expect(poses[0]!.heading).toBeGreaterThan(0.1);
    expect(Math.abs(poses[5]!.heading)).toBeLessThan(0.035);
    expect(poses[0]!.bank).toBeLessThan(-0.1);
    expect(Math.abs(poses[5]!.bank)).toBeLessThan(0.06);
    // A rigid parent rotation would make every local offset match this instantaneous heading.
    const expectedRigid = formationOffsets("fighter", 6, "outbound")[5]!;
    const anchor = turningSnapshot(2.4);
    const rigidX = anchor.position.x + expectedRigid.x * Math.cos(anchor.heading) + expectedRigid.z * Math.sin(anchor.heading);
    expect(Math.abs(poses[5]!.position.x - rigidX)).toBeGreaterThan(2);
  });

  it("keeps straight-flight spacing and deterministic results without random yaw noise", () => {
    const one = new AircraftFormationTracker("repeat");
    const two = new AircraftFormationTracker("repeat");
    let poses = one.update(snapshot(), 0);
    for (let frame = 0; frame <= 300; frame += 1) {
      const time = frame / 60;
      poses = one.update(snapshot(time), time);
      expect(two.update(snapshot(time), time)).toEqual(poses);
    }
    const offsets = formationOffsets("fighter", 6, "outbound");
    for (const pose of poses) {
      expect(pose.position.x - 600).toBeCloseTo(offsets[pose.slot]!.x, 5);
      expect(pose.position.z - 500).toBeCloseTo(offsets[pose.slot]!.z, 2);
      expect(Math.abs(pose.heading)).toBeLessThan(0.001);
      expect(Math.abs(pose.bank)).toBeLessThan(0.001);
    }
  });

  it("banks according to turn rate rather than render-frame heading delta", () => {
    const at30 = fly(new AircraftFormationTracker("rate"), 4, 30);
    const at60 = fly(new AircraftFormationTracker("rate"), 4, 60);
    expect(Math.abs(at60[0]!.bank)).toBeGreaterThan(0.5);
    for (let slot = 0; slot < at30.length; slot += 1) {
      expect(Math.abs(at30[slot]!.bank - at60[slot]!.bank)).toBeLessThan(0.08);
      expect(Math.abs(at30[slot]!.heading - at60[slot]!.heading)).toBeLessThan(0.025);
    }
  });

  it("layers role, squadron and slot altitude while following a real descent nose-first", () => {
    const fighter = new AircraftFormationTracker("layer-a").update(snapshot(), 0);
    const bomber = new AircraftFormationTracker("layer-a").update(snapshot(0, 6, "torpedoBomber"), 0);
    const other = new AircraftFormationTracker("layer-b").update(snapshot(), 0);
    expect(new Set(fighter.map(({ position }) => position.y)).size).toBe(6);
    expect(fighter[0]!.position).toEqual(snapshot().position);
    expect(fighter[1]!.position.y).not.toBe(bomber[1]!.position.y);
    expect(fighter[1]!.position.y).not.toBe(other[1]!.position.y);
    const tracker = new AircraftFormationTracker("descent");
    let poses = tracker.update(snapshot(0, 5, "diveBomber"), 0);
    for (let frame = 1; frame <= 180; frame += 1) {
      const time = frame / 60;
      const state = snapshot(time, 5, "diveBomber");
      state.phase = "attackRun";
      state.position.y = 400 - 60 * time;
      poses = tracker.update(state, time);
    }
    expect(poses[0]!.pitch).toBeGreaterThan(0.4);
    const forward = Vector3.TransformNormal(Vector3.Forward(), Matrix.RotationYawPitchRoll(poses[0]!.heading, poses[0]!.pitch, poses[0]!.bank));
    expect(forward.y).toBeLessThan(-0.4);
  });

  it("freezes while paused and resets bounded history after seeks, gaps and teleports", () => {
    const tracker = new AircraftFormationTracker("lifecycle");
    const poses = fly(tracker, 20);
    expect(tracker.historySize).toBeLessThanOrEqual(96);
    expect(tracker.update(turningSnapshot(20), 20)).toEqual(poses);
    const teleported = snapshot(20.1);
    teleported.position = { x: -9000, y: 260, z: -3000 };
    const next = tracker.update(teleported, 20.1);
    expect(tracker.historySize).toBe(1);
    expect(next.every(({ position, bank }) => Math.abs(position.x + 9000) < 100 && bank === 0)).toBe(true);
    expect(tracker.update(snapshot(1), 1)).toHaveLength(6);
    expect(tracker.historySize).toBe(1);
    expect(tracker.update(snapshot(8), 8)).toHaveLength(6);
    expect(tracker.historySize).toBe(1);
    tracker.clear();
    tracker.clear();
    expect(tracker.historySize).toBe(0);
  });

  it("displays the SIM leader position, heading and physical pitch/bank exactly", () => {
    const tracker = new AircraftFormationTracker("physical-lead");
    const state = snapshot();
    state.heading = .8;
    state.flight = { speedMetersPerSecond: 85, pitch: .24, bank: .52 };
    const leader = tracker.update(state, 0)[0]!;
    expect(leader.position).toEqual(state.position);
    expect(leader.heading).toBe(.8);
    expect(leader.pitch).toBe(-.24);
    expect(leader.bank).toBe(-.52);
    expect(leader.speedMetersPerSecond).toBe(85);
    const forward = Vector3.TransformNormal(Vector3.Forward(), Matrix.RotationYawPitchRoll(leader.heading, leader.pitch, leader.bank));
    expect(forward.y).toBeGreaterThan(.23);
  });

  it.each(["fighter", "diveBomber", "torpedoBomber"] as const)("integrates %s wingmen within speed, acceleration and attitude-rate limits", role => {
    const profile = AIR_FLIGHT_PROFILE[role];
    const tracker = new AircraftFormationTracker(`bounded-${role}`);
    const cruise = Math.min(88, profile.maximumSpeedMetersPerSecond - 8);
    const state = snapshot(0, 5, role);
    state.flight = { speedMetersPerSecond: cruise, pitch: 0, bank: 0 };
    let previous = tracker.update(state, 0);
    const dt = 1 / 60;
    for (let frame = 1; frame <= 480; frame += 1) {
      const time = frame * dt, angle = time * .24;
      state.position = { x: 600 + (1 - Math.cos(angle)) * cruise / .24, y: 300 + time * 12, z: Math.sin(angle) * cruise / .24 };
      state.heading = angle;
      state.flight = { speedMetersPerSecond: cruise, pitch: Math.atan2(12, cruise), bank: .6 };
      if (frame === 120) state.phase = "attackRun";
      const poses = tracker.update(state, time);
      for (let slot = 1; slot < poses.length; slot += 1) {
        const before = previous[slot]!, after = poses[slot]!;
        const distance = Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y, after.position.z - before.position.z);
        expect(distance).toBeLessThanOrEqual(profile.maximumSpeedMetersPerSecond * dt + .002);
        expect(Math.abs(after.speedMetersPerSecond - before.speedMetersPerSecond)).toBeLessThanOrEqual(profile.longitudinalAccelerationMetersPerSecondSquared * dt + .001);
        expect(Math.abs(after.pitch - before.pitch)).toBeLessThanOrEqual(profile.pitchRateRadiansPerSecond * dt + .001);
        expect(Math.abs(after.bank - before.bank)).toBeLessThanOrEqual(profile.rollRateRadiansPerSecond * dt + .001);
      }
      previous = poses;
    }
  });

  it("moves each wingman along its own nose rather than sliding to an offset", () => {
    const tracker = new AircraftFormationTracker("nose");
    let previous = fly(tracker, 3);
    for (let frame = 181; frame <= 300; frame += 1) {
      const poses = tracker.update(turningSnapshot(frame / 60), frame / 60);
      for (let slot = 1; slot < poses.length; slot += 1) {
        const before = previous[slot]!, after = poses[slot]!;
        const displacement = new Vector3(after.position.x - before.position.x, after.position.y - before.position.y, after.position.z - before.position.z).normalize();
        const forward = Vector3.TransformNormal(Vector3.Forward(), Matrix.RotationYawPitchRoll(after.heading, after.pitch, after.bank)).normalize();
        expect(Vector3.Dot(displacement, forward)).toBeGreaterThan(.999);
      }
      previous = poses;
    }
  });

  it("preserves integrated positions and vertical trajectory across 30/60 Hz presentation", () => {
    const at30 = fly(new AircraftFormationTracker("integration-rate"), 10, 30);
    const at60 = fly(new AircraftFormationTracker("integration-rate"), 10, 60);
    for (let slot = 0; slot < at30.length; slot += 1) {
      const left = at30[slot]!, right = at60[slot]!;
      expect(Math.hypot(left.position.x - right.position.x, left.position.y - right.position.y, left.position.z - right.position.z)).toBeLessThan(.6);
      expect(Math.abs(left.pitch - right.pitch)).toBeLessThan(.02);
      expect(Math.abs(left.speedMetersPerSecond - right.speedMetersPerSecond)).toBeLessThan(.2);
    }
  });
});

describe("actual cloned aircraft body transforms", () => {
  it.each(["diveBomber", "torpedoBomber"] as const)("keeps complete %s wings separated through a real SIM strike and pull-out", role => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const state = createInitialState(976, "sea-trials");
    const target = state.ships.find(ship => ship.team === "enemy")!;
    target.position = { x: 0, y: 0, z: 0 };
    target.previousPosition = { ...target.position };
    for (const ship of state.ships) ship.antiAirMounts = 0;
    const squadron = createAirSquadronState({
      id: `separated-${role}`, controllerId: "player", team: "player", role,
      position: { x: role === "torpedoBomber" ? 340 : 0, y: role === "diveBomber" ? 390 : 225, z: -2400 },
      recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: -5200 } },
    });
    squadron.aircraftCapacity = 5;
    squadron.aircraftOperational = 5;
    squadron.phase = "outbound";
    squadron.flight = { speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond[role], pitch: 0, bank: 0 };
    squadron.order = { squadronId: squadron.id, kind: "strikeShip", targetId: target.id, targetIds: [target.id],
      candidateTargetIds: [target.id], activeTargetId: target.id, selectedWeapon: role === "diveBomber" ? "heBomb" : "aerialTorpedo",
      issuedAt: 0, lastKnownPosition: { ...target.position }, lastKnownPositions: { [target.id]: { ...target.position } } };
    state.airSquadrons = [squadron];
    const visual = createAirSquadronGeometry(scene, squadron.id, "player", role, 5);
    const tracker = new AircraftFormationTracker(squadron.id);
    const at30 = new AircraftFormationTracker(squadron.id);
    const initial = airVisualSnapshot(squadron, state.time)!;
    tracker.update(initial, state.time);
    at30.update(initial, state.time);
    let minimumSeparation = Infinity, releasedAt: number | undefined, releaseHeight = 0;
    let completed = false, maximumFrameRateDifference = 0;
    try {
      for (let frame = 1; frame <= 90 / FIXED_STEP; frame++) {
        // Only this production simulation advances the entity after the initial fixture.
        stepSimulation(state, new Map(), FIXED_STEP);
        const live = state.airSquadrons[0]!;
        const view = airVisualSnapshot(live, state.time)!;
        const poses = tracker.update(view, state.time);
        expect(poses).toHaveLength(5);
        applyAircraftWorldPoses(visual, poses);
        visual.root.computeWorldMatrix(true);
        for (const plane of visual.planes) {
          plane.root.computeWorldMatrix(true);
          plane.body.computeWorldMatrix(true);
        }
        for (let a = 0; a < poses.length; a++) {
          for (let b = a + 1; b < poses.length; b++) {
            const one = visual.planes[a]!.body, two = visual.planes[b]!.body;
            const distance = Vector3.Distance(one.getBoundingInfo().boundingBox.centerWorld, two.getBoundingInfo().boundingBox.centerWorld);
            minimumSeparation = Math.min(minimumSeparation, distance);
            // body is the merged historical aircraft, including its full-span wings.
            expect(one.intersectsMesh(two, true), `${role} t=${state.time.toFixed(3)} pair=${a}/${b} separation=${distance.toFixed(3)}`).toBe(false);
          }
        }
        if (frame % 2 === 0) {
          const slower = at30.update(view, state.time);
          for (let slot = 1; slot < poses.length; slot++) {
            const a = poses[slot]!.position, b = slower[slot]!.position;
            maximumFrameRateDifference = Math.max(maximumFrameRateDifference, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
          }
        }
        if (releasedAt === undefined && state.airEvents.some(event => event.kind === "weaponReleased" && event.squadronId === live.id)) {
          releasedAt = state.time;
          releaseHeight = live.position.y;
        }
        if (releasedAt !== undefined && state.time > releasedAt + 6 && live.position.y > releaseHeight + 35 && live.flight!.pitch > .04) {
          completed = true;
          break;
        }
      }
      expect(releasedAt).toBeDefined();
      expect(completed).toBe(true);
      expect(minimumSeparation).toBeGreaterThan(role === "diveBomber" ? 14.37 : 16.51);
      expect(maximumFrameRateDifference).toBeLessThan(.8);
    } finally {
      visual.root.dispose(false, true);
      scene.dispose();
      engine.dispose();
    }
  });

  it.each(["fighter", "diveBomber", "torpedoBomber"] as const)("moves and enables distinct %s body and propeller meshes", (role) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const visual = createAirSquadronGeometry(scene, `world-${role}`, "player", role, 6);
    const tracker = new AircraftFormationTracker(`world-${role}`);
    try {
      // A pre-existing transformed parent cannot retain a second formation-level yaw/bank.
      visual.root.position.set(200, 30, 500);
      visual.root.rotation.set(0.2, 1.2, 0.3);
      for (const count of [6, 5, 3, 1, 0]) {
        const time = 7 - count;
        const state = snapshot(time, count, role);
        state.heading = 0.65;
        const poses = tracker.update(state, time);
        applyAircraftWorldPoses(visual, poses);
        visual.root.computeWorldMatrix(true);
        const enabled = visual.planes.filter(({ body }) => body.isEnabled());
        expect(enabled).toHaveLength(count);
        const centers: Vector3[] = [];
        for (let index = 0; index < count; index += 1) {
          const plane = visual.planes[index]!;
          const pose = poses[index]!;
          plane.root.computeWorldMatrix(true);
          plane.body.computeWorldMatrix(true);
          plane.propeller.computeWorldMatrix(true);
          expect(plane.body.parent).toBe(plane.root);
          expect(plane.body.isWorldMatrixFrozen).toBe(false);
          expect(plane.body.geometry).toBe(visual.planes[0]!.body.geometry);
          const expectedMatrix = Matrix.Compose(Vector3.One(), Quaternion.RotationYawPitchRoll(pose.heading, pose.pitch, pose.bank), new Vector3(pose.position.x, pose.position.y, pose.position.z));
          const bounds = plane.body.getBoundingInfo().boundingBox;
          const expectedCenter = Vector3.TransformCoordinates(bounds.center, expectedMatrix);
          expect(Vector3.Distance(bounds.centerWorld, expectedCenter)).toBeLessThan(0.001);
          expect(bounds.maximumWorld.subtract(bounds.minimumWorld).length()).toBeGreaterThan(8);
          const expectedPropeller = Vector3.TransformCoordinates(plane.propeller.position, expectedMatrix);
          expect(Vector3.Distance(plane.propeller.getAbsolutePosition(), expectedPropeller)).toBeLessThan(0.001);
          expect(plane.propeller.getChildMeshes().every((mesh) => mesh.isEnabled())).toBe(true);
          for (const other of centers) expect(Vector3.Distance(other, bounds.centerWorld)).toBeGreaterThan(8);
          centers.push(bounds.centerWorld.clone());
        }
        expect(visual.planes.slice(count).every(({ body, propeller }) => !body.isEnabled() && propeller.getChildMeshes().every((mesh) => !mesh.isEnabled()))).toBe(true);
      }
    } finally {
      visual.root.dispose(false, true);
      scene.dispose();
      engine.dispose();
    }
  });
});

describe("real user squadron quantity paths", () => {
  it("developer spawning preserves the default five and an explicitly selected single aircraft", () => {
    const state = createInitialState();
    const defaultGroup = spawnDeveloperAirSquadron(state, "player", "fighter")!;
    const single = spawnDeveloperAirSquadron(state, "player", "diveBomber", 1)!;
    expect(defaultGroup.aircraftCapacity).toBe(5);
    expect(defaultGroup.aircraftOperational).toBe(5);
    expect(airVisualSnapshot(defaultGroup, state.time)?.aircraftCount).toBe(5);
    expect(airVisualSnapshot(single, state.time)?.aircraftCount).toBe(1);
  });

  it("fleet support launches complete 6/5/5 groups, not a permanently single first plane", () => {
    const state = createInitialState(undefined, "sea-trials");
    deployFleetAirSupport(state);
    expect(state.airSquadrons.map(({ aircraftOperational }) => aircraftOperational)).toEqual([6, 5, 5]);
    for (const squadron of state.airSquadrons) {
      const order = issueAirMissionOrder(squadron, {
        squadronId: squadron.id, kind: "moveTo", area: { center: { x: 0, y: 250, z: 1000 }, radius: 100 },
      }, state.time);
      expect(order.accepted).toBe(true);
      const launching = order.squadron!;
      expect(launching.phase).toBe("launching");
      expect(airVisualSnapshot(launching, state.time)?.aircraftCount).toBe(squadron.aircraftCapacity);
      const airborne = advanceAirSquadronPhase(launching, state.time + AIR_OPERATION_TIMING.launchSeconds + 0.01);
      expect(airborne.phase).toBe("outbound");
      expect(airVisualSnapshot(airborne, state.time + 9)?.aircraftCount).toBe(squadron.aircraftCapacity);
    }
  });
});
