import { describe, expect, it } from "vitest";
import { fireCommandActive, isGameplayKeyCode } from "../src/controllers/playerInput";

describe("player fire input", () => {
  it("preserves a quick tap and keeps firing while Space is held", () => {
    expect(fireCommandActive(true, false)).toBe(true);
    expect(fireCommandActive(false, true)).toBe(true);
    expect(fireCommandActive(true, true)).toBe(true);
    expect(fireCommandActive(false, false)).toBe(false);
  });

  it("does not consume Tab while maps and menus own keyboard focus", () => {
    expect(isGameplayKeyCode("Space")).toBe(true);
    expect(isGameplayKeyCode("KeyM")).toBe(false);
    expect(isGameplayKeyCode("Tab")).toBe(false);
  });
});
