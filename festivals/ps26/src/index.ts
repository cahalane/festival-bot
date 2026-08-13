/**
 * @festival/ps26 — the Primavera Sound 2026 festival module.
 *
 * Thin by design. The Primavera GraphQL integration (lineup, bios, editorial posts,
 * Spotify ids) is a VENDOR adapter shared with every other PS edition and lives in
 * `@festival-bot/adapters` (`primavera-*.ts`). What stays here is only what is
 * genuinely 2026: the declarative pack, the event names, and which Clashfinder event
 * holds this edition's favourites.
 */
import { join } from "node:path";
import type { FestivalModule, FestivalSources } from "@festival-bot/core";
import {
  createWeatherSource,
  createClashfinderFavouritesSource,
  createBlueskyAnnouncementsSource,
  createPsLineupSource,
  createPsArtistInfoSource,
  createPsArtistIdSource,
  createPsPagesSource,
  type PsEvents,
} from "@festival-bot/adapters";
import { loadManifest, loadVenues, loadKnowledge, PACK_DIR } from "./pack.js";

/** The two 2026 programmes on the shared `getLineupEvent` query. */
export const PS26_EVENTS: PsEvents = {
  forum: "primavera-sound-2026-barcelona",
  ciutat: "primavera-ciutat-2026-barcelona",
};

/**
 * PS26's favourites come from a Clashfinder event an INDEPENDENT user maintains —
 * not the festival, and not us. Read-only: we never push to it. (Contrast ps27,
 * which reads from a mirror this deployment publishes.) See docs/setup/clashfinder.md.
 */
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

  // Two official back-channels, deliberately on different seams — they carry
  // different traffic and must not be collapsed into one:
  //   announcements = BlueSky, the LIVE ops channel (stage delays, weather calls);
  //                   this is what carried the Thu 4 Jun weather chaos.
  //   pages         = the GraphQL editorial feed (programme news, ticket waves),
  //                   slower and diffable, so `pages-tick` can watch it for changes.
  const sources: FestivalSources = {
    lineup: createPsLineupSource(PS26_EVENTS, {
      file: join(PACK_DIR, "schedule.json"),
      ciutatFile: join(PACK_DIR, "ciutat.json"),
    }),
    artistInfo: createPsArtistInfoSource(),
    announcements: createBlueskyAnnouncementsSource(),
    pages: createPsPagesSource(),
    // Spotify ids from the app's registration search, used ONLY to disambiguate
    // MusicBrainz lookups during a Clashfinder push — never to identify an act on
    // its own (the endpoint searches Spotify's global catalogue, not the lineup).
    artistIds: createPsArtistIdSource(),
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
