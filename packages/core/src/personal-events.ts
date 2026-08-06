/**
 * Fixed, non-lineup personal commitments (a booked sauna slot, a brunch) that a
 * user wants `myday` to route around. Mirrors reminders.ts's shape: a pure model
 * + selectors here, file-backed storage lives in @festival-bot/data.
 */
import type { ArtistSet } from "./models.js";

export interface PersonalEvent {
  id: string;
  handle: string;
  name: string;
  /** ISO-8601 with offset, e.g. "2026-08-01T18:00:00+01:00". */
  startIso: string;
  endIso: string;
  /** Walk-graph stage slug, or null if the location isn't known/mapped yet. */
  stage: string | null;
  /** Only `true` entries are merged into myday routing (this iteration). */
  mandatory: boolean;
  notes?: string;
}

/** Off-graph placeholder stage for an unlocated event — WalkMatrix.walk() falls
 *  back to its configured defaultMinutes for any stage not in the graph, so this
 *  needs no venues.json changes to get a sane (if approximate) travel penalty. */
export const UNLOCATED_STAGE = "personal:unlocated";

const instant = (iso: string): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`invalid timestamp: ${JSON.stringify(iso)}`);
  return t;
};

export function createPersonalEvent(
  fields: {
    handle: string;
    name: string;
    startIso: string;
    endIso: string;
    stage?: string | null;
    mandatory?: boolean;
    notes?: string;
  },
  idGen: () => string = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8),
): PersonalEvent {
  const start = instant(fields.startIso);
  const end = instant(fields.endIso);
  if (end <= start) throw new Error(`end (${fields.endIso}) must be after start (${fields.startIso})`);
  return {
    id: idGen(),
    handle: fields.handle,
    name: fields.name,
    startIso: fields.startIso,
    endIso: fields.endIso,
    stage: fields.stage ?? null,
    mandatory: fields.mandatory ?? true,
    notes: fields.notes,
  };
}

/** One handle's events starting within `[lo, hi)`. */
export function forHandleAndWindow(items: PersonalEvent[], handle: string, window: [Date, Date]): PersonalEvent[] {
  const [lo, hi] = window;
  return items.filter((e) => e.handle === handle && instant(e.startIso) >= lo.getTime() && instant(e.startIso) < hi.getTime());
}

/** Map to the shape the planner already consumes. */
export function toArtistSet(event: PersonalEvent): ArtistSet {
  const start = new Date(instant(event.startIso));
  const end = new Date(instant(event.endIso));
  return {
    name: event.name,
    slug: event.id,
    stage: event.stage ?? UNLOCATED_STAGE,
    start,
    end,
    durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
  };
}
