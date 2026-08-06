import { describe, expect, test } from "vitest";
import { allPairsFromPixels, calibrateMetresPerPixel } from "./walk-pixels.js";

describe("calibrateMetresPerPixel", () => {
  // ATN's 2026 site map is a picture, not geodata — no lat/lngs anywhere. But the
  // 2025 edition's POI API did carry real coordinates, and several stages sit in
  // the same physical spot both years, so a known real distance over a measured
  // pixel distance gives the scale.
  test("averages the scale across the supplied reference pairs", () => {
    const scale = calibrateMetresPerPixel([
      { metres: 800, pixels: 1000 },
      { metres: 600, pixels: 1000 },
    ]);
    expect(scale).toBeCloseTo(0.7, 5);
  });

  test("refuses to calibrate from nothing rather than inventing a scale", () => {
    expect(() => calibrateMetresPerPixel([])).toThrow(/reference/i);
  });

  test("ignores a degenerate pair with zero pixel separation", () => {
    const scale = calibrateMetresPerPixel([
      { metres: 800, pixels: 1000 },
      { metres: 50, pixels: 0 },
    ]);
    expect(scale).toBeCloseTo(0.8, 5);
  });
});

describe("allPairsFromPixels", () => {
  const opts = { metresPerPixel: 1, pathFactor: 1, walkMps: 1 };

  test("produces an edge for every unordered pair, once", () => {
    const edges = allPairsFromPixels(
      { a: [0, 0], b: [60, 0], c: [0, 60] },
      opts,
    );
    expect(edges).toHaveLength(3);
    const keys = edges.map(([x, y]) => `${x}-${y}`).sort();
    expect(keys).toEqual(["a-b", "a-c", "b-c"]);
  });

  test("converts straight-line pixels to walking minutes", () => {
    // 60px -> 60m at 1 m/px, / 1 m/s = 60s = 1 minute.
    const mins = allPairsFromPixels({ a: [0, 0], b: [60, 0] }, opts)[0]![2];
    expect(mins).toBe(1);
  });

  test("applies the path-inefficiency factor and walking pace", () => {
    // 100px -> 100m, x1.3 = 130m, / 1.1 m/s = 118s -> 2 minutes.
    const mins = allPairsFromPixels(
      { a: [0, 0], b: [100, 0] },
      { metresPerPixel: 1, pathFactor: 1.3, walkMps: 1.1 },
    )[0]![2];
    expect(mins).toBe(2);
  });

  test("never returns a zero-minute walk, even between neighbours", () => {
    const mins = allPairsFromPixels({ a: [0, 0], b: [1, 0] }, opts)[0]![2];
    expect(mins).toBe(1);
  });

  test("is symmetric — distance does not depend on read order", () => {
    const fwd = allPairsFromPixels({ a: [10, 20], b: [300, 400] }, opts)[0]![2];
    const rev = allPairsFromPixels({ b: [300, 400], a: [10, 20] }, opts)[0]![2];
    expect(fwd).toBe(rev);
  });

  test("emits edges in a stable, sorted order so diffs stay readable", () => {
    const edges = allPairsFromPixels({ c: [0, 0], a: [10, 0], b: [20, 0] }, opts);
    expect(edges.map(([x, y]) => `${x}|${y}`)).toEqual(["a|b", "a|c", "b|c"]);
  });
});
