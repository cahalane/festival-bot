/**
 * File-backed personal (non-lineup) events. Same pattern as reminders.ts: the
 * on-disk shape stays snake_case as a stable, tool-agnostic format; this layer
 * maps it to the core's camelCase PersonalEvent model.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPersonalEvent, type PersonalEvent } from "@festival-bot/core";
import { DEFAULT_DATA_DIR } from "./paths.js";

interface DiskPersonalEvent {
  id: string;
  handle: string;
  name: string;
  start_iso: string;
  end_iso: string;
  stage: string | null;
  mandatory: boolean;
  notes?: string;
}

const toModel = (d: DiskPersonalEvent): PersonalEvent => ({
  id: d.id,
  handle: d.handle,
  name: d.name,
  startIso: d.start_iso,
  endIso: d.end_iso,
  stage: d.stage,
  mandatory: d.mandatory,
  notes: d.notes,
});

const toDisk = (e: PersonalEvent): DiskPersonalEvent => ({
  id: e.id,
  handle: e.handle,
  name: e.name,
  start_iso: e.startIso,
  end_iso: e.endIso,
  stage: e.stage,
  mandatory: e.mandatory,
  notes: e.notes,
});

const file = (baseDir: string) => join(baseDir, "personal_events.json");

export function loadPersonalEvents(baseDir = DEFAULT_DATA_DIR): PersonalEvent[] {
  try {
    return (JSON.parse(readFileSync(file(baseDir), "utf8")) as DiskPersonalEvent[]).map(toModel);
  } catch {
    return [];
  }
}

export function savePersonalEvents(items: PersonalEvent[], baseDir = DEFAULT_DATA_DIR): void {
  mkdirSync(dirname(file(baseDir)), { recursive: true });
  writeFileSync(file(baseDir), JSON.stringify(items.map(toDisk), null, 2));
}

export function addPersonalEvent(
  fields: { handle: string; name: string; startIso: string; endIso: string; stage?: string | null; mandatory?: boolean; notes?: string },
  baseDir = DEFAULT_DATA_DIR,
  idGen?: () => string,
): PersonalEvent {
  const e = createPersonalEvent(fields, idGen);
  const items = loadPersonalEvents(baseDir);
  items.push(e);
  savePersonalEvents(items, baseDir);
  return e;
}

export function removePersonalEvent(id: string, baseDir = DEFAULT_DATA_DIR): void {
  savePersonalEvents(loadPersonalEvents(baseDir).filter((e) => e.id !== id), baseDir);
}
