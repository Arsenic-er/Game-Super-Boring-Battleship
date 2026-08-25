import { describe, expect, it } from "vitest";
import { replicationViewFor } from "../src/net/replicationView";
import { createInitialState } from "../src/sim/simulation";
import type { ImpactEvent, ProjectileState, ShotEvent } from "../src/sim/types";

function placeEnemyVisible(state: ReturnType<typeof createInitialState>): void {
  const player = state.ships.find((ship) => ship.id === "player")!;
  const enemy = state.ships.find((ship) => ship.id === "enemy")!;
  enemy.position = {
    x: player.position.x + 1_100,
    y: player.position.y,
    z: player.position.z + 200,
  };
  enemy.previousPosition = { ...enemy.position };
}

describe("replicationViewFor", () => {
  it("omits hidden enemy ship state but includes visible contacts, projectiles and non-leaking events", () => {
    const hidden = createInitialState(401, "battle");
    const hiddenView = replicationViewFor(hidden, "player", 6, 0);

    expect(hiddenView.contacts).toHaveLength(0);
    expect(JSON.stringify(hiddenView)).not.toContain('"id":"enemy"');

    const visible = createInitialState(402, "battle");
    placeEnemyVisible(visible);
    visible.time = 1;
    const player = visible.ships.find((ship) => ship.id === "player")!;
    const enemy = visible.ships.find((ship) => ship.id === "enemy")!;

    visible.projectiles = [{
      id: 900,
      ownerId: enemy.id,
      team: "enemy",
      kind: "shell",
      ammoType: "he",
      position: { x: player.position.x + 900, y: 10, z: player.position.z },
      previousPosition: { x: player.position.x + 920, y: 10, z: player.position.z },
      velocity: { x: -100, y: 0, z: 0 },
      damage: 1,
      age: 1,
    }] as ProjectileState[];
    visible.shots = [{
      id: 901,
      ownerId: enemy.id,
      team: "enemy",
      kind: "shell",
      ammoType: "he",
      position: { x: enemy.position.x, y: enemy.position.y + 10, z: enemy.position.z },
    }] as ShotEvent[];
    visible.impacts = [{
      id: 902,
      kind: "hit",
      position: { x: player.position.x + 100, y: player.position.y, z: player.position.z + 25 },
      sourceId: enemy.id,
      sourceTeam: "enemy",
      targetId: player.id,
      damage: 33,
      projectileKind: "shell",
      ammoType: "he",
    }] as ImpactEvent[];

    const view = replicationViewFor(visible, "player", 6, 3);

    expect(view.contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: enemy.id }),
    ]));
    expect(view.projectiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: enemy.id, kind: "shell" }),
    ]));
    expect(view.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 901, ownerId: enemy.id }),
      expect.objectContaining({ id: 902, sourceId: enemy.id, targetId: player.id }),
    ]));
    expect("hull" in view.contacts[0]!).toBe(false);
    expect("modules" in view.contacts[0]!).toBe(false);
  });

  it("deep-clones every snapshot branch so callers cannot mutate authoritative state", () => {
    const state = createInitialState(403, "battle");
    placeEnemyVisible(state);
    state.time = 1;

    const snapshot = replicationViewFor(state, "player", 12, 7);
    (snapshot.self.position as { x: number }).x = 123_456;
    (snapshot.objective.center as { x: number }).x = -999;
    if (snapshot.contacts[0]) {
      (snapshot.contacts[0].position as { x: number }).x = 777;
    }

    const fresh = replicationViewFor(state, "player", 12, 7);
    const player = state.ships.find((ship) => ship.id === "player")!;

    expect(player.position.x).not.toBe(123_456);
    expect(state.objective.center.x).not.toBe(-999);
    expect(fresh.self).not.toBe(snapshot.self);
    expect(fresh.self.position).not.toBe(snapshot.self.position);
    if (fresh.contacts[0]) {
      const freshContact = fresh.contacts[0] as { position: { x: number } };
      const mutatedContact = snapshot.contacts[0] as { position: { x: number } } | undefined;
      expect(freshContact.position.x).not.toBe(777);
      expect(freshContact.position).not.toBe(mutatedContact?.position);
    }
  });
});
