/**
 * @festival/atn26 — the All Together Now festival module.
 *
 * Wires the shared Appmiral lineup adapter (vendor = Appmiral; event
 * `alltogethernow`) to ATN's declarative pack. Defaults to the bundled snapshot
 * for offline/deterministic loads and to be polite to the rate-limited API; pass
 * `live: true` to fetch the edition over HTTP (needs secrets.appmiral.xProtect).
 *
 * The bundled snapshot + manifest days are the 2026 edition (flipped 2026-07-10 when
 * the timetable published). `./festplan fetch-lineup [--force]` re-pulls it live via
 * LineupSource.refresh, behind the shared shrink guard.
 */
import type { FestivalModule, FestivalSources } from "@festival-bot/core";
import {
  createWeatherSource,
  createAppmiralLineupSource,
  createAppmiralArtistInfoSource,
  createClashfinderFavouritesSource,
  createAppmiralNotificationsSource,
  createAppmiralPagesSource,
  createAppmiralMapSource,
} from "@festival-bot/adapters";
import { loadManifest, loadVenues, loadKnowledge, SCHEDULE_FILE } from "./pack.js";

const ATN_EVENT = "alltogethernow";
/** The edition the bundled snapshot came from. Flipped to 2026 on 2026-07-10 when it published (timetable live). */
const ATN_EDITION = "alltogethernow2026";
/** Read-only Clashfinder mirror we push the lineup to; users star acts on it (Appmiral has no per-user picks). */
const ATN_FAVOURITES_EVENT = "atn2026";

export interface Atn26Config {
  secrets?: {
    appmiral?: { xProtect: string };
    /** Clashfinder auth for the read-only `atn2026` favourites mirror. */
    clashfinder?: { authUsername: string; authPublicKey: string };
  };
  /** Directory for source caches (lineup, weather). Omit to disable disk caching. */
  cacheDir?: string;
  /** Override the Appmiral edition id (defaults to the bundled snapshot's edition). */
  edition?: string;
  /** Fetch the lineup live from the Appmiral API instead of the bundled snapshot. */
  live?: boolean;
}

export function createFestival(config: Atn26Config = {}): FestivalModule {
  const manifest = loadManifest();
  const venues = loadVenues();
  const knowledge = loadKnowledge();

  const appmiralConfig = {
    event: ATN_EVENT,
    edition: config.edition ?? ATN_EDITION,
    xProtect: config.secrets?.appmiral?.xProtect ?? "",
  };
  // `file` is always the snapshot: what loadSets reads by default, and what
  // `fetch-lineup` (LineupSource.refresh) re-writes from the live API.
  const appmiralOpts = { file: SCHEDULE_FILE, cacheDir: config.cacheDir, live: config.live };

  const sources: FestivalSources = {
    lineup: createAppmiralLineupSource(appmiralConfig, appmiralOpts),
    // Bios come inline with the lineup (the `body` field) — no extra fetch.
    artistInfo: createAppmiralArtistInfoSource(appmiralConfig, appmiralOpts),
  };

  // Official ATN announcements (push/news inbox), on the same Appmiral API +
  // x-protect auth as the lineup. No snapshot fallback, so needs the token.
  if (config.secrets?.appmiral?.xProtect) {
    sources.announcements = createAppmiralNotificationsSource(appmiralConfig);
    sources.pages = createAppmiralPagesSource(appmiralConfig);
  }

  const xProtect = config.secrets?.appmiral?.xProtect;
  if (xProtect) {
    sources.map = createAppmiralMapSource({ event: ATN_EVENT, edition: ATN_EDITION, xProtect });
  }

  const cf = config.secrets?.clashfinder;
  if (cf) {
    sources.favourites = createClashfinderFavouritesSource(ATN_FAVOURITES_EVENT, {
      authUsername: cf.authUsername,
      authPublicKey: cf.authPublicKey,
      cacheDir: config.cacheDir,
    });
  }

  if (manifest.coordinates) {
    sources.weather = createWeatherSource(
      manifest.coordinates,
      manifest.timezone,
      config.cacheDir ? { cache: { dir: config.cacheDir } } : {},
    );
  }

  return { manifest, venues, knowledge, sources };
}
