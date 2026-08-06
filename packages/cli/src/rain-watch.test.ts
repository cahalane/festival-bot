import { describe, expect, test } from "vitest";
import { rainEpisode, rainSeverity, alertWorthy, type RainHour } from "./rain-watch.js";

/**
 * Operator ask, 2026-07-31: "there should be a standing watch ... watching the
 * day ahead. Changes implying imminent rain should be brought into the
 * context and a warning should be sent out."
 *
 * The daily card is a planning document written once in the morning; this is
 * the thing that catches rain ARRIVING after it was written. Same shape as the
 * cold watch — forecast-based, silent unless something is due, one alert per
 * episode — because the failure mode is identical: a watch that repeats itself
 * every 20 minutes gets muted, and a muted watch warns nobody.
 */
const H = (time: string, precipMm: number, precipProbPct: number): RainHour => ({
  time,
  precipMm,
  precipProbPct,
});

const now = new Date("2026-08-02T12:00:00+01:00");

describe("rainEpisode", () => {
  test("finds rain arriving inside the lookahead", () => {
    const hours = [H("2026-08-02T13:00:00+01:00", 0, 5), H("2026-08-02T14:00:00+01:00", 1.2, 80)];
    const e = rainEpisode(hours, now, 6);
    expect(e?.from).toBe("2026-08-02T14:00:00+01:00");
    expect(e?.peakMm).toBe(1.2);
  });

  test("stays quiet on a dry outlook", () => {
    expect(rainEpisode([H("2026-08-02T13:00:00+01:00", 0, 10)], now, 6)).toBeNull();
  });

  test("ignores a high chance that carries no actual rain", () => {
    // 60% chance of 0.0mm is a cloudy afternoon, not a warning. Firing on
    // probability alone would cry wolf through an entire dry weekend.
    expect(rainEpisode([H("2026-08-02T14:00:00+01:00", 0, 60)], now, 6)).toBeNull();
  });

  test("ignores a trace amount nobody would put a coat on for", () => {
    expect(rainEpisode([H("2026-08-02T14:00:00+01:00", 0.05, 90)], now, 6)).toBeNull();
  });

  test("ignores rain already past", () => {
    expect(rainEpisode([H("2026-08-02T09:00:00+01:00", 5, 95)], now, 6)).toBeNull();
  });

  test("ignores rain beyond the lookahead", () => {
    expect(rainEpisode([H("2026-08-03T02:00:00+01:00", 5, 95)], now, 6)).toBeNull();
  });

  test("reports the wettest hour of the episode, not the first", () => {
    const hours = [
      H("2026-08-02T14:00:00+01:00", 0.4, 60),
      H("2026-08-02T15:00:00+01:00", 2.6, 90),
      H("2026-08-02T16:00:00+01:00", 0.3, 55),
    ];
    const e = rainEpisode(hours, now, 6)!;
    expect(e.from).toBe("2026-08-02T14:00:00+01:00");
    expect(e.peakMm).toBe(2.6);
    expect(e.totalMm).toBeCloseTo(3.3, 5);
  });

  test("ends the episode at a genuinely dry gap", () => {
    const hours = [
      H("2026-08-02T14:00:00+01:00", 0.5, 70),
      H("2026-08-02T15:00:00+01:00", 0, 5),
      H("2026-08-02T16:00:00+01:00", 4, 95),
    ];
    expect(rainEpisode(hours, now, 6)!.until).toBe("2026-08-02T14:00:00+01:00");
  });
});

describe("rainSeverity", () => {
  test("calls a light episode drizzle", () => {
    expect(rainSeverity({ peakMm: 0.3, totalMm: 0.5 })).toBe("drizzle");
  });

  test("calls a moderate episode rain", () => {
    expect(rainSeverity({ peakMm: 1.5, totalMm: 3 })).toBe("rain");
  });

  test("calls a heavy episode a downpour", () => {
    expect(rainSeverity({ peakMm: 5, totalMm: 9 })).toBe("downpour");
  });

  test("escalates on total even when no single hour is heavy", () => {
    // Four hours of steady 1.2mm is a soaking, whatever the peak says.
    expect(rainSeverity({ peakMm: 1.2, totalMm: 8 })).toBe("downpour");
  });
});

/**
 * The floor is too low for an ALERT.
 *
 * 2026-08-02 01:05: the watch fired "drizzle from 08:00 — 0.1mm peak hour,
 * 0.1mm total". A single hour at exactly the wet-hour threshold, six hours out,
 * at eight in the morning. Nothing anybody would act on, and it would have been
 * a 1am notification about a tenth of a millimetre.
 *
 * WET_HOUR_MM decides what counts as a wet HOUR when measuring an episode's
 * extent. Deciding whether the episode is worth telling people about is a
 * separate question, and it needs a higher bar.
 */
describe("alertWorthy", () => {
  test("a single hour at the floor is not worth an alert", () => {
    expect(alertWorthy({ peakMm: 0.1, totalMm: 0.1 })).toBe(false);
  });

  test("0.4mm over a few hours is NOT worth it — superseded belief", () => {
    // This test used to assert the opposite, on the reasoning that "four hours
    // of drizzle soaks a tent". It does not: 0.4mm total is a damp flysheet.
    // Sunday 2 Aug proved it — a whole day of exactly this fired three alerts
    // that were not worth relaying to anyone.
    expect(alertWorthy({ peakMm: 0.1, totalMm: 0.4 })).toBe(false);
  });

  test("one genuinely heavy hour is worth it even if brief", () => {
    expect(alertWorthy({ peakMm: 1.5, totalMm: 1.5 })).toBe(true);
  });

  test("a downpour is always worth it", () => {
    expect(alertWorthy({ peakMm: 5, totalMm: 9 })).toBe(true);
  });
});

/**
 * Drizzle should not page anyone.
 *
 * Sunday 2 Aug was persistent light drizzle: 0.1-0.4mm an hour, on and off from
 * 09:00 to 22:00. The watch fired THREE times in twelve hours (0.1mm, then
 * 0.4mm, then 0.3mm) because each dry hour split the day into a fresh
 * "episode", and every one of them was a new alert. I relayed none of them —
 * which is the tell that the bar was in the wrong place, not that my judgement
 * was needed three times.
 *
 * The runbook already says a drizzle is usually not worth changing plans for.
 * So the alert bar is now severity >= "rain": a wet HOUR still delimits an
 * episode, but only real rain earns a notification.
 */
describe("alertWorthy uses severity", () => {
  test("drizzle never alerts, however many hours it spans", () => {
    expect(alertWorthy({ peakMm: 0.4, totalMm: 1.9 })).toBe(false);
  });

  test("one properly wet hour alerts", () => {
    expect(alertWorthy({ peakMm: 1.2, totalMm: 1.2 })).toBe(true);
  });

  test("a sustained soaking alerts on total", () => {
    expect(alertWorthy({ peakMm: 0.5, totalMm: 2.5 })).toBe(true);
  });

  test("a downpour alerts", () => {
    expect(alertWorthy({ peakMm: 6, totalMm: 12 })).toBe(true);
  });

  test("agrees with rainSeverity — anything it calls drizzle is not alert-worthy", () => {
    const drizzle = { peakMm: 0.9, totalMm: 1.9 };
    expect(rainSeverity(drizzle)).toBe("drizzle");
    expect(alertWorthy(drizzle)).toBe(false);
  });
});
