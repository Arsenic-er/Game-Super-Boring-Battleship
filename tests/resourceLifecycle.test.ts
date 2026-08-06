import { describe, expect, it, vi } from "vitest";
import { disposeProjectileTrailResources } from "../src/render/resourceLifecycle";

describe("projectile render resource lifecycle", () => {
  it("disposes torpedo wake planes together with the core trail and plume", () => {
    const core = { dispose: vi.fn() };
    const plume = { dispose: vi.fn() };
    const wakePlanes = [
      { dispose: vi.fn() },
      { dispose: vi.fn() },
      { dispose: vi.fn() },
    ];

    disposeProjectileTrailResources({ core, plume, wakePlanes });

    expect(core.dispose).toHaveBeenCalledOnce();
    expect(plume.dispose).toHaveBeenCalledOnce();
    for (const wake of wakePlanes) expect(wake.dispose).toHaveBeenCalledOnce();
  });

  it("accepts an absent trail and optional resources", () => {
    expect(() => disposeProjectileTrailResources(undefined)).not.toThrow();
    const core = { dispose: vi.fn() };

    disposeProjectileTrailResources({ core });

    expect(core.dispose).toHaveBeenCalledOnce();
  });
});
