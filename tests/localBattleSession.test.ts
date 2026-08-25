import { describe, expect, it } from "vitest";
import { spawnDeveloperShip } from "../src/sim/developerSandbox";
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

const firingCommandFor = (ship: ShipState): ControlCommand => ({
  ...zeroCommandFor(ship),
  aimPoint: { x: ship.position.x, y: ship.position.y, z: ship.position.z + 1_000 },
  fire: true,
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

  it("only enables developer AI for uncontrolled ships when requested for the current step", () => {
    const state = createInitialState(17, "battle");
    const ally = spawnDeveloperShip(state, "player", "cleveland")!;
    ally.aiControlled = false;
    const session = new LocalBattleSession(state);
    const command = zeroCommandFor(state.ships[0]!);

    session.step(new Map([["player", command]]), FIXED_STEP);
    expect(ally.aiDecision).toBeUndefined();

    session.step(new Map([["player", command]]), FIXED_STEP, { includeDeveloperAi: true });
    expect(ally.aiDecision).toBeDefined();
  });

  it("uses constructor developer-AI defaults unless a step explicitly overrides them", () => {
    const defaultEnabled = createInitialState(17, "battle");
    const defaultEnabledAlly = spawnDeveloperShip(defaultEnabled, "player", "cleveland")!;
    defaultEnabledAlly.aiControlled = false;
    const defaultEnabledSession = new LocalBattleSession(defaultEnabled, { includeDeveloperAi: true });
    defaultEnabledSession.step(
      new Map([["player", zeroCommandFor(defaultEnabled.ships[0]!)] ]),
      FIXED_STEP,
    );
    expect(defaultEnabledAlly.aiDecision).toBeDefined();

    const disabledByOverride = createInitialState(18, "battle");
    const disabledAlly = spawnDeveloperShip(disabledByOverride, "player", "cleveland")!;
    disabledAlly.aiControlled = false;
    const disabledSession = new LocalBattleSession(disabledByOverride, { includeDeveloperAi: true });
    disabledSession.step(
      new Map([["player", zeroCommandFor(disabledByOverride.ships[0]!)] ]),
      FIXED_STEP,
      { includeDeveloperAi: false },
    );
    expect(disabledAlly.aiDecision).toBeUndefined();

    const enabledByOverride = createInitialState(19, "battle");
    const enabledAlly = spawnDeveloperShip(enabledByOverride, "player", "cleveland")!;
    enabledAlly.aiControlled = false;
    const enabledSession = new LocalBattleSession(enabledByOverride);
    enabledSession.step(
      new Map([["player", zeroCommandFor(enabledByOverride.ships[0]!)] ]),
      FIXED_STEP,
      { includeDeveloperAi: true },
    );
    expect(enabledAlly.aiDecision).toBeDefined();
  });

  it("reset replaces the state and clears AI controllers between battles", () => {
    const initial = createInitialState(17, "battle");
    const initialAlly = spawnDeveloperShip(initial, "player", "cleveland")!;
    initialAlly.aiControlled = false;
    const session = new LocalBattleSession(initial);
    session.step(
      new Map([["player", zeroCommandFor(initial.ships[0]!)] ]),
      FIXED_STEP,
      { includeDeveloperAi: true },
    );

    const nextState = createInitialState(88, "battle");
    const expectedState = createInitialState(88, "battle");
    const nextAlly = spawnDeveloperShip(nextState, "player", "cleveland")!;
    const expectedAlly = spawnDeveloperShip(expectedState, "player", "cleveland")!;
    nextAlly.aiControlled = false;
    expectedAlly.aiControlled = false;
    const expectedSession = new LocalBattleSession(expectedState);

    session.reset(nextState);
    session.step(new Map([["player", zeroCommandFor(nextState.ships[0]!)] ]), FIXED_STEP);
    expectedSession.step(new Map([["player", zeroCommandFor(expectedState.ships[0]!)] ]), FIXED_STEP);

    expect(session.state).toBe(nextState);
    expect(nextAlly.aiDecision).toBeUndefined();
    expect(nextState).toEqual(expectedState);
  });

  it("returns stable step event snapshots", () => {
    const state = createInitialState(17, "sea-trials");
    const session = new LocalBattleSession(state);
    const output = session.step(
      new Map([["player", firingCommandFor(state.ships[0]!)] ]),
      FIXED_STEP,
    );
    const firstShots = [...output.shots];
    const firstImpacts = [...output.impacts];
    const firstAirEvents = [...output.airEvents];

    expect(output.shots).not.toBe(state.shots);
    expect(output.impacts).not.toBe(state.impacts);
    expect(output.airEvents).not.toBe(state.airEvents);

    session.step(new Map([["player", zeroCommandFor(state.ships[0]!)] ]), FIXED_STEP);

    expect(output.shots).toEqual(firstShots);
    expect(output.impacts).toEqual(firstImpacts);
    expect(output.airEvents).toEqual(firstAirEvents);
  });
});
