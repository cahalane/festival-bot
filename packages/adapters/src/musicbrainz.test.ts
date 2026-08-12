import { describe, expect, test } from "vitest";
import { pickExactMbid, createMbidResolver, stripActSuffixes, mbidFromSpotifyId } from "./musicbrainz.js";

describe("stripActSuffixes", () => {
  test("strips trailing (DJ Set)/(Live)/[..] qualifiers, keeps the core name", () => {
    expect(stripActSuffixes("Fatboy Slim (DJ Set)")).toBe("Fatboy Slim");
    expect(stripActSuffixes("Bicep (Live)")).toBe("Bicep");
    expect(stripActSuffixes("Some Artist [DJ]")).toBe("Some Artist");
    expect(stripActSuffixes("Simple Minds (Live) (2026)")).toBe("Simple Minds");
    expect(stripActSuffixes("Charli XCX")).toBe("Charli XCX");
  });
  test("leaves a fully-parenthesised name alone", () => {
    expect(stripActSuffixes("(Sandy) Alex G")).toBe("(Sandy) Alex G");
  });
});

describe("pickExactMbid", () => {
  const cands = [
    { id: "mbid-charli", name: "Charli XCX", score: 100 },
    { id: "mbid-partial", name: "Charli", score: 80 },
  ];

  test("returns the mbid of a unique high-score exact name match", () => {
    expect(pickExactMbid("Charli XCX", cands)).toBe("mbid-charli");
  });

  test("is case/whitespace/diacritic insensitive on the name", () => {
    expect(pickExactMbid("  charli   xcx ", cands)).toBe("mbid-charli");
    expect(pickExactMbid("Beyonce", [{ id: "bey", name: "Beyoncé", score: 99 }])).toBe("bey");
  });

  test("returns null when no candidate name matches exactly", () => {
    expect(pickExactMbid("Charli", cands)).toBe(null); // 'Charli' candidate is below threshold
    expect(pickExactMbid("Totally Unknown", cands)).toBe(null);
  });

  test("returns null when the exact name is ambiguous (two distinct artists)", () => {
    const nirvana = [
      { id: "uk", name: "Nirvana", score: 100 },
      { id: "us", name: "Nirvana", score: 100 },
    ];
    expect(pickExactMbid("Nirvana", nirvana)).toBe(null);
  });

  test("returns null when the exact match scores below threshold", () => {
    expect(pickExactMbid("Charli XCX", [{ id: "x", name: "Charli XCX", score: 50 }])).toBe(null);
  });

  test("collapses duplicate entries of the same mbid", () => {
    const dupe = [
      { id: "same", name: "Fontaines D.C.", score: 100 },
      { id: "same", name: "Fontaines D.C.", score: 97 },
    ];
    expect(pickExactMbid("Fontaines D.C.", dupe)).toBe("same");
  });
});

describe("mbidFromSpotifyId", () => {
  const relation = { "target-type": "artist", artist: { id: "mbid-wetleg", name: "Wet Leg" } };

  test("reverses a Spotify artist id through the MusicBrainz URL entity", async () => {
    let asked = "";
    const got = await mbidFromSpotifyId("2TwOrUcYnAlIiKmVQkkoSZ", async <T>(url: string) => {
      asked = url;
      return { relations: [relation] } as T;
    });
    expect(got).toBe("mbid-wetleg");
    expect(decodeURIComponent(asked)).toContain("https://open.spotify.com/artist/2TwOrUcYnAlIiKmVQkkoSZ");
    expect(asked).toContain("inc=artist-rels");
  });

  test("a 404 (MusicBrainz has no such URL) is an ordinary miss, not an error", async () => {
    // Measured: DJ Marcelle, Akazie, Gadea and DJ Nobu all 404 here. That is the
    // normal shape of thin coverage, so it must not abort an enrichment run.
    const got = await mbidFromSpotifyId("nolink", async () => {
      throw new Error("HTTP 404");
    });
    expect(got).toBe(null);
  });

  test("ignores non-artist relations on the same URL", async () => {
    const got = await mbidFromSpotifyId("x", async <T>() =>
      ({ relations: [{ "target-type": "release-group", artist: undefined }, relation] }) as T);
    expect(got).toBe("mbid-wetleg");
  });

  test("returns null when one URL points at two different artists", async () => {
    // Upstream data conflict. Same rule as pickExactMbid: no tag beats a wrong tag.
    const got = await mbidFromSpotifyId("x", async <T>() =>
      ({
        relations: [relation, { "target-type": "artist", artist: { id: "other", name: "Someone Else" } }],
      }) as T);
    expect(got).toBe(null);
  });

  test("returns null for an empty id without calling out", async () => {
    let calls = 0;
    expect(
      await mbidFromSpotifyId("", async <T>() => {
        calls++;
        return {} as T;
      }),
    ).toBe(null);
    expect(calls).toBe(0);
  });
});

