import { describe, expect, test } from "vitest";
import { refreshDecision, classifyRemoved } from "./refresh.js";

/**
 * The shrink guard exists because a live feed PRUNES past acts once an event is
 * over, so a re-fetch can come back smaller than the snapshot it would replace.
 *
 * It originally keyed off nothing but the counts, which mid-ATN mistook two live
 * cancellations (Jr Spesh, Ciara May) for pruning and parked a correct fetch.
 * The first fix keyed off whether the festival was running — but that was still
 * the wrong question. Operator, 2026-07-31: *"Post prune is a valid concern but only
 * if the specific set is in the past."*
 *
 * So the test is per-set, not per-phase: sets vanishing from the FUTURE are
 * cancellations and must be written; sets vanishing from the PAST are pruning
 * and must not clobber a fuller snapshot. This is sharper than the phase rule —
 * it correctly accepts a cancellation announced weeks ahead of the gates, which
 * `live: false` would have parked.
 */
const NOW = new Date("2026-07-31T12:00:00+01:00");

describe("classifyRemoved", () => {
  const prev = [
    { slug: "a", start: new Date("2026-07-31T09:00:00+01:00") }, // past
    { slug: "b", start: new Date("2026-07-31T15:00:00+01:00") }, // future
    { slug: "c", start: new Date("2026-08-01T15:00:00+01:00") }, // future
  ];

  test("counts nothing removed when the fetch still has everything", () => {
    expect(classifyRemoved(prev, prev, NOW)).toEqual({ past: 0, future: 0 });
  });

  test("counts a removed past set as past", () => {
    const next = prev.filter((s) => s.slug !== "a");
    expect(classifyRemoved(prev, next, NOW)).toEqual({ past: 1, future: 0 });
  });

  test("counts a removed future set as future", () => {
    const next = prev.filter((s) => s.slug !== "b");
    expect(classifyRemoved(prev, next, NOW)).toEqual({ past: 0, future: 1 });
  });

  test("separates a mixed removal", () => {
    expect(classifyRemoved(prev, [prev[1]!], NOW)).toEqual({ past: 1, future: 1 });
  });

  test("ignores sets that were ADDED, counting only what went missing", () => {
    const next = [...prev, { slug: "d", start: new Date("2026-08-02T15:00:00+01:00") }];
    expect(classifyRemoved(prev, next, NOW)).toEqual({ past: 0, future: 0 });
  });

  test("treats a set that has already started as past", () => {
    // Mid-set removal is still pruning, not a cancellation anyone can act on.
    const started = [{ slug: "x", start: new Date("2026-07-31T11:30:00+01:00") }];
    expect(classifyRemoved(started, [], NOW)).toEqual({ past: 1, future: 0 });
  });
});

describe("refreshDecision", () => {
  test("writes when the fetch grew", () => {
    expect(refreshDecision(500, 480, false).write).toBe(true);
  });

  test("writes when the fetch is the same size", () => {
    expect(refreshDecision(480, 480, false).write).toBe(true);
  });

  test("writes when there is no prior snapshot", () => {
    expect(refreshDecision(480, null, false).write).toBe(true);
  });

  test("guards a shrink when nothing is known about what was removed", () => {
    expect(refreshDecision(474, 476, false).write).toBe(false);
  });

  test("guards a shrink that removed only PAST sets — that is pruning", () => {
    const d = refreshDecision(474, 476, false, { removed: { past: 2, future: 0 } });
    expect(d.write).toBe(false);
    expect(d.reason).toMatch(/pruning|past/i);
  });

  test("accepts a shrink that removed a FUTURE set — that is a cancellation", () => {
    const d = refreshDecision(474, 476, false, { removed: { past: 0, future: 2 } });
    expect(d.write).toBe(true);
    expect(d.reason).toMatch(/cancel/i);
  });

  test("accepts a mixed removal — a future cancellation is real news either way", () => {
    expect(refreshDecision(474, 476, false, { removed: { past: 5, future: 1 } }).write).toBe(true);
  });

  test("accepts a future cancellation even before the festival opens", () => {
    // The phase-based rule got this wrong: an act pulled a week out is still a
    // cancellation, and parking it leaves the planner advertising a dead set.
    expect(refreshDecision(474, 476, false, { removed: { past: 0, future: 1 } }).write).toBe(true);
  });

  test("force still overrides the guard", () => {
    expect(refreshDecision(474, 476, true, { removed: { past: 2, future: 0 } }).write).toBe(true);
  });

  test("refuses an implausible collapse even when framed as future cancellations", () => {
    // 3 of 476 is a broken fetch, not 473 cancellations.
    const d = refreshDecision(3, 476, false, { removed: { past: 0, future: 473 } });
    expect(d.write).toBe(false);
    expect(d.reason).toMatch(/implausible|collapse/i);
  });

  test("says how much it shrank, so the log stays diagnosable", () => {
    expect(refreshDecision(474, 476, false, { removed: { past: 0, future: 2 } }).reason).toMatch(/476.*474/);
  });
});
