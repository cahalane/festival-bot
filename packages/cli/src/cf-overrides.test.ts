import { describe, expect, test } from "vitest";
import { applyDisplayNames, loadCfOverrides, type CfOverrides } from "./cf-overrides.js";
import type { ArtistSet } from "@festival-bot/core";

/**
 * Community edits on the Clashfinder mirror.
 *
 * Operator note, 2026-08-01: someone had hand-entered the six Seanchoíche sessions on
 * Clashfinder — the app had them as bare words ("Love", "Memory") with no clue
 * what they were — and my cf-push overwrote the lot. The push replaces the whole
 * event, so anything a human added by hand is destroyed on the next sync.
 *
 * The mirror is a shared artefact other people contribute to, and automation
 * that silently deletes their work is worse than automation that lags. This is
 * the display layer that lets their contributions survive: overrides live in
 * the festival module, are applied at PUSH time only, and never touch the
 * planner's own names (which have to keep matching the lineup feed for
 * favourites resolution).
 */
const set = (name: string, stage = "seancho-che"): ArtistSet => ({
  name,
  slug: name.toLowerCase().replace(/\W+/g, "-"),
  stage,
  start: new Date("2026-08-01T12:00:00+01:00"),
  end: new Date("2026-08-01T14:00:00+01:00"),
  durationMin: 120,
});

const overrides: CfOverrides = {
  displayNames: { Love: "Seanchoíche: Love", Memory: "Seanchoíche: Memory" },
};

describe("applyDisplayNames", () => {
  test("renames a set for the mirror", () => {
    const [s] = applyDisplayNames([set("Love")], overrides);
    expect(s!.name).toBe("Seanchoíche: Love");
  });

  test("leaves sets with no override untouched", () => {
    const [s] = applyDisplayNames([set("Pulp", "atn-main-stage")], overrides);
    expect(s!.name).toBe("Pulp");
  });

  test("does not mutate the input — the planner keeps the feed's names", () => {
    // Favourites resolution matches against the lineup feed, so renaming in
    // place would silently unmatch everyone's stars.
    const original = set("Love");
    applyDisplayNames([original], overrides);
    expect(original.name).toBe("Love");
  });

  test("preserves times and stage", () => {
    const src = set("Memory");
    const [s] = applyDisplayNames([src], overrides);
    expect(s!.stage).toBe("seancho-che");
    expect(s!.start.getTime()).toBe(src.start.getTime());
    expect(s!.durationMin).toBe(120);
  });

  test("returns the list unchanged when there are no overrides", () => {
    const sets = [set("Love")];
    expect(applyDisplayNames(sets, {})[0]!.name).toBe("Love");
  });

  test("handles an empty override map without touching anything", () => {
    expect(applyDisplayNames([set("Love")], { displayNames: {} })[0]!.name).toBe("Love");
  });
});

describe("loadCfOverrides", () => {
  test("returns empty overrides when the file is absent", () => {
    expect(loadCfOverrides("/nonexistent/cf-overrides.json")).toEqual({});
  });
});
