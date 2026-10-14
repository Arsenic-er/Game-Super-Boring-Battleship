import { describe, expect, it } from "vitest";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import { SENSOR } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import { WEATHER_IDS } from "../src/sim/weather";
import type { Team } from "../src/sim/types";

function fixture(team: Team) {
  const state = createInitialState(0x715ff, "battle");
  state.mapId = "open-sea-range";
  state.time = .5;
  const self = createDeveloperShipState({
    id: "viewer", team, shipClassId: "fletcher", position: { x: 0, y: 0, z: 0 },
  });
  const target = createDeveloperShipState({
    id: "target", team: team === "player" ? "enemy" : "player", shipClassId: "richelieu",
    position: { x: 0, y: 0, z: 0 },
  });
  target.lastMainGunFiredAt = 0;
  target.position.z = .75 * Math.min(SENSOR.gunBloomDetectionMeters, effectiveMainBattery(target).maximumRangeMeters);
  target.previousPosition = { ...target.position };
  state.ships = [self, target];
  state.airSquadrons = [];
  return { state, self, target };
}

describe("public weather observation and optical sample invalidation", () => {
  for (const team of ["player", "enemy"] as const) {
    it.each(WEATHER_IDS)(team + ": exposes %s in fresh and cached observations without adding private target state", weather => {
      const { state, self } = fixture(team);
      state.weatherId = weather;
      const fresh = observe(state, self.id);
      const cached = observe(state, self.id);
      expect(fresh.weatherId).toBe(weather);
      expect(cached.weatherId).toBe(weather);
      expect(cached.contacts).toBe(fresh.contacts);
      expect(state.sensorSnapshots[self.id]!.weatherId).toBe(weather);
      for (const contact of fresh.contacts) {
        expect(contact).not.toHaveProperty("modules");
        expect(contact).not.toHaveProperty("hull");
        expect(contact).not.toHaveProperty("aimPoint");
      }
    });

    it(team + ": weather changes invalidate optics within the same sample, without waiting 2.5 seconds", () => {
      const { state, self, target } = fixture(team);
      const clear = observe(state, self.id);
      expect(clear.contacts.map(contact => contact.id)).toContain(target.id);
      const sample = state.sensorSnapshots[self.id]!.sampleIndex;
      const seed = state.randomSeed;
      state.weatherId = "sea-fog";
      const fog = observe(state, self.id);
      expect(fog.weatherId).toBe("sea-fog");
      expect(fog.contacts).toEqual([]);
      expect(state.sensorSnapshots[self.id]!.sampleIndex).toBe(sample);
      expect(state.randomSeed).toBe(seed);
      expect(state.time).toBe(.5);
      state.weatherId = "clear";
      const restored = observe(state, self.id);
      expect(restored.contacts).toEqual(clear.contacts);
      expect(restored.contacts).not.toBe(fog.contacts);
    });

    it(team + ": legacy snapshots without a weather cache key are sampled again", () => {
      const { state, self } = fixture(team);
      const clear = observe(state, self.id);
      delete state.sensorSnapshots[self.id]!.weatherId;
      state.weatherId = "sea-fog";
      expect(observe(state, self.id).contacts).toEqual([]);
      expect(state.sensorSnapshots[self.id]!.contacts).not.toBe(clear.contacts);
    });

    it(team + ": fog still permits the existing hydro close-range observation", () => {
      const { state, self, target } = fixture(team);
      state.weatherId = "sea-fog";
      self.hydroActiveRemaining = 10;
      target.position.z = 1_900;
      target.previousPosition = { ...target.position };
      const contact = observe(state, self.id).contacts.find(contact => contact.id === target.id);
      expect(contact).toBeDefined();
      expect(contact!.confidence).toBe(.98);
    });
  }
});
