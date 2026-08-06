/**
 * Star watch — did this push break anyone's Clashfinder highlights?
 *
 * A highlight code (`fortho-1`, `mabfie1-1`) is an identity ATN control and
 * Clashfinder derives. Renaming an act, splitting it in two, or adding another act
 * sharing its first six letters can renumber the code — so a star silently stops
 * resolving, or worse, starts resolving to a DIFFERENT act. Over 2026-07-27/28
 * that happened four times across the crew and each one was found by accident.
 *
 * Operator standing instruction, 2026-07-28: "Routine pushes should stay.
 * Clashfinder is for a much wider audience than just us and I want it to
 * mirror the source of truth as much as possible. Rather say 'hey, Clashfinder
 * dropped your star' than let it go out of sync." So the mirror keeps being
 * pushed, and this reports the collateral instead of it being found by
 * accident days later.
 *
 * Pure: state in, diff out. The fetching lives in cf-push.
 */

/** code -> act name, or null when the code resolves to nothing. */
export type StarState = Record<string, string | null>;

export interface StarDiff {
  /** Stars that resolved before and resolve to nothing now. */
  dropped: { code: string; was: string }[];
  /** Stars that now resolve to a different act — silently wrong, not merely absent. */
  moved: { code: string; was: string; now: string }[];
}

export interface UserStarDiff {
  handle: string;
  diff: StarDiff;
}

/** Resolve every code in a user's highlight tiers against the current event map. */
export function starStateFrom(
  gets: Record<string, string | undefined>,
  codeToName: Map<string, string>,
): StarState {
  const state: StarState = {};
  for (let i = 1; i <= 20; i++) {
    const codes = gets[`hl${i}`];
    if (!codes) continue;
    for (const raw of codes.split(",")) {
      const code = raw.trim();
      if (code) state[code] = codeToName.get(code) ?? null;
    }
  }
  return state;
}

/**
 * What changed for one user between two pushes. Only regressions are reported:
 * a new star, or a dead code coming back, needs no one's attention.
 */
export function diffStars(prev: StarState, next: StarState): StarDiff {
  const dropped: StarDiff["dropped"] = [];
  const moved: StarDiff["moved"] = [];
  for (const [code, was] of Object.entries(prev)) {
    if (was === null) continue; // already broken; not news again
    if (!(code in next)) continue; // the user removed it themselves
    const now = next[code]!;
    if (now === null) dropped.push({ code, was });
    else if (now !== was) moved.push({ code, was, now });
  }
  return { dropped, moved };
}

/** Human report for the push output. Empty string when nothing broke. */
export function renderStarDiff(users: UserStarDiff[]): string {
  const lines: string[] = [];
  for (const { handle, diff } of users) {
    if (!diff.dropped.length && !diff.moved.length) continue;
    lines.push(`  ${handle}:`);
    for (const d of diff.dropped) {
      lines.push(`    DROPPED  ${d.was} (${d.code}) — tell them to re-star it`);
    }
    for (const m of diff.moved) {
      // Worse than a drop: the plan still looks complete and routes the wrong act.
      lines.push(`    MOVED    ${m.code} was ${m.was} — NOW POINTS AT ${m.now}`);
    }
  }
  if (!lines.length) return "";
  return ["STAR CHECK — this push changed what some stars resolve to:", ...lines].join("\n");
}
