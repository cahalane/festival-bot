import { describe, expect, test } from "vitest";
import { refineEdges, addMissingEdges } from "./walk-refine.js";

/**
 * `refineEdges` maps over the edges that already exist, so a venue added to the
 * lineup after the graph was built gets nothing and silently routes on
 * `defaultMinutes` (12) forever. That bit us twice: the Big Romance Dome in
 * July, and `all-curious-minds` appearing on 2026-07-29 with three sets on it.
 *
 * `addMissingEdges` closes that: any pair where both ends have a coordinate but
 * no edge gets one.
 */
const coords = new Map([
  ["a", { lat: 52.2950, lng: -7.3576 }],
  ["b", { lat: 52.2947, lng: -7.3620 }],
  ["c", { lat: 52.2905, lng: -7.3589 }], // the newcomer
]);

describe("addMissingEdges", () => {
  test("creates an edge for a coordinate-bearing pair that has none", () => {
    const { edges, added } = addMissingEdges([["a", "b", 5]], coords, ["a", "b", "c"]);
    const keys = edges.map(([x, y]) => `${x}|${y}`).sort();
    expect(keys).toEqual(["a|b", "a|c", "b|c"]);
    expect(added).toHaveLength(2);
  });

  test("leaves existing edges alone — refining them is refineEdges' job", () => {
    const { edges } = addMissingEdges([["a", "b", 99]], coords, ["a", "b", "c"]);
    expect(edges.find(([x, y]) => x === "a" && y === "b")![2]).toBe(99);
  });

  test("matches an existing edge regardless of which way round it is stored", () => {
    const { added } = addMissingEdges([["b", "a", 5]], coords, ["a", "b"]);
    expect(added).toEqual([]);
  });

  test("skips a pair when either end lacks a coordinate", () => {
    const { added } = addMissingEdges([], coords, ["a", "unknown"]);
    expect(added).toEqual([]);
  });

  test("never emits a zero-minute walk", () => {
    const same = new Map([
      ["x", { lat: 52.29, lng: -7.36 }],
      ["y", { lat: 52.29, lng: -7.36 }],
    ]);
    const { edges } = addMissingEdges([], same, ["x", "y"]);
    expect(edges[0]![2]).toBeGreaterThanOrEqual(1);
  });

  test("emits new edges in a stable sorted order", () => {
    const { edges } = addMissingEdges([], coords, ["c", "a", "b"]);
    expect(edges.map(([x, y]) => `${x}|${y}`)).toEqual(["a|b", "a|c", "b|c"]);
  });

  test("uses the same distance model as refineEdges, so the graph stays consistent", () => {
    // Same pair through both paths must agree — a newcomer's edges must not be
    // computed on a different basis from everyone else's.
    const viaAdd = addMissingEdges([], coords, ["a", "b"]).edges[0]![2];
    const viaRefine = refineEdges([["a", "b", 999]], coords).newEdges[0]![2];
    expect(viaAdd).toBe(viaRefine);
  });
});
