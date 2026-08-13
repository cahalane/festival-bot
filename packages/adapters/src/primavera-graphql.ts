/**
 * Primavera Sound live lineup fetch — VENDOR adapter, shared by every PS edition.
 *
 * The GraphQL endpoint serves BOTH PS programmes via the same `getLineupEvent(name)`
 * query — they are DIFFERENT EVENTS, not different APIs:
 *   - `forum`  → e.g. "primavera-sound-2026-barcelona"  = the Parc del Fòrum main
 *                lineup (the bundled planning snapshot, parsed by the lineup source).
 *   - `ciutat` → e.g. "primavera-ciutat-2026-barcelona" = "Primavera a la Ciutat", the
 *                off-site city-venue programme — a SEPARATELY-TICKETED event, tracked
 *                for awareness but NOT auto-planned into routes.
 *
 * The event NAMES are the only year-specific thing here, so they are not hardcoded:
 * each festival module supplies its own `PsEvents` (see `festivals/ps26/src/index.ts`).
 * Everything else — endpoint, query, parse — is stable across editions.
 *
 * Lesson baked into refreshDecision: the live feed PRUNES past acts once the event is
 * over, so a post-festival re-fetch can shrink the lineup — don't silently clobber a
 * fuller bundled snapshot with a degraded one.
 */
import type { RawLineup } from "./primavera-lineup.js";
import { httpGetJson } from "./http.js";

export const PS_ENDPOINT = "https://graphql.primaverasound.com/prod/graphql";

/** The two programmes a PS edition publishes. `ciutat` is optional — not every edition runs one. */
export interface PsEvents {
  forum: string;
  ciutat?: string;
}

export type PsEventKind = keyof PsEvents;

/**
 * The fields the OFFICIAL Android app requests (com.primaverasound.barcelona v1.0.41;
 * see docs/research/primavera-graphql-api.md). This started as a minimal
 * scheduler-only projection ported from fetch_schedule.sh; it now mirrors the app's
 * own `getLineupEvent` selection, because everything extra is free — same request,
 * same endpoint, no auth — and it makes the snapshot self-describing:
 *
 *   - venuesInfo      readable stage names + display `position`, so a snapshot no
 *                     longer depends on a hand-maintained slug→name table.
 *                     (`latitude`/`longitude`/`capacity` are requested but Primavera
 *                     leaves them null/0 — verified against a FULL edition, so they
 *                     are no use for the walk graph. Kept so a future backfill shows up.)
 *   - artistsPosts    the editorial write-ups, and `postCategory` — which carries the
 *                     `bits` tag marking separately-ticketed Primavera Bits acts.
 *   - artistSetName / shortTitle / smallText   the app's own display strings
 *                     (e.g. a b2b or "live" billing that `artistName` alone loses).
 *
 * Extra fields are additive: parseLineup reads the same subset it always did.
 */
const QUERY = `query Get($name: String!) {
  getLineupEvent(name: $name) {
    eventName
    eventSlugName
    updatedAt
    venues
    venuesInfo {
      venueSlugName venueName venueReadableName { en }
      address location country latitude longitude capacity position postUri
    }
    artists {
      artistName artistSlugName artistReadableName { en }
      image { en } postUri duration countryCode
      venues {
        venueSlugName artistSetSlugName artistSetName artistSetReadableName { en }
        artistSetGenres shortTitle { en } smallText { en }
        duration dateTimeStartReal
      }
    }
    artistsPosts {
      slugName postName postCategory
      postSubtitle { en } postText { en } url
    }
  }
}`;

export function lineupUrl(eventName: string): string {
  const q = new URLSearchParams({
    query: QUERY,
    operationName: "Get",
    variables: JSON.stringify({ name: eventName }),
  });
  return `${PS_ENDPOINT}?${q.toString()}`;
}

/**
 * Fetch one programme's raw lineup. Takes the resolved event NAME rather than a
 * kind, so this stays edition-agnostic; callers map kind -> name via their own
 * `PsEvents`.
 */
export async function fetchLineupRaw(
  eventName: string,
  fetchJson: <T>(url: string) => Promise<T> = (u) => httpGetJson(u),
): Promise<RawLineup> {
  return fetchJson<RawLineup>(lineupUrl(eventName));
}
