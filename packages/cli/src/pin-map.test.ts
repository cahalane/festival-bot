import { describe, expect, test } from "vitest";
import { compositeToPixel, resolvePins, cropBox, jpegSize, assertGeoFitsImage, type Geo } from "./pin-map.js";

/**
 * A "map of ATN with This Must Be The Place and the sauna pinned" was asked
 * for (2026-07-31), which needs the INVERSE of the transform the KML export
 * uses: real coordinates back onto the 6000x7500 composite raster.
 *
 * The georeference was validated before any of this was written: ATN's own five
 * general car park POIs project to within 47-118px (~15-38m) of the label
 * centres read off the raster by hand on 2026-07-29. That is the accuracy of a
 * hand-read label in a large field, not an error in the fit.
 */
const GEO: Geo = { lat0: 52.2838361, lat1: 52.3056716, lng0: -7.3829981, lng1: -7.3544336, w: 6000, h: 7500 };

describe("compositeToPixel", () => {
  test("puts the north-west corner at the image origin", () => {
    const p = compositeToPixel(GEO.lat1, GEO.lng0, GEO);
    expect(p.px).toBeCloseTo(0, 6);
    expect(p.py).toBeCloseTo(0, 6);
  });

  test("puts the south-east corner at the far pixel", () => {
    const p = compositeToPixel(GEO.lat0, GEO.lng1, GEO);
    expect(p.px).toBeCloseTo(GEO.w, 6);
    expect(p.py).toBeCloseTo(GEO.h, 6);
  });

  test("latitude increases upward — north is a SMALLER y", () => {
    // Getting this backwards flips the map vertically and would send someone
    // to the far end of the site, so it gets its own test.
    const north = compositeToPixel(52.3, -7.37, GEO);
    const south = compositeToPixel(52.29, -7.37, GEO);
    expect(north.py).toBeLessThan(south.py);
  });

  test("reproduces the sauna's known composite position", () => {
    const p = compositeToPixel(52.293233, -7.365592, GEO);
    expect(Math.round(p.px)).toBe(3656);
    expect(Math.round(p.py)).toBe(4272);
  });
});

const POIS = [
  { name: "This Must Be The Place", coordinates: [{ lat: 52.2907, lng: -7.3651 }] },
  { name: "Rise x VITHIT Hot Tub & Sauna Village", coordinates: [{ lat: 52.293233, lng: -7.365592 }] },
  { name: "ATN Main", coordinates: [{ lat: 52.2985, lng: -7.3576 }] },
  { name: "Nowhere", coordinates: [] },
];

describe("resolvePins", () => {
  test("matches on a case-insensitive substring", () => {
    const { pins } = resolvePins(POIS, ["this must be the place"]);
    expect(pins.map((p) => p.name)).toEqual(["This Must Be The Place"]);
  });

  test("matches a partial name the user would actually type", () => {
    const { pins } = resolvePins(POIS, ["sauna"]);
    expect(pins[0]!.name).toBe("Rise x VITHIT Hot Tub & Sauna Village");
  });

  test("uses the centroid of a multi-point POI", () => {
    const poly = [{ name: "Field", coordinates: [{ lat: 52.29, lng: -7.37 }, { lat: 52.31, lng: -7.35 }] }];
    const { pins } = resolvePins(poly, ["field"]);
    expect(pins[0]!.lat).toBeCloseTo(52.3, 6);
    expect(pins[0]!.lng).toBeCloseTo(-7.36, 6);
  });

  test("reports a query that matched nothing rather than dropping it", () => {
    // Silently returning one pin when two were asked for is the failure that
    // reads as a complete answer while being half of one.
    const { pins, unmatched } = resolvePins(POIS, ["sauna", "helipad"]);
    expect(pins).toHaveLength(1);
    expect(unmatched).toEqual(["helipad"]);
  });

  test("skips a POI carrying no coordinates", () => {
    const { pins, unmatched } = resolvePins(POIS, ["nowhere"]);
    expect(pins).toEqual([]);
    expect(unmatched).toEqual(["nowhere"]);
  });

  test("keeps the caller's order, not the document's", () => {
    const { pins } = resolvePins(POIS, ["sauna", "this must be"]);
    expect(pins.map((p) => p.name)).toEqual([
      "Rise x VITHIT Hot Tub & Sauna Village",
      "This Must Be The Place",
    ]);
  });

  test("returns one pin per query even when a name matches several POIs", () => {
    const dupes = [
      { name: "Water Station", coordinates: [{ lat: 52.29, lng: -7.37 }] },
      { name: "Water Station", coordinates: [{ lat: 52.30, lng: -7.36 }] },
    ];
    const { pins } = resolvePins(dupes, ["water station"]);
    expect(pins).toHaveLength(1);
  });
});

