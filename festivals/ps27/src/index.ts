/**
 * @festival/ps27 — Primavera Sound 2027.
 *
 * ⚠️ DORMANT SKELETON. As of 2026-08-13 Primavera has not created the 2027 event:
 * `getLineupEvent("primavera-sound-2027-barcelona")` returns null and no dates are
 * announced. This module exists so the plumbing is ready the moment they publish —
 * it is NOT wired into `CLAUDE.md` and must not be made active until there is real
 * data. See CONTEXT.md for the activation checklist.
 *
 * The Primavera GraphQL integration is a vendor adapter shared with ps26 and lives
 * in `@festival-bot/adapters` (`primavera-*.ts`). Only what is genuinely 2027 lives
 * here — and the difference that matters is the FAVOURITES TOPOLOGY, below.
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

/**
 * No `ciutat` yet. PS has run a city programme in recent years, but 2027's is
 * unannounced and the adapter refuses a `ciutat` refresh rather than silently
 * fetching the Fòrum lineup into the wrong snapshot. Add it when it exists.
 */
export const PS27_EVENTS: PsEvents = {
  forum: "primavera-sound-2027-barcelona",
};

/**
 * THE TOPOLOGY DIFFERENCE FROM PS26. ps26 reads favourites from a Clashfinder event
 * an independent user maintains — read-only, never pushed to. ps27 reads from a
 * mirror THIS DEPLOYMENT publishes and owns (clashfinder.com/s/psb27), the same
 * event `./festplan cf-push psb27` writes to. That is the atn26 model.
 *
 * Two consequences worth knowing before anyone stars anything:
 *   1. `cf-push` overwrites the whole event, so the foreign-edit guard is live and
 *      will hold a push when someone hand-edits the mirror. That is intended.
 *   2. Stars do NOT migrate from the community `ps26` event. Everyone starts empty
 *      here and has to re-star on psb27.
 */
export const PS27_FAVOURITES_EVENT = "psb27";

export interface Ps27Config {
  secrets?: { clashfinder?: { authUsername: string; authPublicKey: string } };
  /** Directory for source caches (event map, weather). Omit to disable disk caching. */
  cacheDir?: string;
}

export function createFestival(config: Ps27Config = {}): FestivalModule {
  const manifest = loadManifest();
  const venues = loadVenues();
  const knowledge = loadKnowledge();

  const sources: FestivalSources = {
    // No snapshot ships with this module — there is no 2027 lineup to ship. The
    // source reports that plainly rather than returning an empty timetable, which
    // would read as "nothing is on".
    lineup: createPsLineupSource(PS27_EVENTS, { file: join(PACK_DIR, "schedule.json") }),
    artistInfo: createPsArtistInfoSource(),
    announcements: createBlueskyAnnouncementsSource(),
    pages: createPsPagesSource(),
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
    sources.favourites = createClashfinderFavouritesSource(PS27_FAVOURITES_EVENT, {
      authUsername: cf.authUsername,
      authPublicKey: cf.authPublicKey,
      cacheDir: config.cacheDir,
    });
  }

  return { manifest, venues, knowledge, sources };
}
