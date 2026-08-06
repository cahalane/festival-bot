import { describe, expect, test } from "vitest";
import { createFestival } from "./index.js";

describe("atn26 festival module", () => {
  test("assembles the manifest, venues and knowledge", () => {
    const f = createFestival();
    expect(f.manifest.slug).toBe("atn26");
    expect(f.manifest.timezone).toBe("Europe/Dublin");
    expect(f.manifest.dayCutoffHour).toBe(6);
    // 16 mapped stages, then seven that appeared as the lineup filled out:
    // Big Romance Dome x Altos (2026-07-24), Dance Forever: Red Bull x Izakaya,
    // Lover's Rock and GoLoud. Lounge (all 2026-07-27), and All Curious Minds
    // (2026-07-29, already carrying three sets when it turned up), and
    // Seanchoíche (2026-07-31, whose accented í slugifies to seancho-che), and
    // the Heineken Garden (a BAR, registered 2026-08-01 for a Mary Wallopers pop-up).
    expect(f.venues.venues.length).toBe(23);
    expect(f.venues.walk.defaultMinutes).toBe(12);
    expect(f.knowledge?.runbook).toContain("Appmiral");
  });

  /**
   * Venue ORDER is the ATN app's own stage order, and cf-push uses it verbatim
   * for the Clashfinder column order. I alphabetised the list on 2026-08-01
   * while registering new stages, and the mirror came out alphabetical — the
   * operator spotted it within the hour. Sorting this list is a user-visible regression.
   */
  test("venues stay in the app's stage order, not alphabetical", () => {
    const slugs = createFestival().venues.venues.map((v) => v.slug);
    expect(slugs[0]).toBe("atn-main-stage");
    expect(slugs[1]).toBe("something-kind-of-wonderful");
    expect(slugs[2]).toBe("road-to-nowhere");
    expect(slugs).not.toEqual([...slugs].sort());
  });

  test("wires the Appmiral lineup to the bundled snapshot (offline)", async () => {
    const sets = await createFestival().sources.lineup.loadSets();
    expect(sets.length).toBeGreaterThan(350);
    expect(sets.every((s) => s.durationMin > 0)).toBe(true);
    expect(sets.some((s) => s.name === "Pulp")).toBe(true);
  });

  test("every set's stage slug keys into the venue/walk graph", async () => {
    const f = createFestival();
    const venueSlugs = new Set(f.venues.venues.map((v) => v.slug));
    const sets = await f.sources.lineup.loadSets();
    expect(sets.filter((s) => !venueSlugs.has(s.stage))).toHaveLength(0);
  });

  test("wires the shared weather source from coordinates", () => {
    expect(createFestival().sources.weather).toBeDefined();
  });

  test("registers the Appmiral notifications announcements source when x-protect is present", () => {
    const withTok = createFestival({ secrets: { appmiral: { xProtect: "tok" } } });
    expect(withTok.sources.announcements).toBeDefined();
  });

  test("omits announcements when no x-protect token", () => {
    expect(createFestival({}).sources.announcements).toBeUndefined();
  });
});
