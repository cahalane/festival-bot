import { describe, expect, test } from "vitest";
import { buildWalkMatrix, calendarOf, parseWhen } from "@festival-bot/core";
import { loadManifest, loadVenues, loadKnowledge } from "./pack.js";

describe("ps26 pack", () => {
  test("manifest carries the festival's calendar facts", () => {
    const m = loadManifest();
    expect(m.slug).toBe("ps26");
    expect(m.timezone).toBe("Europe/Madrid");
    expect(m.dayCutoffHour).toBe(8);
    expect(m.days.thu).toEqual([2026, 6, 4]);
    expect(m.coordinates).toEqual({ lat: 41.4106, lon: 2.2275 });
  });

  test("venues reproduce known walk distances and limited-capacity flags", () => {
    const v = loadVenues();
    const w = buildWalkMatrix(v.walk);
    expect(w.walk("revolut", "estrella-damm")).toBe(1); // alternating mains pair
    expect(w.walk("plenitude", "cupra")).toBe(15);
    expect(w.walk("occident", "port")).toBe(9); // occident->cupra(5)->pulse(2)->port(2)
    expect(v.limitedCapacity).toContain("auditori-rockdelux");
  });

  test("knowledge docs load, including year-specific ones under knowledge/2026/", () => {
    const k = loadKnowledge();
    expect(k.geography?.length).toBeGreaterThan(50); // evergreen, top-level
    expect(k.runbook?.length).toBeGreaterThan(50); // evergreen, top-level
    expect(k.stages?.length).toBeGreaterThan(50); // knowledge/2026/ — proves recursive load
    expect(k["city-program"]?.length).toBeGreaterThan(50); // knowledge/2026/
  });

  test("calendar parity: Cameron Winter anchor parses to Thu 17:00 CEST", () => {
    const cal = calendarOf(loadManifest());
    expect(parseWhen("Thu 17:00", cal).getTime()).toBe(Date.UTC(2026, 5, 4, 15, 0));
  });
});