describe("createMbidResolver", () => {
  test("resolves a name, caches hits and misses (one fetch each)", async () => {
    const calls: string[] = [];
    const r = createMbidResolver({
      minIntervalMs: 0,
      fetchJson: async <T>(url: string) => {
        calls.push(url);
        if (url.includes("Real%20Act") || url.includes("Real+Act")) {
          return { artists: [{ id: "mbid-real", name: "Real Act", score: 100 }] } as T;
        }
        return { artists: [{ id: "nope", name: "Something Else", score: 60 }] } as T;
      },
    });
    expect(await r.resolve("Real Act")).toBe("mbid-real");
    expect(await r.resolve("Real Act")).toBe("mbid-real"); // cached hit
    expect(await r.resolve("Ghost Act")).toBe(null);
    expect(await r.resolve("Ghost Act")).toBe(null); // cached miss
    expect(calls).toHaveLength(2); // one per distinct name
  });

  test("strips common suffixes before querying MusicBrainz", async () => {
    let queried = "";
    const r = createMbidResolver({
      minIntervalMs: 0,
      fetchJson: async <T>(url: string) => {
        queried = url;
        return { artists: [{ id: "fb", name: "Fatboy Slim", score: 100 }] } as T;
      },
    });
    expect(await r.resolve("Fatboy Slim (DJ Set)")).toBe("fb");
    expect(decodeURIComponent(queried)).toContain('artist:"Fatboy Slim"');
    expect(decodeURIComponent(queried)).not.toContain("DJ Set");
  });

  test("cachedOnly returns cached hits with no network and lists misses", async () => {
    let calls = 0;
    const r = createMbidResolver({
      minIntervalMs: 0,
      fetchJson: async <T>(url: string) => {
        calls++;
        return { artists: [{ id: "h", name: "Known", score: 100 }] } as T;
      },
    });
    await r.resolve("Known"); // 1 network call, caches
    const { found, missing } = r.cachedOnly(["Known", "Unknown"]);
    expect(found.get("Known")).toBe("h");
    expect(missing).toEqual(["Unknown"]);
    expect(calls).toBe(1);
  });

  test("falls back to the Spotify id when the name search finds nothing", async () => {
    // The real case this exists for: MusicBrainz's name search returned no exact
    // match for Ecco2k / Gorillaz, but reversing their Spotify URL resolved both.
    const r = createMbidResolver({
      minIntervalMs: 0,
      fetchJson: async <T>(url: string) =>
        (url.includes("/ws/2/url")
          ? { relations: [{ "target-type": "artist", artist: { id: "mbid-ecco", name: "Ecco2K" } }] }
          : { artists: [] }) as T,
      spotifyIdFor: async () => "6hG0VsXXlD10l60TqiIHIX",
    });
    expect(await r.resolve("Ecco2k")).toBe("mbid-ecco");
  });

  test("does NOT consult Spotify when the name search already resolved", async () => {
    let spotifyCalls = 0;
    const r = createMbidResolver({
      minIntervalMs: 0,
      fetchJson: async <T>() => ({ artists: [{ id: "by-name", name: "Wet Leg", score: 100 }] }) as T,
      spotifyIdFor: async () => {
        spotifyCalls++;
        return "x";
      },
    });
    expect(await r.resolve("Wet Leg")).toBe("by-name");
    expect(spotifyCalls).toBe(0);
  });

  test("a failing Spotify lookup degrades to a miss, it does not throw", async () => {
    // This runs mid-push. The festival's catalogue being down must cost us a tag,
    // never the Clashfinder write.
    const r = createMbidResolver({
      minIntervalMs: 0,
      fetchJson: async <T>() => ({ artists: [] }) as T,
      spotifyIdFor: async () => {
        throw new Error("PS graphql down");
      },
    });
    expect(await r.resolve("Anything")).toBe(null);
  });

  test("resolveAll returns only matched names", async () => {
    const r = createMbidResolver({
      minIntervalMs: 0,
      fetchJson: async <T>(url: string) =>
        (url.includes("Hit") ? { artists: [{ id: "h", name: "Hit", score: 100 }] } : { artists: [] }) as T,
    });
    const map = await r.resolveAll(["Hit", "Miss"]);
    expect(map.get("Hit")).toBe("h");
    expect(map.has("Miss")).toBe(false);
  });
});
