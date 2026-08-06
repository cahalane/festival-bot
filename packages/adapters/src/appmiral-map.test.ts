import { describe, expect, test } from "vitest";
import { createAppmiralMapSource, type AppmiralMap, type AppmiralPoi } from "./appmiral-map.js";

const config = { event: "atn26", edition: "2026", xProtect: "test-token" };

const maps: AppmiralMap[] = [
  {
    id: 1,
    categories: [
      { id: 10, name: "Stage", type: "poi" },
      { id: 20, name: "Bar", type: "poi" },
    ],
  },
];

function source(pois: AppmiralPoi[]) {
  return createAppmiralMapSource(config, {
    fetchMaps: async () => maps,
    fetchPois: async () => pois,
  });
}

describe("createAppmiralMapSource", () => {
  test("drops a POI with a deleted_at timestamp", async () => {
    const pois: AppmiralPoi[] = [
      { id: 1, name: "Ghost Stage", category_id: 10, coordinates: [{ lat: 52.1, lng: -7.1 }], deleted_at: "2026-07-01T00:00:00Z" },
      { id: 2, name: "Live Stage", category_id: 10, coordinates: [{ lat: 52.2, lng: -7.2 }] },
    ];
    const out = await source(pois).loadPois();
    expect(out.map((p) => p.name)).toEqual(["Live Stage"]);
  });

  test("drops a POI with no coordinates", async () => {
    const pois: AppmiralPoi[] = [
      { id: 1, name: "No Coords", category_id: 10 },
      { id: 2, name: "Empty Coords", category_id: 10, coordinates: [] },
      { id: 3, name: "Fine", category_id: 10, coordinates: [{ lat: 52.2, lng: -7.2 }] },
    ];
    const out = await source(pois).loadPois();
    expect(out.map((p) => p.name)).toEqual(["Fine"]);
    expect(out.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true);
  });

  test("reduces polygon coordinates to their centroid", async () => {
    const pois: AppmiralPoi[] = [
      {
        id: 1,
        name: "Field",
        category_id: 10,
        coordinates: [
          { lat: 52.0, lng: -7.0 },
          { lat: 52.2, lng: -7.0 },
          { lat: 52.2, lng: -7.2 },
          { lat: 52.0, lng: -7.2 },
        ],
      },
    ];
    const out = await source(pois).loadPois();
    expect(out).toHaveLength(1);
    expect(out[0]!.lat).toBeCloseTo(52.1);
    expect(out[0]!.lng).toBeCloseTo(-7.1);
  });

  test("resolves category_id to the human-readable name via the maps categories", async () => {
    const pois: AppmiralPoi[] = [
      { id: 1, name: "Big Romance Dome", category_id: 10, coordinates: [{ lat: 52.2, lng: -7.2 }] },
      { id: 2, name: "The Snug", category_id: 20, coordinates: [{ lat: 52.3, lng: -7.3 }] },
    ];
    const out = await source(pois).loadPois();
    expect(out.find((p) => p.name === "Big Romance Dome")?.category).toBe("Stage");
    expect(out.find((p) => p.name === "The Snug")?.category).toBe("Bar");
  });

  test("unresolvable category_id produces an empty-string category, not a crash or the raw id", async () => {
    const pois: AppmiralPoi[] = [{ id: 1, name: "Mystery Spot", category_id: 999, coordinates: [{ lat: 52.2, lng: -7.2 }] }];
    const out = await source(pois).loadPois();
    expect(out[0]!.category).toBe("");
  });

  test("emits id as a string", async () => {
    const pois: AppmiralPoi[] = [{ id: 42, name: "Numbered", category_id: 10, coordinates: [{ lat: 52.2, lng: -7.2 }] }];
    const out = await source(pois).loadPois();
    expect(out[0]!.id).toBe("42");
    expect(typeof out[0]!.id).toBe("string");
  });

  test("flags backdrop:true when the vendor record carries a non-empty map_overlay_image, even under an ordinary category", async () => {
    const pois: AppmiralPoi[] = [
      {
        id: 1,
        name: "Corner Tile",
        category_id: 10,
        coordinates: [{ lat: 52.2, lng: -7.2 }],
        map_overlay_image: { medium: "https://example.com/tile.png" },
      },
    ];
    const out = await source(pois).loadPois();
    expect(out[0]!.category).toBe("Stage");
    expect(out[0]!.backdrop).toBe(true);
  });

  test("no backdrop flag when map_overlay_image is absent or all values are empty strings", async () => {
    const pois: AppmiralPoi[] = [
      { id: 1, name: "No Overlay Field", category_id: 10, coordinates: [{ lat: 52.2, lng: -7.2 }] },
      {
        id: 2,
        name: "Empty Overlay",
        category_id: 10,
        coordinates: [{ lat: 52.2, lng: -7.2 }],
        map_overlay_image: { medium: "", large: "" },
      },
    ];
    const out = await source(pois).loadPois();
    expect(out.every((p) => !p.backdrop)).toBe(true);
  });
});
