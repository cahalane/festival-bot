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
export const GREENCOPPER_OTA_HOST = "https://api.mobile.leapevent.tech/ota";

/**
 * The OTA url needs a 32-hex path token, which is NOT in this repo for the same
 * reason Appmiral's `x-protect` is not (see docs/setup/appmiral-discovery.md §4):
 * it is a working access gate, and a public copy invites volume use until the
 * vendor rotates it — breaking it for every legitimate reader including us.
 * Extract it yourself per docs/setup/greencopper-discovery.md and put it in
 * config/secrets.json under `greencopper.otaToken`.
 */
export function ep26OtaUrl(token: string): string {
  return `${GREENCOPPER_OTA_HOST}/${EP26_PROJECT}/${token}/`;
}

export interface Ep26Config {
  secrets?: {
    clashfinder?: { authUsername: string; authPublicKey: string };
    /** From the app: `secret` (runConfig.json) and the OTA path token. NEVER committed. */
    greencopper?: { secret?: string; otaToken?: string };
  };
  cacheDir?: string;
}

export function createFestival(config: Ep26Config = {}): FestivalModule {
  const pack = createPack(PACK_DIR);
  const manifest = pack.loadManifest();

  const sources: FestivalSources = {
    lineup: createEp26LineupSource({
      bundleDir: join(PACK_DIR, "bundle"),
      // Live refresh needs BOTH halves; without them the module still plans from
      // the committed bundle, it just cannot re-fetch.
      greencopper:
        config.secrets?.greencopper?.secret && config.secrets.greencopper.otaToken
          ? {
              project: EP26_PROJECT,
              otaApiUrl: ep26OtaUrl(config.secrets.greencopper.otaToken),
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
