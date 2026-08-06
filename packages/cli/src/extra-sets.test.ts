import { describe, expect, test } from "vitest";
import type { ArtistSet } from "@festival-bot/core";
import { parseExtraSets, mergeExtraSets, parseExtraSetsDoc, applyRetimes } from "./extra-sets.js";

const set = (name: string, stage: string, startIso: string, durationMin: number): ArtistSet => ({
  name,
  slug: name.toLowerCase().replace(/\W+/g, "-"),
  stage,
  start: new Date(startIso),
  end: new Date(new Date(startIso).getTime() + durationMin * 60_000),
  durationMin,
});

const FTIL = {
  name: "For Those I Love",
  stage: "the-circle-by-jameson-music",
  start: "2026-08-01T21:15:00+00:00",
  end: "2026-08-01T22:15:00+00:00",
  note: "Withdrawn from the public timetable 2026-07-10; billed on the official Circle poster as AFTER DARK.",
};

/**
 * Pop-ups (operator standing instruction, 2026-07-31). ATN announce surprise shows
 * on the news feed with a START TIME AND NO END — the first was Sell Everything
 * at Global Roots, 15:15. The original rule here was "no inferred durations",
 * which would have kept every pop-up out of the planner and the mirror entirely.
 *
 * The call: carry them, estimate the end, and handle all future pop-ups the
 * same way we handled FTIL After Dark. So an estimate is allowed — but it must
 * be DECLARED, so nothing downstream can mistake a guessed end for a published
 * one. An unflagged missing end is still an error.
 */
const POPUP = {
  name: "Sell Everything",
  stage: "global-roots-main-stage",
  start: "2026-07-31T14:15:00+00:00",
  end: "2026-07-31T15:00:00+00:00",
  endEstimated: true,
  note: "Official ATN announcement 2026-07-31 11:00Z gave 15:15 start, no end; 45min assumed.",
};

describe("estimated end times", () => {
  test("accepts an end explicitly marked as an estimate", () => {
    const [s] = parseExtraSets([POPUP]);
    expect(s!.durationMin).toBe(45);
  });

  test("still rejects a missing end that is not declared an estimate", () => {
    // The flag is the whole safeguard — without it a guess is indistinguishable
    // from a published time.
    expect(() => parseExtraSets([{ ...POPUP, end: "", endEstimated: undefined }])).toThrow(/end/i);
  });

  test("requires the note to exist even for an estimate", () => {
    expect(() => parseExtraSets([{ ...POPUP, note: "" }])).toThrow(/note/i);
  });

  test("marks the resulting set so downstream can caveat it", () => {
    const [s] = parseExtraSets([POPUP]);
    expect((s as { endEstimated?: boolean }).endEstimated).toBe(true);
  });

  test("leaves a published-time extra unmarked", () => {
    const [s] = parseExtraSets([FTIL]);
    expect((s as { endEstimated?: boolean }).endEstimated).toBeUndefined();
  });
});

describe("parseExtraSets", () => {
  test("turns a recorded extra into a real set with absolute instants", () => {
    const [s] = parseExtraSets([FTIL]);
    expect(s!.name).toBe("For Those I Love");
    expect(s!.stage).toBe("the-circle-by-jameson-music");
    expect(s!.start.toISOString()).toBe("2026-08-01T21:15:00.000Z");
    expect(s!.durationMin).toBe(60);
  });

  test("gives it a slug so it behaves like any other set downstream", () => {
    expect(parseExtraSets([FTIL])[0]!.slug).toBeTruthy();
  });

  test("rejects an entry with no end, rather than inventing a duration", () => {
    expect(() => parseExtraSets([{ ...FTIL, end: "" }])).toThrow(/end/i);
  });

  test("rejects an entry with no provenance note — these must say where they came from", () => {
    expect(() => parseExtraSets([{ ...FTIL, note: "" }])).toThrow(/note/i);
  });
});

