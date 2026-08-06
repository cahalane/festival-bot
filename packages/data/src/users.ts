/**
 * User identity store (cross-festival). users.json maps a handle to identity +
 * the favourite source (a Clashfinder username and/or a manual list) — the single
 * source of truth for who's who.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChannelRef } from "@festival-bot/core";
import { DEFAULT_DATA_DIR } from "./paths.js";
import { parseChannel } from "./channel.js";

/** Tier ordering for a Clashfinder-sourced profile. "inverted" = the HIGHEST set
 *  number is the top priority (a user who colour-codes set 3 = "must see"); default
 *  "normal" = set 1 is top priority. */
export type TierOrder = "normal" | "inverted";

export interface UserProfile {
  name?: string;
  /** Where this person is reachable. Absent = profile kept for favourites only. */
  channel?: ChannelRef;
  clashfinder?: string;
  favs?: string[];
  role?: string;
  tierOrder?: TierOrder;
  /**
   * Clashfinder set numbers holding SOMEONE ELSE's picks (a partner sharing the
   * account's colours). Ranked below every tier of the owner's own.
   */
  partnerTiers?: number[];
  /** Opaque Clashfinder refs -> real lineup names, stated not guessed. */
  refAliases?: Record<string, string>;
  [k: string]: unknown;
}

export interface FavouriteInputs {
  user?: string;
  manual?: string[];
  tierOrder?: TierOrder;
  partnerTiers?: number[];
  refAliases?: Record<string, string>;
}

export function loadUsers(baseDir = DEFAULT_DATA_DIR): Record<string, UserProfile> {
  try {
    const raw = JSON.parse(readFileSync(join(baseDir, "users.json"), "utf8")) as { users?: Record<string, UserProfile> };
    return raw.users ?? {};
  } catch {
    return {};
  }
}

export function getProfile(handle: string, baseDir = DEFAULT_DATA_DIR): UserProfile | undefined {
  return loadUsers(baseDir)[handle];
}

/** The channel ref for a handle, migrating the legacy bare `chat_id` on read. */
export function channelOf(handle: string, baseDir = DEFAULT_DATA_DIR): ChannelRef | undefined {
  const p = getProfile(handle, baseDir);
  if (!p) return undefined;
  return parseChannel(p.channel ?? (p as { chat_id?: unknown }).chat_id);
}

/**
 * Favourite-source inputs for a handle, for the engine's favourites resolution:
 * a Clashfinder `user` and/or a `manual` list. An unknown handle is treated as a
 * bare Clashfinder username.
 */
export function favouriteInputs(handle: string, baseDir = DEFAULT_DATA_DIR): FavouriteInputs {
  const p = getProfile(handle, baseDir);
  if (!p) return { user: handle };
  const out: FavouriteInputs = {};
  if (p.clashfinder) out.user = p.clashfinder;
  if (p.favs && p.favs.length) out.manual = p.favs;
  if (!out.user && !out.manual) out.user = handle;
  // Only meaningful for a Clashfinder-sourced (tiered) profile.
  if (p.tierOrder === "inverted" && out.user) out.tierOrder = "inverted";
  if (p.partnerTiers?.length && out.user) out.partnerTiers = p.partnerTiers;
  if (p.refAliases && out.user) out.refAliases = p.refAliases;
  return out;
}
