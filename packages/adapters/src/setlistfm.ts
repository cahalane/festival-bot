/**
 * setlist.fm adapter — cross-festival reusable. Fetches an artist's recent
 * setlists (the songs they've actually been playing), to answer the live-festival
 * "what's <artist> playing?" question we kept getting at PS (a couple of crew
 * members during The Cure).
 *
 * Keyed on MusicBrainz IDs — the SAME mbids we already resolve for the Clashfinder
 * export — so lookups join cleanly. mbid lookup is STRONGLY preferred: a plain name
 * search is relevance-ranked and can mis-hit (searching "Radiohead" returns the
 * cover band "An Evening of Radiohead" first), so name search is only a fallback.
 *
 * Crowd-sourced caveat: setlists are entered by attendees, so an in-progress set
 * may be absent, partial, or lag. Callers must present results as setlist.fm data,
 * never as first-hand observation. An entry with an empty `songs` list means the
 * gig exists but nothing is entered yet — "not yet known", not "played nothing".
 *
 * Politeness: setlist.fm allows 2 req/s and 1,440 req/day, and requires an api key
 * (`x-api-key`). So we throttle (default 600ms) and disk-cache per artist.
 * Docs: https://api.setlist.fm/docs/1.0/index.html
 */
import type { Setlist, SetlistSong, SetlistSource } from "@festival-bot/core";
import { cachedJson, httpGetJson } from "./http.js";
import { join } from "node:path";

const BASE = "https://api.setlist.fm/rest/1.0";

// ---- Raw setlist.fm response shapes (only the fields we read) ----
export interface SetlistfmSong {
  name?: string;
  info?: string;
  tape?: boolean;
  cover?: { name?: string };
  with?: { name?: string };
}
export interface SetlistfmSet {
  name?: string;
  encore?: number | null;
  song?: SetlistfmSong[];
}
export interface SetlistfmSetlist {
  id: string;
  eventDate: string; // dd-MM-yyyy
  artist?: { name?: string; mbid?: string };
  venue?: { name?: string; city?: { name?: string } };
  tour?: { name?: string };
  sets?: { set?: SetlistfmSet[] };
  info?: string;
  url?: string;
}
export interface SetlistfmResponse {
  type?: string;
  total?: number;
  itemsPerPage?: number;
  page?: number;
  setlist?: SetlistfmSetlist[];
}

/** Convert setlist.fm's `dd-MM-yyyy` event date to ISO `YYYY-MM-DD`; pass anything else through. */
export function setlistfmDate(d: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

function parseSetlist(s: SetlistfmSetlist): Setlist {
  const songs: SetlistSong[] = [];
  for (const set of s.sets?.set ?? []) {
    for (const song of set.song ?? []) {
      if (!song.name) continue;
      const out: SetlistSong = { name: song.name };
      if (song.info) out.info = song.info;
      if (song.cover?.name) out.cover = song.cover.name;
      if (song.tape) out.tape = true;
      if (set.encore != null) out.encore = set.encore;
      songs.push(out);
    }
  }
  const list: Setlist = { id: s.id, eventDate: setlistfmDate(s.eventDate), artist: s.artist?.name ?? "", songs };
  if (s.venue?.name) list.venue = s.venue.name;
  if (s.venue?.city?.name) list.city = s.venue.city.name;
  if (s.tour?.name) list.tour = s.tour.name;
  if (s.url) list.url = s.url;
  return list;
}

export function parseSetlistfmResponse(raw: SetlistfmResponse): Setlist[] {
  return (raw.setlist ?? []).map(parseSetlist);
}

export function setlistfmArtistUrl(mbid: string, page = 1): string {
  return `${BASE}/artist/${mbid}/setlists?p=${page}`;
}

export function setlistfmSearchUrl(name: string, page = 1): string {
  return `${BASE}/search/setlists?artistName=${encodeURIComponent(name)}&p=${page}`;
}

export function setlistfmHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey, Accept: "application/json" };
}

export interface SetlistSourceOptions {
  apiKey: string;
  /** Resolve an act name to an mbid (preferred lookup path). Inject our MbidResolver. */
  resolveMbid?: (name: string) => Promise<string | null>;
  /** Inject for tests; defaults to a real HTTP GET with the api-key header. */
  fetchJson?: <T>(url: string, headers: Record<string, string>) => Promise<T>;
  /** Directory for the per-artist response cache. Omit to disable disk caching. */
  cacheDir?: string;
  /** Cache freshness window (default 1h) — short, since live sets update fast. */
  cacheMaxAgeMs?: number;
  /** Min ms between live fetches (default 600 → under the 2/s ceiling). */
  minIntervalMs?: number;
}

/** Build a cached, throttled setlist.fm source. */
export function createSetlistSource(opts: SetlistSourceOptions): SetlistSource {
  const headers = setlistfmHeaders(opts.apiKey);
  const minInterval = opts.minIntervalMs ?? 600;
  const maxAge = opts.cacheMaxAgeMs ?? 3_600_000;
  const fetchJson =
    opts.fetchJson ?? (<T>(url: string, h: Record<string, string>) => httpGetJson<T>(url, { headers: h }));

  let lastFetch = 0;
  async function throttle(): Promise<void> {
    const wait = minInterval - (Date.now() - lastFetch);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetch = Date.now();
  }

  async function load(cacheKey: string, url: string): Promise<SetlistfmResponse> {
    const fetchOnce = async (): Promise<SetlistfmResponse> => {
      await throttle();
      return fetchJson<SetlistfmResponse>(url, headers);
    };
    if (!opts.cacheDir) return fetchOnce();
    const { data } = await cachedJson<SetlistfmResponse>({
      file: join(opts.cacheDir, `${cacheKey}.json`),
      maxAgeMs: maxAge,
      fetch: fetchOnce,
    });
    return data;
  }

  async function recent(artist: string, o: { mbid?: string; limit?: number } = {}): Promise<Setlist[]> {
    const mbid = o.mbid ?? (opts.resolveMbid ? await opts.resolveMbid(artist) : null);
    const [cacheKey, url] = mbid
      ? [`mbid-${mbid}`, setlistfmArtistUrl(mbid)]
      : [`name-${artist.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, setlistfmSearchUrl(artist)];
    const lists = parseSetlistfmResponse(await load(cacheKey, url));
    return o.limit != null ? lists.slice(0, o.limit) : lists;
  }

  return { recent };
}
