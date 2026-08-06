import { describe, expect, test } from "vitest";
import { buildWalkMatrix, type WalkGraph } from "./walk.js";

const graph: WalkGraph = {
  edges: [
    ["a", "b", 1],
    ["b", "c", 2],
    ["c", "d", 2],
    ["a", "c", 10], // deliberately longer than a->b->c (3)
  ],
};

describe("buildWalkMatrix", () => {
  const m = buildWalkMatrix(graph);

  test("a stage to itself is zero", () => {
    expect(m.walk("a", "a")).toBe(0);
  });

  test("direct edges are symmetric", () => {
    expect(m.walk("a", "b")).toBe(1);
    expect(m.walk("b", "a")).toBe(1);
  });

  test("shortest path beats a longer direct edge", () => {
    expect(m.walk("a", "c")).toBe(3); // a->b->c, not the direct 10
  });

  test("transitive shortest path across the graph", () => {
    expect(m.walk("a", "d")).toBe(5); // 1 + 2 + 2
  });

  test("off-graph stage uses the default penalty", () => {
    expect(m.walk("a", "zzz")).toBe(20);
  });

  test("default penalty is configurable", () => {
    const m2 = buildWalkMatrix({ ...graph, defaultMinutes: 99 });
    expect(m2.walk("a", "zzz")).toBe(99);
  });
});
