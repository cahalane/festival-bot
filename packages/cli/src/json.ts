/**
 * Machine-readable (`--json`) serialisers for the read commands. The console
 * renderers in format.ts stay for humans/channel relay; these emit structured
 * objects (festival-local ISO times, display venue names, explicit deltas) for an
 * agent or downstream tool to reason over without parsing prose.
 */
import type { ArtistSet, LineupChanges, MydayResult, ReachableSet, Setlist, VibeCheck } from "@festival-bot/core";

export interface JsonCtx {
  tz: string;
  venueName: (slug: string) => string;
  limited: (slug: string) => boolean;
}

/** An instant rendered in `tz` as ISO-8601 with offset, e.g. 2026-06-06T22:05:00+02:00. */
export function localIso(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")!.value;
  const offset = tzName.replace("GMT", "") || "+00:00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}${offset}`;
}

const minBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60_000);

export interface SetJson {
  name: string;
  stage: string;
  venue: string;
  start: string;
  end: string;
  durationMin: number;
  limited?: boolean;
}

export function setJson(ctx: JsonCtx, s: ArtistSet): SetJson {
  const j: SetJson = {
    name: s.name,
    stage: s.stage,
    venue: ctx.venueName(s.stage),
    start: localIso(s.start, ctx.tz),
    end: localIso(s.end, ctx.tz),
    durationMin: s.durationMin,
  };
  if (ctx.limited(s.stage)) j.limited = true;
  return j;
}

export function whatsonJson(ctx: JsonCtx, when: Date, now: ArtistSet[], next: ArtistSet[]) {
  return {
    query: "now" as const,
    when: localIso(when, ctx.tz),
    timezone: ctx.tz,
    now: now.map((s) => ({ ...setJson(ctx, s), endsInMin: minBetween(s.end, when) })),
    next: next.map((s) => ({ ...setJson(ctx, s), startsInMin: minBetween(s.start, when) })),
  };
}

function reachableRow(ctx: JsonCtx, r: ReachableSet) {
  return { ...setJson(ctx, r), walkMin: r.walkMin, missedMin: r.missedMin, catchMin: r.durationMin - r.missedMin };
}

export function reachableJson(ctx: JsonCtx, when: Date, fromStage: string | null, rows: ReachableSet[]) {
  return {
    query: "reachable" as const,
    when: localIso(when, ctx.tz),
    timezone: ctx.tz,
    from: fromStage,
    reachable: rows.map((r) => reachableRow(ctx, r)),
  };
}

export function afterJson(ctx: JsonCtx, base: ArtistSet, rows: ReachableSet[]) {
  return {
    query: "after" as const,
    timezone: ctx.tz,
    base: setJson(ctx, base),
    reachable: rows.map((r) => reachableRow(ctx, r)),
  };
}

export function mydayJson(
  ctx: JsonCtx,
  handle: string,
  dayLo: Date,
  res: MydayResult,
  unmatched: string[],
  stale: boolean,
) {
  return {
    query: "myday" as const,
    handle,
    day: localIso(dayLo, ctx.tz).slice(0, 10),
    timezone: ctx.tz,
    stale,
    meta: { seen: res.meta.nSeen, favsToday: res.meta.nFavsToday },
    route: res.route.map((c, i) => ({
      ...setJson(ctx, c),
      priority: c.priority,
      annotation: c.annotation ?? false,
      partial: c.partial ?? false,
      enter: c.enter ? localIso(c.enter, ctx.tz) : undefined,
      leave: c.leave ? localIso(c.leave, ctx.tz) : undefined,
      caughtMin: c.caughtMin,
      alts: (res.alts[i] ?? []).map((a) => ({
        name: a.set.name,
        stage: a.set.stage,
        venue: ctx.venueName(a.set.stage),
        start: localIso(a.set.start, ctx.tz),
        priority: a.set.priority,
        why: a.why,
      })),
    })),
    dropped: res.dropped.map((s) => ({ name: s.name, start: localIso(s.start, ctx.tz) })),
    notInLineup: unmatched,
  };
}

export function setlistJson(artist: string, lists: Setlist[]) {
  return {
    query: "setlist" as const,
    artist,
    source: "setlist.fm" as const,
    caveat: "crowd-sourced; may lag or be incomplete — not a first-hand report. Empty songs = gig known but not yet entered.",
    setlists: lists,
  };
}

export function remindJson(ctx: JsonCtx, s: ArtistSet, leadMin: number) {
  return {
    ...setJson(ctx, s),
    leadMin,
    fireAt: localIso(new Date(s.start.getTime() - leadMin * 60_000), ctx.tz),
  };
}

export function vibecheckJson(ctx: JsonCtx, vc: VibeCheck, favs: Map<string, number>, stale: boolean) {
  const row = (s: ArtistSet) => ({ ...setJson(ctx, s), priority: favs.get(s.name) });
  return {
    query: "vibecheck" as const,
    when: localIso(vc.now, ctx.tz),
    timezone: ctx.tz,
    stale,
    onNow: vc.onNow.map(row),
    next: vc.next.map((s) => ({ ...row(s), startsInMin: minBetween(s.start, vc.now) })),
    decisions: vc.decisions.map((d) => ({
      a: d.a.name, aStart: localIso(d.a.start, ctx.tz),
      b: d.b.name, bStart: localIso(d.b.start, ctx.tz),
    })),
    later: vc.later ? row(vc.later) : null,
  };
}

export function scheduleWatchJson(ctx: JsonCtx, ch: LineupChanges) {
  return {
    query: "schedule-watch" as const,
    timezone: ctx.tz,
    added: ch.added.map((s) => setJson(ctx, s)),
    removed: ch.removed.map((s) => setJson(ctx, s)),
    moved: ch.moved.map((m) => ({
      ...setJson(ctx, m.set),
      fromStart: localIso(m.fromStart, ctx.tz),
      fromDurationMin: m.fromDurationMin,
    })),
  };
}
