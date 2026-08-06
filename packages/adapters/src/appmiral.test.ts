import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatInZone } from "@festival-bot/core";
import {
  parseAppmiralLineup,
  appmiralVenuesFromLineup,
  appmiralArtistInfoMap,
  appmiralSlugify,
  appmiralLineupUrl,
  appmiralHeaders,
  createAppmiralLineupSource,
  sortLineupById,
  type AppmiralLineupResponse,
} from "./appmiral.js";

const raw: AppmiralLineupResponse = {
  data: [
    {
      id: 1,
      name: "Saoirse",
      published: true,
      performances: [
        {
          id: 10,
          published: true,
          stage_id: 13324,
          stage_name: "IMMERSE",
          start_time: "2025-08-01T23:15:00+00:00",
          end_time: "2025-08-02T01:00:00+00:00",
        },
      ],
    },
    {
      id: 2,
      name: "The T0.0ucan DJs",
      published: true,
      performances: [
        {
          id: 11,
          published: true,
          stage_id: 1,
          stage_name: "The T0.0ucan Pub",
          start_time: "2025-08-02T12:00:00+00:00",
          end_time: "2025-08-02T13:30:00+00:00",
        },
        // unpublished -> dropped
        { id: 12, published: false, stage_name: "Hidden", start_time: "2025-08-02T14:00:00+00:00", end_time: "2025-08-02T15:00:00+00:00" },
        // no times -> dropped
        { id: 13, published: true, stage_name: "No Times" },
      ],
    },
  ],
};

describe("appmiralSlugify", () => {
  test("lowercases, collapses non-alnum, trims", () => {
    expect(appmiralSlugify("ATN Main Stage")).toBe("atn-main-stage");
    expect(appmiralSlugify("GoLoud.")).toBe("goloud");
    expect(appmiralSlugify("Seanchoíche")).toBe("seancho-che");
    expect(appmiralSlugify("The Great Oven Disco Cantina")).toBe("the-great-oven-disco-cantina");
  });
});

describe("parseAppmiralLineup", () => {
  test("maps performances to ArtistSet, converts UTC, computes duration", () => {
    const sets = parseAppmiralLineup(raw);
    const s = sets.find((x) => x.name === "Saoirse")!;
    expect(s.slug).toBe("saoirse");
    expect(s.stage).toBe("immerse");
    expect(s.durationMin).toBe(105);
    expect(s.start.getTime()).toBe(Date.parse("2025-08-01T23:15:00Z"));
    expect(s.end.getTime()).toBe(Date.parse("2025-08-02T01:00:00Z"));
    // 23:15 UTC == 00:15 IST (Europe/Dublin, summer) on Sat 2 Aug
    expect(formatInZone(s.start, "Europe/Dublin")).toMatch(/Sat.*00:15/);
  });

  test("drops unpublished performances and ones missing times", () => {
    const sets = parseAppmiralLineup(raw);
    expect(sets).toHaveLength(2);
    const toucan = sets.find((x) => x.name === "The T0.0ucan DJs")!;
    expect(toucan.stage).toBe("the-t0-0ucan-pub");
    expect(toucan.durationMin).toBe(90);
    expect(sets.some((x) => x.stage === "hidden")).toBe(false);
  });
});

describe("appmiralVenuesFromLineup", () => {
  test("derives distinct {slug,name} venues from stage names", () => {
    const venues = appmiralVenuesFromLineup(raw);
    const bySlug = new Map(venues.map((v) => [v.slug, v.name]));
    expect(bySlug.get("immerse")).toBe("IMMERSE");
    expect(bySlug.get("the-t0-0ucan-pub")).toBe("The T0.0ucan Pub");
  });
});

