import { describe, expect, test } from "vitest";
import { tempGraphGeometry, smoothPath, rollingWindow, type GraphHour } from "./temp-graph.js";

/**
 * Operator request, 2026-07-31, with a screenshot of the Forecaster app:
 * "replace the temp with a labelled graph like the Forecaster app does" — for
 * the CURRENT day specifically (an earlier clarification).
 *
 * The reference is a smooth line with a labelled dot every few hours and a time
 * axis underneath. What matters here is that the geometry is honest: the dots
 * sit where the temperatures actually are, the labelled ones are a readable
 * subset rather than all 24, and a flat day does not divide by zero.
 */
const day = (temps: number[]): GraphHour[] =>
  temps.map((tempC, i) => ({ time: `2026-07-31T${String(i).padStart(2, "0")}:00`, tempC }));

const W = 600;
const H = 120;

describe("tempGraphGeometry", () => {
  test("spans the full width from first hour to last", () => {
    const g = tempGraphGeometry(day([10, 12, 14, 16]), { width: W, height: H });
    expect(g.points[0]!.x).toBeCloseTo(0, 5);
    expect(g.points[3]!.x).toBeCloseTo(W, 5);
  });

  test("puts the warmest hour at the top and the coldest at the bottom", () => {
    const g = tempGraphGeometry(day([10, 20, 5]), { width: W, height: H });
    const warmest = g.points[1]!;
    const coldest = g.points[2]!;
    // SVG y grows downward, so the warmest hour has the SMALLEST y.
    expect(warmest.y).toBeLessThan(coldest.y);
  });

  test("keeps every point inside the box", () => {
    const g = tempGraphGeometry(day([3, 25, 14, 9]), { width: W, height: H });
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(H);
    }
  });

  test("survives a completely flat day instead of dividing by zero", () => {
    const g = tempGraphGeometry(day([14, 14, 14]), { width: W, height: H });
    for (const p of g.points) expect(Number.isFinite(p.y)).toBe(true);
  });

  test("labels a readable subset, not all 24 hours", () => {
    const g = tempGraphGeometry(day(Array.from({ length: 24 }, (_, i) => 10 + i * 0.5)), {
      width: W,
      height: H,
      labelEvery: 3,
    });
    expect(g.points).toHaveLength(24);
    const labelled = g.points.filter((p) => p.labelled);
    expect(labelled.length).toBeGreaterThan(4);
    expect(labelled.length).toBeLessThan(12);
  });

  test("always labels the coldest hour, whether or not it falls on the interval", () => {
    // The overnight low is the number people pack against — it must never be
    // the one dot without a figure on it.
    const temps = Array.from({ length: 24 }, (_, i) => (i === 5 ? 2 : 15));
    const g = tempGraphGeometry(day(temps), { width: W, height: H, labelEvery: 3 });
    expect(g.points[5]!.labelled).toBe(true);
  });

  test("always labels the warmest hour too", () => {
    const temps = Array.from({ length: 24 }, (_, i) => (i === 7 ? 28 : 15));
    const g = tempGraphGeometry(day(temps), { width: W, height: H, labelEvery: 3 });
    expect(g.points[7]!.labelled).toBe(true);
  });

  test("emits time ticks along the axis", () => {
    const g = tempGraphGeometry(day(Array.from({ length: 24 }, () => 15)), {
      width: W,
      height: H,
      labelEvery: 3,
    });
    // Every 3h from midnight, so 12:00 rather than the reference screenshot's
    // 13:00 (that app's axis starts at 07:00, ours covers the whole day).
    expect(g.ticks.map((t) => t.label)).toEqual([
      "00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00",
    ]);
    expect(g.ticks.every((t) => t.x >= 0 && t.x <= W)).toBe(true);
  });

  test("carries the hour label on each point for rendering", () => {
    const g = tempGraphGeometry(day([10, 12]), { width: W, height: H });
    expect(g.points[1]!.hour).toBe("01:00");
  });

  test("returns nothing usable for an empty day rather than throwing", () => {
    const g = tempGraphGeometry([], { width: W, height: H });
    expect(g.points).toEqual([]);
    expect(g.path).toBe("");
  });
});

describe("smoothPath", () => {
  test("starts with a move to the first point", () => {
    expect(smoothPath([{ x: 0, y: 10 }, { x: 10, y: 20 }])).toMatch(/^M0,10/);
  });

  test("curves rather than joining with straight segments", () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    expect(d).toMatch(/C/);
    expect(d).not.toMatch(/L/);
  });

  test("handles a single point without emitting a broken path", () => {
    expect(smoothPath([{ x: 5, y: 5 }])).toBe("M5,5");
  });

  test("handles no points", () => {
    expect(smoothPath([])).toBe("");
  });
});

