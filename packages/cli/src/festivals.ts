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
import { cacheDir, loadSecrets, activeFestivalSlug } from "./config.js";

const builders: Record<string, () => FestivalModule> = {
  demofest: () => demofest({ cacheDir: cacheDir("demofest") }),
  atn26: () => atn26({ secrets: loadSecrets(), cacheDir: cacheDir("atn26") }),
};

export const ACTIVE_FESTIVAL = activeFestivalSlug();

export function loadActiveFestival(slug: string = ACTIVE_FESTIVAL): FestivalModule {
  const build = builders[slug];
  if (!build) throw new Error(`unknown festival '${slug}'; known: ${Object.keys(builders).join(", ")}`);
  return build();
}
