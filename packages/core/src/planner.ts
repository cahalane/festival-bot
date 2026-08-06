/**
 * Travel-aware schedule planning — festival-agnostic.
 *
 * Constructed with a walk matrix and the festival's tunables (catch-fraction,
 * night-gap). Operates on absolute instants, so it is timezone-neutral. Ported
 * from the PS26 psplan engine: whatson / reachable / after / canFollow / myday.
 */
import type { WalkMatrix } from "./walk.js";
import type { ArtistSet } from "./models.js";

export type { ArtistSet } from "./models.js";

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 3_600_000;

export interface PlannerConfig {
  walk: WalkMatrix;
  /** "Catch most" = still see more than this fraction of a set (e.g. 0.5). */
  catchFraction: number;
  /** Optional myday gate: a set caught below this fraction is only added on a
   *  genuine time-clash with the set you're already watching (not a lazy gap
   *  late-join). Omit to disable. */
  worthwhileCatch?: number;
  /** A reachable-list gap this long (hours) ends "the night". */
  nightGapHours: number;
}

export interface ReachableSet extends ArtistSet {
  /** Walk minutes from the origin stage. */
  walkMin: number;
  /** Instant you would arrive. */
  arrive: Date;
  /** Minutes of the set missed by arriving late (rounded). */
  missedMin: number;
}

export interface MydayPick extends ArtistSet {
  priority: number;
  /** For chosen route picks only: the actual watched window, which differs from
   *  the full set when you arrive late and/or leave early to make a higher pick.
   *  `partial` is set when enter/leave trim the set by more than a minute. */
  enter?: Date;
  leave?: Date;
  caughtMin?: number;
  partial?: boolean;
  /** Purely informational — never competes for a slot, never displaces anything,
   *  always shown. Set only on entries passed in via myday's `annotations` param. */
  annotation?: boolean;
}

export interface MydayAlt {
  set: MydayPick;
  /**
   * `clash` — a real either/or with the pick it hangs off.
   * `tight`  — no time overlap, but the walk makes it unreachable.
   * `dip`    — it fits INSIDE a long pick, and you could leave, see it and get
   *            back while still catching most of the long one. Operator note,
   *            2026-07-27: "I would be up for dropping in and out of a long
   *            set rather than skipping it entirely."
   */
  why: "clash" | "tight" | "dip";
}

export interface MydayResult {
  /** Chosen itinerary, in time order. */
  route: MydayPick[];
  /** Displaced favourites, parallel to `route` (alts[i] hangs off route[i]). */
  alts: MydayAlt[][];
  /** Favourites that could not be slotted anywhere. */
  dropped: MydayPick[];
  meta: { nFavsToday: number; nSeen: number };
}

export interface Planner {
  whatson(sets: ArtistSet[], when: Date, windowMin?: number): { now: ArtistSet[]; next: ArtistSet[] };
  reachable(
    sets: ArtistSet[],
    fromStage: string | null,
    fromTime: Date,
    opts?: { exclude?: ArtistSet; trimNight?: boolean },
  ): ReachableSet[];
  after(sets: ArtistSet[], base: ArtistSet): ReachableSet[];
  canFollow(a: ArtistSet, b: ArtistSet): boolean;
  myday(
    sets: ArtistSet[],
    favs: Map<string, number>,
    window: [Date, Date],
    forced?: ArtistSet[],
    annotations?: ArtistSet[],
  ): MydayResult;
}

