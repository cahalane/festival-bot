import { describe, expect, test } from "vitest";
import { buildWalkMatrix } from "@festival-bot/core";
import { loadManifest, loadVenues, loadKnowledge } from "./pack.js";

describe("ps27 pack (dormant skeleton)", () => {
  test("manifest carries the site-stable facts", () => {
    const m = loadManifest();
    expect(m.slug).toBe("ps27");
    expect(m.timezone).toBe("Europe/Madrid");
    expect(m.dayCutoffHour).toBe(8);
    expect(m.coordinates).toEqual({ lat: 41.4106, lon: 2.2275 }); // Parc del Fòrum
  });

  test("carries NO dates — unannounced, and a guess would be fabricated data", () => {
    // Deliberate, not an oversight. See festival.json's _note. Fill this from the
    // announcement; the test then needs updating, which is the point.
    expect(loadManifest().days).toEqual({});
  });

  test("the provisional walk graph loads and is traversable", () => {
    const v = loadVenues();
    const w = buildWalkMatrix(v.walk);
    // Values inherited from the 2026 site plan — asserted so a future edit that
    // re-derives them fails here loudly rather than drifting unnoticed.
    expect(w.walk("revolut", "estrella-damm")).toBe(1);
    expect(w.walk("occident", "port")).toBe(9);
    expect(v.limitedCapacity).toContain("auditori-rockdelux");
  });

  test("knowledge is the evergreen subset, each flagged as unverified for 2027", () => {
    const k = loadKnowledge();
    expect(k.geography).toMatch(/NOT VERIFIED FOR 2027/);
    expect(k.amenities).toMatch(/NOT VERIFIED FOR 2027/);
    // No 2026/ edition docs were carried across — those are last year's facts.
    expect(k.stages).toBeUndefined();
    expect(k["city-program"]).toBeUndefined();
  });
});
