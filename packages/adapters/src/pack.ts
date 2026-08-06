/**
 * Shared loader for a festival's declarative pack (festival.json, venues.json,
 * knowledge/*.md). Each festival module was hand-rolling identical readJson +
 * recursive-knowledge boilerplate in its own pack.ts; this collapses it to one
 * `createPack(packDir)`.
 *
 * Lives in adapters (the I/O layer), NOT core — core is deliberately pure/I/O-free.
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { FestivalManifest, VenuesConfig, WalkGraph } from "@festival-bot/core";

interface RawVenues {
  venues: { slug: string; name: string }[];
  limitedCapacity: string[];
  walk: WalkGraph;
}

export interface FestivalPack {
  /** Absolute path to the festival package root (where festival.json lives). */
  packDir: string;
  /** Absolute path to schedule.json (whether or not the festival uses one). */
  scheduleFile: string;
  loadManifest(): FestivalManifest;
  loadVenues(): VenuesConfig;
  loadKnowledge(): Record<string, string>;
}

/**
 * Load every knowledge doc under `dir` — recursively, so year-specific docs in
 * `<year>/` subdirs are picked up alongside evergreen top-level files. Keyed by
 * file basename without extension. Missing/empty dir -> {}.
 */
function loadKnowledgeDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true }) as string[];
  } catch {
    return out; // no knowledge dir
  }
  for (const rel of entries) {
    if (!rel.endsWith(".md")) continue;
    try {
      out[basename(rel, ".md")] = readFileSync(join(dir, rel), "utf8");
    } catch {
      // a directory entry or unreadable file — skip
    }
  }
  return out;
}

export function createPack(packDir: string): FestivalPack {
  const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(packDir, rel), "utf8")) as T;
  return {
    packDir,
    scheduleFile: join(packDir, "schedule.json"),
    loadManifest: () => readJson<FestivalManifest>("festival.json"),
    loadVenues: () => {
      const raw = readJson<RawVenues>("venues.json");
      return { venues: raw.venues, limitedCapacity: raw.limitedCapacity, walk: raw.walk };
    },
    loadKnowledge: () => loadKnowledgeDir(join(packDir, "knowledge")),
  };
}
