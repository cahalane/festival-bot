/**
 * Personalised "vibe-check" for a user: what's on now, what's next in the coming
 * horizon (~90 min), and any clash decisions among their picks. Pure and
 * festival-agnostic — the caller passes the user's favourite sets (already matched
 * to the lineup) and tags tiers from favourite priority. Ports vibecheck.py.
 */
import type { ArtistSet } from "./models.js";

export interface VibeDecision {
  a: ArtistSet;
  b: ArtistSet;
}

export interface VibeCheck {
  now: Date;
  onNow: ArtistSet[];
  next: ArtistSet[];
  decisions: VibeDecision[];
  /** Soonest pick after the horizon, only when `next` is empty. */
  later?: ArtistSet;
}

const byStart = (a: ArtistSet, b: ArtistSet) => a.start.getTime() - b.start.getTime();

export function vibeCheck(picks: ArtistSet[], now: Date, horizonMin = 90): VibeCheck {
  const horizon = new Date(now.getTime() + horizonMin * 60_000);
  const onNow = picks.filter((s) => s.start <= now && now < s.end).sort(byStart);
  const next = picks.filter((s) => now < s.start && s.start <= horizon).sort(byStart);
  const decisions: VibeDecision[] = [];
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i]!;
      const b = next[j]!;
      if (a.start < b.end && b.start < a.end) decisions.push({ a, b });
    }
  }
  const later = next.length ? undefined : picks.filter((s) => s.start > now).sort(byStart)[0];
  return { now, onNow, next, decisions, later };
}
