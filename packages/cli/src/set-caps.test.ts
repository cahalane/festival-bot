import { describe, expect, test } from "vitest";
import { parseCaps, applyCaps } from "./set-caps.js";
import type { ArtistSet } from "@festival-bot/core";

/**
 * Operator ask, 2026-08-01: "I don't plan on going to the whole cypher, can I
 * see a card that maximises for me going at most to an arbitrary hour of it?"
 *
 * The Last City Cypher runs 14:30-17:30. The router treats a starred set as
 * attended end to end, so a three-hour block swallows the afternoon and nothing
 * else can be scheduled against it — even though only an hour was wanted.
 * Capping shortens the set FOR ROUTING so the planner can use the freed-up time.
 */
const set = (name: string, startIso: string, minutes: number): ArtistSet => ({
  name,
  slug: name.toLowerCase().replace(/\W+/g, "-"),
  stage: "the-last-city",
  start: new Date(startIso),
  end: new Date(new Date(startIso).getTime() + minutes * 60_000),
  durationMin: minutes,
});

const cypher = set("The Last City All Ireland Cypher with Lil Skag", "2026-08-01T14:30:00+01:00", 180);
const other = set("Christy Moore", "2026-08-01T15:30:00+01:00", 60);

describe("parseCaps", () => {
  test("reads a substring=minutes pair", () => {
    expect(parseCaps(["Cypher=60"])).toEqual([{ match: "cypher", minutes: 60 }]);
  });

  test("reads several, comma separated", () => {
    expect(parseCaps(["Cypher=60,Christy=30"])).toHaveLength(2);
  });

  test("ignores a pair with no minutes rather than defaulting silently", () => {
    expect(parseCaps(["Cypher="])).toEqual([]);
  });

  test("ignores a non-numeric cap", () => {
    expect(parseCaps(["Cypher=ages"])).toEqual([]);
  });

  test("lowercases the match so it is case-insensitive", () => {
    expect(parseCaps(["CYPHER=60"])[0]!.match).toBe("cypher");
  });
});

describe("applyCaps", () => {
  test("shortens a matching set to the cap", () => {
    const [s] = applyCaps([cypher], parseCaps(["Cypher=60"]));
    expect(s!.durationMin).toBe(60);
    expect(s!.end.toISOString()).toBe(new Date("2026-08-01T15:30:00+01:00").toISOString());
  });

  test("leaves the start time alone — he still arrives when it starts", () => {
    const [s] = applyCaps([cypher], parseCaps(["Cypher=60"]));
    expect(s!.start.getTime()).toBe(cypher.start.getTime());
  });

  test("does not touch sets that do not match", () => {
    const out = applyCaps([cypher, other], parseCaps(["Cypher=60"]));
    expect(out[1]!.durationMin).toBe(60);
    expect(out[1]!.end.getTime()).toBe(other.end.getTime());
  });

  test("never LENGTHENS a set that is already shorter than the cap", () => {
    // A cap is a ceiling, not a target: capping at 2h must not turn a 60min set
    // into a 2h one and invent a clash that does not exist.
    const [s] = applyCaps([other], parseCaps(["Christy=120"]));
    expect(s!.durationMin).toBe(60);
  });

  test("does not mutate the input sets", () => {
    applyCaps([cypher], parseCaps(["Cypher=60"]));
    expect(cypher.durationMin).toBe(180);
  });

  test("returns the list untouched when there are no caps", () => {
    expect(applyCaps([cypher], [])[0]!.durationMin).toBe(180);
  });

  test("matches on a substring of the full name", () => {
    const [s] = applyCaps([cypher], parseCaps(["lil skag=45"]));
    expect(s!.durationMin).toBe(45);
  });
});
