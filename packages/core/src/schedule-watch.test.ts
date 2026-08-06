import { describe, expect, test } from "vitest";
import { diffLineups } from "./schedule-watch.js";
import type { ArtistSet } from "./models.js";

const set = (name: string, stage: string, startIso: string): ArtistSet => {
  const start = new Date(startIso);
  return { name, slug: name.toLowerCase(), stage, start, end: new Date(start.getTime() + 3600000), durationMin: 60 };
};

describe("diffLineups", () => {
  test("reports added, removed and moved (same name+stage, new start)", () => {
    const ref = [
      set("Stay", "port", "2026-06-05T20:00:00+02:00"),
      set("Gone", "cupra", "2026-06-05T21:00:00+02:00"),
      set("Mover", "occident", "2026-06-05T22:00:00+02:00"),
    ];
    const cur = [
      set("Stay", "port", "2026-06-05T20:00:00+02:00"),
      set("Mover", "occident", "2026-06-05T23:00:00+02:00"), // moved +1h
      set("New", "revolut", "2026-06-05T19:00:00+02:00"),
    ];
    const ch = diffLineups(ref, cur);
    expect(ch.added.map((s) => s.name)).toEqual(["New"]);
    expect(ch.removed.map((s) => s.name)).toEqual(["Gone"]);
    expect(ch.moved).toHaveLength(1);
    expect(ch.moved[0]!.set.name).toBe("Mover");
    expect(ch.moved[0]!.fromStart.toISOString()).toBe(new Date("2026-06-05T22:00:00+02:00").toISOString());
  });

  test("identical lineups produce no changes", () => {
    const a = [set("X", "port", "2026-06-05T20:00:00+02:00")];
    const ch = diffLineups(a, a);
    expect(ch.added).toHaveLength(0);
    expect(ch.removed).toHaveLength(0);
    expect(ch.moved).toHaveLength(0);
  });

  // Residency case: an artist with SEVERAL sets on the same stage (The Last City /
  // Ping Pong Disco run these all weekend). Keying on name+stage alone collapses them
  // to one, which invented phantom MOVEs in the real ATN26 diff.
  test("multi-set artist on one stage: unchanged sets are not reported as moves", () => {
    const ref = [
      set("Residency", "last-city", "2026-07-31T19:00:00+01:00"),
      set("Residency", "last-city", "2026-08-01T17:00:00+01:00"),
    ];
    const cur = [
      set("Residency", "last-city", "2026-07-31T19:00:00+01:00"),
      set("Residency", "last-city", "2026-08-01T17:00:00+01:00"),
    ];
    const ch = diffLineups(ref, cur);
    expect(ch.added).toHaveLength(0);
    expect(ch.removed).toHaveLength(0);
    expect(ch.moved).toHaveLength(0);
  });

  test("multi-set artist on one stage: only the retimed set is a move", () => {
    const ref = [
      set("Residency", "last-city", "2026-07-31T19:00:00+01:00"),
      set("Residency", "last-city", "2026-08-02T22:00:00+01:00"),
    ];
    const cur = [
      set("Residency", "last-city", "2026-07-31T19:00:00+01:00"), // untouched
      set("Residency", "last-city", "2026-08-02T21:30:00+01:00"), // pulled 30m earlier
    ];
    const ch = diffLineups(ref, cur);
    expect(ch.added).toHaveLength(0);
    expect(ch.removed).toHaveLength(0);
    expect(ch.moved).toHaveLength(1);
    expect(ch.moved[0]!.set.start.toISOString()).toBe(new Date("2026-08-02T21:30:00+01:00").toISOString());
    expect(ch.moved[0]!.fromStart.toISOString()).toBe(new Date("2026-08-02T22:00:00+01:00").toISOString());
  });

  test("a cancelled set among several on one stage is REMOVED, not moved", () => {
    const ref = [
      set("Residency", "last-city", "2026-07-31T19:00:00+01:00"),
      set("Residency", "last-city", "2026-08-01T17:00:00+01:00"),
    ];
    const cur = [set("Residency", "last-city", "2026-07-31T19:00:00+01:00")];
    const ch = diffLineups(ref, cur);
    expect(ch.moved).toHaveLength(0);
    expect(ch.added).toHaveLength(0);
    expect(ch.removed).toHaveLength(1);
    expect(ch.removed[0]!.start.toISOString()).toBe(new Date("2026-08-01T17:00:00+01:00").toISOString());
  });
});

