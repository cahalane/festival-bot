import { describe, expect, test } from "vitest";
import { createPsArtistIdSource, pickExactArtist, preferencesUrl, normArtistName } from "./primavera-spotify.js";

describe("preferencesUrl", () => {
  test("sends the app's own query shape", () => {
    const q = new URL(preferencesUrl("Wet Leg")).searchParams;
    expect(JSON.parse(q.get("variables")!)).toEqual({ search: "Wet Leg", from: 0, to: 5, artists: [] });
    expect(q.get("query")).toContain("getRegisterPreferencesData");
    expect(q.get("query")).toContain("spotifyId");
  });
});

describe("normArtistName", () => {
  test("folds case, whitespace and diacritics", () => {
    expect(normArtistName("  Béyoncé   Knowles ")).toBe("beyonce knowles");
  });
});

describe("pickExactArtist", () => {
  // Real responses captured live on 2026-08-12. The endpoint searches Spotify's
  // GLOBAL catalogue and pads with related artists, so result[0] is routinely a
  // different, more famous act than the one asked for.
  const gretaResults = [
    { name: "Greta Van Fleet", slug: "greta-van-fleet", spotifyId: "4NpFxQe2UvRCAjto3JqlSl" },
    { name: "Led Zeppelin", slug: "led-zeppelin", spotifyId: "36QJpDe2go2KgaRleHCDTp" },
    { name: "Greta Stanley", slug: "greta-stanley", spotifyId: "3lkwqHO5vO9jUlmJd0N5aC" },
  ];

  test("refuses the famous near-miss rather than tagging the wrong artist", () => {
    // ps26's Bits act is literally slugged `greta`; taking result[0] would tag it
    // as Greta Van Fleet on a published mirror.
    expect(pickExactArtist("Greta", gretaResults)).toBe(null);
  });

  test("finds the exact match even when it is not first", () => {
    const results = [{ name: "Mustard", slug: "mustard", spotifyId: "wrong" }, ...gretaResults];
    expect(pickExactArtist("Greta Van Fleet", results)?.spotifyId).toBe("4NpFxQe2UvRCAjto3JqlSl");
  });

  test("matches case- and diacritic-insensitively", () => {
    expect(pickExactArtist("  wet leg ", [{ name: "Wet Leg", spotifyId: "s" }])?.spotifyId).toBe("s");
  });

  test("skips an exact-name result that carries no spotifyId", () => {
    expect(pickExactArtist("Wet Leg", [{ name: "Wet Leg" }])).toBe(null);
  });
});

describe("createPsArtistIdSource", () => {
  test("returns the id for an exact match", async () => {
    const src = createPsArtistIdSource({
      fetchJson: async <T>(): Promise<T> =>
        ({
          data: { getRegisterPreferencesData: { topArtists: [{ name: "Big Thief", spotifyId: "5QdyldG4Fl4TPiOIeMNpBZ" }] } },
        }) as T,
    });
    expect(await src.spotifyId("Big Thief")).toBe("5QdyldG4Fl4TPiOIeMNpBZ");
  });

  test("returns null when the search only offers a different act", async () => {
    const src = createPsArtistIdSource({
      fetchJson: async <T>(): Promise<T> =>
        ({ data: { getRegisterPreferencesData: { topArtists: [{ name: "Karol Sevilla", spotifyId: "x" }] } } }) as T,
    });
    expect(await src.spotifyId("Amiga Date Cuenta")).toBe(null);
  });

  test("a GraphQL error degrades to null — this must not abort a push", async () => {
    // Deliberately unlike posts.ts, which RAISES on a GraphQL error. There, an
    // empty result would be mistaken for real data; here the caller is already on
    // its fallback path and "no id" is a truthful answer.
    const src = createPsArtistIdSource({
      fetchJson: async <T>(): Promise<T> => ({ errors: [{ message: "rate limited" }] }) as T,
    });
    expect(await src.spotifyId("Anyone")).toBe(null);
  });

  test("does not call out for an empty name", async () => {
    let calls = 0;
    const src = createPsArtistIdSource({
      fetchJson: async <T>(): Promise<T> => {
        calls++;
        return {} as T;
      },
    });
    expect(await src.spotifyId("   ")).toBe(null);
    expect(calls).toBe(0);
  });
});
