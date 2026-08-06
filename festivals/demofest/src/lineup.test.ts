import { describe, expect, test } from "vitest";
import { createFestival } from "./index.js";

/**
 * demofest exists so a fresh clone runs. It must therefore need NOTHING: no
 * secrets, no network, no cache. If this test ever needs a fixture beyond the
 * committed schedule.json, the fixture is wrong.
 */
describe("demofest", () => {
  test("loads its lineup with no config at all", async () => {
    const sets = await createFestival().sources.lineup.loadSets();
    expect(sets.length).toBeGreaterThan(10);
  });

  test("spans three stages", () => {
    expect(createFestival().venues.venues).toHaveLength(3);
  });

  test("gives every set a real duration", async () => {
    const sets = await createFestival().sources.lineup.loadSets();
    for (const s of sets) {
      expect(s.durationMin).toBeGreaterThan(0);
      expect(s.end.getTime()).toBeGreaterThan(s.start.getTime());
    }
  });

  test("declares no favourites source without credentials", () => {
    expect(createFestival().sources.favourites).toBeUndefined();
  });

  test("has a walk edge between every pair of stages", () => {
    // The planner's routing is only exercised if travel actually costs something.
    const { venues, walk } = createFestival().venues;
    const pairs = (venues.length * (venues.length - 1)) / 2;
    expect(walk.edges.length).toBe(pairs);
  });
});
