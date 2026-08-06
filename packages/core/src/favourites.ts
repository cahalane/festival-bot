/**
 * Favourite resolution — pure logic, festival-agnostic.
 *
 * Sources (Clashfinder tiers, manual lists) are fetched by adapters; this module
 * just maps names to a priority. priority 1 = highest (first tier). Lower number
 * = more important; the planner uses it to break ties.
 *
 * Matching rules carry hard-won bug fixes:
 *  - Clashfinder picks are 1:1 with the feed EXCEPT the feed appends suffixes
 *    ("Mechatok" -> "Mechatok Live"). So: exact-normalized match, else a lineup
 *    name whose normalized form STARTS WITH the pick (suffix variant), guarded to
 *    pick length >= 5. NOT substring-anywhere — that made a tiny name ("res")
 *    phantom-match inside a longer pick ("pinkpantheress").
 *  - Manual (user-typed) names are looser: exact, else substring either direction
 *    with the shorter string >= 5 chars.
 */

export interface FavouriteTier {
  label: string;
  names: string[];
}

export interface ResolvedFavourites {
  /** artistName (as it appears in the lineup) -> priority (1 = highest). */
  favs: Map<string, number>;
  /** picks that matched no lineup entry, reported rather than dropped. */
  unmatched: string[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Match a Clashfinder pick: exact-norm, else a lineup norm starting with it (len>=5). */
function matchExactOrSuffix(pick: string, lineupNorm: Map<string, string>): string | undefined {
  const n = normalize(pick);
  const exact = lineupNorm.get(n);
  if (exact) return exact;
  if (n.length >= 5) {
    for (const [k, real] of lineupNorm) {
      if (k.startsWith(n)) return real;
    }
  }
  return undefined;
}

/** Match a manual pick: exact-norm, else substring either way with shorter >= 5. */
function matchFuzzy(pick: string, lineupNorm: Map<string, string>): string | undefined {
  const n = normalize(pick);
  const exact = lineupNorm.get(n);
  if (exact) return exact;
  for (const [k, real] of lineupNorm) {
    if (n && (k.includes(n) || n.includes(k)) && Math.min(n.length, k.length) >= 5) {
      return real;
    }
  }
  return undefined;
}

export function resolveFavourites(
  lineupNames: Iterable<string>,
  opts: { tiers?: FavouriteTier[]; manual?: string[] },
): ResolvedFavourites {
  const lineupNorm = new Map<string, string>();
  for (const name of lineupNames) lineupNorm.set(normalize(name), name);

  const favs = new Map<string, number>();
  const unmatched: string[] = [];

  const add = (name: string, prio: number, real: string | undefined) => {
    if (real === undefined) {
      unmatched.push(name);
    } else {
      const existing = favs.get(real);
      favs.set(real, existing === undefined ? prio : Math.min(existing, prio));
    }
  };

  const tiers = opts.tiers ?? [];
  tiers.forEach((tier, i) => {
    const prio = i + 1;
    for (const name of tier.names) add(name, prio, matchExactOrSuffix(name, lineupNorm));
  });

  if (opts.manual && opts.manual.length) {
    const base = tiers.length + 1;
    for (const name of opts.manual) add(name, base, matchFuzzy(name, lineupNorm));
  }

  return { favs, unmatched };
}
