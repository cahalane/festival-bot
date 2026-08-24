/**
 * ep26's lineup comes from the official app's Greencopper OTA bundle, committed to
 * `bundle/` so the planner works offline and a bad fetch is visible in a diff.
 *
 * The five MAIN ARENAS are deliberately NOT here: the app publishes no main-arena
 * programming at all, so those times come from `extra-sets.json` (Irish Times,
 * 2026-08-24), which the CLI runtime merges at load. Keeping them there rather than
 * in the bundle is what stops `schedule-tick` reporting a phantom ADD for all 115 of
 * them on every run — the bundle must keep matching the live feed exactly.
 *
 * The two sources touch in exactly one place: the app ships the 79 Comedy acts with
 * `stageId: null`, so the adapter drops them as unplannable and the Irish Times
 * supplies the same acts WITH a stage.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtistSet, LineupSource } from "@festival-bot/core";
import {
  parseGreencopperLineup,
  fetchLatestGreencopperBundle,
  readAesZipEntries,
  readGreencopperBundle,
  refreshDecision,
  classifyRemoved,
  type GreencopperBundle,
  type GreencopperConfig,
} from "@festival-bot/adapters";

/** The committed snapshot, split across the four files the parser needs. */
export function loadBundleFrom(dir: string): GreencopperBundle {
  const j = <T,>(f: string): T => JSON.parse(readFileSync(join(dir, f), "utf8")) as T;
  return {
    strings: j<Record<string, string>>("strings.json"),
    stages: j<GreencopperBundle["stages"]>("stages.json"),
    scheduleItems: j<GreencopperBundle["scheduleItems"]>("scheduleItems.json"),
    timeSlots: j<GreencopperBundle["timeSlots"]>("timeSlots.json"),
  };
}

export function createEp26LineupSource(opts: {
  bundleDir: string;
  greencopper?: GreencopperConfig;
}): LineupSource {
  const source: LineupSource = {
    async loadSets(): Promise<ArtistSet[]> {
      return parseGreencopperLineup(loadBundleFrom(opts.bundleDir));
    },
  };

  // Live refresh needs the project secret, so it exists only when one is configured.
  const gc = opts.greencopper;
  if (gc?.secret) {
    source.refresh = async ({ force = false } = {}) => {
      const { bundle, version } = await fetchLatestGreencopperBundle(
        gc,
        (zip, pw) => readAesZipEntries(zip, pw),
        readGreencopperBundle,
      );
      const next = parseGreencopperLineup(bundle);
      const prev = parseGreencopperLineup(loadBundleFrom(opts.bundleDir));
      const decision = refreshDecision(next.length, prev.length, force, {
        removed: classifyRemoved(prev, next),
      });
      // On a guarded shrink keep the snapshot and park the fetch beside it.
      const dir = decision.write ? opts.bundleDir : `${opts.bundleDir}.fetched`;
      const w = (f: string, d: unknown) => writeFileSync(join(dir, f), JSON.stringify(d, null, 1) + "\n");
      w("strings.json", bundle.strings);
      w("stages.json", bundle.stages);
      w("scheduleItems.json", bundle.scheduleItems);
      w("timeSlots.json", bundle.timeSlots);
      return {
        variant: `v${version}`,
        fetched: next.length,
        previous: prev.length,
        written: decision.write,
        file: dir,
        note: decision.reason,
      };
    };
  }

  return source;
}
