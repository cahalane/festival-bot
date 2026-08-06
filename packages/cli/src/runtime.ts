/**
 * Runtime wiring: bind a FestivalModule to the engine. Festival-agnostic — given
 * any module it builds the planner, loads the set list, and resolves a user's
 * favourites. The CLI (and, later, the bot) sit on top of this.
 */
import {
  buildWalkMatrix,
  calendarOf,
  createPlanner,
  resolveFavourites,
  type ArtistSet,
  type FestivalCalendar,
  type FestivalModule,
  type Planner,
} from "@festival-bot/core";
import { join } from "node:path";
import { REPO_ROOT } from "./config.js";
import { loadExtraSetsDoc, mergeExtraSets, applyRetimes } from "./extra-sets.js";

export interface Runtime {
  module: FestivalModule;
  planner: Planner;
  calendar: FestivalCalendar;
  sets: ArtistSet[];
  venueName(slug: string): string;
  limited(slug: string): boolean;
}

export async function loadRuntime(module: FestivalModule): Promise<Runtime> {
  const m = module.manifest;
  const walk = buildWalkMatrix(module.venues.walk);
  const planner = createPlanner({
    walk,
    catchFraction: m.catchFraction,
    worthwhileCatch: m.worthwhileCatch,
    nightGapHours: m.nightGapHours,
  });
  // Real sets the vendor feed no longer carries (ATN withdraw "after dark" sets
  // from the public timetable). Merged HERE so the planner routes the festival as
  // it actually is — the mirror having a set the planner ignores is a split brain,
  // and the crew would be shown a set that myday then silently refuses to plan.
  // schedule.json itself stays untouched, so schedule-tick sees no phantom ADD.
  //
  // `retime` is applied BEFORE the merge: the feed sometimes publishes a
  // takeover as one long block when the host's own running order splits it into
  // several (the Last City Cypher, 2026-08-01). Retiming keeps the act and its
  // stars; the individual sets arrive as ordinary additions.
  const extras = loadExtraSetsDoc(join(REPO_ROOT, "festivals", module.manifest.slug, "extra-sets.json"));
  const sets = mergeExtraSets(applyRetimes(await module.sources.lineup.loadSets(), extras.retime), extras.sets);
  const nameBySlug = new Map(module.venues.venues.map((v) => [v.slug, v.name]));
  const limited = new Set(module.venues.limitedCapacity);
  return {
    module,
    planner,
    calendar: calendarOf(m),
    sets,
    venueName: (s) => nameBySlug.get(s) ?? s,
    limited: (s) => limited.has(s),
  };
}

export interface FavResult {
  favs: Map<string, number>;
  unmatched: string[];
  /** True if favourites came from a stale cache (Clashfinder outage). */
  stale: boolean;
}

export async function resolveUserFavourites(
  rt: Runtime,
  opts: {
    user?: string;
    manual?: string[];
    tierOrder?: "normal" | "inverted";
    partnerTiers?: number[];
    /**
     * Opaque Clashfinder refs ("?fortho-1-2") -> the real lineup name. Explicit
     * per user, never stem-guessed: "?mooncu-1" could be Moonchild Sanelly or
     * Mooncup, and guessing puts someone at the wrong stage.
     */
    refAliases?: Record<string, string>;
  },
): Promise<FavResult> {
  const lineupNames = rt.sets.map((s) => s.name);
  const src = rt.module.sources.favourites;
  let tiers = undefined;
  let stale = false;
  if (opts.user && src) {
    tiers = await src.tiersFor(opts.user);
    stale = src.lastFetchStale?.() ?? false;
    // Some Clashfinders carry someone ELSE's picks in a dedicated colour —
    // one user keeps their partner's wants in pink (2026-07-31). Those tiers are
    // pulled out BEFORE any inversion and appended last, so they stay visible
    // without ever outranking the owner's own picks. Blind inversion had been
    // putting the partner's 6 acts above the owner's 17 must-sees.
    // Alias unresolved refs BEFORE anything else, so an aliased pick keeps the
    // tier it was starred in rather than arriving as an extra.
    const aliases = opts.refAliases;
    if (tiers && aliases && Object.keys(aliases).length) {
      tiers = tiers.map((t) => ({ ...t, names: t.names.map((n) => aliases[n] ?? n) }));
    }
    if (tiers) {
      const partner = new Set(opts.partnerTiers ?? []);
      const own = tiers.filter((_, i) => !partner.has(i + 1));
      const theirs = tiers.filter((_, i) => partner.has(i + 1));
      // The inversion describes how the OWNER colours their own picks, so it
      // applies to their tiers only.
      const ordered = opts.tierOrder === "inverted" ? [...own].reverse() : own;
      tiers = [...ordered, ...theirs];
    }
  }
  const { favs, unmatched } = resolveFavourites(lineupNames, { tiers, manual: opts.manual });
  return { favs, unmatched, stale };
}

/** Sets whose name or slug contains the query (case-insensitive). */
export function findSets(sets: ArtistSet[], query: string): ArtistSet[] {
  const q = query.toLowerCase();
  return sets.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q));
}
