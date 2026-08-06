import { describe, expect, test } from "vitest";
import { vibeCheck } from "./vibecheck.js";
import type { ArtistSet } from "./models.js";

const set = (name: string, stage: string, startIso: string, durMin: number): ArtistSet => {
  const start = new Date(startIso);
  return { name, slug: name.toLowerCase(), stage, start, end: new Date(start.getTime() + durMin * 60000), durationMin: durMin };
};

describe("vibeCheck", () => {
  const now = new Date("2026-06-06T22:00:00+02:00");
  test("splits on-now, next-90, and flags clashing picks as decisions", () => {
    const picks = [
      set("OnNowAct", "port", "2026-06-06T21:30:00+02:00", 60),       // covers 22:00
      set("SoonA", "cupra", "2026-06-06T22:30:00+02:00", 60),         // 22:30-23:30
      set("SoonB", "occident", "2026-06-06T23:00:00+02:00", 60),      // 23:00-24:00 overlaps SoonA
      set("WayLater", "revolut", "2026-06-07T01:30:00+02:00", 60),    // beyond 90min horizon
    ];
    const vc = vibeCheck(picks, now);
    expect(vc.onNow.map((s) => s.name)).toEqual(["OnNowAct"]);
    expect(vc.next.map((s) => s.name)).toEqual(["SoonA", "SoonB"]);
    expect(vc.decisions).toHaveLength(1);
    expect([vc.decisions[0]!.a.name, vc.decisions[0]!.b.name]).toEqual(["SoonA", "SoonB"]);
    expect(vc.later).toBeUndefined();
  });

  test("when nothing is in the horizon, reports the soonest later pick", () => {
    const picks = [set("Future", "port", "2026-06-07T02:00:00+02:00", 60)];
    const vc = vibeCheck(picks, now);
    expect(vc.onNow).toHaveLength(0);
    expect(vc.next).toHaveLength(0);
    expect(vc.later?.name).toBe("Future");
  });
});
