import { describe, expect, test } from "vitest";
import { PS_ENDPOINT, lineupUrl, fetchLineupRaw } from "./primavera-graphql.js";
import type { RawLineup } from "./primavera-lineup.js";

// Event NAMES are per-edition and asserted in each festival module's own test
// (see festivals/ps26/src/index.test.ts). This adapter only knows how to ask.
const CIUTAT_2026 = "primavera-ciutat-2026-barcelona";

describe("lineupUrl", () => {
  test("targets the endpoint and encodes the event name + query", () => {
    const url = lineupUrl(CIUTAT_2026);
    expect(url.startsWith(`${PS_ENDPOINT}?`)).toBe(true);
    const q = new URL(url).searchParams;
    expect(JSON.parse(q.get("variables")!)).toEqual({ name: CIUTAT_2026 });
    expect(q.get("operationName")).toBe("Get");
    expect(q.get("query")).toContain("getLineupEvent");
  });

  test("asks for the app's own selection, not just the scheduler minimum", () => {
    const q = new URL(lineupUrl("x")).searchParams.get("query")!;
    for (const field of ["venuesInfo", "artistsPosts", "artistSetName", "dateTimeStartReal"]) {
      expect(q).toContain(field);
    }
  });
});

describe("fetchLineupRaw", () => {
  test("fetches the URL for the event name it is given", async () => {
    const seen: string[] = [];
    const fake = async <T>(u: string): Promise<T> => {
      seen.push(u);
      return { data: { getLineupEvent: { artists: [] } } } as T;
    };
    const raw = await fetchLineupRaw("primavera-sound-2027-barcelona", fake);
    expect(seen[0]).toContain("primavera-sound-2027-barcelona");
    expect((raw as RawLineup).data.getLineupEvent.artists).toEqual([]);
  });
});
