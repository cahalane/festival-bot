/**
 * Extra sets — real performances the live feed no longer carries.
 *
 * ATN withdrew For Those I Love's Circle set from the published timetable on
 * 2026-07-10 (11:18:01Z) and billed it on the official Circle poster as AFTER
 * DARK: a set that is really happening, deliberately absent from the schedule so
 * it stays a surprise. The vendor feed is therefore not a complete record of the
 * festival, and a mirror built only from it has a hole in it.
 *
 * These live in the festival module rather than in `schedule.json` on purpose.
 * The snapshot must keep matching the live feed exactly or `schedule-tick` reports
 * a phantom ADD on every run; this list is merged in at the point of USE (the
 * Clashfinder push) and nowhere else.
 *
 * Every entry must carry a `note` saying where its times came from. The FTIL
 * times were recovered from the 2026-07-10 snapshot committed fifteen minutes
 * before the deletion, not guessed from the gap they fit.
 *
 * POP-UPS (operator standing instruction, 2026-07-31): ATN announce surprise shows
 * on the official news feed with a start time and NO end. The original blanket
 * ban on inferred durations would have kept every one of them out of the planner
 * and the mirror, which is worse than a declared estimate — so an estimated end
 * is allowed when it is marked `endEstimated: true`. The flag is the safeguard:
 * a guess must never be indistinguishable from a published time. Handle every
 * future announced pop-up this way.
 */
import { readFileSync } from "node:fs";
import type { ArtistSet } from "@festival-bot/core";

export interface ExtraSetRecord {
  name: string;
  stage: string;
  /** ISO with offset, as published before withdrawal. */
  start: string;
  end: string;
  /**
   * Set when the end time is an estimate rather than a published one — the case
   * for an announced pop-up, which comes with a start and nothing else.
   */
  endEstimated?: boolean;
  /** Where these times came from. Required — an unsourced entry is a guess. */
  note: string;
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parseExtraSets(records: ExtraSetRecord[]): ArtistSet[] {
  return records.map((r) => {
    if (!r.name || !r.stage) throw new Error(`extra set needs a name and stage: ${JSON.stringify(r)}`);
    if (!r.start) throw new Error(`extra set "${r.name}" needs a start time`);
    if (!r.end) {
      throw new Error(
        `extra set "${r.name}" needs an end — estimate it and set endEstimated: true, but never leave it unmarked`,
      );
    }
    if (!r.note?.trim()) throw new Error(`extra set "${r.name}" needs a note recording where its times came from`);
    const start = new Date(r.start);
    const end = new Date(r.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error(`extra set "${r.name}" has an unparseable start/end`);
    }
    return {
      name: r.name,
      slug: slugify(r.name),
      stage: r.stage,
      start,
      end,
      durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
      // Carried through so anything user-facing can caveat the finish time.
      ...(r.endEstimated ? { endEstimated: true } : {}),
    };
  });
}

export interface RetimeRecord {
  /** Substring of the act name as the feed publishes it. */
  name: string;
  start: string;
  end: string;
  note: string;
}

export interface ExtraSetsDoc {
  sets: ArtistSet[];
  retime: RetimeRecord[];
}

/**
 * Accept either the legacy array (pure additions) or the object form
 * `{ sets, retime }`.
 *
 * `retime` exists because the Appmiral feed sometimes publishes a takeover as
 * ONE long block when it is really several things: the Last City All Ireland
 * Cypher is listed 14:30-17:30, but the host's own running order has GOMIE,
 * Beddyminaj, Sugaboo and Lil Skag taking half an hour each and the cypher
 * proper only in the last hour (operator note, 2026-08-01). Planning against the block
 * routes people to a three-hour set that does not exist.
 *
 * Retiming rather than suppress-and-re-add keeps the act's identity, so
 * anyone's star on it still resolves.
 */
export function parseExtraSetsDoc(raw: unknown): ExtraSetsDoc {
  if (Array.isArray(raw)) return { sets: parseExtraSets(raw as ExtraSetRecord[]), retime: [] };
  const doc = (raw ?? {}) as { sets?: ExtraSetRecord[]; retime?: RetimeRecord[] };
  const retime = (doc.retime ?? []).filter((r) => {
    if (!r.name || !r.start || !r.end) throw new Error(`retime entry needs name, start and end: ${JSON.stringify(r)}`);
    if (!r.note?.trim()) throw new Error(`retime "${r.name}" needs a note recording where the times came from`);
    return true;
  });
  return { sets: parseExtraSets(doc.sets ?? []), retime };
}

/** Apply retimes to the live lineup. Never mutates; matches on a name substring. */
export function applyRetimes(sets: ArtistSet[], retime: RetimeRecord[]): ArtistSet[] {
  if (!retime.length) return sets;
  return sets.map((s) => {
    const r = retime.find((x) => s.name.toLowerCase().includes(x.name.toLowerCase()));
    if (!r) return s;
    const start = new Date(r.start);
    const end = new Date(r.end);
    return { ...s, start, end, durationMin: Math.round((end.getTime() - start.getTime()) / 60_000) };
  });
}

export function loadExtraSets(file: string): ArtistSet[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return []; // a festival with no withdrawn sets simply has no file
  }
  return parseExtraSetsDoc(JSON.parse(raw)).sets;
}

/** Full document (additions + retimes) for a festival. */
export function loadExtraSetsDoc(file: string): ExtraSetsDoc {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return { sets: [], retime: [] };
  }
  return parseExtraSetsDoc(JSON.parse(raw));
}

/**
 * Live lineup + extras, dropping any extra the feed has since restored. Identity
 * is name + stage + start: the same act on a different stage or at a different
 * time is a different performance, not a duplicate (FTIL play twice).
 */
export function mergeExtraSets(live: ArtistSet[], extras: ArtistSet[]): ArtistSet[] {
  if (!extras.length) return live;
  const key = (s: ArtistSet): string => `${s.name}|${s.stage}|${s.start.getTime()}`;
  const seen = new Set(live.map(key));
  return [...live, ...extras.filter((e) => !seen.has(key(e)))];
}
