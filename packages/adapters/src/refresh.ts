/**
 * The snapshot-refresh guard, shared by every lineup source that persists a
 * bundled snapshot.
 *
 * Lesson baked in (from PS26): a live feed PRUNES past acts once the event is
 * over, so a post-festival re-fetch can come back smaller than the snapshot it
 * would replace. Never silently clobber a fuller snapshot with a degraded one —
 * shrinks are diverted to a sidecar unless the operator forces the write.
 *
 * Refined twice on 2026-07-31, mid-ATN. The guard originally saw only the two
 * counts, so it read two live cancellations as pruning and parked a correct
 * fetch. The first fix asked whether the festival was running; the operator sharpened
 * it to the real question — *"post prune is a valid concern but only if the
 * specific set is in the past"*. Which sets disappeared is what distinguishes
 * the two cases, and it is right in both phases: an act pulled a week before the
 * gates is a cancellation, and pruning after the event is still pruning.
 */

export interface RefreshDecision {
  write: boolean;
  reason: string;
}

/** Just enough of a set to place it in time. */
export interface TimedSet {
  slug: string;
  start: Date;
}

export interface RemovedSplit {
  past: number;
  future: number;
}

export interface RefreshContext {
  /**
   * How the sets missing from the fetch split around now. Omitted = unknown, in
   * which case the guard stays conservative and parks the shrink.
   */
  removed?: RemovedSplit;
}

/**
 * A shrink below this fraction of the snapshot is a broken fetch, not
 * cancellations. Real cancellations trickle; a feed returning a handful of sets
 * has failed, and "they were all cancelled" is never the likelier story.
 */
const PLAUSIBLE_SHRINK = 0.8;

/**
 * Split the sets missing from `next` into those already started and those still
 * to come. Keyed by slug + start so a set moved in time reads as a move rather
 * than a removal.
 */
export function classifyRemoved(prev: TimedSet[], next: TimedSet[], now: Date = new Date()): RemovedSplit {
  const key = (s: TimedSet) => `${s.slug}@${s.start.getTime()}`;
  const have = new Set(next.map(key));
  const split: RemovedSplit = { past: 0, future: 0 };
  for (const s of prev) {
    if (have.has(key(s))) continue;
    if (s.start.getTime() <= now.getTime()) split.past++;
    else split.future++;
  }
  return split;
}

/** Decide whether to overwrite a snapshot, guarding against post-festival pruning. */
export function refreshDecision(
  fetched: number,
  previous: number | null,
  force: boolean,
  ctx: RefreshContext = {},
): RefreshDecision {
  if (previous === null) return { write: true, reason: "no prior snapshot" };
  if (fetched >= previous) {
    return { write: true, reason: fetched === previous ? `same size (${fetched})` : `grew ${previous}→${fetched}` };
  }
  if (force) return { write: true, reason: `shrank ${previous}→${fetched} (forced)` };

  // A collapse is a failed fetch whatever the removed sets claim to be.
  if (fetched < previous * PLAUSIBLE_SHRINK) {
    return {
      write: false,
      reason: `shrank ${previous}→${fetched} — implausible collapse for cancellations; not overwriting`,
    };
  }

  const removed = ctx.removed;
  if (!removed) {
    return { write: false, reason: `shrank ${previous}→${fetched} — cannot tell pruning from cancellation; not overwriting` };
  }
  if (removed.future > 0) {
    return {
      write: true,
      reason:
        `shrank ${previous}→${fetched} — ${removed.future} future set(s) cancelled` +
        (removed.past ? ` (+${removed.past} past pruned)` : ""),
    };
  }
  return {
    write: false,
    reason: `shrank ${previous}→${fetched} — only past sets removed; pruning, not overwriting`,
  };
}
