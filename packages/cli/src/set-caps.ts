/**
 * `--cap "<substring>=<minutes>"` — plan for attending only PART of a set.
 *
 * Operator ask, 2026-08-01: "I don't plan on going to the whole cypher, can I
 * see a card that maximises for me going at most to an arbitrary hour of it?"
 *
 * The Last City Cypher runs 14:30-17:30, and the planner treats a starred set as
 * attended end to end — so a three-hour block swallows the afternoon and nothing
 * else can be routed against it, even though only an hour of it was wanted.
 * Capping shortens the set FOR ROUTING ONLY, so the planner can spend the time
 * that gets freed up.
 *
 * A cap is a CEILING, never a target: it must not lengthen a set that is already
 * shorter, or the router would invent clashes that do not exist.
 */
import type { ArtistSet } from "@festival-bot/core";

export interface SetCap {
  /** Lowercased substring of the act name. */
  match: string;
  minutes: number;
}

/** Parse `--cap` values: "Cypher=60" or "Cypher=60,Christy=30". */
export function parseCaps(values: string[]): SetCap[] {
  const out: SetCap[] = [];
  for (const v of values) {
    for (const part of v.split(",")) {
      const [name, mins] = part.split("=");
      const minutes = Number((mins ?? "").trim());
      // A cap with no usable number is dropped rather than defaulted — guessing
      // how long someone wants to stay is exactly the wrong thing to invent.
      if (!name?.trim() || !Number.isFinite(minutes) || minutes <= 0) continue;
      out.push({ match: name.trim().toLowerCase(), minutes });
    }
  }
  return out;
}

export function applyCaps(sets: ArtistSet[], caps: SetCap[]): ArtistSet[] {
  if (!caps.length) return sets;
  return sets.map((s) => {
    const cap = caps.find((c) => s.name.toLowerCase().includes(c.match));
    if (!cap || s.durationMin <= cap.minutes) return s;
    return {
      ...s,
      end: new Date(s.start.getTime() + cap.minutes * 60_000),
      durationMin: cap.minutes,
    };
  });
}
