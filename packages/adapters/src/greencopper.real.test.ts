import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseGreencopperLineup, greencopperVenuesFromBundle, type GreencopperBundle } from "./greencopper.js";

const D = "/home/colm/.claude/jobs/5834c5c1/tmp/dec39";
const has = existsSync(`${D}/event/data/scheduleItems.json`);
const j = (p: string) => JSON.parse(readFileSync(`${D}/${p}`, "utf8"));

describe.skipIf(!has)("real EP v39 bundle", () => {
  const bundle: GreencopperBundle = {
    strings: j("core/strings/en-GB.json"),
    stages: j("event/data/stages.json"),
    scheduleItems: j("event/data/scheduleItems.json"),
    timeSlots: j("event/data/timeSlots.json"),
  };
  const sets = parseGreencopperLineup(bundle);
  test("counts", () => {
    console.log("SETS:", sets.length, "VENUES:", greencopperVenuesFromBundle(bundle).length);
    expect(sets.length).toBeGreaterThan(500);
  });
  test("no unresolved keys leak", () => {
    expect(sets.filter(s => /^(activity|location)_/.test(s.name))).toEqual([]);
    expect(sets.filter(s => /^(activity|location)-/.test(s.stage))).toEqual([]);
  });
  test("sane durations", () => {
    expect(sets.filter(s => s.durationMin <= 0 || s.durationMin > 24*60).map(b=>`${b.name}:${b.durationMin}`)).toEqual([]);
  });
  test("window", () => {
    console.log("FIRST:", sets[0]!.start.toISOString(), "|", sets[0]!.name, "@", sets[0]!.stage);
    const last = sets[sets.length - 1]!;
    console.log("LAST :", last.start.toISOString(), "|", last.name, "@", last.stage);
    expect(sets[0]!.start.getUTCFullYear()).toBe(2026);
  });
});
