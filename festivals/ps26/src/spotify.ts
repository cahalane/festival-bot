/**
 * PS26 artist-id source — act name -> Spotify artist id, via the same query the
 * official app uses to power its registration artist-picker
 * (`getRegisterPreferencesData`, com.primaverasound.barcelona v1.0.41; see
 * docs/research/primavera-graphql-api.md). Unauthenticated, like the rest of the
 * endpoint.
 *
 * WHAT THIS IS NOT: a lineup lookup. The endpoint searches Spotify's *global*
 * catalogue and pads the results with related artists, so the first hit is
 * routinely a different, more famous act. Measured live on 2026-08-12:
 *
 *   search "Greta"             -> Greta Van Fleet   (NOT ps26's Bits act `greta`)
 *   search "Amiga Date Cuenta" -> Karol Sevilla
 *   search "Corte!"            -> CortexUS
 *
 * Taking result[0] would therefore tag the wrong artist with total confidence —
 * the res/pinkpantheress phantom match rebuilt through a new door. So this module
 * accepts a result ONLY on an exact normalised-name match, and returns null
 * otherwise. Of 30 real ps26 acts, 24 matched exactly; the 6 that didn't are
 * suffixed or b2b billings that the name search was never going to settle anyway.
 */
import { httpGetJson } from "@festival-bot/adapters";
import type { ArtistIdSource } from "@festival-bot/core";
import { PS_ENDPOINT } from "./fetch.js";

/** The app's own query, field-for-field. */
const PREFERENCES = `query R($search: String, $from: Int, $to: Int, $artists: [String]) {
  getRegisterPreferencesData(search: $search, from: $from, to: $to, artists: $artists) {
    topArtists { name image isSpotifyArtist spotifyId slug }
  }
}`;

export interface PsTopArtist {
  name?: string;
  image?: string;
  isSpotifyArtist?: boolean;
  spotifyId?: string;
  slug?: string;
}

interface PreferencesResponse {
  data?: { getRegisterPreferencesData?: { topArtists?: PsTopArtist[] } | null };
  errors?: { message?: string }[];
}

export function preferencesUrl(search: string, limit = 5): string {
  const q = new URLSearchParams({
    query: PREFERENCES,
    operationName: "R",
    variables: JSON.stringify({ search, from: 0, to: limit, artists: [] }),
  });
  return `${PS_ENDPOINT}?${q.toString()}`;
}

/**
 * Fold to a comparable form: diacritics stripped, lowercased, whitespace collapsed.
 * Deliberately the same normalisation the MusicBrainz matcher uses — the two gates
 * should agree on what "the same name" means.
 */
export function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pick the search result whose name IS the act's name. No fuzzy fallback, no
 * "closest" — see the module header for what happens when you reach further.
 */
export function pickExactArtist(query: string, artists: PsTopArtist[]): PsTopArtist | null {
  const q = normName(query);
  return artists.find((a) => a.name && normName(a.name) === q && a.spotifyId) ?? null;
}

export function createArtistIdSource(
  opts: { fetchJson?: <T>(url: string) => Promise<T>; limit?: number } = {},
): ArtistIdSource {
  const fetchJson = opts.fetchJson ?? (<T>(u: string) => httpGetJson<T>(u));

  return {
    async spotifyId(name: string): Promise<string | null> {
      if (!name.trim()) return null;
      const res = await fetchJson<PreferencesResponse>(preferencesUrl(name, opts.limit ?? 5));
      // Unlike the lineup/posts queries, a failure here is not worth raising: the
      // caller (MBID enrichment) is already on its fallback path, and an id lookup
      // that errors should degrade to "no id", not abort a Clashfinder push.
      if (res.errors?.length || !res.data) return null;
      const artists = res.data.getRegisterPreferencesData?.topArtists ?? [];
      return pickExactArtist(name, artists)?.spotifyId ?? null;
    },
  };
}
