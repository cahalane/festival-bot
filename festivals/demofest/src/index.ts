/**
 * @festival/demofest — an invented festival with no external dependencies.
 *
 * Two jobs: it is what a fresh clone runs before anyone has configured anything,
 * and it is the fixture the planner tests route over. Both jobs require it to
 * need NO secrets, NO network and NO cache — so it deliberately declares no
 * coordinates (hence no weather) and no favourites source.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FestivalModule, FestivalSources } from "@festival-bot/core";
import { createPack } from "@festival-bot/adapters";
import { createLineupSource } from "./lineup.js";

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface DemofestConfig {
  /**
   * Cache directory — accepted so every festival module takes the same config shape
   * and the CLI registry can hand each one a cache directory without special-casing.
   * Demofest ignores this because its lineup is a committed file with nothing to cache.
   * A real festival module passes this to its sources.
   */
  cacheDir?: string;
}

/**
 * Create the demofest module. A real festival would use `config.cacheDir` to pass
 * cache paths to its sources; demofest ignores it since its data is committed.
 */
export function createFestival(_config: DemofestConfig = {}): FestivalModule {
  const pack = createPack(PACK_DIR);
  const sources: FestivalSources = { lineup: createLineupSource() };
  return {
    manifest: pack.loadManifest(),
    venues: pack.loadVenues(),
    knowledge: pack.loadKnowledge(),
    sources,
  };
}
