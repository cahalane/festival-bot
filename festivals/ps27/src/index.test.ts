import { describe, expect, test } from "vitest";
import { createFestival, PS27_EVENTS, PS27_FAVOURITES_EVENT } from "./index.js";

describe("createFestival (ps27 skeleton)", () => {
  test("assembles the pack and every source the vendor adapter provides", () => {
    const f = createFestival();
    expect(f.manifest.slug).toBe("ps27");
    expect(f.manifest.timezone).toBe("Europe/Madrid");
    expect(f.sources.lineup).toBeDefined();
    expect(f.sources.artistInfo).toBeDefined();
    expect(f.sources.announcements).toBeDefined();
    expect(f.sources.pages).toBeDefined();
    expect(f.sources.artistIds).toBeDefined();
    expect(f.sources.weather).toBeDefined();
  });

  test("targets the 2027 Fòrum event and declares no ciutat programme yet", () => {
    expect(PS27_EVENTS.forum).toBe("primavera-sound-2027-barcelona");
    expect(PS27_EVENTS.ciutat).toBeUndefined();
  });

  test("favourites point at the mirror THIS deployment publishes, not ps26's community event", () => {
    // The topology difference from ps26. If this ever reads "ps26" again, the crew
    // would be starring on someone else's event while cf-push writes to ours.
    expect(PS27_FAVOURITES_EVENT).toBe("psb27");
    const withCf = createFestival({ secrets: { clashfinder: { authUsername: "u", authPublicKey: "k" } } });
    expect(withCf.sources.favourites).toBeDefined();
    expect(createFestival().sources.favourites).toBeUndefined();
  });

  test("says there is no lineup yet rather than reporting an empty timetable", async () => {
    // An empty set list would render as "nothing on" — a claim about the festival.
    // Until PS publishes 2027, the honest answer is that we have no data.
    await expect(createFestival().sources.lineup.loadSets()).rejects.toThrow(/no lineup snapshot/);
  });

  test("carries no dates: they are unannounced, and a guess would be fabricated data", () => {
    expect(createFestival().manifest.days).toEqual({});
  });
});
