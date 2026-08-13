/**
 * Active-festival registry. Adding a festival = import its module factory and
 * register its slug here (+ add the workspace dependency). Which one is active is
 * NOT decided here: it's read from the `@festivals/<slug>/CONTEXT.md` import in
 * CLAUDE.md (see config.activeFestivalSlug) so docs and CLI never drift; the
 * ACTIVE_FESTIVAL env var overrides for tests / one-off runs.
 */
import type { FestivalModule } from "@festival-bot/core";
import { createFestival as demofest } from "@festival/demofest";
import { createFestival as atn26 } from "@festival/atn26";
import { createFestival as ps26 } from "@festival/ps26";
import { createFestival as ps27 } from "@festival/ps27";
import { cacheDir, loadSecrets, activeFestivalSlug } from "./config.js";

const builders: Record<string, () => FestivalModule> = {
  demofest: () => demofest({ cacheDir: cacheDir("demofest") }),
  atn26: () => atn26({ secrets: loadSecrets(), cacheDir: cacheDir("atn26") }),
  ps26: () => ps26({ secrets: loadSecrets(), cacheDir: cacheDir("ps26") }),
  // Registered but DORMANT: no 2027 lineup exists yet. Reachable via
  // ACTIVE_FESTIVAL=ps27 for setup work; do not point CLAUDE.md at it until
  // there is real data (see festivals/ps27/CONTEXT.md).
  ps27: () => ps27({ secrets: loadSecrets(), cacheDir: cacheDir("ps27") }),
};

export const ACTIVE_FESTIVAL = activeFestivalSlug();

export function loadActiveFestival(slug: string = ACTIVE_FESTIVAL): FestivalModule {
  const build = builders[slug];
  if (!build) throw new Error(`unknown festival '${slug}'; known: ${Object.keys(builders).join(", ")}`);
  return build();
}
