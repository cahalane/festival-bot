/**
 * REFERENCE skeleton for a festival module's entrypoint. Copy alongside the rest
 * of _template and adapt. (Excluded from the build until copied to a real slug.)
 *
 * Assemble a FestivalModule from the declarative pack + the sources this festival
 * implements. Reuse shared factories/adapters; write festival-specific ones in this src/.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FestivalModule, FestivalSources, LineupSource } from "@festival-bot/core";
import { createPack } from "@festival-bot/adapters";
// import { createWeatherSource, createClashfinderFavouritesSource } from "@festival-bot/adapters";

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface FestivalConfig {
  secrets?: { clashfinder?: { authUsername: string; authPublicKey: string } };
  /** Directory for source caches. Omit to disable disk caching. */
  cacheDir?: string;
}

export function createFestival(config: FestivalConfig = {}): FestivalModule {
  const pack = createPack(PACK_DIR);
  const manifest = pack.loadManifest();
  const venues = pack.loadVenues();
  const knowledge = pack.loadKnowledge();

  // 1. Implement your lineup source (festival-specific — its own API/CSV/etc.).
  const lineup: LineupSource = {
    async loadSets() {
      throw new Error("implement loadSets() for this festival");
    },
  };

  const sources: FestivalSources = { lineup };

  // 2. Wire optional shared sources when this festival has them, e.g.:
  // if (manifest.coordinates)
  //   sources.weather = createWeatherSource(manifest.coordinates, manifest.timezone,
  //     config.cacheDir ? { cache: { dir: config.cacheDir } } : {});
  // const cf = config.secrets?.clashfinder;
  // if (cf)
  //   sources.favourites = createClashfinderFavouritesSource("<cf-event>", { ...cf, cacheDir: config.cacheDir });

  return { manifest, venues, knowledge, sources };
}