describe("mergeExtraSets", () => {
  const live = [set("Cromby", "the-circle-by-jameson-music", "2026-08-01T22:30:00Z", 60)];

  test("adds the extra alongside the live lineup", () => {
    const merged = mergeExtraSets(live, parseExtraSets([FTIL]));
    expect(merged.map((s) => s.name).sort()).toEqual(["Cromby", "For Those I Love"]);
  });

  test("leaves the live lineup untouched when there are no extras", () => {
    expect(mergeExtraSets(live, [])).toEqual(live);
  });

  test("does not duplicate a set the live feed has since restored", () => {
    // If ATN republish the set, the extra must drop out rather than push twice.
    const restored = [...live, set("For Those I Love", "the-circle-by-jameson-music", "2026-08-01T21:15:00Z", 60)];
    const merged = mergeExtraSets(restored, parseExtraSets([FTIL]));
    expect(merged.filter((s) => s.name === "For Those I Love")).toHaveLength(1);
  });

  test("keeps a same-named act that plays a genuinely different slot", () => {
    // FTIL also play Something Kind of Wonderful on the Friday — that is not a dupe.
    const withFriday = [
      ...live,
      set("For Those I Love", "something-kind-of-wonderful", "2026-07-31T20:30:00Z", 75),
    ];
    const merged = mergeExtraSets(withFriday, parseExtraSets([FTIL]));
    expect(merged.filter((s) => s.name === "For Those I Love")).toHaveLength(2);
  });
});

/**
 * Retiming a feed set, and the running order behind it.
 *
 * Operator note, 2026-08-01, from an Instagram story by the host: the Appmiral feed
 * carries "The Last City All Ireland Cypher" as ONE block, 14:30-17:30. It is
 * actually five things — GOMIE, Beddyminaj, Sugaboo and Lil Skag each get half
 * an hour, and the cypher proper is only the last hour. Planning against the
 * block routes people to a three-hour set that does not exist.
 *
 * Suppressing and re-adding would lose the act's identity (and everyone's
 * stars); retiming keeps it and moves it.
 */
describe("extra-sets object form", () => {
  const doc = {
    retime: [
      { name: "The Last City All Ireland Cypher", start: "2026-08-01T15:30:00+00:00", end: "2026-08-01T16:30:00+00:00", note: "IG running order" },
    ],
    sets: [
      { name: "GOMIE", stage: "the-last-city", start: "2026-08-01T13:30:00+00:00", end: "2026-08-01T14:00:00+00:00", note: "IG running order" },
    ],
  };

  test("parses the additions out of the object form", () => {
    expect(parseExtraSetsDoc(doc).sets.map((s) => s.name)).toEqual(["GOMIE"]);
  });

  test("parses the retimes", () => {
    expect(parseExtraSetsDoc(doc).retime[0]!.name).toBe("The Last City All Ireland Cypher");
  });

  test("still accepts the legacy array form as pure additions", () => {
    const legacy = [{ name: "X", stage: "s", start: "2026-08-01T13:30:00+00:00", end: "2026-08-01T14:00:00+00:00", note: "n" }];
    const d = parseExtraSetsDoc(legacy);
    expect(d.sets).toHaveLength(1);
    expect(d.retime).toEqual([]);
  });

  test("a retime moves the matching set by substring, keeping its name and stage", () => {
    const live = [set("The Last City All Ireland Cypher with Lil Skag", "the-last-city", "2026-08-01T14:30:00+01:00", 180)];
    const [out] = applyRetimes(live, parseExtraSetsDoc(doc).retime);
    expect(out!.name).toBe("The Last City All Ireland Cypher with Lil Skag");
    expect(out!.stage).toBe("the-last-city");
    expect(out!.durationMin).toBe(60);
  });

  test("leaves non-matching sets alone", () => {
    const live = [set("Pulp", "atn-main-stage", "2026-08-01T22:45:00+01:00", 90)];
    expect(applyRetimes(live, parseExtraSetsDoc(doc).retime)[0]!.durationMin).toBe(90);
  });

  test("does not mutate the input", () => {
    const live = [set("The Last City All Ireland Cypher with Lil Skag", "the-last-city", "2026-08-01T14:30:00+01:00", 180)];
    applyRetimes(live, parseExtraSetsDoc(doc).retime);
    expect(live[0]!.durationMin).toBe(180);
  });
});
