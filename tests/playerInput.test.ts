import { describe, expect, it } from "vitest";
import { fireCommandActive } from "../src/controllers/playerInput";

describe("player fire input", () => {
  it("preserves a quick tap and keeps firing while Space is held", () => {
    expect(fireCommandActive(true, false)).toBe(true);
    expect(fireCommandActive(false, true)).toBe(true);
    expect(fireCommandActive(true, true)).toBe(true);
    expect(fireCommandActive(false, false)).toBe(false);
  });
});
