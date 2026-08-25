import { describe, expect, it } from "vitest";
import { FIXED_STEP } from "../src/sim/config";
import { createInitialState } from "../src/sim/simulation";
import type { ControlCommand, ShipState } from "../src/sim/types";
import { LocalBattleSession } from "../src/session/localBattleSession";

const zeroCommandFor = (ship: ShipState): ControlCommand => ({
  throttle: 0,
  rudder: 0,
  aimPoint: { ...ship.aimPoint },
  fire: false,
});

describe("LocalBattleSession", () => {
  it("advances the authoritative state once and preserves human commands", () => {
    const state = createInitialState(17, "battle");
    const session = new LocalBattleSession(state);
    const command = { ...zeroCommandFor(state.ships[0]!), throttle: 1 };
    session.step(new Map([["player", command]]), FIXED_STEP);
    expect(state.time).toBeCloseTo(FIXED_STEP);
    expect(state.ships.find(({ id }) => id === "player")!.throttle).toBe(1);
  });

  it("generates AI commands for every live uncontrolled combat ship", () => {
    const state = createInitialState(17, "battle");
    const session = new LocalBattleSession(state);
    session.step(new Map([["player", zeroCommandFor(state.ships[0]!)] ]), FIXED_STEP);
    expect(state.ships.find(({ id }) => id === "enemy")!.aiDecision).toBeDefined();
  });
});