describe("appmiralArtistInfoMap", () => {
  test("indexes each artist's body (bio) by slug", () => {
    const withBio: AppmiralLineupResponse = {
      data: [
        { id: 1, name: "Saoirse", published: true, body: "<p>Irish DJ.</p>", performances: [] },
        { id: 2, name: "No Bio Act", published: true, performances: [] },
      ],
    };
    const m = appmiralArtistInfoMap(withBio);
    expect(m.get("saoirse")?.name).toBe("Saoirse");
    expect(m.get("saoirse")?.bio).toBe("<p>Irish DJ.</p>");
    expect(m.get("no-bio-act")?.bio).toBe("");
  });
});

describe("appmiral url + headers", () => {
  const cfg = { event: "alltogethernow", edition: "alltogethernow2025", xProtect: "SECRET" };

  test("builds the artists endpoint with include_related", () => {
    const u = appmiralLineupUrl(cfg);
    expect(u).toBe(
      "https://app.appmiral.com/api/v7/events/alltogethernow/editions/alltogethernow2025/artists?include_related=true",
    );
  });

  test("sends x-protect, x-platform and Accept-Language", () => {
    const h = appmiralHeaders(cfg);
    expect(h["x-protect"]).toBe("SECRET");
    expect(h["x-platform"]).toBe("android");
    expect(h["Accept-Language"]).toBe("en");
  });
});

describe("createAppmiralLineupSource (live, injected fetch)", () => {
  test("fetches the artists endpoint with the x-protect header and parses it", async () => {
    let calledUrl = "";
    let sentHeaders: Record<string, string> = {};
    const src = createAppmiralLineupSource(
      { event: "alltogethernow", edition: "alltogethernow2025", xProtect: "SECRET" },
      {
        fetchJson: async <T>(url: string, headers: Record<string, string>) => {
          calledUrl = url;
          sentHeaders = headers;
          return raw as T;
        },
      },
    );
    const sets = await src.loadSets();
    expect(calledUrl).toContain("/events/alltogethernow/editions/alltogethernow2025/artists?include_related=true");
    expect(sentHeaders["x-protect"]).toBe("SECRET");
    expect(sets).toHaveLength(2);
  });
});

describe("parseAppmiralLineup — deleted performances", () => {
  // The live API tombstones a cancelled performance: the row comes back as
  // { id, deleted_at } with no times. It must not survive into the schedule.
  test("drops a tombstoned performance but keeps the artist's surviving sets", () => {
    const withTombstone: AppmiralLineupResponse = {
      data: [
        {
          id: 2118853,
          name: "For Those I Love",
          published: true,
          performances: [
            {
              id: 341528,
              published: true,
              stage_id: 16234,
              stage_name: "Something Kind of Wonderful",
              start_time: "2026-07-31T20:30:00+00:00",
              end_time: "2026-07-31T21:45:00+00:00",
            },
            { id: 341939, deleted_at: "2026-07-10T11:18:01+00:00" },
          ],
        },
      ],
    };
    const sets = parseAppmiralLineup(withTombstone);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.stage).toBe("something-kind-of-wonderful");
  });
});

describe("createAppmiralLineupSource — refresh()", () => {
  const cfg = { event: "alltogethernow", edition: "alltogethernow2026", xProtect: "SECRET" };
  const tmp = () => join(mkdtempSync(join(tmpdir(), "appmiral-")), "schedule.json");

  test("writes the snapshot when the fetch grows the lineup", async () => {
    const file = tmp();
    writeFileSync(file, JSON.stringify({ data: [] }));
    const src = createAppmiralLineupSource(cfg, { file, fetchJson: async <T>() => raw as T });
    const res = await src.refresh!();
    expect(res.written).toBe(true);
    expect(res.fetched).toBe(2);
    expect(res.previous).toBe(0);
    expect(res.file).toBe(file);
    // The snapshot on disk is the raw API response, reloadable by loadSets.
    expect(await createAppmiralLineupSource(cfg, { file }).loadSets()).toHaveLength(2);
  });

  test("guards a shrink: keeps the snapshot, parks the fetch in a sidecar", async () => {
    const file = tmp();
    writeFileSync(file, JSON.stringify(raw));
    const shrunk: AppmiralLineupResponse = { data: raw.data.slice(0, 1) };
    const src = createAppmiralLineupSource(cfg, { file, fetchJson: async <T>() => shrunk as T });
    const res = await src.refresh!();
    expect(res.written).toBe(false);
    expect(res.file).toBe(`${file}.fetched.json`);
    expect(res.note).toContain("not overwriting");
    // Original snapshot untouched.
    expect(await createAppmiralLineupSource(cfg, { file }).loadSets()).toHaveLength(2);
  });

  test("--force overwrites a shrink", async () => {
    const file = tmp();
    writeFileSync(file, JSON.stringify(raw));
    const shrunk: AppmiralLineupResponse = { data: raw.data.slice(0, 1) };
    const src = createAppmiralLineupSource(cfg, { file, fetchJson: async <T>() => shrunk as T });
    const res = await src.refresh!({ force: true });
    expect(res.written).toBe(true);
    expect(res.file).toBe(file);
    expect(await createAppmiralLineupSource(cfg, { file }).loadSets()).toHaveLength(1);
  });

  test("has no refresh when no snapshot file is configured", () => {
    expect(createAppmiralLineupSource(cfg, {}).refresh).toBeUndefined();
  });
});

