import { describe, expect, test } from "vitest";
import { starStateFrom, diffStars, renderStarDiff } from "./star-watch.js";

const map = (o: Record<string, string>): Map<string, string> => new Map(Object.entries(o));

describe("starStateFrom", () => {
  test("resolves each starred code to the act it currently points at", () => {
    const gets = { hl1: "pulp-1,fortho-1", hl2: "mike-1" };
    const state = starStateFrom(gets, map({ "pulp-1": "Pulp", "fortho-1": "For Those I Love", "mike-1": "MIKE" }));

    expect(state).toEqual({
      "pulp-1": "Pulp",
      "fortho-1": "For Those I Love",
      "mike-1": "MIKE",
    });
  });

  test("records a code that resolves to nothing, so a dead star is still tracked", () => {
    expect(starStateFrom({ hl1: "ghost-9" }, map({}))).toEqual({ "ghost-9": null });
  });

  test("ignores empty tiers and stray whitespace", () => {
    expect(starStateFrom({ hl1: "", hl2: " pulp-1 , ", hl3: undefined as unknown as string }, map({ "pulp-1": "Pulp" }))).toEqual({
      "pulp-1": "Pulp",
    });
  });
});

describe("diffStars", () => {
  // The point of the whole exercise: a cf-push can renumber the identity space a
  // star points at. Operator standing instruction, 2026-07-28: "Rather say 'hey,
  // Clashfinder dropped your star' than let it go out of sync."
  test("reports a star that stopped resolving", () => {
    const d = diffStars({ "mabfie1-1": "Mabfield Live Podcast with Getdown Services" }, { "mabfie1-1": null });

    expect(d.dropped).toEqual([{ code: "mabfie1-1", was: "Mabfield Live Podcast with Getdown Services" }]);
    expect(d.moved).toEqual([]);
  });

  test("reports a star that now points at a DIFFERENT act — the dangerous one", () => {
    const d = diffStars({ "talksi1-1": "Talks in the Tent: John Cooper Clarke" }, { "talksi1-1": "Talks in The Tent: David O'Doherty" });

    expect(d.moved).toEqual([
      {
        code: "talksi1-1",
        was: "Talks in the Tent: John Cooper Clarke",
        now: "Talks in The Tent: David O'Doherty",
      },
    ]);
  });

  test("says nothing about stars that are unchanged", () => {
    const same = { "pulp-1": "Pulp" };
    const d = diffStars(same, same);
    expect(d.dropped).toEqual([]);
    expect(d.moved).toEqual([]);
  });

  test("a code that was already dead and still is is not re-reported", () => {
    const d = diffStars({ "tradfo-1": null }, { "tradfo-1": null });
    expect(d.dropped).toEqual([]);
  });

  test("a newly starred code is not a problem and is not reported", () => {
    const d = diffStars({}, { "pulp-1": "Pulp" });
    expect(d.dropped).toEqual([]);
    expect(d.moved).toEqual([]);
  });

  test("a dead star coming back to life is not reported as a problem", () => {
    const d = diffStars({ "pulp-1": null }, { "pulp-1": "Pulp" });
    expect(d.dropped).toEqual([]);
    expect(d.moved).toEqual([]);
  });
});

describe("renderStarDiff", () => {
  test("names the person and what they need to re-star", () => {
    const out = renderStarDiff([
      {
        handle: "alex",
        diff: {
          dropped: [{ code: "fortho-1-2", was: "For Those I Love" }],
          moved: [],
        },
      },
    ]);

    expect(out).toContain("alex");
    expect(out).toContain("For Those I Love");
    expect(out).toMatch(/re-?star/i);
  });

  test("is completely silent when nothing broke", () => {
    expect(renderStarDiff([{ handle: "alex", diff: { dropped: [], moved: [] } }])).toBe("");
  });

  test("calls a moved star out separately — it is worse than a dropped one", () => {
    const out = renderStarDiff([
      {
        handle: "sam-cf",
        diff: { dropped: [], moved: [{ code: "talksi1-1", was: "John Cooper Clarke", now: "David O'Doherty" }] },
      },
    ]);

    expect(out).toContain("John Cooper Clarke");
    expect(out).toContain("David O'Doherty");
    expect(out.toUpperCase()).toContain("NOW POINTS AT");
  });
});
