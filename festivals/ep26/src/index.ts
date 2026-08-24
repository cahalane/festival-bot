/**
 * @festival/ep26 — Electric Picnic 2026 (Stradbally Hall, Co Laois).
 *
 * Thin by design: the Greencopper/Leap integration is a VENDOR adapter shared with
 * every other festival on that platform and lives in `@festival-bot/adapters`
 * (`greencopper*.ts`). What stays here is genuinely 2026: the pack, the project
 * tag/OTA url, and the two-source lineup union (see src/lineup.ts).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FestivalModule, FestivalSources } from "@festival-bot/core";
import { createPack, createWeatherSource, createClashfinderFavouritesSource } from "@festival-bot/adapters";
import { createEp26LineupSource } from "./lineup.js";

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Project identity, read out of the app's own config (docs/setup/greencopper-discovery.md). */
export const EP26_PROJECT = "electricpicnic-2026";
export const EP26_OTA_URL =
  "https://api.mobile.leapevent.tech/ota/electricpicnic-2026/c4eb8ada4e66436f9d798ea61e1a3d38/";

export interface Ep26Config {
  secrets?: {
    clashfinder?: { authUsername: string; authPublicKey: string };
    /** Bundle-decryption secret from the app's runConfig.json. NEVER committed. */
    greencopper?: { secret?: string };
  };
  cacheDir?: string;
}

export function createFestival(config: Ep26Config = {}): FestivalModule {
  const pack = createPack(PACK_DIR);
  const manifest = pack.loadManifest();

  const sources: FestivalSources = {
    lineup: createEp26LineupSource({
      bundleDir: join(PACK_DIR, "bundle"),
      greencopper: config.secrets?.greencopper?.secret
        ? {
            project: EP26_PROJECT,
            otaApiUrl: EP26_OTA_URL,
            secret: config.secrets.greencopper.secret,
            locale: "en-GB",
          }
        : undefined,
    }),
  };

  if (manifest.coordinates) {
    sources.weather = createWeatherSource(
      manifest.coordinates,
      manifest.timezone,
      config.cacheDir ? { cache: { dir: config.cacheDir } } : {},
    );
  }

  // NOTE: no favourites source is wired by default. The public `ep26` Clashfinder
  // event is maintained by an independent user and this deployment has no edit
  // rights on it (verified 2026-08-24: /s/ep26/?edit -> 403), so it is read-only
  // at most. Point this at an event you own before relying on favourites.
  const cf = config.secrets?.clashfinder;
  if (cf && process.env.EP26_FAVOURITES_EVENT) {
    sources.favourites = createClashfinderFavouritesSource(process.env.EP26_FAVOURITES_EVENT, {
      authUsername: cf.authUsername,
      authPublicKey: cf.authPublicKey,
      cacheDir: config.cacheDir,
    });
  }

  return { manifest, venues: pack.loadVenues(), knowledge: pack.loadKnowledge(), sources };
}
