/**
 * The FestivalModule contract — what a festival package exports.
 *
 * A festival module bundles its declarative facts (manifest, venues, knowledge)
 * with the data sources it implements. The bot loads the active module by slug
 * and drives the engine with it. A leaner festival simply registers fewer
 * sources — it is a smaller module, not a broken one.
 */
import type { FestivalCalendar } from "./time.js";
import type { WalkGraph } from "./walk.js";
import type {
  LineupSource,
  FavouritesSource,
  WeatherSource,
  AnnouncementsSource,
  PagesSource,
  ArtistInfoSource,
} from "./sources.js";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface FestivalManifest {
  slug: string;
  name: string;
  /** IANA timezone, e.g. "Europe/Madrid". */
  timezone: string;
  /** Hour a festival "day" rolls over (groups post-midnight sets with the evening). */
  dayCutoffHour: number;
  /** "Catch most" threshold (e.g. 0.5) — the hard floor for counting a set seen. */
  catchFraction: number;
  /** Optional: myday only adds a set caught below this fraction when it's a genuine
   *  time-clash with the set you're already watching (else the catchFraction floor
   *  applies to any reachable set, which fills gaps with thin late-joins). Omit to
   *  disable the gate. */
  worthwhileCatch?: number;
  /** Reachable-list gap (hours) that ends "the night". */
  nightGapHours: number;
  /** Day name -> [year, month(1-12), day]. */
  days: Record<string, readonly [number, number, number]>;
  /** Site coordinates (for the weather adapter). */
  coordinates?: GeoPoint;
}

export interface VenueInfo {
  slug: string;
  name: string;
}

export interface VenuesConfig {
  venues: VenueInfo[];
  walk: WalkGraph;
  /** Stage slugs that are capacity-limited ("arrive early"). */
  limitedCapacity: string[];
}

export interface FestivalSources {
  lineup: LineupSource;
  favourites?: FavouritesSource;
  weather?: WeatherSource;
  announcements?: AnnouncementsSource;
  pages?: PagesSource;
  artistInfo?: ArtistInfoSource;
}

export interface FestivalModule {
  manifest: FestivalManifest;
  venues: VenuesConfig;
  sources: FestivalSources;
  /** Markdown knowledge docs keyed by topic, for the agent to read. */
  knowledge?: Record<string, string>;
}

/** The calendar a manifest implies (consumed by the time module). */
export function calendarOf(m: FestivalManifest): FestivalCalendar {
  return { timezone: m.timezone, dayCutoffHour: m.dayCutoffHour, days: m.days };
}
