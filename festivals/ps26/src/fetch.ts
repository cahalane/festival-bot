/**
 * PS26 live lineup fetch (festival-specific). The Primavera GraphQL endpoint serves
 * BOTH PS programmes via the same `getLineupEvent(name)` query — they are DIFFERENT
 * EVENTS, not different APIs:
 *   - `forum`  → "primavera-sound-2026-barcelona"  = the Parc del Fòrum main lineup
 *                (the bundled planning snapshot, parsed by the lineup source).
 *   - `ciutat` → "primavera-ciutat-2026-barcelona" = "Primavera a la Ciutat", the
 *                off-site city-venue programme — a SEPARATELY-TICKETED event, tracked
 *                for awareness but NOT auto-planned into routes.
 *
 * Lesson baked into refreshDecision: the live feed PRUNES past acts once the event is
 * over, so a post-festival re-fetch can shrink the lineup — don't silently clobber a
 * fuller bundled snapshot with a degraded one.
 */
import type { RawLineup } from "./lineup.js";
import { httpGetJson } from "@festival-bot/adapters";

export const PS_ENDPOINT = "https://graphql.primaverasound.com/prod/graphql";

export const PS_EVENTS = {
  forum: "primavera-sound-2026-barcelona",
  ciutat: "primavera-ciutat-2026-barcelona",
} as const;

export type PsEventKind = keyof typeof PS_EVENTS;

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

export async function fetchLineupRaw(
  kind: PsEventKind,
  fetchJson: <T>(url: string) => Promise<T> = (u) => httpGetJson(u),
): Promise<RawLineup> {
  return fetchJson<RawLineup>(lineupUrl(PS_EVENTS[kind]));
}

// The shrink guard is festival-agnostic — it now lives in @festival-bot/adapters
// (every snapshot-backed lineup source needs it). Re-exported so ps26's callers
// and tests keep their existing import site.
export { refreshDecision, type RefreshDecision } from "@festival-bot/adapters";
