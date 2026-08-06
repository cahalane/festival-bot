import { describe, expect, test } from "vitest";
import { parseWhen, dayWindow, formatInZone, type FestivalCalendar } from "./time.js";

// PS26-shaped calendar fixture (Europe/Madrid, 08:00 day-cutoff).
const ps: FestivalCalendar = {
  timezone: "Europe/Madrid",
  dayCutoffHour: 8,
  days: {
    wed: [2026, 6, 3],
    thu: [2026, 6, 4],
    fri: [2026, 6, 5],
    sat: [2026, 6, 6],
    sun: [2026, 6, 7],
  },
};

describe("parseWhen", () => {
  test("'Thu 22:00' is 22:00 Europe/Madrid (CEST, UTC+2) on the festival Thursday", () => {
    // 2026-06-04 22:00 CEST == 2026-06-04 20:00 UTC
    expect(parseWhen("Thu 22:00", ps).getTime()).toBe(Date.UTC(2026, 5, 4, 20, 0));
  });

  test("night-relative: 'Sat 01:30' rolls to the following calendar morning", () => {
    // hours before the 08:00 cutoff belong to the next morning -> 2026-06-07 01:30 CEST
    // == 2026-06-06 23:30 UTC
    expect(parseWhen("Sat 01:30", ps).getTime()).toBe(Date.UTC(2026, 5, 6, 23, 30));
  });

  test("case-insensitive day and 3-letter prefixes", () => {
    expect(parseWhen("fri 17:40", ps).getTime()).toBe(parseWhen("Friday 17:40", ps).getTime());
  });

  test("ISO without offset is interpreted as festival-timezone wall-clock", () => {
    // 2026-06-04 17:00 Madrid == 15:00 UTC (the Cameron Winter anchor wall time)
    expect(parseWhen("2026-06-04T17:00", ps).getTime()).toBe(Date.UTC(2026, 5, 4, 15, 0));
  });

  test("ISO with explicit offset is respected", () => {
    expect(parseWhen("2026-06-04T17:00:00+02:00", ps).getTime()).toBe(Date.UTC(2026, 5, 4, 15, 0));
  });
});

describe("dayWindow", () => {
  test("'thu' window is [Thu 08:00, Fri 08:00) in festival tz", () => {
    const [lo, hi] = dayWindow("thu", ps);
    expect(lo.getTime()).toBe(Date.UTC(2026, 5, 4, 6, 0)); // 08:00 CEST = 06:00 UTC
    expect(hi.getTime()).toBe(Date.UTC(2026, 5, 5, 6, 0)); // +24h
  });

  test("unknown day throws", () => {
    expect(() => dayWindow("mon", ps)).toThrow();
  });
});

describe("formatInZone", () => {
  test("renders an instant as wall-clock in the festival timezone (sanity anchor)", () => {
    // Cameron Winter: Thu 2026-06-04 17:00 CEST
    const cw = new Date(Date.UTC(2026, 5, 4, 15, 0));
    expect(formatInZone(cw, ps.timezone, { weekday: "short", hour: "2-digit", minute: "2-digit" }))
      .toMatch(/Thu.*17:00/);
  });
});
