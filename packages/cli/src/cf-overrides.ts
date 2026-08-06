/**
 * Mirror-only display overrides — how a human's Clashfinder edits survive our
 * automation.
 *
 * Operator note, 2026-08-01: somebody had hand-entered the six Seanchoíche sessions on
 * the mirror, because the Appmiral feed lists them as bare words ("Love",
 * "Memory") with nothing saying what they are. The next `cf-push` overwrote the
 * whole event and destroyed that work. The push replaces the event wholesale,
 * so ANY hand-added detail is lost on the next sync — a shared artefact other
 * people contribute to, silently reverted by a bot.
 *
 * This is the fix, and the reason it lives at the push layer rather than in the
 * lineup: the planner's names MUST keep matching the Appmiral feed exactly, or
 * favourites resolution stops matching people's stars. So the override applies
 * to the copy that goes to Clashfinder and nowhere else.
 *
 * The same file is the answer to the wider problem the operator named — stages and sets
 * the app covers late or not at all (the Mary Wallopers pop-up, a "Believe"
 * set that never appeared). Where the act itself is missing it goes in
 * `extra-sets.json`; where the act exists but its LABEL is useless, it goes
 * here.
 */
import { existsSync, readFileSync } from "node:fs";
import type { ArtistSet } from "@festival-bot/core";

export interface CfOverrides {
  /**
   * Lineup name -> the name to show on the mirror. Use for acts whose feed
   * label is meaningless out of context ("Love" -> "Seanchoíche: Love").
   */
  displayNames?: Record<string, string>;
}

export function loadCfOverrides(file: string): CfOverrides {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CfOverrides;
  } catch {
    // A malformed overrides file must not take the push down: the schedule
    // itself is the important payload, the labels are cosmetic.
    return {};
  }
}

/**
 * Copy of `sets` with mirror display names applied. Never mutates the input —
 * the planner keeps the feed's names so stars keep resolving.
 */
export function applyDisplayNames(sets: ArtistSet[], overrides: CfOverrides): ArtistSet[] {
  const map = overrides.displayNames;
  if (!map || !Object.keys(map).length) return sets;
  return sets.map((s) => (map[s.name] ? { ...s, name: map[s.name]! } : s));
}