/**
 * The first render of that map came out with both pins in the wrong place.
 * The pins were right; the BACKDROP was wrong — the cached
 * `site_map_2026.jpg` is a 3000x3000 single tile, while the georeference
 * describes the 6000x7500 composite. A square image stretched into a 0.8
 * frame slid everything vertically, and the only reason it was caught is
 * that the artwork was read before sending.
 *
 * Nothing errored. So the aspect check is the guard: a raster whose shape
 * disagrees with the georeference is not a backdrop, it is a different map.
 */
describe("assertGeoFitsImage", () => {
  const GEO_A: Geo = { ...GEO };

  test("accepts the composite the georeference was built for", () => {
    expect(() => assertGeoFitsImage(6000, 7500, GEO_A)).not.toThrow();
  });

  test("accepts a correctly-proportioned downscale", () => {
    expect(() => assertGeoFitsImage(2400, 3000, GEO_A)).not.toThrow();
  });

  test("rejects the square single tile that caused the misplaced pins", () => {
    expect(() => assertGeoFitsImage(3000, 3000, GEO_A)).toThrow(/aspect/i);
  });

  test("names both shapes so the failure is diagnosable", () => {
    expect(() => assertGeoFitsImage(3000, 3000, GEO_A)).toThrow(/3000x3000/);
  });
});

describe("jpegSize", () => {
  test("reads dimensions from an SOF0 segment", () => {
    // Minimal JPEG: SOI, a skipped APP0, then SOF0 carrying 7500x6000.
    const buf = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x1d, 0x4c, 0x17, 0x70,
    ]);
    expect(jpegSize(buf)).toEqual({ w: 6000, h: 7500 });
  });

  test("returns null rather than guessing when there is no SOF", () => {
    expect(jpegSize(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
});

describe("cropBox", () => {
  const pts = [
    { px: 3656, py: 4272 },
    { px: 3756, py: 5698 },
  ];

  test("contains every pin", () => {
    const b = cropBox(pts, GEO, { padPx: 400, minPx: 100 });
    for (const p of pts) {
      expect(p.px).toBeGreaterThanOrEqual(b.x);
      expect(p.px).toBeLessThanOrEqual(b.x + b.w);
      expect(p.py).toBeGreaterThanOrEqual(b.y);
      expect(p.py).toBeLessThanOrEqual(b.y + b.h);
    }
  });

  test("never runs off the image", () => {
    const b = cropBox([{ px: 20, py: 20 }], GEO, { padPx: 800, minPx: 100 });
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(GEO.w);
    expect(b.y + b.h).toBeLessThanOrEqual(GEO.h);
  });

  test("gives a lone pin a usable window instead of a zero-size box", () => {
    const b = cropBox([{ px: 3000, py: 3000 }], GEO, { padPx: 0, minPx: 900 });
    expect(b.w).toBeGreaterThanOrEqual(900);
    expect(b.h).toBeGreaterThanOrEqual(900);
  });

  test("clamps a window larger than the image to the image", () => {
    const b = cropBox([{ px: 3000, py: 3000 }], GEO, { padPx: 0, minPx: 99_999 });
    expect(b.w).toBe(GEO.w);
    expect(b.h).toBe(GEO.h);
  });
});
