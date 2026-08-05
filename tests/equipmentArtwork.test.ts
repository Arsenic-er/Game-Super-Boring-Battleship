import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EQUIPMENT_CATALOG } from "../src/profile/equipmentCatalog";
import { equipmentArtworkMarkup, equipmentArtworkUrl } from "../src/ui/equipmentArtwork";

describe("historical equipment artwork", () => {
  it("provides one local SVG for every equipment model", () => {
    expect(EQUIPMENT_CATALOG).toHaveLength(32);
    expect(new Set(EQUIPMENT_CATALOG.map((item) => item.artwork)).size).toBe(32);
    const contents = EQUIPMENT_CATALOG.map((item) => {
      const file = fileURLToPath(new URL(`../public/${item.artwork}`, import.meta.url));
      expect(existsSync(file), item.id).toBe(true);
      const content = readFileSync(file, "utf8");
      expect(content.length, item.id).toBeGreaterThan(450);
      expect(content).toContain(`data-equipment-id="${item.id}"`);
      expect(content).not.toMatch(/(?:href|src)=["']https?:/i);
      expect(content).not.toContain("<script");
      return content;
    });
    expect(new Set(contents).size).toBe(32);
  });

  it("renders accessible non-duplicating card markup", () => {
    for (const item of EQUIPMENT_CATALOG) {
      expect(equipmentArtworkUrl(item)).toContain(item.artwork);
      const markup = equipmentArtworkMarkup(item);
      expect(markup).toContain(`data-equipment-art="${item.id}"`);
      expect(markup).toContain('alt=""');
      expect(markup).toContain("loading=\"lazy\"");
    }
  });
});
