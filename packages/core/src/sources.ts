/**
 * Data-source adapter interfaces (the seams between the engine and the world).
 *
 * Implementations live EITHER in @festival-bot/adapters (cross-festival
 * reusables, e.g. Open-Meteo weather) OR inside a festival's own module
 * (festival-specific, e.g. Primavera's GraphQL lineup). The engine consumes
 * whatever the active festival registers — it never imports a concrete adapter.
 */
import type { ArtistSet } from "./models.js";
import type { FavouriteTier } from "./favourites.js";

export interface LineupRefreshResult {
  /** Which programme/variant was fetched (festival-defined, e.g. "forum" | "ciutat"). */
  variant: string;
  /** Set count in the freshly fetched lineup. */
  fetched: number;
  /** Set count in the prior snapshot, or null if there was none. */
  previous: number | null;
  /** True if the snapshot was overwritten; false if a guard diverted it. */
  written: boolean;
  /** File the data was written to (the snapshot, or a guarded sidecar). */
  file: string;
  /** Human-readable explanation of the write/guard decision. */
  note: string;
}

export interface LineupSource {
  /** Current set list for the festival (already in absolute instants). */
  loadSets(): Promise<ArtistSet[]>;
  /**
   * Re-fetch from the live source and persist a snapshot. OPTIONAL — a festival
   * with only a static snapshot omits it. Guards against clobbering a fuller
   * snapshot with a degraded one (see ps26 post-festival pruning).
   */
  refresh?(opts?: { variant?: string; force?: boolean }): Promise<LineupRefreshResult>;
}

export interface FavouritesSource {
  /** Ordered priority tiers for a user (tier 0 = highest priority). */
  tiersFor(user: string): Promise<FavouriteTier[]>;
  /** True if the last result came from a stale cache after a fetch failure. */
  lastFetchStale?(): boolean;
}

export interface WeatherDaily {
  date: string; // YYYY-MM-DD (festival-local)
  tempMaxC: number;
  tempMinC: number;
  precipMm: number;
  precipProbPct: number;
}

export interface WeatherHourly {
  time: string; // ISO with offset (festival-local)
  tempC: number;
  /** Feels-like temperature, when the source provides it. */
  apparentC?: number;
  precipMm: number;
  precipProbPct: number;
  /** Total cloud cover %, when the source provides it. */
  cloudCoverPct?: number;
}

export interface WeatherSource {
  daily(days?: number): Promise<WeatherDaily[]>;
  hourly(hours?: number): Promise<WeatherHourly[]>;
  /**
   * Hourly across an explicit local date range (YYYY-MM-DD). OPTIONAL: `hourly`
   * counts hours from now, so it cannot reach a festival several days out.
   */
  hourlyRange?(startDate: string, endDate: string): Promise<WeatherHourly[]>;
  /**
   * True if the last result came from a stale cache after a failed refresh.
   * Mirrors FavouritesSource — a forecast served from cache during an outage must
   * be reported as stale, never presented as current.
   */
  lastFetchStale?(): boolean;
}

export interface Announcement {
  id: string;
  text: string;
  createdAt: string; // ISO
  url?: string;
  imageUrl?: string;
}

export interface AnnouncementsSource {
  latest(limit?: number): Promise<Announcement[]>;
}

/** Minimal fingerprint of a CMS/info page, for change detection. */
export interface PageRef {
  id: string;
  title: string;
  modifiedAt: string; // ISO with offset
}

/** A full info/CMS page, including its rendered-to-text body. */
export interface PageDetail extends PageRef {
  body: string; // plain text (HTML stripped)
}

/** A source of info/CMS page fingerprints (e.g. Appmiral `/pages`). */
export interface PagesSource {
  refs(): Promise<PageRef[]>;
  /** Fetch one page's full body by id, or null if it's gone. Optional — a source may only fingerprint. */
  page?(id: string): Promise<PageDetail | null>;
}

export interface ArtistInfo {
  name: string;
  bio: string;
  url: string;
}

export interface ArtistInfoSource {
  info(slug: string): Promise<ArtistInfo>;
}

export interface SetlistSong {
  name: string;
  /** Free-text note (e.g. "with Robert Smith", "Live debut"). */
  info?: string;
  /** Original artist, when this song is a cover. */
  cover?: string;
  /** True when the song was played from tape (not performed live). */
  tape?: boolean;
  /** Encore number this song belongs to (1 = first encore); absent for the main set. */
  encore?: number;
}

export interface Setlist {
  id: string;
  /** Festival-/show-local calendar date, normalised to YYYY-MM-DD. */
  eventDate: string;
  artist: string;
  venue?: string;
  city?: string;
  tour?: string;
  /** Songs in performance order, flattened across main set + encores. An empty
   *  list means the gig exists on setlist.fm but no songs are entered yet
   *  (e.g. an in-progress set) — the caller should treat that as "not yet known". */
  songs: SetlistSong[];
  url?: string;
}

export interface SetlistSource {
  /**
   * An artist's most recent setlists, newest first. Pass a known MusicBrainz
   * `mbid` to look up directly (preferred); otherwise the implementation falls
   * back to a name search. Crowd-sourced — may lag or be incomplete; never
   * present songs as first-hand observation.
   */
  recent(artist: string, opts?: { mbid?: string; limit?: number }): Promise<Setlist[]>;
}
