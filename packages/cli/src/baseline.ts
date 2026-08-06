/**
 * The schedule baseline: the last lineup we consider "known", stored per festival
 * in cache/<slug>/schedule_ref.json (gitignored, regenerable).
 *
 * Both the operator-facing `schedule-watch` and the unattended `schedule-tick`
 * diff against it, so it lives here rather than inside either command.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ArtistSet } from "@festival-bot/core";
import { cacheDir } from "./config.js";

interface SerSet {
  name: string;
  slug: string;
  stage: string;
  start: number;
  end: number;
  durationMin: number;
}

const ser = (s: ArtistSet): SerSet => ({
  name: s.name, slug: s.slug, stage: s.stage,
  start: s.start.getTime(), end: s.end.getTime(), durationMin: s.durationMin,
});

const de = (r: SerSet): ArtistSet => ({
  name: r.name, slug: r.slug, stage: r.stage,
  start: new Date(r.start), end: new Date(r.end), durationMin: r.durationMin,
});

export const baselineFile = (slug: string): string => join(cacheDir(slug), "schedule_ref.json");

/** The saved baseline, or null when none has been seeded yet. */
export function readBaseline(file: string): ArtistSet[] | null {
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as SerSet[]).map(de);
  } catch {
    return null;
  }
}

export function writeBaseline(file: string, sets: ArtistSet[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(sets.map(ser), null, 2));
}
