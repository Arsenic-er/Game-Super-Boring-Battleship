import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("main voyage integration source contract", () => {
  it("returns to the retained LAN lobby without triggering leaveRoom through menu cleanup", async () => {
    const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
    const returned = source.match(/onLobbyReturned:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\},/)?.[1];
    expect(returned, "the runtime must retain a dedicated lobby-return hook").toBeDefined();
    expect(returned).toMatch(/returnToMainMenu\(false\)/);
    expect(returned).toMatch(/showMultiplayerLobby\(snapshot,\s*localPeerId\)/);
    expect(returned).not.toMatch(/leaveRoom\s*\(/);

    const cleanup = source.match(/function returnToMainMenu\(leaveRoom\s*=\s*true\):\s*void\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(cleanup, "ordinary menu exit must still default to leaving LAN").toBeDefined();
    expect(cleanup).toMatch(/if\s*\(\s*leaveRoom\s*&&\s*lanRuntime\??\.role\s*!==\s*"none"\s*\)\s*void\s+lanRuntime\.callbacks\.leaveRoom\(\)/);
    expect(cleanup?.match(/callbacks\.leaveRoom\(/g)).toHaveLength(1);
  });
});
