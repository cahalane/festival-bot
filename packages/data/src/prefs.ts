/**
 * Per-user preference store (tone, display name, free-form notes). Flat map
 * handle -> prefs. NB a person's prefs key need not equal their handle (e.g.
 * it may be their cf-username instead) — a known quirk the caller maps.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChannelRef } from "@festival-bot/core";
import { DEFAULT_DATA_DIR } from "./paths.js";

export interface Prefs {
  name?: string;
  tone?: string;
  notes?: string[];
  channel?: ChannelRef;
  [k: string]: unknown;
}

export function loadPrefs(baseDir = DEFAULT_DATA_DIR): Record<string, Prefs> {
  try {
    return JSON.parse(readFileSync(join(baseDir, "prefs.json"), "utf8")) as Record<string, Prefs>;
  } catch {
    return {};
  }
}

export function getPrefs(handle: string, baseDir = DEFAULT_DATA_DIR): Prefs {
  return loadPrefs(baseDir)[handle] ?? {};
}

export function tone(handle: string, baseDir = DEFAULT_DATA_DIR): string | undefined {
  return getPrefs(handle, baseDir).tone;
}
