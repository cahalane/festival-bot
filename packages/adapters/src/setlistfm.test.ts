import { describe, expect, test } from "vitest";
import {
  setlistfmDate,
  parseSetlistfmResponse,
  setlistfmArtistUrl,
  setlistfmSearchUrl,
  setlistfmHeaders,
  createSetlistSource,
  type SetlistfmResponse,
} from "./setlistfm.js";

// Trimmed real-shape fixture (from api.setlist.fm 2026-06-19): one main set + one
// encore, with a cover, an info note, and a tape track.
const raw: SetlistfmResponse = {
  type: "setlists",
  total: 2,
  itemsPerPage: 20,
  page: 1,
  setlist: [
    {
      id: "34cc517",
      eventDate: "16-12-2025",
      artist: { name: "Radiohead", mbid: "a74b1b7f" },
      venue: { name: "O2 Arena", city: { name: "London" } },
      tour: { name: "European Tour 2025" },
      info: "Filmed for broadcast",
      url: "https://www.setlist.fm/setlist/radiohead/2025/o2-34cc517.html",
      sets: {
        set: [
          {
            song: [
              { name: "2 + 2 = 5" },
              { name: "Lucky", info: "first time since 2017" },
              { name: "Creep", cover: { name: "Scott Walker" } },
            ],
          },
          {
            encore: 1,
            song: [{ name: "Karma Police" }, { name: "Exit Music", tape: true }],
          },
        ],
      },
    },
    // An in-progress / not-yet-entered gig: exists but no songs.
    {
      id: "empty99",
      eventDate: "07-06-2026",
      artist: { name: "Radiohead", mbid: "a74b1b7f" },
      venue: { name: "Parc del Fòrum", city: { name: "Barcelona" } },
      url: "https://www.setlist.fm/setlist/radiohead/2026/forum-empty99.html",
    },
  ],
};

describe("setlistfmDate", () => {
  test("normalises dd-MM-yyyy to YYYY-MM-DD", () => {
    expect(setlistfmDate("16-12-2025")).toBe("2025-12-16");
    expect(setlistfmDate("07-06-2026")).toBe("2026-06-07");
  });
  test("returns the input unchanged when not in the expected format", () => {
    expect(setlistfmDate("2025-12-16")).toBe("2025-12-16");
    expect(setlistfmDate("")).toBe("");
  });
});

describe("parseSetlistfmResponse", () => {
  test("maps each setlist's metadata and flattens songs in order across sets", () => {
    const lists = parseSetlistfmResponse(raw);
    expect(lists).toHaveLength(2);
    const r = lists[0]!;
    expect(r.id).toBe("34cc517");
    expect(r.eventDate).toBe("2025-12-16");
    expect(r.artist).toBe("Radiohead");
    expect(r.venue).toBe("O2 Arena");
    expect(r.city).toBe("London");
    expect(r.tour).toBe("European Tour 2025");
    expect(r.url).toBe("https://www.setlist.fm/setlist/radiohead/2025/o2-34cc517.html");
    expect(r.songs.map((s) => s.name)).toEqual([
      "2 + 2 = 5",
      "Lucky",
      "Creep",
      "Karma Police",
      "Exit Music",
    ]);
  });

  test("captures cover, info, tape and encore membership on songs", () => {
    const r = parseSetlistfmResponse(raw)[0]!;
    expect(r.songs.find((s) => s.name === "Creep")?.cover).toBe("Scott Walker");
    expect(r.songs.find((s) => s.name === "Lucky")?.info).toBe("first time since 2017");
    expect(r.songs.find((s) => s.name === "Exit Music")?.tape).toBe(true);
    // main-set songs have no encore; encore set songs carry the encore number
    expect(r.songs.find((s) => s.name === "2 + 2 = 5")?.encore).toBeUndefined();
    expect(r.songs.find((s) => s.name === "Karma Police")?.encore).toBe(1);
    expect(r.songs.find((s) => s.name === "Exit Music")?.encore).toBe(1);
  });

  test("treats a gig with no sets as an empty (not-yet-known) setlist, not a drop", () => {
    const r = parseSetlistfmResponse(raw)[1]!;
    expect(r.id).toBe("empty99");
    expect(r.songs).toEqual([]);
  });

  test("returns [] when there is no setlist array", () => {
    expect(parseSetlistfmResponse({ type: "setlists" })).toEqual([]);
  });
});

describe("setlistfm url + header helpers", () => {
  test("artist endpoint is keyed by mbid", () => {
    expect(setlistfmArtistUrl("a74b1b7f")).toBe(
      "https://api.setlist.fm/rest/1.0/artist/a74b1b7f/setlists?p=1",
    );
  });
  test("search endpoint encodes the artist name", () => {
    expect(setlistfmSearchUrl("Fontaines D.C.")).toBe(
      "https://api.setlist.fm/rest/1.0/search/setlists?artistName=Fontaines%20D.C.&p=1",
    );
  });
  test("headers carry the api key and ask for JSON", () => {
    const h = setlistfmHeaders("SECRET");
    expect(h["x-api-key"]).toBe("SECRET");
    expect(h["Accept"]).toBe("application/json");
  });
});

describe("createSetlistSource", () => {
  test("uses the artist-by-mbid endpoint when an mbid is given, sending the api key", async () => {
    let calledUrl = "";
    let sentHeaders: Record<string, string> = {};
    const src = createSetlistSource({
      apiKey: "SECRET",
      minIntervalMs: 0,
      fetchJson: async <T>(url: string, headers: Record<string, string>) => {
        calledUrl = url;
        sentHeaders = headers;
        return raw as T;
      },
    });
    const lists = await src.recent("Radiohead", { mbid: "a74b1b7f" });
    expect(calledUrl).toBe("https://api.setlist.fm/rest/1.0/artist/a74b1b7f/setlists?p=1");
    expect(sentHeaders["x-api-key"]).toBe("SECRET");
    expect(lists[0]!.songs[0]!.name).toBe("2 + 2 = 5");
  });

  test("resolves an mbid via the injected resolver and prefers the artist endpoint", async () => {
    let calledUrl = "";
    let resolvedFor = "";
    const src = createSetlistSource({
      apiKey: "K",
      minIntervalMs: 0,
      resolveMbid: async (name) => {
        resolvedFor = name;
        return "resolved-mbid";
      },
      fetchJson: async <T>(url: string) => {
        calledUrl = url;
        return raw as T;
      },
    });
    await src.recent("Radiohead");
    expect(resolvedFor).toBe("Radiohead");
    expect(calledUrl).toContain("/artist/resolved-mbid/setlists");
  });

  test("falls back to the name-search endpoint when no mbid is available", async () => {
    let calledUrl = "";
    const src = createSetlistSource({
      apiKey: "K",
      minIntervalMs: 0,
      resolveMbid: async () => null,
      fetchJson: async <T>(url: string) => {
        calledUrl = url;
        return raw as T;
      },
    });
    await src.recent("Some Unknown Act");
    expect(calledUrl).toContain("/search/setlists?artistName=Some%20Unknown%20Act");
  });

  test("respects the limit option", async () => {
    const src = createSetlistSource({
      apiKey: "K",
      minIntervalMs: 0,
      fetchJson: async <T>() => raw as T,
    });
    const lists = await src.recent("Radiohead", { mbid: "a74b1b7f", limit: 1 });
    expect(lists).toHaveLength(1);
  });
});
