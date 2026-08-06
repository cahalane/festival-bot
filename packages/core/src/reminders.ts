/**
 * Reminder queue logic — pure and timezone-aware.
 *
 * The persisted queue (not a cron) is the source of truth: a wake loop calls
 * due() and sends each item, then marks it fired. fireIso is ISO-8601 WITH
 * offset; all comparisons are by absolute instant (Date), so the machine's own
 * timezone is irrelevant. Persistence (reading/writing the JSON store) is a
 * runtime concern layered on top of these pure selectors.
 */

import type { ChannelRef } from "./channel-ref.js";

export interface Reminder {
  id: string;
  handle: string;
  /** Which channel + address to deliver to. */
  channel: ChannelRef;
  /** ISO-8601 with offset, e.g. "2026-06-06T21:50:00+02:00". */
  fireIso: string;
  text: string;
  fired: boolean;
}

const instant = (iso: string): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`invalid fire timestamp: ${JSON.stringify(iso)}`);
  return t;
};

/** Unfired reminders whose fire time is at/before `nowIso` (default real now), oldest first. */
export function due(items: Reminder[], nowIso?: string): Reminder[] {
  const now = nowIso ? instant(nowIso) : Date.now();
  return items
    .filter((r) => !r.fired && instant(r.fireIso) <= now)
    .sort((a, b) => instant(a.fireIso) - instant(b.fireIso));
}

/** Unfired reminders, soonest first. */
export function pending(items: Reminder[]): Reminder[] {
  return items.filter((r) => !r.fired).sort((a, b) => instant(a.fireIso) - instant(b.fireIso));
}

/** fireIso of the soonest pending reminder (to pace a wake loop), or null. */
export function nextFireIso(items: Reminder[]): string | null {
  const p = pending(items);
  return p.length ? p[0]!.fireIso : null;
}

export function createReminder(
  fields: { handle: string; channel: ChannelRef; fireIso: string; text: string },
  idGen: () => string = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8),
): Reminder {
  instant(fields.fireIso); // validate / fail fast
  return {
    id: idGen(),
    handle: fields.handle,
    channel: { kind: fields.channel.kind, id: String(fields.channel.id) },
    fireIso: fields.fireIso,
    text: fields.text,
    fired: false,
  };
}
