import { describe, expect, test } from "vitest";
import type { ArtistSet } from "@festival-bot/core";
import { renderWhatson } from "./format.js";
import type { Runtime } from "./runtime.js";

const mk = (name: string, startIso: string, endIso: string, stage = "main"): ArtistSet => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  stage,
  start: new Date(startIso),
  end: new Date(endIso),
  durationMin: (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
});

function fakeRuntime(sets: ArtistSet[]): Runtime {
  return {
    module: { manifest: { timezone: "Europe/Madrid", slug: "fake" } } as Runtime["module"],
    planner: {} as Runtime["planner"],
    calendar: {} as Runtime["calendar"],
    sets,
    venueName: (s) => s,
    limited: () => false,
  };
}

describe("renderWhatson — empty-result coverage hint", () => {
  test("empty now+next with a loaded lineup prints the covered date range", () => {
    const sets = [
      mk("Alpha", "2026-05-30T20:00:00Z", "2026-05-30T21:00:00Z"),
      mk("Beta", "2026-05-31T20:00:00Z", "2026-05-31T21:30:00Z"),
    ];
    const rt = fakeRuntime(sets);
    const out = renderWhatson(rt, new Date("2026-05-29T20:00:00Z"), [], []);
    expect(out).toContain("this festival's lineup covers");
    expect(out).toContain("Sat 30 May");
    expect(out).toContain("Sun 31 May");
    expect(out).toContain("nothing loaded for the day you asked about");
  });

  test("non-empty now does NOT print the coverage hint", () => {
    const sets = [mk("Alpha", "2026-05-30T20:00:00Z", "2026-05-30T21:00:00Z")];
    const rt = fakeRuntime(sets);
    const out = renderWhatson(rt, new Date("2026-05-30T20:30:00Z"), sets, []);
    expect(out).not.toContain("this festival's lineup covers");
  });

  test("non-empty next does NOT print the coverage hint", () => {
    const sets = [mk("Alpha", "2026-05-30T20:00:00Z", "2026-05-30T21:00:00Z")];
    const rt = fakeRuntime(sets);
    const out = renderWhatson(rt, new Date("2026-05-30T19:00:00Z"), [], sets);
    expect(out).not.toContain("this festival's lineup covers");
  });

  test("completely empty lineup prints a plain no-lineup message, not a bogus range", () => {
    const rt = fakeRuntime([]);
    const out = renderWhatson(rt, new Date("2026-05-29T20:00:00Z"), [], []);
    expect(out).toContain("no lineup loaded");
    expect(out).not.toContain("this festival's lineup covers");
  });
});
