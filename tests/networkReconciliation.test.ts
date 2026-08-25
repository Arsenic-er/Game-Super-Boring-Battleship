import { describe, expect, it } from "vitest";
import { reconciliationMode } from "../src/net/reconciliation";

describe("network reconciliation", () => {
  it("blends tiny positional drift", () => {
    expect(reconciliationMode(0, 0)).toBe("blend");
    expect(reconciliationMode(4.99, 9.9)).toBe("blend");
  });

  it("converges medium drift without snapping", () => {
    expect(reconciliationMode(5, 0)).toBe("converge");
    expect(reconciliationMode(19.99, 9.99)).toBe("converge");
  });

  it("snaps when the error is too large in distance or heading", () => {
    expect(reconciliationMode(20, 0)).toBe("snap");
    expect(reconciliationMode(0, 10)).toBe("snap");
    expect(reconciliationMode(32, 4)).toBe("snap");
  });
});
