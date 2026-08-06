/**
 * demofest's lineup: a committed JSON file, read from disk. No network, no auth.
 *
 * This is also the smallest possible worked example of a LineupSource — a real
 * festival's version differs only in where the records come from before they are
 * mapped to ArtistSet.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ArtistSet, LineupSource } from "@festival-bot/core";

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

interface RawSet {
  name: string;
  stage: string;
  start: string;
  end: string;
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function createLineupSource(): LineupSource {
  return {
    async loadSets(): Promise<ArtistSet[]> {
      const raw = JSON.parse(readFileSync(join(PACK_DIR, "schedule.json"), "utf8")) as RawSet[];
      return raw.map((r) => {
        const start = new Date(r.start);
        const end = new Date(r.end);
        return {
          name: r.name,
          slug: slugify(r.name),
          stage: r.stage,
          start,
          end,
          durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
        };
      });
    },
  };
}
