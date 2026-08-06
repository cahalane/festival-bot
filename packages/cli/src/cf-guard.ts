/**
 * Don't clobber someone else's Clashfinder work.
 *
 * Our `cf-push` replaces the entire event, so a human's hand-entered acts are
 * destroyed on the next sync. That happened: a user had added the six
 * Seanchoíche sessions (the Appmiral feed labels them as bare words like "Love"
 * and "Memory") and our automation wiped them.
 *
 * Operator spec, 2026-08-01: "1. Check if last editor of the Clashfinder was us.
 * 2. If not, pull the diff. 3. If diff is plausible, ask me before reconciling.
 * 4. Don't run the push until I make a go/no go call."
 *
 * Clashfinder's read API exposes `lastEdit` but no editor NAME, so "was it us"
 * is answered by recording the `lastEdit` we observe immediately after our own
 * push and comparing on the next one. If it has moved, somebody else did it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface PushState {
  event: string;
  /** The mirror's `lastEdit` as observed right after our own push. */
  lastEdit: string;
  pushedAt: string;
  actCount: number;
}

export interface MirrorAct {
  name: string;
  stage: string;
  /** "YYYY-MM-DD HH:MM" as Clashfinder returns it. */
  start: string;
}

export interface MirrorDiff {
  /** On the mirror but not in our push — somebody added these by hand. */
  theirsOnly: MirrorAct[];
  /** In our push but not on the mirror — our own additions. */
  oursOnly: MirrorAct[];
  retimed: { name: string; theirs: string; ours: string }[];
}

/**
 * Has anyone touched the mirror since we last pushed?
 *
 * Absent state counts as foreign: with no record of our own push there is no
 * evidence the mirror is ours, and assuming it is, is exactly how the
 * Seanchoíche entries were lost.
 */
export function foreignEdit(remoteLastEdit: string, state: PushState | undefined, event?: string): boolean {
  if (!state) return true;
  if (event && state.event !== event) return true;
  return state.lastEdit !== remoteLastEdit;
}

/**
 * Full identity: an act at a stage AT A TIME.
 *
 * The first cut keyed on name+stage alone, which collapsed acts that play twice
 * on one stage (Paradise Cabaret, Friday and Sunday) into a single entry, and
 * then read the two dates as a retime — a phantom edit on a mirror nobody had
 * touched. Repeat performances are normal at a festival.
 */
const key = (a: MirrorAct): string => `${a.name}|||${a.stage}|||${a.start}`;
const actKey = (a: MirrorAct): string => `${a.name}|||${a.stage}`;

function countBy(list: MirrorAct[], f: (a: MirrorAct) => string): Map<string, MirrorAct[]> {
  const m = new Map<string, MirrorAct[]>();
  for (const a of list) m.set(f(a), [...(m.get(f(a)) ?? []), a]);
  return m;
}

export function diffMirror(remote: MirrorAct[], ours: MirrorAct[]): MirrorDiff {
  const rKeys = new Set(remote.map(key));
  const oKeys = new Set(ours.map(key));
  let theirsOnly = remote.filter((a) => !oKeys.has(key(a)));
  let oursOnly = ours.filter((a) => !rKeys.has(key(a)));

  // Reclassify: the same act+stage unmatched on BOTH sides is one performance
  // that moved, not a deletion plus an unrelated addition.
  const retimed: MirrorDiff["retimed"] = [];
  const theirsBy = countBy(theirsOnly, actKey);
  const oursBy = countBy(oursOnly, actKey);
  const paired = new Set<string>();
  for (const [k, theirs] of theirsBy) {
    const mine = oursBy.get(k);
    if (!mine) continue;
    const n = Math.min(theirs.length, mine.length);
    for (let i = 0; i < n; i++) retimed.push({ name: theirs[i]!.name, theirs: theirs[i]!.start, ours: mine[i]!.start });
    if (theirs.length === mine.length) paired.add(k);
  }
  theirsOnly = theirsOnly.filter((a) => !paired.has(actKey(a)));
  oursOnly = oursOnly.filter((a) => !paired.has(actKey(a)));
  return { theirsOnly, oursOnly, retimed };
}

export interface Revision {
  rev: number;
  by: string;
  note: string;
}

/**
 * Revisions from `clashfinder.com/l/<event>`, newest first.
 *
 * Pointed out on 2026-08-01: it names the AUTHOR of every revision, so
 * "was the last editor us?" is answered directly rather than inferred from a
 * timestamp we recorded ourselves.
 */
export function parseRevisions(html: string): Revision[] {
  const text = html.replace(/<[^>]*>/g, "|");
  const out: Revision[] = [];
  const re = /Rev\s+(\d+)\s*\|+[^|]*\|+\s*by\s*\|+\s*([^|]+?)\s*\|+\s*([^|]*)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ rev: Number(m[1]), by: m[2]!.trim(), note: (m[3] ?? "").trim() });
  }
  return out;
}

/** Did WE make the most recent edit? No revisions = cannot prove it, so no. */
export function lastEditorIsUs(revs: Revision[], ourUsername: string): boolean {
  const top = revs[0];
  if (!top) return false;
  return top.by.toLowerCase() === ourUsername.toLowerCase();
}

/**
 * Is this diff shaped like a person's contribution, or like a broken sync?
 *
 * A human adds a handful of sets the app missed. If the mirror differs from us
 * by hundreds of acts, something is wrong with one side's data and a human
 * should look before anything is overwritten either way.
 */
const PLAUSIBLE_MAX = 40;

export function plausibleEdit(d: MirrorDiff): boolean {
  const n = d.theirsOnly.length + d.retimed.length;
  if (n === 0) return false;
  return n <= PLAUSIBLE_MAX;
}

export function loadPushState(file: string): PushState | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PushState;
  } catch {
    return undefined;
  }
}

export function savePushState(file: string, state: PushState): void {
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

/** Flatten a Clashfinder event read into comparable acts. */
export function mirrorActsFromEvent(ev: {
  locations?: { name?: string; events?: { name?: string; start?: string }[] }[];
}): MirrorAct[] {
  const out: MirrorAct[] = [];
  for (const loc of ev.locations ?? []) {
    for (const e of loc.events ?? []) {
      if (!e.name || !e.start) continue;
      out.push({ name: e.name, stage: loc.name ?? "", start: e.start });
    }
  }
  return out;
}

/** Clashfinder's local wall-clock stamp format, "YYYY-MM-DD HH:MM". */
export function cfLocalStamp(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string): string => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

export interface ClashfinderEventRead {
  lastEdit?: string;
  locations?: { name?: string; events?: { name?: string; start?: string }[] }[];
}

/** Signed read of a Clashfinder event. Read-only; never mutates. */
export async function readClashfinderEvent(
  event: string,
  authUsername: string,
  authPublicKey: string,
): Promise<ClashfinderEventRead | null> {
  const q = new URLSearchParams({ authUsername, authPublicKey });
  const res = await fetch(`https://clashfinder.com/data/event/${event}.json?${q}`);
  if (!res.ok) return null;
  return (await res.json()) as ClashfinderEventRead;
}

/** Fetch the revision log for an event (public page, no auth needed). */
export async function fetchRevisions(event: string): Promise<Revision[]> {
  const res = await fetch(`https://clashfinder.com/l/${event}`, { redirect: "follow" });
  if (!res.ok) return [];
  return parseRevisions(await res.text());
}

/** The compare URL supplied by the operator — for a human to eyeball two revisions. */
export function compareUrl(event: string, rev1: number, rev2: number): string {
  return `https://clashfinder.com/s/${event}/?compare&rev1=${rev1}&rev2=${rev2}`;
}
