/**
 * PS26 lineup source (festival-specific). Parses the Primavera GraphQL response
 * shape into the engine's ArtistSet model: epoch-ms starts -> instants, and the
 * 720-min non-music open-hours "set" filtered out.
 *
 * Defaults to the cached snapshot in the pack (offline/deterministic). A live
 * GraphQL fetch can be layered on later behind the same LineupSource interface.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtistSet, LineupSource } from "@festival-bot/core";
import { PACK_DIR } from "./pack.js";
import { fetchLineupRaw, refreshDecision, type PsEventKind } from "./fetch.js";

interface RawVenue {
  venueSlugName: string;
  duration: number;
  dateTimeStartReal: string;
}
interface RawArtist {
  artistName: string;
  artistSlugName: string;
  venues: RawVenue[];
}
export interface RawLineup {
  data: { getLineupEvent: { artists: RawArtist[] } };
}

/** Non-music open-hours appear as a single very long "set"; drop them. */
const FILLER_MIN = 600;

export function parseLineup(raw: RawLineup): ArtistSet[] {
  const out: ArtistSet[] = [];
  for (const a of raw.data.getLineupEvent.artists) {
    for (const v of a.venues) {
      if (v.duration >= FILLER_MIN) continue;
      const start = new Date(Number(v.dateTimeStartReal));
      out.push({
        name: a.artistName,
        slug: a.artistSlugName,
        stage: v.venueSlugName,
        start,
        end: new Date(start.getTime() + v.duration * 60_000),
        durationMin: v.duration,
      });
    }
  }
  return out;
}

export function createLineupSource(
  opts: { file?: string; ciutatFile?: string; fetchJson?: <T>(url: string) => Promise<T> } = {},
): LineupSource {
  const file = opts.file ?? join(PACK_DIR, "schedule.json");
  const ciutatFile = opts.ciutatFile ?? join(PACK_DIR, "ciutat.json");
  const countSets = (f: string): number | null => {
    try {
      return parseLineup(JSON.parse(readFileSync(f, "utf8")) as RawLineup).length;
    } catch {
      return null;
    }
  };
  return {
    async loadSets() {
      return parseLineup(JSON.parse(readFileSync(file, "utf8")) as RawLineup);
    },
    async refresh({ variant = "forum", force = false } = {}) {
      const kind: PsEventKind = variant === "ciutat" ? "ciutat" : "forum";
      const dest = kind === "ciutat" ? ciutatFile : file;
      const raw = await fetchLineupRaw(kind, opts.fetchJson);
      const fetched = parseLineup(raw).length;
      const previous = countSets(dest);
      const decision = refreshDecision(fetched, previous, force);
      // On a guarded shrink, keep the existing snapshot and park the fetch in a sidecar.
      const outFile = decision.write ? dest : `${dest}.fetched.json`;
      writeFileSync(outFile, JSON.stringify(raw, null, 2));
      return { variant: kind, fetched, previous, written: decision.write, file: outFile, note: decision.reason };
    },
  };
}
