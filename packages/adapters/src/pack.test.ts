import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPack } from "./pack.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pack-"));
  writeFileSync(
    join(dir, "festival.json"),
    JSON.stringify({ slug: "test26", name: "Test Fest", timezone: "Europe/Dublin", dayCutoffHour: 6, catchFraction: 0.5, nightGapHours: 3, days: { fri: [2026, 7, 31] } }),
  );
  writeFileSync(
    join(dir, "venues.json"),
    JSON.stringify({ venues: [{ slug: "main", name: "Main" }], limitedCapacity: ["main"], walk: { defaultMinutes: 10, edges: [] } }),
  );
  mkdirSync(join(dir, "knowledge", "2026"), { recursive: true });
  writeFileSync(join(dir, "knowledge", "amenities.md"), "top-level evergreen doc");
  writeFileSync(join(dir, "knowledge", "2026", "lineup.md"), "year-specific doc");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("createPack", () => {
  test("loadManifest reads festival.json", () => {
    const m = createPack(dir).loadManifest();
    expect(m.slug).toBe("test26");
    expect(m.dayCutoffHour).toBe(6);
  });

  test("loadVenues projects to VenuesConfig", () => {
    const v = createPack(dir).loadVenues();
    expect(v.venues).toEqual([{ slug: "main", name: "Main" }]);
    expect(v.limitedCapacity).toEqual(["main"]);
    expect(v.walk.defaultMinutes).toBe(10);
  });

  test("loadKnowledge recurses into year subdirs, keyed by basename", () => {
    const k = createPack(dir).loadKnowledge();
    expect(k.amenities).toBe("top-level evergreen doc");
    expect(k.lineup).toBe("year-specific doc"); // proves recursion into knowledge/2026/
  });

  test("loadKnowledge tolerates a missing knowledge dir", () => {
    const empty = mkdtempSync(join(tmpdir(), "pack-empty-"));
    try {
      expect(createPack(empty).loadKnowledge()).toEqual({});
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("scheduleFile is packDir/schedule.json", () => {
    expect(createPack(dir).scheduleFile).toBe(join(dir, "schedule.json"));
  });
});
