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

// Minimal query: only the fields the scheduler needs (ports fetch_schedule.sh).
const QUERY = `query Get($name: String!) {
  getLineupEvent(name: $name) {
    artists { artistName artistSlugName duration
      venues { venueSlugName artistSetSlugName artistSetGenres duration dateTimeStartReal } }
    venues
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
