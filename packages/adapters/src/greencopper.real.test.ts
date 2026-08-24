/**
 * The parser against a REAL Greencopper bundle, not a hand-made fixture — the
 * committed ep26 snapshot. A synthetic fixture can only test what I already
 * believed about the format; this catches the shape actually shipping.
 */
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseGreencopperLineup, greencopperVenuesFromBundle, type GreencopperBundle } from "./greencopper.js";

const BUNDLE = join(dirname(fileURLToPath(import.meta.url)), "../../../festivals/ep26/bundle");
const present = existsSync(join(BUNDLE, "scheduleItems.json"));
const j = <T,>(f: string): T => JSON.parse(readFileSync(join(BUNDLE, f), "utf8")) as T;

describe.skipIf(!present)("real Electric Picnic bundle", () => {
  const bundle: GreencopperBundle = {
    strings: j("strings.json"),
    stages: j("stages.json"),
    scheduleItems: j("scheduleItems.json"),
    timeSlots: j("timeSlots.json"),
  };
  const sets = parseGreencopperLineup(bundle);

  test("parses a full festival programme", () => {
    expect(sets.length).toBeGreaterThan(800);
    expect(greencopperVenuesFromBundle(bundle).length).toBeGreaterThan(30);
  });

  test("resolves every name and stage through the string table", () => {
    expect(sets.filter((s) => /^(activity|location)_/.test(s.name))).toEqual([]);
    expect(sets.filter((s) => /^(activity|location)-/.test(s.stage))).toEqual([]);
  });

  test("durations are sane", () => {
    expect(sets.filter((s) => s.durationMin <= 0 || s.durationMin > 24 * 60)).toEqual([]);
  });

  test("keeps the feed's local wall time (no double zone conversion)", () => {
    // Every set falls inside the real festival window, 27-31 Aug 2026.
    for (const s of sets) {
      expect(s.start.getTime()).toBeGreaterThanOrEqual(Date.parse("2026-08-27T00:00:00Z"));
      expect(s.start.getTime()).toBeLessThan(Date.parse("2026-09-01T00:00:00Z"));
    }
  });

  test("is sorted deterministically, so a re-fetch diffs only real changes", () => {
    const copy = [...sets].sort(
      (a, b) => a.start.getTime() - b.start.getTime() || a.stage.localeCompare(b.stage) || a.name.localeCompare(b.name),
    );
    expect(sets.map((s) => `${s.start.toISOString()}|${s.stage}|${s.name}`)).toEqual(
      copy.map((s) => `${s.start.toISOString()}|${s.stage}|${s.name}`),
    );
  });
});
