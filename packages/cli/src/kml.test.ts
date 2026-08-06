import { describe, expect, test } from "vitest";
import { buildKml, fitStaticToLatLng, kmlColor } from "./kml.js";

/**
 * Google My Maps caps a map at 10 layers, and one-layer-per-category came to 16
 * (operator note, 2026-07-29). So categories collapse into a few layers and are told
 * apart by icon + colour instead.
 */
describe("kmlColor", () => {
  test("converts #rrggbb to KML's aabbggrr byte order", () => {
    // The single easiest silent bug here: KML stores colour BACKWARDS relative
    // to CSS, so pure red written naively comes out pure blue on the map.
    expect(kmlColor("#ff0000")).toBe("ffff0000".replace(/^ff/, "ff").replace("ff0000", "0000ff"));
  });

  test("red and blue are actually swapped, not passed through", () => {
    expect(kmlColor("#ff0000")).toBe("ff0000ff"); // opaque, blue=00 green=00 red=ff
    expect(kmlColor("#0000ff")).toBe("ffff0000"); // opaque, blue=ff green=00 red=00
  });

  test("keeps green in the middle where it is unaffected by the swap", () => {
    expect(kmlColor("#00ff00")).toBe("ff00ff00");
  });

  test("accepts an explicit alpha for translucent area fills", () => {
    expect(kmlColor("#ff0000", 0.5)).toBe("800000ff");
  });

  test("tolerates a missing leading hash", () => {
    expect(kmlColor("ff0000")).toBe("ff0000ff");
  });
});

/**
 * A custom Google Map of every POI was requested (2026-07-29). Google My Maps
 * imports KML, so the export is KML — but our POI positions live in PIXELS on
 * ATN's site-map image, so they must be converted to real coordinates first.
 *
 * The conversion is fitted from stages whose real 2025 coordinates we hold,
 * which is the same bridge used to place Craft Cocktails.
 */
describe("fitStaticToLatLng", () => {
  // A clean synthetic frame: lng increases with x, lat DECREASES with y (north
  // is up on an image, so the y axis is inverted relative to latitude).
  const controls = [
    { px: 0, py: 0, lat: 52.4, lng: -7.4 },
    { px: 1000, py: 0, lat: 52.4, lng: -7.3 },
    { px: 0, py: 1000, lat: 52.3, lng: -7.4 },
    { px: 1000, py: 1000, lat: 52.3, lng: -7.3 },
  ];

  test("recovers the control points it was fitted from", () => {
    const f = fitStaticToLatLng(controls);
    const p = f(1000, 1000);
    expect(p.lat).toBeCloseTo(52.3, 6);
    expect(p.lng).toBeCloseTo(-7.3, 6);
  });

  test("interpolates a point between the controls", () => {
    const f = fitStaticToLatLng(controls);
    const p = f(500, 500);
    expect(p.lat).toBeCloseTo(52.35, 6);
    expect(p.lng).toBeCloseTo(-7.35, 6);
  });

  test("keeps latitude decreasing as pixel y increases", () => {
    const f = fitStaticToLatLng(controls);
    expect(f(0, 0).lat).toBeGreaterThan(f(0, 900).lat);
  });

  test("refuses to fit from too few controls rather than inventing a projection", () => {
    expect(() => fitStaticToLatLng(controls.slice(0, 1))).toThrow(/control/i);
  });
});

describe("buildKml", () => {
  const folders = [
    { name: "Stages", places: [{ name: "The Circle", lat: 52.29, lng: -7.36 }] },
    { name: "Bars", places: [{ name: "Wine Bar", lat: 52.291, lng: -7.361, description: "near the Circle" }] },
  ];

  test("emits one Folder per category so My Maps gets separate layers", () => {
    const kml = buildKml("ATN 2026", folders);
    expect(kml.match(/<Folder>/g)).toHaveLength(2);
    expect(kml).toContain("<name>Stages</name>");
    expect(kml).toContain("<name>Bars</name>");
  });

  test("writes coordinates in KML's lng,lat order — not lat,lng", () => {
    // Reversing these silently drops the map in the Indian Ocean, and it is the
    // single easiest mistake to make here.
    expect(buildKml("x", folders)).toContain("<coordinates>-7.36,52.29,0</coordinates>");
  });

  test("escapes XML metacharacters in names", () => {
    const kml = buildKml("x", [
      { name: "Food", places: [{ name: "Fish & Chips <best>", lat: 1, lng: 2 }] },
    ]);
    expect(kml).toContain("Fish &amp; Chips &lt;best&gt;");
    expect(kml).not.toContain("<best>");
  });

  test("includes a description only when one is supplied", () => {
    const kml = buildKml("x", folders);
    expect(kml).toContain("<description>near the Circle</description>");
    expect(kml.match(/<description>/g)).toHaveLength(1);
  });

  test("produces a single well-formed document envelope", () => {
    const kml = buildKml("ATN 2026", folders);
    expect(kml.startsWith("<?xml")).toBe(true);
    expect(kml.match(/<kml /g)).toHaveLength(1);
    expect(kml.trimEnd().endsWith("</kml>")).toBe(true);
    expect(kml).toContain("<name>ATN 2026</name>");
  });

  test("skips an empty folder rather than emitting a dead layer", () => {
    const kml = buildKml("x", [...folders, { name: "Empty", places: [] }]);
    expect(kml).not.toContain("<name>Empty</name>");
  });
});

