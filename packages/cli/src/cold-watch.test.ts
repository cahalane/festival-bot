import { describe, expect, test } from "vitest";
import { coldEpisode, coldSubscribers, shouldAlert, dueStage, isSameEpisode, type ColdHour } from "./cold-watch.js";

/**
 * A crew member camping on site asked for a cold-snap watch after a bad night
 * (2026-07-31): monitor temps and notify when it goes below 7, or preferably a
 * feels-like temp.
 *
 * Two decisions this encodes. It watches the FORECAST rather than the current
 * reading — being told it is cold while you are already shivering in a tent is
 * useless; the actionable version arrives before you need the extra layer. And
 * it alerts once per EPISODE, not once per tick, because a cold night is one
 * fact and six identical 3am messages is spam.
 */
const H = (time: string, tempC: number, apparentC?: number): ColdHour => ({ time, tempC, apparentC });

describe("coldEpisode", () => {
  const now = new Date("2026-07-31T20:00:00+01:00");

  test("finds the first hour at or below the threshold", () => {
    const hours = [H("2026-07-31T21:00:00+01:00", 12, 11), H("2026-07-31T22:00:00+01:00", 9, 6.5)];
    const e = coldEpisode(hours, 7, now, 8);
    expect(e?.from).toBe("2026-07-31T22:00:00+01:00");
    expect(e?.lowC).toBe(6.5);
  });

  test("prefers feels-like over air temperature", () => {
    // 9C air but 6C on the wind is exactly the night that prompted the ask.
    const hours = [H("2026-07-31T22:00:00+01:00", 9, 6)];
    expect(coldEpisode(hours, 7, now, 8)).not.toBeNull();
  });

  test("falls back to air temperature when feels-like is missing", () => {
    const hours = [H("2026-07-31T22:00:00+01:00", 5)];
    expect(coldEpisode(hours, 7, now, 8)?.lowC).toBe(5);
  });

  test("returns null when nothing in the window is cold", () => {
    const hours = [H("2026-07-31T21:00:00+01:00", 14, 13), H("2026-07-31T22:00:00+01:00", 12, 11)];
    expect(coldEpisode(hours, 7, now, 8)).toBeNull();
  });

  test("ignores hours already in the past", () => {
    // Cold already sat through is not something to act on.
    const hours = [H("2026-07-31T04:00:00+01:00", 3, 1), H("2026-07-31T21:00:00+01:00", 15, 15)];
    expect(coldEpisode(hours, 7, now, 8)).toBeNull();
  });

  test("ignores hours beyond the lookahead", () => {
    const hours = [H("2026-08-02T02:00:00+01:00", 2, 0)];
    expect(coldEpisode(hours, 7, now, 8)).toBeNull();
  });

  test("reports the coldest point of the episode, not just its first hour", () => {
    const hours = [
      H("2026-07-31T22:00:00+01:00", 8, 6.8),
      H("2026-07-31T23:00:00+01:00", 7, 5.1),
      H("2026-08-01T00:00:00+01:00", 6, 4.2),
    ];
    const e = coldEpisode(hours, 7, now, 8)!;
    expect(e.from).toBe("2026-07-31T22:00:00+01:00");
    expect(e.lowC).toBe(4.2);
  });

  test("ends the episode when it warms back up", () => {
    const hours = [
      H("2026-07-31T22:00:00+01:00", 8, 6.5),
      H("2026-07-31T23:00:00+01:00", 12, 11),
      H("2026-08-01T00:00:00+01:00", 5, 3),
    ];
    const e = coldEpisode(hours, 7, now, 8)!;
    expect(e.until).toBe("2026-07-31T22:00:00+01:00");
    expect(e.lowC).toBe(6.5);
  });

  test("treats exactly the threshold as cold", () => {
    expect(coldEpisode([H("2026-07-31T22:00:00+01:00", 10, 7)], 7, now, 8)).not.toBeNull();
  });
});

describe("shouldAlert", () => {
  const ep = { from: "2026-07-31T22:00:00+01:00", until: "2026-08-01T02:00:00+01:00", lowC: 4.2 };

  test("alerts when this episode has not been sent", () => {
    expect(shouldAlert(ep, undefined)).toBe(true);
  });

  test("stays silent on a repeat tick for the same episode", () => {
    expect(shouldAlert(ep, { from: ep.from, lowC: ep.lowC })).toBe(false);
  });

  test("alerts again for a genuinely new episode", () => {
    expect(shouldAlert(ep, { from: "2026-07-30T23:00:00+01:00", lowC: 5 })).toBe(true);
  });

  /**
   * The lookahead truncates an episode that runs past its edge, so the FIRST
   * alert can understate the night badly. Real case, 2026-07-31: at 20:00 the
   * window reached 04:00 and reported 6.1C; two hours later the same episode
   * showed 3.8C. Deduping purely on the start time would have left someone
   * planning for 6C on a night that hit 3.8C.
   */
  test("re-alerts when the same episode turns out materially colder", () => {
    expect(shouldAlert({ ...ep, lowC: 2.0 }, { from: ep.from, lowC: 4.2 })).toBe(true);
  });

  test("does not re-alert for a trivial revision", () => {
    expect(shouldAlert({ ...ep, lowC: 3.9 }, { from: ep.from, lowC: 4.2 })).toBe(false);
  });

  test("does not re-alert when the forecast eases", () => {
    expect(shouldAlert({ ...ep, lowC: 6.0 }, { from: ep.from, lowC: 4.2 })).toBe(false);
  });
});

