import { describe, expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseGreencopperLineup } from "@festival-bot/adapters";
import { loadBundleFrom, createEp26LineupSource } from "./lineup.js";

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = loadBundleFrom(join(PACK_DIR, "bundle"));

describe("ep26 committed bundle", () => {
  const sets = parseGreencopperLineup(bundle);

  test("parses the full area/fringe programme", () => {
    expect(sets.length).toBeGreaterThan(800);
  });

  test("no strings-table key leaks into a name or stage", () => {
    expect(sets.filter((s) => /^(activity|location)_/.test(s.name))).toEqual([]);
    expect(sets.filter((s) => /^(activity|location)-/.test(s.stage))).toEqual([]);
  });

  // The app did NOT carry the main arenas when this module was built (OTA v39);
  // it published them in v42 on 2026-08-24, matching the Irish Times times. That is
  // why extra-sets.json shrank from 115 entries to 2 — see its _note.
  test("carries the main arenas", () => {
    for (const stage of ["main-stage-presented-by-3", "electric-arena", "rankins-wood", "comedy-arena"]) {
      expect(sets.filter((s) => s.stage === stage).length).toBeGreaterThan(0);
    }
  });

  test("Comedy acts now carry a stage, so they are plannable", () => {
    const dok = sets.find((s) => s.name === "Deirdre O'Kane");
    expect(dok?.stage).toBe("comedy-arena");
  });

  test("every set is inside the festival window and sanely bounded", () => {
    for (const s of sets) {
      expect(s.durationMin).toBeGreaterThan(0);
      expect(s.start.getUTCFullYear()).toBe(2026);
      expect(s.end.getTime()).toBeGreaterThan(s.start.getTime());
    }
  });
});

describe("createEp26LineupSource", () => {
  test("loadSets reads the committed bundle", async () => {
    const src = createEp26LineupSource({ bundleDir: join(PACK_DIR, "bundle") });
    expect((await src.loadSets()).length).toBeGreaterThan(800);
  });

  test("omits refresh() when no greencopper secret is configured", () => {
    // A clone with no secrets must still plan, just without live re-fetch.
    expect(createEp26LineupSource({ bundleDir: join(PACK_DIR, "bundle") }).refresh).toBeUndefined();
  });

  test("exposes refresh() once a secret is supplied", () => {
    const src = createEp26LineupSource({
      bundleDir: join(PACK_DIR, "bundle"),
      greencopper: { project: "p", otaApiUrl: "https://example.invalid/", secret: "s" },
    });
    expect(typeof src.refresh).toBe("function");
  });
});
