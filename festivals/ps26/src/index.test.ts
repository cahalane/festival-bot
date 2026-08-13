import { describe, expect, test } from "vitest";
import { createFestival, PS26_EVENTS } from "./index.js";

describe("createFestival (ps26 module assembly)", () => {
  test("assembles manifest, venues, knowledge and the always-available sources", async () => {
    const f = createFestival();
    expect(f.manifest.slug).toBe("ps26");
    expect(f.venues.limitedCapacity).toContain("auditori-rockdelux");
    expect(f.knowledge?.runbook).toMatch(/Jornada Inaugural/);
    expect(f.sources.lineup).toBeDefined();
    expect(f.sources.weather).toBeDefined(); // coordinates present -> weather wired
    expect(f.sources.artistInfo).toBeDefined();
    expect(f.sources.announcements).toBeDefined(); // BlueSky — live ops
    expect(f.sources.pages).toBeDefined(); // GraphQL editorial feed — diffable news
    expect(f.sources.artistIds).toBeDefined(); // Spotify ids — MusicBrainz disambiguation
    expect(f.sources.artistInfo?.infoMany).toBeDefined(); // batched bios for cf-push
    // Reads the real bundled 2026 snapshot: the filler is gone and a known act
    // lands on its known stage. The adapter ships no snapshot, so this per-edition
    // check lives here.
    const sets = await f.sources.lineup.loadSets();
    expect(sets.length).toBeGreaterThan(50);
    expect(sets.every((s) => s.durationMin < 600)).toBe(true);
    expect(sets.find((s) => s.name === "st.frances")?.stage).toBe("auditori-rockdelux");
  });

  test("declares the 2026 Fòrum and Ciutat events as distinct", () => {
    expect(PS26_EVENTS.forum).toBe("primavera-sound-2026-barcelona");
    expect(PS26_EVENTS.ciutat).toBe("primavera-ciutat-2026-barcelona");
    expect(PS26_EVENTS.forum).not.toBe(PS26_EVENTS.ciutat);
  });

  test("favourites is wired only when Clashfinder secrets are supplied", () => {
    expect(createFestival().sources.favourites).toBeUndefined();
    const withCf = createFestival({ secrets: { clashfinder: { authUsername: "u", authPublicKey: "k" } } });
    expect(withCf.sources.favourites).toBeDefined();
  });
});
