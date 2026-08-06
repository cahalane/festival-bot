import { expect, test } from "vitest";
import { calendarOf, type FestivalManifest } from "./festival.js";

test("calendarOf projects a manifest into the time-module calendar", () => {
  const m: FestivalManifest = {
    slug: "ps26",
    name: "Primavera Sound 2026",
    timezone: "Europe/Madrid",
    dayCutoffHour: 8,
    catchFraction: 0.5,
    nightGapHours: 3,
    days: { thu: [2026, 6, 4] },
  };
  expect(calendarOf(m)).toEqual({
    timezone: "Europe/Madrid",
    dayCutoffHour: 8,
    days: { thu: [2026, 6, 4] },
  });
});
