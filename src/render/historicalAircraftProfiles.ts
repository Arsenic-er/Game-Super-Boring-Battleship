import type { AircraftRole, Team } from "../sim/types";

export type HistoricalAircraftId =
  | "f6f-3-hellcat" | "a6m2-zero" | "sbd-2-dauntless"
  | "d3a1-val" | "tbf-1-avenger" | "b5n2-kate";
export type AircraftPaint = readonly [number, number, number];
/** Half-wing sections: semispan fraction, leading Z, trailing Z, thickness, height. */
export type AircraftWingSection = readonly [number, number, number, number, number];

export interface HistoricalAircraftProfile {
  readonly id: HistoricalAircraftId;
  readonly name: string;
  readonly role: AircraftRole;
  readonly year: number;
  readonly supportGroup: "us-navy" | "japanese-navy";
  /** Metres, including the spinner. Geometry axes are +Z nose, +Y up. */
  readonly length: number;
  readonly span: number;
  readonly radius: readonly [number, number];
  readonly cowlRadius: number;
  readonly cowlStart: number;
  readonly canopy: readonly [number, number, number, number]; // aft Z, forward Z, width, height
  readonly canopyFrames: number;
  readonly wing: readonly AircraftWingSection[];
  readonly tailSpan: number;
  readonly tailChord: number;
  readonly finHeight: number;
  readonly finSweep: number;
  readonly propRadius: number;
  readonly upper: AircraftPaint;
  readonly lower: AircraftPaint;
  readonly cowl: AircraftPaint;
  readonly features: readonly ("fixed-spatted-gear" | "perforated-dive-brakes" | "dorsal-turret" | "external-torpedo" | "internal-torpedo-bay" | "bomb-crutch")[];
}

