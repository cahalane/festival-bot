import { describe, expect, test } from "vitest";
import { informationalPois, diffPlacedPois } from "./map-watch.js";
import type { SitePoi } from "@festival-bot/core";

/**
 * One festival's 2026 map published as FOUR georeferenced raster tiles and
 * nothing else — corner polygons carrying the vendor-neutral
 * "map_overlay_image" category, with every real category empty. The watch's
 * old gate was `pois.length === 0`, so those four tiles tripped it, it
 * announced "MAP AVAILABLE (4 POIs)" and self-stopped — leaving nothing
 * watching for the actual venue data. Operator call: treat the map as a work
 * in progress and keep watching until real categories are filled.
 */
const cornerTile = (id: number, name: string): SitePoi => ({
  id: String(id),
  name,
  category: "map_overlay_image",
  lat: 52.3,
  lng: -7.37,
});

const stage = (id: number, name: string): SitePoi => ({
  id: String(id),
  name,
  category: "Stages",
  lat: 52.3,
  lng: -7.37,
});

describe("informationalPois", () => {
  test("treats the four raster corner tiles as NOT informational", () => {
    const pois = [
      cornerTile(363789, "Top Right Corner"),
      cornerTile(363788, "Top Left Corner"),
      cornerTile(363790, "Bottom Right Corner"),
      cornerTile(363791, "Bottom Left Corner"),
    ];
    expect(informationalPois(pois)).toEqual([]);
  });

  test("counts a real stage POI as informational", () => {
    const pois = [cornerTile(363789, "Top Right Corner"), stage(1, "Main Stage")];
    expect(informationalPois(pois).map((p) => p.name)).toEqual(["Main Stage"]);
  });

  test("returns every real POI when the categories are finally populated", () => {
    const pois = [
      cornerTile(363789, "Top Right Corner"),
      stage(1, "Main Stage"),
      { id: "3", name: "Toilets A", category: "Toilets", lat: 52.3, lng: -7.37 } as SitePoi,
    ];
    expect(informationalPois(pois)).toHaveLength(2);
  });
});

/**
 * A festival may place real stage POIs incrementally — a handful at a time —
 * so a one-shot watch is the wrong shape: it announces the first batch and
 * then goes quiet for the rest. The standing call is to treat the map as a
 * work in progress, so the watch diffs the placed set instead.
 */
const placed = (id: number, name: string, lat: number, lng: number): SitePoi => ({
  id: String(id),
  name,
  category: "Stages",
  lat,
  lng,
});

describe("diffPlacedPois", () => {
  const a = placed(1, "ATN Main", 52.2951, -7.3575);
  const b = placed(2, "Born Social", 52.2947, -7.362);

  test("reports nothing when the placed set is unchanged", () => {
    const d = diffPlacedPois([a, b], [a, b]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.moved).toEqual([]);
  });

  test("reports a newly placed stage", () => {
    expect(diffPlacedPois([a], [a, b]).added.map((p) => p.name)).toEqual(["Born Social"]);
  });

  test("reports a POI that disappeared", () => {
    expect(diffPlacedPois([a, b], [a]).removed.map((p) => p.name)).toEqual(["Born Social"]);
  });

  test("reports a POI whose position moved meaningfully", () => {
    // ~200m south — the size of the Circle-onto-the-Jameson-bar misplacement.
    const movedB = placed(2, "Born Social", 52.2929, -7.362);
    const d = diffPlacedPois([a, b], [a, movedB]);
    expect(d.moved).toHaveLength(1);
    expect(d.moved[0]!.name).toBe("Born Social");
    expect(d.moved[0]!.metres).toBeGreaterThan(150);
  });

  test("ignores sub-10m jitter so a re-save does not spam the session", () => {
    const nudged = placed(2, "Born Social", 52.29471, -7.362);
    expect(diffPlacedPois([a, b], [a, nudged]).moved).toEqual([]);
  });

  test("treats a rename at the same spot as a move, not an add plus a remove", () => {
    const renamed = placed(2, "Born Social by Schweppes", 52.2947, -7.362);
    const d = diffPlacedPois([a, b], [a, renamed]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.moved.map((m) => m.name)).toEqual(["Born Social by Schweppes"]);
  });
});
