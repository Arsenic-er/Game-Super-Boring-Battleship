import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createAirSquadronGeometry } from "../src/render/aircraftGeometry";
import { AircraftFormationTracker, applyAircraftWorldPoses } from "../src/render/aircraftFormationMotion";
import { airVisualSnapshot, formationOffsets, type AirVisualSnapshot } from "../src/render/aircraftPresentation";
import { AIR_OPERATION_TIMING, advanceAirSquadronPhase, deployFleetAirSupport, issueAirMissionOrder } from "../src/sim/airOperations";
import { spawnDeveloperAirSquadron } from "../src/sim/developerSandbox";
import { createInitialState } from "../src/sim/simulation";
import type { AircraftRole } from "../src/sim/types";

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
    expect(fighter[0]!.position.y).not.toBe(bomber[0]!.position.y);
    expect(fighter[0]!.position.y).not.toBe(other[0]!.position.y);
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
  });
});

describe("actual cloned aircraft body transforms", () => {
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
