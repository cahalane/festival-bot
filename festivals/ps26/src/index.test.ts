import { describe, expect, test } from "vitest";
import { createFestival } from "./index.js";

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
    expect((await f.sources.lineup.loadSets()).length).toBeGreaterThan(50);
  });

  test("favourites is wired only when Clashfinder secrets are supplied", () => {
    expect(createFestival().sources.favourites).toBeUndefined();
    const withCf = createFestival({ secrets: { clashfinder: { authUsername: "u", authPublicKey: "k" } } });
    expect(withCf.sources.favourites).toBeDefined();
  });
});