describe("sortLineupById", () => {
  test("sorts artists and their performances by id, without mutating input", () => {
    const unordered: AppmiralLineupResponse = {
      data: [
        { id: 30, name: "Zed", performances: [{ id: 900 }, { id: 100 }] },
        { id: 10, name: "Ann", performances: [{ id: 5 }] },
        { id: 20, name: "Moe" },
      ],
      _meta: { keep: true },
    };
    const sorted = sortLineupById(unordered);
    expect(sorted.data.map((a) => a.id)).toEqual([10, 20, 30]);
    expect(sorted.data[2]?.performances?.map((p) => p.id)).toEqual([100, 900]);
    expect(sorted._meta).toEqual({ keep: true });
    // input untouched (pure)
    expect(unordered.data.map((a) => a.id)).toEqual([30, 10, 20]);
  });

  test("is idempotent — re-sorting an already-sorted response is a no-op", () => {
    const once = sortLineupById(raw);
    expect(JSON.stringify(sortLineupById(once))).toBe(JSON.stringify(once));
  });
});

/**
 * A performance with no stage at all.
 *
 * ATN published "Memory" (Seanchoíche, Sun 2 Aug) with `stage_name: null` and
 * no `stage_id` on 2026-07-31. The parser fell back to the literal slug
 * "unknown", which keys into no venue and no walk edge — so the planner would
 * route someone to a stage that does not exist, at the 12-minute default walk.
 * A set nobody can be directed to is not schedulable.
 */
describe("performances with no stage", () => {
  const raw = {
    data: [
      {
        id: 1,
        name: "Memory",
        performances: [
          {
            id: 10,
            published: true,
            start_time: "2026-08-02T13:30:00+00:00",
            end_time: "2026-08-02T15:30:00+00:00",
          },
        ],
      },
      {
        id: 2,
        name: "Real Act",
        performances: [
          {
            id: 11,
            published: true,
            stage_name: "The Well",
            start_time: "2026-08-02T13:30:00+00:00",
            end_time: "2026-08-02T14:30:00+00:00",
          },
        ],
      },
    ],
  };

  test("drops a set that has neither stage_name nor stage_id", () => {
    const sets = parseAppmiralLineup(raw);
    expect(sets.map((s) => s.name)).toEqual(["Real Act"]);
  });

  test("never emits the literal slug 'unknown'", () => {
    expect(parseAppmiralLineup(raw).some((s) => s.stage === "unknown")).toBe(false);
  });

  test("still keeps a set that has only a stage_id", () => {
    const byId = { data: [{ id: 3, name: "IdOnly", performances: [{ id: 12, published: true, stage_id: 99, start_time: "2026-08-02T13:30:00+00:00", end_time: "2026-08-02T14:00:00+00:00" }] }] };
    expect(parseAppmiralLineup(byId).map((s) => s.stage)).toEqual(["stage-99"]);
  });
});
