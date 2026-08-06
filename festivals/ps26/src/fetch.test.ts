import { describe, expect, test } from "vitest";
import { PS_EVENTS, PS_ENDPOINT, lineupUrl, fetchLineupRaw, refreshDecision } from "./fetch.js";
import type { RawLineup } from "./lineup.js";

describe("PS event sources", () => {
  test("Fòrum and Ciutat are distinct events on the same endpoint", () => {
    expect(PS_EVENTS.forum).toBe("primavera-sound-2026-barcelona");
    expect(PS_EVENTS.ciutat).toBe("primavera-ciutat-2026-barcelona");
    expect(PS_EVENTS.forum).not.toBe(PS_EVENTS.ciutat);
  });

  test("lineupUrl targets the endpoint and encodes the event name + query", () => {
    const url = lineupUrl(PS_EVENTS.ciutat);
    expect(url.startsWith(`${PS_ENDPOINT}?`)).toBe(true);
    const q = new URL(url).searchParams;
    expect(JSON.parse(q.get("variables")!)).toEqual({ name: "primavera-ciutat-2026-barcelona" });
    expect(q.get("operationName")).toBe("Get");
    expect(q.get("query")).toContain("getLineupEvent");
  });
});

describe("fetchLineupRaw", () => {
  test("fetches the URL for the requested kind and returns the raw payload", async () => {
    const seen: string[] = [];
    const fake = async <T>(u: string): Promise<T> => {
      seen.push(u);
      return { data: { getLineupEvent: { artists: [] } } } as T;
    };
    const raw = await fetchLineupRaw("forum", fake);
    expect(seen[0]).toContain("primavera-sound-2026-barcelona");
    expect((raw as RawLineup).data.getLineupEvent.artists).toEqual([]);
  });
});

describe("refreshDecision (snapshot shrink guard)", () => {
  test("writes when there is no prior snapshot", () => {
    expect(refreshDecision(73, null, false).write).toBe(true);
  });
  test("writes when the lineup grew or stayed the same", () => {
    expect(refreshDecision(80, 73, false).write).toBe(true);
    expect(refreshDecision(73, 73, false).write).toBe(true);
  });
  test("guards (no write) when the lineup shrank without --force", () => {
    const d = refreshDecision(50, 73, false);
    expect(d.write).toBe(false);
    expect(d.reason).toMatch(/shrank 73.*50/);
  });
  test("--force overrides the shrink guard", () => {
    expect(refreshDecision(50, 73, true).write).toBe(true);
  });
});