/**
 * Rolling window (operator ask, 2026-07-31): "make the graph from time of card
 * render to 24h ahead".
 *
 * A calendar-day graph is mostly history by the afternoon — at 15:00 two thirds
 * of it is weather that already happened. A rolling window is entirely
 * actionable, and it crosses midnight, which is exactly where the cold lives.
 */
describe("rollingWindow", () => {
  const hours = Array.from({ length: 48 }, (_, i) => ({
    time: `2026-07-31T${String(i % 24).padStart(2, "0")}:00`,
    tempC: 10 + (i % 24),
    _day: i < 24 ? "2026-07-31" : "2026-08-01",
  })).map((h) => ({ time: `${h._day}T${h.time.slice(11)}`, tempC: h.tempC }));

  test("starts at the current hour, not the start of the day", () => {
    const w = rollingWindow(hours, new Date("2026-07-31T15:20:00+01:00"), 24);
    expect(w[0]!.time).toBe("2026-07-31T15:00");
  });

  test("runs a full 24 hours forward", () => {
    const w = rollingWindow(hours, new Date("2026-07-31T15:00:00+01:00"), 24);
    expect(w).toHaveLength(25); // inclusive of both ends
    expect(w[w.length - 1]!.time).toBe("2026-08-01T15:00");
  });

  test("crosses midnight, which is where the cold is", () => {
    const w = rollingWindow(hours, new Date("2026-07-31T20:00:00+01:00"), 24);
    expect(w.some((h) => h.time.startsWith("2026-08-01"))).toBe(true);
  });

  test("drops hours already past", () => {
    const w = rollingWindow(hours, new Date("2026-07-31T15:00:00+01:00"), 24);
    expect(w.every((h) => h.time >= "2026-07-31T15:00")).toBe(true);
  });

  test("returns what it has when the series runs out early", () => {
    const short = hours.slice(0, 20);
    const w = rollingWindow(short, new Date("2026-07-31T18:00:00+01:00"), 24);
    expect(w.length).toBeGreaterThan(0);
    expect(w.length).toBeLessThan(25);
  });

  test("returns empty rather than throwing on no data", () => {
    expect(rollingWindow([], new Date(), 24)).toEqual([]);
  });
});

/**
 * Label collisions. The first rolling render printed "18°18°" at the left edge:
 * the 3-hourly interval labelled hour 0 and the day's warmest hour happened to
 * be hour 1, so two figures landed on top of each other.
 */
describe("label collision", () => {
  // 25 hours across 560px is ~23px per hour — the real card geometry, where an
  // extreme sitting next to an interval label genuinely overlaps.
  const temps = Array.from({ length: 25 }, (_, i) => (i === 1 ? 18.4 : 18 - i * 0.2));

  test("drops an interval label that would collide with an extreme", () => {
    const g = tempGraphGeometry(
      temps.map((tempC, i) => ({ time: `2026-07-31T${String(i % 24).padStart(2, "0")}:00`, tempC })),
      { width: 560, height: 120, labelEvery: 3, minLabelGapPx: 40 },
    );
    const labelled = g.points.filter((p) => p.labelled);
    for (let i = 1; i < labelled.length; i++) {
      expect(labelled[i]!.x - labelled[i - 1]!.x).toBeGreaterThanOrEqual(40);
    }
  });

  test("keeps the extreme rather than the interval label when they clash", () => {
    const g = tempGraphGeometry(
      temps.map((tempC, i) => ({ time: `2026-07-31T${String(i % 24).padStart(2, "0")}:00`, tempC })),
      { width: 560, height: 120, labelEvery: 3, minLabelGapPx: 40 },
    );
    expect(g.points[1]!.labelled).toBe(true); // the warmest hour survives
  });

  test("still labels the coldest hour after collision pruning", () => {
    const temps = Array.from({ length: 24 }, (_, i) => (i === 1 ? 2 : 15));
    const g = tempGraphGeometry(
      temps.map((tempC, i) => ({ time: `2026-07-31T${String(i).padStart(2, "0")}:00`, tempC })),
      { width: 600, height: 120, labelEvery: 3, minLabelGapPx: 40 },
    );
    expect(g.points[1]!.labelled).toBe(true);
  });
});
