/**
 * Primavera Sound lineup source — VENDOR adapter, shared by every PS edition.
 * Parses the GraphQL response shape into the engine's ArtistSet model: epoch-ms
 * starts -> instants, and the 720-min non-music open-hours "set" filtered out.
 *
 * Reads the cached snapshot the festival module supplies (offline/deterministic);
 * `refresh()` re-fetches live, guarded against the post-festival shrink.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ArtistSet, LineupSource } from "@festival-bot/core";
import { refreshDecision } from "./refresh.js";
import { fetchLineupRaw, type PsEvents, type PsEventKind } from "./primavera-graphql.js";

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
  // Primavera answers 200 with `getLineupEvent: null` for an event name it doesn't
  // have — which is what a not-yet-announced edition looks like. Name it, rather
  // than dying on a property of null or (worse) reporting an empty festival.
  const event = raw?.data?.getLineupEvent;
  if (!event) {
    throw new Error("Primavera has no lineup event by that name (not announced yet, or the name is wrong)");
  }
  const out: ArtistSet[] = [];
  for (const a of event.artists ?? []) {
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

/**
 * @param events  this edition's programme names (see PsEvents). Required — the
 *                event name is the one thing that changes year to year.
 * @param opts.file / ciutatFile  snapshot paths, supplied by the festival pack.
 */
export function createPsLineupSource(
  events: PsEvents,
  opts: { file: string; ciutatFile?: string; fetchJson?: <T>(url: string) => Promise<T> },
): LineupSource {
  const file = opts.file;
  const ciutatFile = opts.ciutatFile;
  const countSets = (f: string): number | null => {
    try {
      return parseLineup(JSON.parse(readFileSync(f, "utf8")) as RawLineup).length;
    } catch {
      return null;
    }
  };
  return {
    async loadSets() {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        // A future edition ships no snapshot until the lineup exists. Say so —
        // returning [] here would read as "nothing is on", which is a claim about
        // the festival rather than about our data.
        throw new Error(
          `no lineup snapshot at ${file} — this edition has none yet; run \`fetch-lineup\` once the event is published`,
        );
      }
      return parseLineup(JSON.parse(text) as RawLineup);
    },
    async refresh({ variant = "forum", force = false } = {}) {
      const kind: PsEventKind = variant === "ciutat" ? "ciutat" : "forum";
      // An edition that runs no Ciutat programme (or hasn't announced one) must say
      // so, not quietly fetch the Fòrum lineup and write it to the wrong snapshot.
      if (kind === "ciutat" && !(events.ciutat && ciutatFile)) {
        throw new Error("this Primavera edition declares no `ciutat` programme — nothing to refresh");
      }
      const dest = kind === "ciutat" ? ciutatFile! : file;
      const raw = await fetchLineupRaw(kind === "ciutat" ? events.ciutat! : events.forum, opts.fetchJson);
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
