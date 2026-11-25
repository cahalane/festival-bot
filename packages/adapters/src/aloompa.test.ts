import { describe, expect, test } from "vitest";
import { aloompaSlugify, parseAloompaLineup, aloompaVenues, fetchAloompaSubApp, type AloompaSubApp } from "./aloompa.js";

const t = (iso: string) => ({ date: Date.parse(iso) / 1000, timezoneName: "Europe/London" });

const sub: AloompaSubApp = {
  id: "sub",
  name: "2026 Test",
  listSubAppEvents: {
    items: [
      { id: "1", name: "Knats", status: "PUBLIC", startsAt: t("2026-11-29T21:00:00Z"), endsAt: t("2026-11-29T21:30:00Z"), eventPlace: { id: "p1", name: "St James' Church" } },
      { id: "2", name: "Fizzy Orange", status: "PUBLIC", startsAt: t("2026-11-29T23:30:00Z"), endsAt: t("2026-11-30T00:15:00Z"), eventPlace: { id: "p2", name: "Foxy John's " } },
      // TBD placeholder (zero-length) — dropped.
      { id: "3", name: "Man/Woman/Chainsaw", status: "PUBLIC", timeIsTBD: true, startsAt: t("2026-11-27T10:57:00Z"), endsAt: t("2026-11-27T10:57:00Z"), eventPlace: { id: "p1", name: "St James' Church" } },
      // No place — dropped.
      { id: "4", name: "Floating", status: "PUBLIC", startsAt: t("2026-11-28T20:00:00Z"), endsAt: t("2026-11-28T21:00:00Z"), eventPlace: null },
      // Not public — dropped.
      { id: "5", name: "Draft", status: "DRAFT", startsAt: t("2026-11-28T20:00:00Z"), endsAt: t("2026-11-28T21:00:00Z"), eventPlace: { id: "p1", name: "St James' Church" } },
    ],
  },
};

describe("aloompa", () => {
  test("slugify strips apostrophes, accents, trailing space", () => {
    expect(aloompaSlugify("St James' Church")).toBe("st-james-church");
    expect(aloompaSlugify("Foxy John's ")).toBe("foxy-johns");
    expect(aloompaSlugify("Páidí Ó Sé’s")).toBe("paidi-o-ses");
    expect(aloompaSlugify("Barr na Sráide")).toBe("barr-na-sraide");
  });

  test("parses epoch seconds as absolute instants (no zone re-application)", () => {
    const sets = parseAloompaLineup(sub);
    expect(sets.map((s) => s.name)).toEqual(["Knats", "Fizzy Orange"]);
    expect(sets[0]!.start.toISOString()).toBe("2026-11-29T21:00:00.000Z");
    expect(sets[0]!.stage).toBe("st-james-church");
    expect(sets[1]!.durationMin).toBe(45);
    expect(sets[1]!.stage).toBe("foxy-johns");
  });

  test("venues are trimmed and deduped", () => {
    expect(aloompaVenues(sub)).toEqual([
      { slug: "st-james-church", name: "St James' Church" },
      { slug: "foxy-johns", name: "Foxy John's" },
    ]);
  });

  test("fetch resolves the key via build-params, then pages events", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const page = (items: AloompaSubApp["listSubAppEvents"]["items"], nextToken: string | null) => ({
      data: { getSubApp: { ...sub, listSubAppEvents: { items, nextToken } } },
    });
    const responses: unknown[] = [
      { dragonflyApiUrl: "https://api.example/graphql", dragonflyApiKey: "k" },
      page([sub.listSubAppEvents.items[0]!], "tok"),
      page([sub.listSubAppEvents.items[1]!], null),
    ];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as unknown as typeof fetch;
    const got = await fetchAloompaSubApp({ appId: "a", subAppId: "sub", buildParamsToken: "T" }, { fetch: fakeFetch });
    expect(got.listSubAppEvents.items.map((e) => e.id)).toEqual(["1", "2"]);
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("T");
    expect((calls[1]!.init?.headers as Record<string, string>)["x-api-key"]).toBe("k");
    expect(JSON.parse(calls[2]!.init?.body as string).variables.evToken).toBe("tok");
  });

  test("graphql errors surface instead of an empty lineup", async () => {
    const responses: unknown[] = [
      { dragonflyApiUrl: "https://api.example/graphql", dragonflyApiKey: "k" },
      { data: null, errors: [{ message: "Unauthorized" }] },
    ];
    const fakeFetch = (async () => new Response(JSON.stringify(responses.shift()), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchAloompaSubApp({ appId: "a", subAppId: "s", buildParamsToken: "T" }, { fetch: fakeFetch })).rejects.toThrow(/Unauthorized/);
  });
});