export function createPlanner(cfg: PlannerConfig): Planner {
  const { walk, catchFraction, nightGapHours, worthwhileCatch } = cfg;
  const maxMissable = (s: ArtistSet) => (1 - catchFraction) * s.durationMin;

  function canFollow(a: ArtistSet, b: ArtistSet): boolean {
    const arrive = a.end.getTime() + walk.walk(a.stage, b.stage) * MS_PER_MIN;
    if (arrive >= b.end.getTime()) return false;
    const missed = Math.max(0, (arrive - b.start.getTime()) / MS_PER_MIN);
    return missed <= maxMissable(b);
  }

  function whatson(sets: ArtistSet[], when: Date, windowMin = 120) {
    const t = when.getTime();
    const now = sets
      .filter((s) => s.start.getTime() <= t && t < s.end.getTime())
      .sort((a, b) => a.stage.localeCompare(b.stage) || a.start.getTime() - b.start.getTime());
    const horizon = t + windowMin * MS_PER_MIN;
    const next = sets
      .filter((s) => t < s.start.getTime() && s.start.getTime() <= horizon)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return { now, next };
  }

  function reachable(
    sets: ArtistSet[],
    fromStage: string | null,
    fromTime: Date,
    opts: { exclude?: ArtistSet; trimNight?: boolean } = {},
  ): ReachableSet[] {
    const { exclude, trimNight = true } = opts;
    const out: ReachableSet[] = [];
    for (const s of sets) {
      if (exclude && s === exclude) continue;
      const w = fromStage ? walk.walk(fromStage, s.stage) : 0;
      const arrive = fromTime.getTime() + w * MS_PER_MIN;
      if (arrive >= s.end.getTime()) continue;
      const missed = Math.max(0, (arrive - s.start.getTime()) / MS_PER_MIN);
      if (missed > maxMissable(s)) continue;
      out.push({ ...s, walkMin: w, arrive: new Date(arrive), missedMin: Math.round(missed) });
    }
    out.sort((a, b) => a.start.getTime() - b.start.getTime());
    if (!trimNight) return out;
    const trimmed: ReachableSet[] = [];
    let prev = fromTime.getTime();
    for (const r of out) {
      if ((r.start.getTime() - prev) / MS_PER_HOUR > nightGapHours) break;
      trimmed.push(r);
      prev = r.start.getTime();
    }
    return trimmed;
  }

  function after(sets: ArtistSet[], base: ArtistSet): ReachableSet[] {
    return reachable(sets, base.stage, base.end, { exclude: base });
  }

  function myday(
    sets: ArtistSet[],
    favs: Map<string, number>,
    window: [Date, Date],
    forced: ArtistSet[] = [],
    annotations: ArtistSet[] = [],
  ): MydayResult {
    const [lo, hi] = window;
    const FORCED_WEIGHT = Number.MAX_SAFE_INTEGER / 1e3; // dominates any sum of tier weights
    const today: MydayPick[] = [
      ...sets
        .filter((s) => favs.has(s.name) && s.start >= lo && s.start < hi)
        .map((s) => ({ ...s, priority: favs.get(s.name)! })),
      ...forced
        .filter((s) => s.start >= lo && s.start < hi)
        .map((s) => ({ ...s, priority: 0, forced: true }) as MydayPick & { forced: true }),
    ].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());

    const n = today.length;
    const maxSet = favs.size ? Math.max(...favs.values()) : 1;
    // Count dominates (x1000) for real favs; a forced stop dominates everything.
    // Tier is LEXICOGRAPHIC over count, not a tiebreak on it. The old weight was
    // 1000 per set seen plus (maxSet - priority) — about three points of tier
    // against a thousand of count — so any two lesser picks outranked one better
    // one, and a three-hour set-1 booking was dropped wholesale because three
    // set-3 acts fitted in the window it occupied. Operator note, 2026-07-27:
    // "Why is a Set 3 tipping a Set 1 there?"
    //
    // Base 100 per tier step, so no realistic number of lower picks can outweigh
    // a single higher one (a festival day tops out well under 100 sets per tier),
    // while picks of the SAME tier still compete on count as before.
    const TIER_BASE = 100;
    const wt = (s: MydayPick) =>
      (s as { forced?: boolean }).forced ? FORCED_WEIGHT : TIER_BASE ** (maxSet - s.priority);
    const missableMs = (s: MydayPick) => (1 - catchFraction) * s.durationMin * MS_PER_MIN;

    // Latest instant you can leave `from` (having arrived at `fromArr`) and still
    // catch `to` within its miss budget — null if `to` is unreachable in time.
    // Never earlier than `from`'s own catch is met (you must watch catchFraction
    // of it), never later than `from` actually ends. This is what lets the route
    // LEAVE A SET EARLY to make a higher pick in full: `from` need not run to its
    // end before you walk on.
    const departFor = (from: MydayPick, fromArr: number, to: MydayPick): number | null => {
      const watchStart = Math.max(fromArr, from.start.getTime());
      const earliestLeave = watchStart + catchFraction * from.durationMin * MS_PER_MIN;
      if (earliestLeave > from.end.getTime()) return null; // can't satisfy from's catch
      const w = walk.walk(from.stage, to.stage) * MS_PER_MIN;
      let depart = Math.min(Math.max(to.start.getTime() - w, earliestLeave), from.end.getTime());
      // Only cut a set SHORT (leave before it ends) to make a STRICTLY higher
      // pick — otherwise the count-first optimiser would ditch part of every set
      // to grab the next same- or lower-tier one. For an equal/lower successor you
      // see `from` out, then join `to` late only if the worthwhile gate allows.
      if (depart < from.end.getTime() && to.priority >= from.priority) depart = from.end.getTime();
      const arrive = depart + w;
      if (arrive >= to.end.getTime()) return null;
      if (Math.max(0, arrive - to.start.getTime()) > missableMs(to)) return null;
      // A STRICTLY higher pick is never joined late to accommodate a lesser one.
      // The weight is 1000 per set against a tier bonus of a few points, so count
      // beats tier absolutely: without this the optimiser opens on the set-2 act,
      // leaves it early, and walks into the set-1 act well after it started —
      // half of each instead of the one that matters in full. Operator note,
      // 2026-07-27: "The set-1 act on Friday should take precedence on the
      // card, and the set-2 act should be shown as the fallback." Arriving before
      // `to` starts is untouched, so a lesser warm-up into a later top pick still
      // chains normally.
      if (to.priority < from.priority && arrive > to.start.getTime()) return null;
      // Worthwhile gate: a thin catch of `to` (below worthwhileCatch) is only
      // justified when it reaches for a STRICTLY higher pick than the set you're
      // leaving — a genuine clash you resolve in favour of the better act. A thin
      // catch of an equal- or lower-rated set is just gap/tier clutter and must
      // instead clear the worthwhile bar; otherwise it's skipped so the plan stays
      // fewer-but-fuller. (In a dense lineup nearly everything overlaps in time, so
      // priority — not mere time overlap — is the real test of a genuine clash.)
      if (worthwhileCatch != null && to.priority >= from.priority) {
        const caught = to.end.getTime() - Math.max(arrive, to.start.getTime());
        if (caught < worthwhileCatch * to.durationMin * MS_PER_MIN) return null;
      }
      return depart;
    };

    // Arrival-aware weighted-interval DP. dp[j] = best weight of a chain ending
    // at j; arr[j] = the arrival instant at j for that chain (earliest on value
    // ties — an earlier arrival only ever widens later options, so it weakly
    // dominates). Because departFor allows an early exit, two overlapping sets
    // can both be kept, which plain finish-then-walk chaining cannot express.
    const dp = new Array<number>(n).fill(0);
    const arr = new Array<number>(n).fill(0);
    const par = new Array<number>(n).fill(-1);
    for (let j = 0; j < n; j++) {
      const sj = today[j]!;
      dp[j] = wt(sj); // base: begin a fresh leg here, on time
      arr[j] = sj.start.getTime();
      par[j] = -1;
      for (let i = 0; i < j; i++) {
        const depart = departFor(today[i]!, arr[i]!, sj);
        if (depart === null) continue;
        const arriveJ = depart + walk.walk(today[i]!.stage, sj.stage) * MS_PER_MIN;
        const cand = dp[i]! + wt(sj);
        if (cand > dp[j]! || (cand === dp[j]! && arriveJ < arr[j]!)) {
          dp[j] = cand;
          arr[j] = arriveJ;
          par[j] = i;
        }
      }
    }

    const route: MydayPick[] = [];
    const routeIdx: number[] = [];
    if (n) {
      let j = 0;
      for (let k = 1; k < n; k++) if (dp[k]! > dp[j]!) j = k; // first max on ties
      while (j !== -1) {
        route.push(today[j]!);
        routeIdx.push(j);
        j = par[j]!;
      }
      route.reverse();
      routeIdx.reverse();
    }

    // Annotate each chosen pick with its actual watched window. enter/leave trim
    // the set only for a late join or an early exit to make the next pick.
    for (let m = 0; m < route.length; m++) {
      const c = route[m]!;
      const arriveMs = arr[routeIdx[m]!]!;
      const enterMs = Math.max(arriveMs, c.start.getTime());
      const leaveMs =
        m + 1 < route.length ? (departFor(c, arriveMs, route[m + 1]!) ?? c.end.getTime()) : c.end.getTime();
      c.enter = new Date(enterMs);
      c.leave = new Date(leaveMs);
      c.caughtMin = Math.round((leaveMs - enterMs) / MS_PER_MIN);
      c.partial = enterMs > c.start.getTime() + MS_PER_MIN || leaveMs < c.end.getTime() - MS_PER_MIN;
    }

    // Could you leave `host` for `guest` and be back before it ends, still having
    // watched catchFraction of `host` overall? Only then is the overlap a dip
    // rather than a genuine either/or. Both legs of the walk are paid for, and
    // `guest` must sit strictly inside `host` — you cannot dip out of something
    // you have not started.
    const canDipOut = (host: MydayPick, guest: MydayPick): boolean => {
      const w = walk.walk(host.stage, guest.stage) * MS_PER_MIN;
      const out = guest.start.getTime() - w;
      const back = guest.end.getTime() + w;
      if (out <= host.start.getTime() || back >= host.end.getTime()) return false;
      const watched = out - host.start.getTime() + (host.end.getTime() - back);
      return watched >= catchFraction * host.durationMin * MS_PER_MIN;
    };

    const chosen = new Set(routeIdx);
    const alts: MydayAlt[][] = route.map(() => []);
    const dropped: MydayPick[] = [];
    const posOf = (set: MydayPick) => route.indexOf(set);

    for (let i = 0; i < n; i++) {
      if (chosen.has(i)) continue;
      const s = today[i]!;
      // Chosen act with the most time overlap, if any.
      let bestOverlap = 0;
      let clashWith: MydayPick | undefined;
      for (const c of route) {
        if (s.start < c.end && c.start < s.end) {
          const ov = Math.min(s.end.getTime(), c.end.getTime()) - Math.max(s.start.getTime(), c.start.getTime());
          if (ov > bestOverlap) {
            bestOverlap = ov;
            clashWith = c;
          }
        }
      }
      if (clashWith) {
        alts[posOf(clashWith)]!.push({ set: s, why: canDipOut(clashWith, s) ? "dip" : "clash" });
        continue;
      }
      // No overlap -> dropped due to travel; pin to the nearest earlier chosen act.
      const earlier = route.filter((c) => c.end <= s.start);
      if (earlier.length) {
        alts[posOf(earlier[earlier.length - 1]!)]!.push({ set: s, why: "tight" });
      } else {
        dropped.push(s);
      }
    }

    const noted: MydayPick[] = annotations
      .filter((s) => s.start >= lo && s.start < hi)
      .map((s) => ({ ...s, priority: 0, annotation: true, enter: s.start, leave: s.end, caughtMin: s.durationMin, partial: false }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const a of noted) {
      let idx = route.findIndex((r) => r.start.getTime() >= a.start.getTime());
      if (idx === -1) idx = route.length;
      route.splice(idx, 0, a);
      alts.splice(idx, 0, []);
    }

    return { route, alts, dropped, meta: { nFavsToday: n, nSeen: route.length } };
  }

  return { whatson, reachable, after, canFollow, myday };
}