/**
 * Requested straight after the first version shipped: "can you ping me when
 * it's getting cold just so I don't forget to put the jacket on."
 *
 * The advance warning is for PLANNING (dig the layer out before you go out);
 * this is the NUDGE, close enough to the drop that acting on it is the next
 * thing you do. Same episode, two different jobs, so each fires once.
 */
describe("dueStage", () => {
  const ep = { from: "2026-08-01T04:00:00+01:00", until: "2026-08-01T06:00:00+01:00", lowC: 3.8 };

  test("is the advance warning when the cold is still hours off", () => {
    expect(dueStage(ep, new Date("2026-07-31T22:00:00+01:00"), [])).toBe("ahead");
  });

  test("is the nudge when the drop is close", () => {
    expect(dueStage(ep, new Date("2026-08-01T03:15:00+01:00"), ["ahead"])).toBe("imminent");
  });

  test("still nudges once the cold has already arrived", () => {
    // Session down over the crossing, or asleep — the jacket prompt is still
    // wanted, just late.
    expect(dueStage(ep, new Date("2026-08-01T04:30:00+01:00"), ["ahead"])).toBe("imminent");
  });

  test("does not repeat the advance warning", () => {
    expect(dueStage(ep, new Date("2026-07-31T23:00:00+01:00"), ["ahead"])).toBeNull();
  });

  test("does not repeat the nudge", () => {
    expect(dueStage(ep, new Date("2026-08-01T03:30:00+01:00"), ["ahead", "imminent"])).toBeNull();
  });

  test("goes straight to the nudge when the episode is first seen up close", () => {
    // A tick that first sees the episode 20 min out should not send a stale
    // "hours from now" warning — the useful message is the jacket prompt.
    expect(dueStage(ep, new Date("2026-08-01T03:40:00+01:00"), [])).toBe("imminent");
  });

  test("is silent once the episode has ended", () => {
    expect(dueStage(ep, new Date("2026-08-01T07:00:00+01:00"), ["ahead", "imminent"])).toBeNull();
  });
});

/**
 * Episode identity, and why it is not the start time.
 *
 * `from` is computed from the FUTURE window only, so it walks forward as the
 * night is consumed: one cold snap reports from=04:00, then 05:00, then 06:00.
 * Keying state on it made the 05:00 tick look like a brand-new episode and fire
 * the jacket nudge a second time — caught in a dry run over tonight's real
 * forecast, which would have pinged the subscriber at 04:00, 05:00 and 06:00.
 *
 * Overlap is the stable test: an episode starting before the previous one ended
 * is the same cold snap, however its edges have shifted.
 */
describe("isSameEpisode", () => {
  const prev = { from: "2026-08-01T04:00:00+01:00", until: "2026-08-01T06:00:00+01:00", lowC: 3.8 };

  test("treats a start time that has walked forward as the same snap", () => {
    expect(isSameEpisode({ ...prev, from: "2026-08-01T05:00:00+01:00" }, prev)).toBe(true);
  });

  test("treats an end time extended by the lookahead as the same snap", () => {
    // At 20:30 the window only reached 04:00; two hours later it saw 06:00.
    const early = { from: "2026-08-01T04:00:00+01:00", until: "2026-08-01T04:00:00+01:00", lowC: 6.1 };
    expect(isSameEpisode(prev, early)).toBe(true);
  });

  test("treats a snap starting after the last one ended as new", () => {
    const nextNight = { from: "2026-08-02T03:00:00+01:00", until: "2026-08-02T06:00:00+01:00", lowC: 5 };
    expect(isSameEpisode(nextNight, prev)).toBe(false);
  });

  test("has nothing to match against when none was stored", () => {
    expect(isSameEpisode(prev, undefined)).toBe(false);
  });
});

describe("coldSubscribers", () => {
  const prefs = {
    alexS: { name: "Alex", chat_id: "100000001", coldAlert: { belowC: 7 } },
    samT: { name: "Sam", chat_id: "100000002" },
    ghost: { name: "Ghost", coldAlert: { belowC: 5 } },
  };

  test("returns only handles that opted in", () => {
    expect(coldSubscribers(prefs).map((s) => s.handle)).toEqual(["alexS"]);
  });

  test("carries the threshold and channel through", () => {
    const [s] = coldSubscribers(prefs);
    expect(s!.belowC).toBe(7);
    expect(s!.channel).toEqual({ kind: "telegram", id: "100000001" });
  });

  test("skips a subscriber with no chat id rather than crashing the tick", () => {
    // One malformed prefs entry must not take the whole watch down.
    expect(coldSubscribers(prefs).find((s) => s.handle === "ghost")).toBeUndefined();
  });
});