/** Original silhouette studies, not airworthiness drawings. See docs/historical-models-aircraft.md. */
export const HISTORICAL_AIRCRAFT_PROFILES: Readonly<Record<HistoricalAircraftId, HistoricalAircraftProfile>> = {
  "f6f-3-hellcat": {
    id: "f6f-3-hellcat", name: "Grumman F6F-3 Hellcat", role: "fighter", year: 1943,
    supportGroup: "us-navy", length: 10.21, span: 13.04,
    radius: [0.78, 0.89], cowlRadius: 0.83, cowlStart: 0.28,
    canopy: [-0.85, 1.50, 0.94, 0.67], canopyFrames: 4,
    wing: [[0, 2.12, -1.24, 0.32, -0.37], [0.18, 2.07, -1.21, 0.29, -0.37], [0.68, 1.47, -0.86, 0.19, -0.09], [0.90, 1.13, -0.63, 0.11, 0.06], [0.98, 0.74, -0.42, 0.06, 0.10], [1, 0.27, 0.00, 0.025, 0.11]],
    tailSpan: 4.48, tailChord: 1.70, finHeight: 1.91, finSweep: 0.50, propRadius: 1.99,
    upper: [0.20, 0.31, 0.40], lower: [0.70, 0.74, 0.73], cowl: [0.18, 0.28, 0.37], features: [],
  },
  "a6m2-zero": {
    id: "a6m2-zero", name: "Mitsubishi A6M2 Model 21 Zero", role: "fighter", year: 1941,
    supportGroup: "japanese-navy", length: 9.06, span: 12.00,
    radius: [0.56, 0.67], cowlRadius: 0.67, cowlStart: 0.30,
    canopy: [-1.20, 1.14, 0.76, 0.58], canopyFrames: 5,
    wing: [[0, 1.65, -1.10, 0.24, -0.29], [0.16, 1.64, -1.08, 0.22, -0.29], [0.63, 1.27, -0.72, 0.15, -0.02], [0.86, 0.94, -0.50, 0.09, 0.14], [0.97, 0.51, -0.26, 0.045, 0.22], [1, 0.18, 0.04, 0.016, 0.24]],
    tailSpan: 3.96, tailChord: 1.44, finHeight: 1.48, finSweep: 0.64, propRadius: 1.45,
    upper: [0.70, 0.71, 0.62], lower: [0.76, 0.77, 0.70], cowl: [0.12, 0.15, 0.17], features: [],
  },
  "sbd-2-dauntless": {
    id: "sbd-2-dauntless", name: "Douglas SBD-2 Dauntless", role: "diveBomber", year: 1941,
    supportGroup: "us-navy", length: 9.957, span: 12.649,
    radius: [0.64, 0.75], cowlRadius: 0.72, cowlStart: 0.32,
    canopy: [-2.00, 1.56, 0.85, 0.57], canopyFrames: 6,
    wing: [[0, 1.91, -1.30, 0.31, -0.30], [0.23, 1.91, -1.30, 0.28, -0.30], [0.73, 1.42, -0.83, 0.17, 0.00], [0.92, 0.95, -0.59, 0.09, 0.16], [0.98, 0.55, -0.28, 0.045, 0.21], [1, 0.21, 0.07, 0.017, 0.22]],
    tailSpan: 4.16, tailChord: 1.53, finHeight: 1.68, finSweep: 0.65, propRadius: 1.60,
    upper: [0.34, 0.45, 0.52], lower: [0.73, 0.76, 0.75], cowl: [0.30, 0.41, 0.49],
    features: ["perforated-dive-brakes", "bomb-crutch"],
  },
  "d3a1-val": {
    id: "d3a1-val", name: "Aichi D3A1 Val", role: "diveBomber", year: 1941,
    supportGroup: "japanese-navy", length: 10.20, span: 14.37,
    radius: [0.62, 0.72], cowlRadius: 0.70, cowlStart: 0.31,
    canopy: [-1.96, 1.40, 0.78, 0.53], canopyFrames: 6,
    wing: [[0, 1.83, -1.56, 0.30, -0.32], [0.19, 1.85, -1.55, 0.28, -0.32], [0.56, 1.69, -1.25, 0.22, -0.04], [0.80, 1.22, -0.76, 0.14, 0.15], [0.95, 0.67, -0.35, 0.065, 0.26], [1, 0.19, 0.05, 0.018, 0.30]],
    tailSpan: 4.44, tailChord: 1.58, finHeight: 1.57, finSweep: 0.80, propRadius: 1.55,
    upper: [0.67, 0.70, 0.61], lower: [0.75, 0.77, 0.69], cowl: [0.11, 0.14, 0.15],
    features: ["fixed-spatted-gear", "bomb-crutch"],
  },
  "tbf-1-avenger": {
    id: "tbf-1-avenger", name: "Grumman TBF-1 Avenger", role: "torpedoBomber", year: 1942,
    supportGroup: "us-navy", length: 12.471, span: 16.510,
    radius: [0.84, 1.04], cowlRadius: 0.91, cowlStart: 0.31,
    canopy: [-1.26, 2.06, 1.02, 0.63], canopyFrames: 5,
    wing: [[0, 2.37, -1.77, 0.43, -0.40], [0.16, 2.36, -1.74, 0.39, -0.40], [0.65, 1.52, -1.30, 0.24, -0.04], [0.89, 1.06, -1.03, 0.14, 0.13], [0.98, 0.70, -0.74, 0.065, 0.20], [1, 0.12, -0.15, 0.022, 0.22]],
    tailSpan: 5.39, tailChord: 2.10, finHeight: 2.28, finSweep: 0.58, propRadius: 1.98,
    upper: [0.24, 0.36, 0.45], lower: [0.71, 0.75, 0.75], cowl: [0.21, 0.32, 0.40],
    features: ["dorsal-turret", "internal-torpedo-bay"],
  },
  "b5n2-kate": {
    id: "b5n2-kate", name: "Nakajima B5N2 Kate", role: "torpedoBomber", year: 1941,
    supportGroup: "japanese-navy", length: 10.30, span: 15.50,
    radius: [0.60, 0.72], cowlRadius: 0.68, cowlStart: 0.33,
    canopy: [-2.40, 1.53, 0.83, 0.54], canopyFrames: 7,
    wing: [[0, 1.76, -1.77, 0.32, -0.33], [0.17, 1.76, -1.73, 0.29, -0.33], [0.65, 1.12, -1.20, 0.19, 0.00], [0.88, 0.66, -0.93, 0.11, 0.18], [0.98, 0.27, -0.59, 0.05, 0.26], [1, -0.05, -0.19, 0.017, 0.28]],
    tailSpan: 4.56, tailChord: 1.60, finHeight: 1.74, finSweep: 0.74, propRadius: 1.56,
    upper: [0.23, 0.34, 0.27], lower: [0.69, 0.73, 0.66], cowl: [0.10, 0.14, 0.13],
    features: ["external-torpedo"],
  },
};

const DEFAULT_SUPPORT_AIRCRAFT: Record<Team, Record<AircraftRole, HistoricalAircraftId>> = {
  player: { fighter: "f6f-3-hellcat", diveBomber: "sbd-2-dauntless", torpedoBomber: "tbf-1-avenger" },
  enemy: { fighter: "a6m2-zero", diveBomber: "d3a1-val", torpedoBomber: "b5n2-kate" },
};

/** Team selects a visual support group only; it does not assert fleet nationality. */
export function historicalAircraftProfile(team: Team, role: AircraftRole): HistoricalAircraftProfile {
  return HISTORICAL_AIRCRAFT_PROFILES[DEFAULT_SUPPORT_AIRCRAFT[team][role]];
}
