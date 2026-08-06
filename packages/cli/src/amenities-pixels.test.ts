import { describe, expect, test } from "vitest";
import { nearestByCategory } from "./amenities-pixels.js";

const items = [
  { name: "Near bar", category: "bar", at: [10, 0] as [number, number] },
  { name: "Far bar", category: "bar", at: [500, 0] as [number, number] },
  { name: "Only toilets", category: "toilets", at: [100, 0] as [number, number] },
];

describe("nearestByCategory", () => {
  test("picks the closest item of each category to the stage", () => {
    const n = nearestByCategory([0, 0], items, 1);
    expect(n.bar!.name).toBe("Near bar");
    expect(n.toilets!.name).toBe("Only toilets");
  });

  test("reports the distance in metres using the map scale", () => {
    // 100px at 0.792 m/px = 79m
    expect(nearestByCategory([0, 0], items, 0.792).toilets!.metres).toBe(79);
  });

  test("omits a category with nothing in it rather than inventing one", () => {
    expect(nearestByCategory([0, 0], items, 1).water).toBeUndefined();
  });

  test("returns nothing at all when there are no amenities", () => {
    expect(nearestByCategory([0, 0], [], 1)).toEqual({});
  });

  test("is unaffected by the order items are listed in", () => {
    const a = nearestByCategory([0, 0], items, 1).bar!.name;
    const b = nearestByCategory([0, 0], [...items].reverse(), 1).bar!.name;
    expect(a).toBe(b);
  });
});
