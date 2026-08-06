/**
 * @festival/ps26 — the Primavera Sound 2026 festival module.
 *
 * Assembles the declarative pack (manifest, venues, knowledge) with the data
 * sources PS implements. `createFestival(config)` takes runtime config (secrets,
 * cache dir) so the module stays free of deployment paths — the bot/CLI injects
 * them. Favourites is wired only when Clashfinder credentials are supplied.
 */
import type { FestivalModule, FestivalSources } from "@festival-bot/core";
import { createWeatherSource, createClashfinderFavouritesSource } from "@festival-bot/adapters";
import { loadManifest, loadVenues, loadKnowledge } from "./pack.js";
import { createLineupSource } from "./lineup.js";
import { createArtistInfoSource } from "./artist-info.js";
import { createAnnouncementsSource } from "./announcements.js";

/** PS26's official Clashfinder event (per-user highlights source). */
const PS26_FAVOURITES_EVENT = "ps26";

export interface Ps26Config {
  secrets?: { clashfinder?: { authUsername: string; authPublicKey: string } };
  /** Directory for source caches (event map, weather). Omit to disable disk caching. */
  cacheDir?: string;
}

export function createFestival(config: Ps26Config = {}): FestivalModule {
  const manifest = loadManifest();
  const venues = loadVenues();
  const knowledge = loadKnowledge();

  const sources: FestivalSources = {
    lineup: createLineupSource(),
    artistInfo: createArtistInfoSource(),
    announcements: createAnnouncementsSource(),
  };

  if (manifest.coordinates) {
    sources.weather = createWeatherSource(
      manifest.coordinates,
      manifest.timezone,
      config.cacheDir ? { cache: { dir: config.cacheDir } } : {},
    );
  }

  const cf = config.secrets?.clashfinder;
  if (cf) {
    sources.favourites = createClashfinderFavouritesSource(PS26_FAVOURITES_EVENT, {
      authUsername: cf.authUsername,
      authPublicKey: cf.authPublicKey,
      cacheDir: config.cacheDir,
    });
  }

  return { manifest, venues, knowledge, sources };
}
