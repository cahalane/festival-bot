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
  cacheDir?: string;
}

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
