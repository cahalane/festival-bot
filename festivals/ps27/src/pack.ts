/**
 * ps27 declarative pack (festival.json, venues.json, knowledge/*.md), loaded via
 * the shared `createPack` factory. The full FestivalModule (with live data sources)
 * is assembled in ./index.ts.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPack } from "@festival-bot/adapters";

export const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const pack = createPack(PACK_DIR);
export const loadManifest = pack.loadManifest;
export const loadVenues = pack.loadVenues;
export const loadKnowledge = pack.loadKnowledge;
