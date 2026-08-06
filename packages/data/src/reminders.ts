/**
 * File-backed reminder queue. The persisted JSON is the source of truth (not a
 * cron) — a wake loop calls dueReminders(), sends each via the channel plugin,
 * then markFired(). On-disk shape stays snake_case as a stable, tool-agnostic file
 * format; this layer maps it to the core's camelCase Reminder model and reuses the
 * core selectors (due/pending/nextFire).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createReminder, due, nextFireIso, pending, type ChannelRef, type Reminder } from "@festival-bot/core";
import { DEFAULT_DATA_DIR } from "./paths.js";
import { parseChannel } from "./channel.js";

interface DiskReminder {
  id: string;
  handle: string;
  /** Structured ref. `chat_id` is the legacy form, still read. */
  channel?: { kind?: string; id?: string | number };
  chat_id?: string | number;
  fire_iso: string;
  text: string;
  fired: boolean;
}

const toModel = (d: DiskReminder): Reminder => {
  const channel = parseChannel(d.channel ?? d.chat_id);
  if (!channel) throw new Error(`reminder ${d.id} has no channel to deliver to`);
  return { id: d.id, handle: d.handle, channel, fireIso: d.fire_iso, text: d.text, fired: d.fired };
};

const toDisk = (r: Reminder): DiskReminder => ({
  id: r.id,
  handle: r.handle,
  channel: { kind: r.channel.kind, id: r.channel.id },
  fire_iso: r.fireIso,
  text: r.text,
  fired: r.fired,
});

const file = (baseDir: string) => join(baseDir, "reminders.json");

export function loadReminders(baseDir = DEFAULT_DATA_DIR): Reminder[] {
  try {
    return (JSON.parse(readFileSync(file(baseDir), "utf8")) as DiskReminder[]).map(toModel);
  } catch {
    return [];
  }
}

export function saveReminders(items: Reminder[], baseDir = DEFAULT_DATA_DIR): void {
  mkdirSync(dirname(file(baseDir)), { recursive: true });
  writeFileSync(file(baseDir), JSON.stringify(items.map(toDisk), null, 2));
}

export function addReminder(
  fields: { handle: string; channel: ChannelRef; fireIso: string; text: string },
  baseDir = DEFAULT_DATA_DIR,
  idGen?: () => string,
): Reminder {
  const r = createReminder(fields, idGen);
  const items = loadReminders(baseDir);
  items.push(r);
  saveReminders(items, baseDir);
  return r;
}

export function markFired(id: string, baseDir = DEFAULT_DATA_DIR): void {
  saveReminders(loadReminders(baseDir).map((r) => (r.id === id ? { ...r, fired: true } : r)), baseDir);
}

export function removeReminder(id: string, baseDir = DEFAULT_DATA_DIR): void {
  saveReminders(loadReminders(baseDir).filter((r) => r.id !== id), baseDir);
}

export function dueReminders(nowIso?: string, baseDir = DEFAULT_DATA_DIR): Reminder[] {
  return due(loadReminders(baseDir), nowIso);
}

export function pendingReminders(baseDir = DEFAULT_DATA_DIR): Reminder[] {
  return pending(loadReminders(baseDir));
}

export function nextReminderFire(baseDir = DEFAULT_DATA_DIR): string | null {
  return nextFireIso(loadReminders(baseDir));
}
