import { describe, expect, test } from "vitest";
import {
  greencopperSlugify,
  greencopperBundlePassword,
  pickLatestRelease,
  parseGreencopperLineup,
  greencopperVenuesFromBundle,
  greencopperArtistInfoMap,
  type GreencopperBundle,
  type GreencopperOtaEntry,
} from "./greencopper.js";

const bundle: GreencopperBundle = {
  strings: {
    activity_name_1: "Fontaines DC",
    activity_name_2: "The Mary Wallopers",
    activity_name_3: "Ghost Set",
    activity_description_1: "Dublin post-punk.",
    location_name_10: "Rankins Wood",
    location_name_11: "Salty Dog",
  },
  stages: [
    { id: 10, name: "location_name_10", order: 2 },
    { id: 11, name: "location_name_11", order: 1 },
  ],
  scheduleItems: [
    { id: 100, activityId: 900, name: "activity_name_1", description: "activity_description_1", stageId: 10 },
    { id: 101, activityId: 901, name: "activity_name_2", stageId: 11 },
    // No matching timeSlot -> not schedulable.
    { id: 102, activityId: 902, name: "activity_name_3", stageId: 10 },
  ],
  timeSlots: [
    {
      id: 200,
      scheduleItemId: 100,
      dayOfEvent: "2026-08-30T12:00:00+01:00",
      startDate: "2026-08-30T22:30:00+01:00",
      endDate: "2026-08-31T00:00:00+01:00",
    },
    {
      id: 201,
      scheduleItemId: 101,
      dayOfEvent: "2026-08-29T12:00:00+01:00",
      startDate: "2026-08-29T19:15:00+01:00",
      endDate: "2026-08-29T20:15:00+01:00",
    },
  ],
};

describe("greencopperSlugify", () => {
  test("lowercases and dash-joins", () => {
    expect(greencopperSlugify("Rankins Wood")).toBe("rankins-wood");
    expect(greencopperSlugify("Croi - Mainstage")).toBe("croi-mainstage");
    expect(greencopperSlugify("Metro 🚇")).toBe("metro");
  });
});

describe("greencopperBundlePassword", () => {
  // The derivation recovered from ConcreteContentArchiveOpener.kt:
  //   password = fileName.replace(".zip", secret + "zip")
  test("splices the secret in place of the .zip extension", () => {
    expect(greencopperBundlePassword("content_v39.zip", "abc123")).toBe("content_v39abc123zip");
  });

  test("derives per-version, so each bundle has its own password", () => {
    expect(greencopperBundlePassword("content_v25.zip", "s")).toBe("content_v25szip");
    expect(greencopperBundlePassword("content_v39.zip", "s")).toBe("content_v39szip");
  });

  test("rejects a filename that is not a .zip (would silently yield a wrong password)", () => {
    expect(() => greencopperBundlePassword("content_v39.tar", "s")).toThrow(/\.zip/);
  });
});

describe("pickLatestRelease", () => {
  const entries: GreencopperOtaEntry[] = [
    { version: 37, schema: 1, url: "u37", type: "release", project: "p" },
    { version: 39, schema: 1, url: "u39", type: "release", project: "p" },
    { version: 38, schema: 1, url: "u38", type: "release", project: "p" },
    // Unpublished drafts must never win over a real release.
    { version: 40, schema: 1, url: "u40", type: "in_progress", project: "p" },
  ];

  test("picks the highest-versioned release, ignoring in_progress", () => {
    expect(pickLatestRelease(entries)?.version).toBe(39);
  });

  test("returns null when nothing is released yet", () => {
    expect(pickLatestRelease([{ version: 1, schema: 1, url: "u", type: "in_progress", project: "p" }])).toBeNull();
  });

  test("returns null on an empty manifest", () => {
    expect(pickLatestRelease([])).toBeNull();
  });
});

describe("parseGreencopperLineup", () => {
  const sets = parseGreencopperLineup(bundle);

  test("resolves name and stage keys through the strings table", () => {
    const s = sets.find((x) => x.name === "Fontaines DC")!;
    expect(s).toBeDefined();
    expect(s.stage).toBe("rankins-wood");
    expect(s.slug).toBe("fontaines-dc");
  });

  test("keeps the feed's local offset rather than shifting the wall clock", () => {
    // 22:30+01:00 is the real-world set time; a UTC double-conversion would show 21:30.
    const s = sets.find((x) => x.name === "Fontaines DC")!;
    expect(s.start.toISOString()).toBe("2026-08-30T21:30:00.000Z");
    expect(s.durationMin).toBe(90);
  });

  test("handles a set crossing midnight", () => {
    const s = sets.find((x) => x.name === "Fontaines DC")!;
    expect(s.end.getTime() - s.start.getTime()).toBe(90 * 60_000);
  });

  test("drops a schedule item with no time slot", () => {
    // A set nobody can be placed in time is not plannable.
    expect(sets.some((x) => x.name === "Ghost Set")).toBe(false);
    expect(sets).toHaveLength(2);
  });

  test("is deterministic (sorted by start, then stage, then name)", () => {
    expect(sets.map((s) => s.name)).toEqual(["The Mary Wallopers", "Fontaines DC"]);
  });
});

describe("greencopperVenuesFromBundle", () => {
  // Feed order, NOT `order`: that field is present on only some stages in real
  // bundles, so sorting by it would be non-deterministic where it is missing.
  test("returns distinct resolved stages in feed order", () => {
    expect(greencopperVenuesFromBundle(bundle)).toEqual([
      { slug: "rankins-wood", name: "Rankins Wood" },
      { slug: "salty-dog", name: "Salty Dog" },
    ]);
  });
});

describe("greencopperArtistInfoMap", () => {
  test("indexes resolved descriptions by act slug", () => {
    const m = greencopperArtistInfoMap(bundle);
    expect(m.get("fontaines-dc")?.bio).toBe("Dublin post-punk.");
  });

  test("omits a bio when the description key does not resolve", () => {
    const m = greencopperArtistInfoMap(bundle);
    expect(m.get("the-mary-wallopers")?.bio).toBe("");
  });
});
