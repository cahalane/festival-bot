/**
 * @festival/ov26 — Other Voices Dingle 2026 (Dingle, Co Kerry), 27–29 November.
 *
 * Thin by design: the Aloompa Dragonfly integration is a VENDOR adapter in
 * `@festival-bot/adapters` (`aloompa.ts`). What stays here is genuinely 2026: the
 * pack, the app / sub-app ids, and the snapshot file + its refresh guard.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FestivalModule, FestivalSources } from "@festival-bot/core";
import { createPack, createWeatherSource, createClashfinderFavouritesSource } from "@festival-bot/adapters";
import { createOv26LineupSource } from "./lineup.js";

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** From the APK's flutter_assets/properties.json and its bundled package (public ids). */
export const OV_APP_ID = "e3474b11-9155-45e6-86d9-6a4cbd419de2";
/** The "2026 Other Voices" sub-app inside the Other Voices app. */
export const OV26_SUBAPP_ID = "93c338cc-ee57-482e-bb4f-f646bf4a0cf2";

/**
 * Public Clashfinder event "Other Voices Dingle 2026 (unofficial)". Run by an independent
 * user, NOT this deployment: READ-ONLY. Never `cf-push` to it (docs/setup/clashfinder.md).
 */
export const OV26_CF_EVENT = "ov2026";

export interface Ov26Config {
  secrets?: {
    clashfinder?: { authUsername: string; authPublicKey: string };
    /** properties.json `staticParamsEndpointAuthToken`. NEVER committed. */
    aloompa?: { buildParamsToken?: string };
  };
  cacheDir?: string;
}

export function createFestival(config: Ov26Config = {}): FestivalModule {
  const pack = createPack(PACK_DIR);
  const manifest = pack.loadManifest();
  const token = config.secrets?.aloompa?.buildParamsToken;

  const sources: FestivalSources = {
    lineup: createOv26LineupSource({
      file: join(PACK_DIR, "snapshot", "subapp.json"),
      // Without the token the module still plans from the committed snapshot.
      aloompa: token ? { appId: OV_APP_ID, subAppId: OV26_SUBAPP_ID, buildParamsToken: token } : undefined,
    }),
  };

  if (manifest.coordinates) {
    sources.weather = createWeatherSource(
      manifest.coordinates,
      manifest.timezone,
      config.cacheDir ? { cache: { dir: config.cacheDir } } : {},
    );
  }

  // Favourites from the public (someone else's) Clashfinder event, read-only.
  const cf = config.secrets?.clashfinder;
  if (cf) {
    sources.favourites = createClashfinderFavouritesSource(OV26_CF_EVENT, {
      authUsername: cf.authUsername,
      authPublicKey: cf.authPublicKey,
      cacheDir: config.cacheDir,
    });
  }

  return { manifest, venues: pack.loadVenues(), knowledge: pack.loadKnowledge(), sources };
}