describe("buildKml — areas", () => {
  const square = [
    { lat: 52.3, lng: -7.38 },
    { lat: 52.3, lng: -7.37 },
    { lat: 52.29, lng: -7.37 },
    { lat: 52.29, lng: -7.38 },
  ];

  test("emits a Polygon for an area", () => {
    const kml = buildKml("x", [{ name: "Campsites", areas: [{ name: "Better Lands", ring: square }], places: [] }]);
    expect(kml).toContain("<Polygon>");
    expect(kml).toContain("<name>Better Lands</name>");
  });

  test("closes the ring by repeating the first vertex last", () => {
    // KML requires a closed LinearRing; an unclosed ring renders as a gap or is
    // rejected outright, and our traced rings are stored open.
    const kml = buildKml("x", [{ name: "C", areas: [{ name: "A", ring: square }], places: [] }]);
    const coords = kml.match(/<coordinates>([\s\S]*?)<\/coordinates>/)![1]!.trim().split(/\s+/);
    expect(coords).toHaveLength(square.length + 1);
    expect(coords[0]).toBe(coords[coords.length - 1]);
  });

  test("writes polygon vertices in lng,lat order too", () => {
    const kml = buildKml("x", [{ name: "C", areas: [{ name: "A", ring: square }], places: [] }]);
    expect(kml).toContain("-7.38,52.3,0");
  });

  test("rejects a degenerate ring rather than emitting invalid geometry", () => {
    expect(() =>
      buildKml("x", [{ name: "C", areas: [{ name: "A", ring: square.slice(0, 2) }], places: [] }]),
    ).toThrow(/at least 3/i);
  });

  test("a folder may carry both areas and points", () => {
    const kml = buildKml("x", [
      { name: "Mixed", areas: [{ name: "A", ring: square }], places: [{ name: "P", lat: 1, lng: 2 }] },
    ]);
    expect(kml).toContain("<Polygon>");
    expect(kml).toContain("<Point>");
    expect(kml.match(/<Folder>/g)).toHaveLength(1);
  });

  test("keeps a folder that has areas but no points", () => {
    const kml = buildKml("x", [{ name: "OnlyAreas", areas: [{ name: "A", ring: square }], places: [] }]);
    expect(kml).toContain("<name>OnlyAreas</name>");
  });
});

describe("buildKml — styles", () => {
  const styles = [
    { id: "bar", color: "#e8a33d", icon: "http://maps.google.com/mapfiles/kml/shapes/bars.png" },
    { id: "camp", polyFill: "#4caf50", polyOutline: "#2e7d32" },
  ];

  test("emits a Style block per declared style", () => {
    const kml = buildKml("x", [{ name: "F", places: [{ name: "P", lat: 1, lng: 2, styleId: "bar" }] }], styles);
    expect(kml).toContain('<Style id="bar">');
    expect(kml).toContain("<IconStyle>");
    expect(kml).toContain("shapes/bars.png");
  });

  test("a placemark references its style so one layer can hold many pin types", () => {
    const kml = buildKml("x", [
      {
        name: "Food & drink",
        places: [
          { name: "Wine Bar", lat: 1, lng: 2, styleId: "bar" },
          { name: "Borgo", lat: 3, lng: 4, styleId: "food" },
        ],
      },
    ], styles);
    expect(kml).toContain("<styleUrl>#bar</styleUrl>");
    expect(kml).toContain("<styleUrl>#food</styleUrl>");
    expect(kml.match(/<Folder>/g)).toHaveLength(1); // still ONE layer
  });

  test("polygon styles carry a translucent fill and a solid outline", () => {
    const kml = buildKml("x", [{ name: "A", places: [], areas: [{ name: "Camp", ring: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }, { lat: 2, lng: 3 }], styleId: "camp" }] }], styles);
    expect(kml).toContain("<PolyStyle>");
    expect(kml).toContain("<LineStyle>");
    // fill translucent so overlapping areas stay readable, outline opaque
    expect(kml).toMatch(/<PolyStyle>\s*<color>[0-9a-f]{8}<\/color>/);
  });

  test("omits style machinery entirely when no styles are supplied", () => {
    const kml = buildKml("x", [{ name: "F", places: [{ name: "P", lat: 1, lng: 2 }] }]);
    expect(kml).not.toContain("<Style");
    expect(kml).not.toContain("<styleUrl>");
  });
});
