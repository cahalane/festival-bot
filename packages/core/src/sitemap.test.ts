import { describe, expect, test } from "vitest";
import { poisPublished, type SitePoi } from "./sitemap.js";

const poi = (name: string, category: string, backdrop?: boolean): SitePoi => ({
  id: name, name, category, lat: 52.29, lng: -7.37, ...(backdrop !== undefined ? { backdrop } : {}),
});

/**
 * A map "published" is not the same as a map endpoint returning 200.
 *
 * One festival's 2026 map went live as four corner polygons for the raster
 * backdrop and NOTHING else — every real category empty. A bare length check
 * counts those tiles as data and fires the watch on a map with no information
 * in it.
 */
describe("poisPublished", () => {
  test("false when the response is empty", () => {
    expect(poisPublished([])).toBe(false);
  });

  test("false when only backdrop tiles are present", () => {
    expect(poisPublished([poi("overlay-1", "map_overlay_image"), poi("overlay-2", "map_overlay_image")])).toBe(false);
  });

  test("true once a POI carries real information", () => {
    expect(poisPublished([poi("overlay-1", "map_overlay_image"), poi("Main Stage", "Stages")])).toBe(true);
  });

  test("false when a POI is flagged backdrop even under a normal, real category (mis-categorised tile)", () => {
    expect(poisPublished([poi("weird-tile", "Stages", true)])).toBe(false);
  });

  test("category signal alone still works with no backdrop flag present", () => {
    expect(poisPublished([poi("overlay-1", "map_overlay_image")])).toBe(false);
    expect(poisPublished([poi("Main Stage", "Stages")])).toBe(true);
  });
});
