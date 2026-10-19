import { describe, expect, it, vi } from "vitest";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState } from "../src/sim/simulation";
import type { Team, Vec3 } from "../src/sim/types";

const pose = { x: -2053.6284329947434, y: 0, z: 658.7294229859721 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
// A historical placement starts a fresh production session, not a replay of
// the old battle's contacts, RNG or private controller/recovery state.
function fixture(team: Team, heading: number) {
  const state = createInitialState(0x71501 + 211, "battle");
  state.airSupport = "none"; state.airSquadrons = []; state.weatherId = "rain-squall";
  const own = createDeveloperShipState({ id: "shoal-battleship", team, shipClassId: "richelieu",
    position: { ...pose }, heading, aiControlled: true,
    torpedoLauncherMounts: 0, secondaryGunIds: [] });
  const remote = createDeveloperShipState({ id: "remote-sentinel", team: team === "player" ? "enemy" : "player",
    shipClassId: "fletcher", position: { x: 5000, y: 0, z: 5000 }, heading: 0, aiControlled: false,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  state.ships = [own, remote];
  const nav = terrainNavigationAt(state.mapId, own.position.x, own.position.z, shipDraftMeters(own.shipClassId));
  own.navigationZone = nav.kind; own.waterDepthMeters = nav.depthMeters;
  return { state, own, session: new LocalBattleSession(state) };
}

describe("safe-water shoal recovery in production sessions", () => {
  for (const team of ["player", "enemy"] as const) {
    for (const heading of [.7249218624139191, .3]) {
      it(team + " heading " + heading + " finishes its first recovery and resumes safe travel", () => {
        const { state, own, session } = fixture(team, heading);
        expect(own.navigationZone).toBe("deep");
        const initialPerformance = { ...own.performance };
        const calls = vi.spyOn(AiNavigationRecovery.prototype, "command"); // Real call-through only.
        let startedAt: number | null = null, releasedAt: number | null = null;
        let start: Vec3 | null = null, end: Vec3 | null = null, nextStart: Vec3 | null = null;
        let nextRecoveryAt: number | null = null;
        let stopped = 0, longestStopped = 0, firstRecoveryGrounded = 0, actualAsternSeconds = 0;
        let reverseStarts = 0, wasReverse = false, firstReverseStarts = 0;
        let afterNormalSeconds = 0, afterGrounded = 0, afterTravel = 0, afterDisplacement = 0;
        let totalGrounded = 0, maxRudder = 0;
        let previous = { ...own.position };
        try {
          for (let tick = 0; tick < 480 / FIXED_STEP; ++tick) {
            session.step(new Map(), FIXED_STEP);
            const navigation = calls.mock.results.at(-1)?.value;
            expect(navigation, "the real AI must issue a navigation decision on every step").toBeDefined();
            if (navigation?.recovering && startedAt === null) {
              startedAt = state.time; start = { ...own.position };
            }
            if (navigation?.throttleLimit < 0 && !wasReverse) ++reverseStarts;
            wasReverse = navigation?.throttleLimit < 0;
            if (startedAt !== null && releasedAt === null && !navigation?.recovering) {
              releasedAt = state.time; end = { ...own.position }; firstReverseStarts = reverseStarts;
            }
            if (startedAt !== null && releasedAt === null) {
              stopped = Math.abs(own.speedKnots) < .05 ? stopped + FIXED_STEP : 0;
              longestStopped = Math.max(longestStopped, stopped);
              if (own.navigationZone === "grounded") firstRecoveryGrounded += FIXED_STEP;
              if (own.speedKnots < -.05) actualAsternSeconds += FIXED_STEP;
            }
            if (releasedAt !== null) {
              if (navigation?.recovering && nextRecoveryAt === null) {
                nextRecoveryAt = state.time; nextStart = { ...own.position };
              }
              if (state.time - releasedAt <= 60) {
                if (!navigation?.recovering) afterNormalSeconds += FIXED_STEP;
                if (own.navigationZone === "grounded") afterGrounded += FIXED_STEP;
                afterTravel += distance(own.position, previous);
                afterDisplacement = distance(own.position, end!);
              }
            }
            if (own.navigationZone === "grounded") totalGrounded += FIXED_STEP;
            maxRudder = Math.max(maxRudder, Math.abs(own.rudderCommand));
            expect([own.position.x, own.position.z, own.heading, own.speedKnots].every(Number.isFinite)).toBe(true);
            previous = { ...own.position };
            calls.mockClear();
          }
        } finally { calls.mockRestore(); }
        if (process.env.SHOAL_RECOVERY_REPORT === "1") console.log("SHOAL_SESSION", JSON.stringify({
          team, heading, startedAt, releasedAt, longestStopped, firstRecoveryGrounded,
          actualAsternSeconds, firstReverseStarts, afterNormalSeconds, afterGrounded,
          afterTravel, afterDisplacement, start, end, nextRecoveryAt, nextStart,
          nextRecoveryDistance: start && nextStart ? distance(start, nextStart) : null,
          reverseStarts, totalGrounded,
        }));
        expect(state.status).toBe("running");
        expect(startedAt, "real terrain must naturally initiate recovery").not.toBeNull();
        expect(releasedAt, "the initial recovery must finish, not just keep reversing").not.toBeNull();
        expect(releasedAt!).toBeLessThanOrEqual(300);
        expect(actualAsternSeconds).toBeGreaterThan(1);
        expect(firstReverseStarts).toBe(1);
        expect(longestStopped).toBeLessThan(30);
        expect(firstRecoveryGrounded).toBe(0);
        expect(afterGrounded).toBe(0);
        expect(afterNormalSeconds).toBeGreaterThanOrEqual(59.99);
        expect(afterTravel).toBeGreaterThan(250);
        expect(afterDisplacement).toBeGreaterThan(250);
        expect(maxRudder).toBeLessThanOrEqual(.82);
        expect(own.performance).toEqual(initialPerformance);
        expect(own.developer?.enabled ?? false).toBe(false);
        // The full 480s observation deliberately remains in the report. Later
        // contact with another shore segment is not evidence of this first
        // recovery failing, nor is it claimed solved by this bounded regression.
      }, 15000);
    }
  }

  it("withholds reverse power after an engine is destroyed during a real extended recovery", () => {
    const { own, session } = fixture("player", .3);
    const calls = vi.spyOn(AiNavigationRecovery.prototype, "command");
    try {
      let navigation: { recovering: boolean; throttleLimit?: number } | undefined;
      for (let tick = 0; tick < 100 / FIXED_STEP; ++tick) {
        session.step(new Map(), FIXED_STEP);
        navigation = calls.mock.results.at(-1)?.value;
        calls.mockClear();
      }
      expect(navigation).toMatchObject({ recovering: true, throttleLimit: -.25 });
      expect(own.speedKnots).toBeLessThan(-1);
      own.modules.engine.health = 0;
      // Let the existing 0.5s command cache expire, without skipping physics.
      for (let tick = 0; tick < 1 / FIXED_STEP; ++tick) {
        session.step(new Map(), FIXED_STEP);
        navigation = calls.mock.results.at(-1)?.value;
        calls.mockClear();
      }
      expect(navigation).toMatchObject({ recovering: true, throttleLimit: 0 });
      const speed = own.speedKnots, before = { ...own.position };
      for (let tick = 0; tick < 1 / FIXED_STEP; ++tick) {
        session.step(new Map(), FIXED_STEP);
        navigation = calls.mock.results.at(-1)?.value;
        expect(navigation?.throttleLimit).toBe(0);
        calls.mockClear();
      }
      expect(own.speedKnots).toBe(speed);
      expect(speed).toBeLessThan(-1);
      expect(distance(before, own.position)).toBeGreaterThan(.5);
      expect(own.navigationZone).not.toBe("grounded");
    } finally { calls.mockRestore(); }
  });
});

// Small branch-boundary checks use public hull placement only. The actual
// recovery acceptance above always uses a fresh, unmodified production session.
function marginGuard() {
  const { own } = fixture("player", .8555);
  own.position = { x: -2019.1493884205997, y: 0, z: 692.9139076394498 };
  own.previousPosition = { ...own.position };
  const recovery = new AiNavigationRecovery();
  expect(recovery.command("atoll-prototype", own, 2.1, 0)).toMatchObject({ recovering: true, throttleLimit: -.25 });
  return { own, recovery };
}

describe("safe-water extended battleship reverse attempt bounds", () => {
  it("does not end a battleship retreat at 65m while its real bow corridor remains blocked", () => {
    const { own, recovery } = marginGuard();
    own.position.x -= Math.sin(own.heading) * 70;
    own.position.z -= Math.cos(own.heading) * 70;
    own.previousPosition = { ...own.position };
    expect(recovery.command("atoll-prototype", own, 2.1, 13))
      .toMatchObject({ recovering: true, throttleLimit: -.25 });
  });

  it("does not treat the 240s limit as permission to move a hull that is still on real dry terrain", () => {
    const { own, recovery } = marginGuard();
    own.position = { x: -650, y: 0, z: 850 };
    own.previousPosition = { ...own.position };
    own.navigationZone = terrainNavigationAt("atoll-prototype", own.position.x, own.position.z,
      shipDraftMeters(own.shipClassId)).kind;
    expect(own.navigationZone).toBe("grounded");
    expect(recovery.command("atoll-prototype", own, 2.1, 240))
      .toMatchObject({ recovering: true, throttleLimit: 0 });
    expect(recovery.command("atoll-prototype", own, 2.1, 241))
      .toMatchObject({ recovering: true, throttleLimit: 0 });
  });

  for (const shipClassId of ["fletcher", "cleveland"] as const) {
    it(shipClassId + " retains the original 65m short-recovery handoff", () => {
      const own = createDeveloperShipState({ id: "short-recovery", team: "player", shipClassId,
        position: { x: 0, y: 0, z: 0 }, heading: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
      const recovery = new AiNavigationRecovery();
      // Public contact-state fixture isolates the legacy branch; no private
      // recovery field is seeded or bypassed. Physical acceptance is above.
      own.navigationZone = "grounded";
      expect(recovery.command("open-sea-range", own, Math.PI, 0))
        .toMatchObject({ recovering: true, throttleLimit: -.25 });
      own.navigationZone = "deep"; own.position.z = -70;
      expect(recovery.command("open-sea-range", own, Math.PI, 13))
        .toMatchObject({ recovering: true, throttleLimit: .18 });
    });
  }

  it("returns to braked reorientation at 45s when no real displacement has occurred", () => {
    const { own, recovery } = marginGuard();
    expect(recovery.command("atoll-prototype", own, 2.1, 44)).toMatchObject({ recovering: true, throttleLimit: -.25 });
    expect(recovery.command("atoll-prototype", own, 2.1, 45)).toMatchObject({ recovering: true, throttleLimit: 0 });
  });

  it("hands a still-safe hull back to reorientation at the 240s reverse-attempt cap", () => {
    const { own, recovery } = marginGuard();
    own.position.x -= Math.sin(own.heading) * 20;
    own.position.z -= Math.cos(own.heading) * 20;
    own.previousPosition = { ...own.position };
    expect(recovery.command("atoll-prototype", own, 2.1, 239)).toMatchObject({ recovering: true, throttleLimit: -.25 });
    expect(recovery.command("atoll-prototype", own, 2.1, 240)).toMatchObject({ recovering: true, throttleLimit: 0 });
  });
});
