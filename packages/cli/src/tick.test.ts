import { describe, expect, test } from "vitest";
import type { ArtistSet, LineupRefreshResult } from "@festival-bot/core";
import { onFetchFailure, runScheduleTick, type ScheduleTickIo } from "./tick.js";

const set = (name: string, stage: string, startMin: number, dur = 60): ArtistSet => {
  const start = new Date(2026, 6, 31, 0, startMin);
  return { name, slug: name.toLowerCase(), stage, start, end: new Date(start.getTime() + dur * 60000), durationMin: dur };
};

const written: LineupRefreshResult = { variant: "forum", fetched: 10, previous: 10, written: true, file: "x", note: "ok" };

/** In-memory ScheduleTickIo capturing side effects for assertions. */
function fakeIo(over: Partial<ScheduleTickIo> & { fails?: number; baseline?: ArtistSet[] | null }): {
  io: ScheduleTickIo;
  logs: string[];
  changes: string[];
  state: { fails: number; baseline: ArtistSet[] | null };
} {
  const logs: string[] = [];
  const changes: string[] = [];
  const state = { fails: over.fails ?? 0, baseline: (over.baseline ?? null) as ArtistSet[] | null };
  const io: ScheduleTickIo = {
    festival: "atn26",
    readFails: () => state.fails,
    writeFails: (f) => { state.fails = f; },
    refresh: async () => written,
    loadSets: async () => [],
    readBaseline: () => state.baseline,
    writeBaseline: (s) => { state.baseline = s; },
    appendChange: (e) => changes.push(e),
    log: (l) => logs.push(l),
    fmtDay: (d) => d.toISOString(),
    venueName: (s) => s,
    now: () => new Date("2026-07-31T12:00:00Z"),
    ...over,
  };
  return { io, logs, changes, state };
}

describe("onFetchFailure", () => {
  test("announces only on every 3rd consecutive failure", () => {
    expect(onFetchFailure(0)).toEqual({ fails: 1, announce: false });
    expect(onFetchFailure(1)).toEqual({ fails: 2, announce: false });
    expect(onFetchFailure(2)).toEqual({ fails: 3, announce: true });
    expect(onFetchFailure(5)).toEqual({ fails: 6, announce: true });
  });
});

describe("runScheduleTick", () => {
  const failing = { refresh: async () => { throw new Error("boom"); } };

  test("1st and 2nd fetch failure are silent but counted", async () => {
    const f1 = fakeIo({ fails: 0, ...failing });
    await runScheduleTick(f1.io);
    expect(f1.state.fails).toBe(1);
    expect(f1.logs).toEqual([]);

    const f2 = fakeIo({ fails: 1, ...failing });
    await runScheduleTick(f2.io);
    expect(f2.state.fails).toBe(2);
    expect(f2.logs).toEqual([]);
  });

  test("3rd consecutive failure announces the outage", async () => {
    const { io, logs, state } = fakeIo({ fails: 2, ...failing });
    await runScheduleTick(io);
    expect(state.fails).toBe(3);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("failed 3x in a row");
    expect(logs[0]).toContain("boom");
  });

  test("a success resets the failure counter and stays silent when unchanged", async () => {
    const base = [set("A", "main", 100)];
    const { io, logs, state } = fakeIo({ fails: 2, baseline: base, loadSets: async () => base });
    await runScheduleTick(io);
    expect(state.fails).toBe(0);
    expect(logs).toEqual([]);
  });

  test("guarded shrink is reported (the feed lost sets)", async () => {
    const { io, logs } = fakeIo({
      refresh: async () => ({ variant: "forum", fetched: 3, previous: 10, written: false, file: "sidecar", note: "shrank 10->3" }),
    });
    await runScheduleTick(io);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("guarded shrink");
    expect(logs[0]).toContain("sidecar");
  });

  test("first run (no baseline) seeds silently", async () => {
    const cur = [set("A", "main", 100)];
    const { io, logs, state } = fakeIo({ baseline: null, loadSets: async () => cur });
    await runScheduleTick(io);
    expect(logs).toEqual([]);
    expect(state.baseline).toBe(cur);
  });

  test("a real change is reported once, logged, and the baseline advances so it never re-fires", async () => {
    const oldLineup = [set("A", "main", 100)];
    const newLineup = [set("A", "main", 100), set("B", "second", 200)];
    const shared = fakeIo({ baseline: oldLineup, loadSets: async () => newLineup });

    await runScheduleTick(shared.io);
    const headline = shared.logs.find((l) => l.startsWith("SCHEDULE CHANGE"));
    expect(headline).toContain("1 added, 0 removed, 0 moved");
    expect(shared.logs.some((l) => l.startsWith("ADDED:") && l.includes("B"))).toBe(true);
    expect(shared.changes).toHaveLength(1); // appended to the changelog exactly once
    expect(shared.state.baseline).toBe(newLineup); // advanced

    // Second tick with the same current lineup: baseline now equals it -> silent.
    shared.logs.length = 0;
    shared.changes.length = 0;
    await runScheduleTick(shared.io);
    expect(shared.logs).toEqual([]);
    expect(shared.changes).toEqual([]);
  });
});
