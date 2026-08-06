import { describe, expect, test } from "vitest";
import { informationalPois, diffPlacedPois } from "./map-watch.js";
import type { AppmiralMap, AppmiralPoi } from "@festival-bot/adapters";

/**
 * ATN's 2026 map published (2026-07-29) as FOUR georeferenced raster tiles and
 * nothing else — corner polygons carrying `map_overlay_image`, with all 42
 * declared categories (Stages, Bars, Toilets, …) empty. The watch's old gate was
 * `pois.length === 0`, so those four tiles tripped it, it announced "MAP
 * AVAILABLE (4 POIs)" and self-stopped — leaving nothing watching for the actual
 * venue data. Operator call (2026-07-29): treat the map as a work in progress and
 * keep watching until the categories are filled.
 */
const map = {
  id: 538,
  categories: [
    { id: 20102, name: "Overlay" },
    { id: 20101, name: "Stages" },
    { id: 20090, name: "Toilets" },
  ],
} as unknown as AppmiralMap;

const cornerTile = (id: number, name: string): AppmiralPoi =>
  ({
    id,
    name,
    category_id: 20102,
    type: "polygon",
    coordinates: [{ lat: 52.3, lng: -7.37 }],
    map_overlay_image: { "3000": "https://media.appmiral.com/…jpeg" },
  }) as unknown as AppmiralPoi;

const stage = (id: number, name: string): AppmiralPoi =>
  ({
    id,
    name,
    category_id: 20101,
    type: "polygon",
    coordinates: [{ lat: 52.3, lng: -7.37 }],
  }) as unknown as AppmiralPoi;

describe("informationalPois", () => {
  test("treats the four raster corner tiles as NOT informational", () => {
    const pois = [
      cornerTile(363789, "Top Right Corner"),
      cornerTile(363788, "Top Left Corner"),
      cornerTile(363790, "Bottom Right Corner"),
      cornerTile(363791, "Bottom Left Corner"),
    ];
    expect(informationalPois(map, pois)).toEqual([]);
  });

  test("counts a real stage POI as informational", () => {
    const pois = [cornerTile(363789, "Top Right Corner"), stage(1, "ATN Main Stage")];
    expect(informationalPois(map, pois).map((p) => p.name)).toEqual(["ATN Main Stage"]);
  });

  test("excludes an overlay-image POI even if it is filed outside the Overlay category", () => {
    // Defensive: don't rely on the category name alone — the image itself is the
    // giveaway that a record is a backdrop tile rather than a place.
    const strayTile = { ...cornerTile(9, "Stray Tile"), category_id: 20101 } as AppmiralPoi;
    expect(informationalPois(map, [strayTile])).toEqual([]);
  });

  test("keeps a POI that has no coordinates out of the count", () => {
    const noCoords = { id: 2, name: "Ghost", category_id: 20090 } as unknown as AppmiralPoi;
    expect(informationalPois(map, [noCoords])).toEqual([]);
  });

  test("returns every real POI when the categories are finally populated", () => {
    const pois = [
      cornerTile(363789, "Top Right Corner"),
      stage(1, "ATN Main Stage"),
      { id: 3, name: "Toilets A", category_id: 20090, coordinates: [{ lat: 52.3, lng: -7.37 }] } as unknown as AppmiralPoi,
    ];
    expect(informationalPois(map, pois)).toHaveLength(2);
  });
});

/**
 * ATN began placing real stage POIs on 2026-07-29 and was still mid-edit when
 * the watch fired — 4 of ~20 stages, plus two unnamed "New Marker" records with
 * no coordinates. A one-shot watch is the wrong shape for that: it announces the
 * first four and then goes quiet for the rest. The standing call is to treat
 * the map as a work in progress, so the watch diffs the placed set instead.
 */
const placed = (id: number, name: string, lat: number, lng: number) =>
  ({ id, name, category_id: 20098, coordinates: [{ lat, lng }] }) as unknown as AppmiralPoi;

describe("diffPlacedPois", () => {
  const a = placed(1, "ATN Main", 52.2951, -7.3575);
  const b = placed(2, "Born Social", 52.2947, -7.3620);

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
    const movedB = placed(2, "Born Social", 52.2929, -7.3620);
    const d = diffPlacedPois([a, b], [a, movedB]);
    expect(d.moved).toHaveLength(1);
    expect(d.moved[0]!.name).toBe("Born Social");
    expect(d.moved[0]!.metres).toBeGreaterThan(150);
  });

  test("ignores sub-10m jitter so a re-save does not spam the session", () => {
    const nudged = placed(2, "Born Social", 52.29471, -7.3620);
    expect(diffPlacedPois([a, b], [a, nudged]).moved).toEqual([]);
  });

  test("treats a rename at the same spot as a move, not an add plus a remove", () => {
    const renamed = placed(2, "Born Social by Schweppes", 52.2947, -7.3620);
    const d = diffPlacedPois([a, b], [a, renamed]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.moved.map((m) => m.name)).toEqual(["Born Social by Schweppes"]);
  });
});
