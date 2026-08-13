import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatInZone } from "@festival-bot/core";
import { parseLineup, createPsLineupSource } from "./primavera-lineup.js";
import type { RawLineup } from "./primavera-lineup.js";

const rawOf = (n: number): RawLineup =>
  ({
    data: {
      getLineupEvent: {
        artists: Array.from({ length: n }, (_, i) => ({
          artistName: `A${i}`,
          artistSlugName: `a${i}`,
          duration: 60,
          venues: [{ venueSlugName: "port", duration: 60, dateTimeStartReal: String(1_780_000_000_000 + i * 3_600_000) }],
        })),
      },
    },
  }) as RawLineup;

const raw = {
  data: {
    getLineupEvent: {
      artists: [
        {
          artistName: "st.frances",
          artistSlugName: "st-frances",
          venues: [{ venueSlugName: "auditori-rockdelux", duration: 60, dateTimeStartReal: "1780756200000" }],
        },
        {
          artistName: "Plenitude Open Hours",
          artistSlugName: "plenitude-open",
          venues: [{ venueSlugName: "plenitude", duration: 720, dateTimeStartReal: "1780700000000" }],
        },
      ],
    },
  },
};

describe("parseLineup", () => {
  test("converts epoch-ms starts to instants and computes end", () => {
    const sets = parseLineup(raw);
    const s = sets.find((x) => x.name === "st.frances")!;
    expect(s.stage).toBe("auditori-rockdelux");
    expect(s.durationMin).toBe(60);
    expect(s.start.getTime()).toBe(1780756200000);
    expect(s.end.getTime()).toBe(1780756200000 + 60 * 60_000);
    // wall-clock sanity in festival tz
    expect(formatInZone(s.start, "Europe/Madrid")).toMatch(/Sat.*16:30/);
  });

  test("names a missing event instead of dying on a property of null", () => {
    // What a not-yet-announced edition actually returns: HTTP 200, and
    // `getLineupEvent: null`. Verified live against primavera-sound-2027-barcelona.
    const missing = { data: { getLineupEvent: null } } as unknown as RawLineup;
    expect(() => parseLineup(missing)).toThrow(/no lineup event by that name/);
  });

  test("filters out the >=600-min non-music open-hours filler", () => {
    const sets = parseLineup(raw);
    expect(sets.map((s) => s.name)).toEqual(["st.frances"]);
    expect(sets.some((s) => s.durationMin >= 600)).toBe(false);
  });
});

// Reading a real bundled snapshot is a per-edition concern and is asserted in the
// festival module's own test (festivals/ps26/src/index.test.ts) — this adapter
// ships no snapshot of its own.

describe("createPsLineupSource refresh (live fetch + snapshot guard)", () => {
  let dir: string;
  let forumFile: string;
  let ciutatFile: string;
  let forumSize: number;
  let ciutatSize: number;

  const fake = async <T>(u: string): Promise<T> => (u.includes("ciutat") ? rawOf(ciutatSize) : rawOf(forumSize)) as T;
  const EVENTS = { forum: "primavera-sound-2026-barcelona", ciutat: "primavera-ciutat-2026-barcelona" };
  const make = () => createPsLineupSource(EVENTS, { file: forumFile, ciutatFile, fetchJson: fake });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ps26-lineup-"));
    forumFile = join(dir, "schedule.json");
    ciutatFile = join(dir, "ciutat.json");
    forumSize = 3;
    ciutatSize = 5;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("first forum refresh writes the snapshot and loadSets reads it back", async () => {
    const src = make();
    const res = await src.refresh!({ variant: "forum" });
    expect(res).toMatchObject({ variant: "forum", fetched: 3, previous: null, written: true, file: forumFile });
    expect((await src.loadSets()).length).toBe(3);
  });

  test("a shrunk re-fetch is guarded: original kept, data diverted to a sidecar", async () => {
    const src = make();
    await src.refresh!({ variant: "forum" }); // seed 3
    forumSize = 1; // feed pruned
    const res = await src.refresh!({ variant: "forum" });
    expect(res.written).toBe(false);
    expect(res.previous).toBe(3);
    expect(res.file).toBe(`${forumFile}.fetched.json`);
    expect((await src.loadSets()).length).toBe(3); // snapshot untouched
    expect(existsSync(`${forumFile}.fetched.json`)).toBe(true);
  });

  test("--force overrides the shrink guard and overwrites", async () => {
    const src = make();
    await src.refresh!({ variant: "forum" });
    forumSize = 1;
    const res = await src.refresh!({ variant: "forum", force: true });
    expect(res.written).toBe(true);
    expect((await src.loadSets()).length).toBe(1);
  });

  test("ciutat variant fetches the city event into the ciutat file, not the forum snapshot", async () => {
    const src = make();
    await src.refresh!({ variant: "forum" }); // forum = 3
    const res = await src.refresh!({ variant: "ciutat" });
    expect(res).toMatchObject({ variant: "ciutat", fetched: 5, written: true, file: ciutatFile });
    expect(readFileSync(ciutatFile, "utf8").length).toBeGreaterThan(0);
    expect((await src.loadSets()).length).toBe(3); // forum snapshot unaffected
  });

  test("an edition with no ciutat programme refuses the variant instead of fetching the forum", async () => {
    // ps27 will start life like this: a forum event and no city programme announced.
    // Silently falling back to the forum event would write the main lineup into the
    // ciutat snapshot and quietly double-count the festival.
    const src = createPsLineupSource({ forum: "primavera-sound-2027-barcelona" }, { file: forumFile, fetchJson: fake });
    await expect(src.refresh!({ variant: "ciutat" })).rejects.toThrow(/no `ciutat` programme/);
  });
});
