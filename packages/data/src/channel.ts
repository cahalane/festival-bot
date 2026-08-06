/**
 * Which chat channel a person is reachable on.
 *
 * The bot has no channel SDK — the agent is the integration, and it talks to
 * whatever Claude Code channel plugin is installed. What the stored data has to
 * carry is therefore not a connection but an ADDRESS: which plugin, and which id
 * within it. A queued reminder that records only a bare id cannot be delivered by
 * anything except the plugin that happened to be running when it was queued.
 */

import type { ChannelRef } from "@festival-bot/core";

export type { ChannelRef };

/** The kind assumed for a bare legacy id. Every id on disk predates this field. */
const LEGACY_KIND = "telegram";

/**
 * Read a channel ref from stored JSON, accepting the legacy bare-id form.
 *
 * Returns undefined rather than a partial ref: a person with no reachable channel
 * is a real state (a profile kept for favourites only), and inventing an address
 * for them would send someone else's message into the void.
 */
export function parseChannel(raw: unknown): ChannelRef | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" || typeof raw === "number") {
    const id = String(raw).trim();
    return id ? { kind: LEGACY_KIND, id } : undefined;
  }
  if (typeof raw === "object") {
    const o = raw as { kind?: unknown; id?: unknown };
    const id = o.id === undefined || o.id === null ? "" : String(o.id).trim();
    if (!id) return undefined;
    const kind = typeof o.kind === "string" && o.kind.trim() ? o.kind.trim() : LEGACY_KIND;
    return { kind, id };
  }
  return undefined;
}
