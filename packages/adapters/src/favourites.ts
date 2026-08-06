/**
 * Shared Clashfinder-backed FavouritesSource. Each festival that pulls picks from
 * Clashfinder (PS26's official event, ATN26's own pushed mirror) was reimplementing
 * the same wrapper; this collapses it to `createClashfinderFavouritesSource(event, cfg)`.
 *
 * Tracks whether the last result came from a stale cache — a Clashfinder outage
 * silently blinded the planner once (PS26, 2026-05-27), so callers should surface
 * staleness rather than plan blind.
 */
import type { FavouritesSource } from "@festival-bot/core";
import { createClashfinderClient } from "./clashfinder.js";

export interface ClashfinderFavouritesConfig {
  authUsername: string;
  authPublicKey: string;
  cacheDir?: string;
}

export function createClashfinderFavouritesSource(
  event: string,
  cfg: ClashfinderFavouritesConfig,
): FavouritesSource {
  const client = createClashfinderClient(
    { event, authUsername: cfg.authUsername, authPublicKey: cfg.authPublicKey },
    { cacheDir: cfg.cacheDir },
  );
  let stale = false;
  return {
    async tiersFor(user: string) {
      const r = await client.tiersFor(user);
      stale = r.stale;
      return r.tiers;
    },
    lastFetchStale() {
      return stale;
    },
  };
}
