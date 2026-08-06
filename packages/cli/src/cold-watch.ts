/**
 * `festplan cold-tick` — the unattended cold-snap watch.
 *
 * A crew member camping on site asked for a cold-temperature watch after a bad
 * night (2026-07-31): monitor temps and notify when it goes below 7, or
 * preferably a feels-like temp.
 *
 * Same contract as the other watches: SILENT unless something is due, state on
 * disk so an alert that lands while the session is down still fires once later.
 *
 * Two things it deliberately does NOT do. It does not report the CURRENT
 * temperature — being told it is cold while you are already shivering is not
 * actionable; the useful version arrives before you need the extra layer, so it
 * reads the forecast a few hours ahead. And it does not re-alert every tick: a
 * cold night is one fact, and six identical 3am messages is spam, so an episode
 * fires once.
 *
 * Feels-like is the default metric because that is what was actually asked for,
 * and what a tent at 3am actually feels like — 9C air on the wind is the night
 * that prompted the ask.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseChannel } from "@festival-bot/data";
import type { ChannelRef } from "@festival-bot/core";
import { cacheDir } from "./config.js";
import { ACTIVE_FESTIVAL } from "./festivals.js";

export interface ColdHour {
  /** ISO with offset, festival-local. */
  time: string;
  tempC: number;
  /** Feels-like, when the source provides it. */
  apparentC?: number;
}

export interface ColdEpisodeInfo {
  /** First hour at or below the threshold. */
  from: string;
  /** Last contiguous hour still at or below it. */
  until: string;
  /** Coldest reading in the episode, on whichever metric was used. */
  lowC: number;
}

/** Feels-like where available, air temperature otherwise. */
function reading(h: ColdHour): number {
  return h.apparentC ?? h.tempC;
}

/**
 * The next run of hours at or below `thresholdC`, within `lookaheadHours` of
 * `now`. Past hours are skipped: cold already sat through is not actionable.
 */
export function coldEpisode(
  hours: ColdHour[],
  thresholdC: number,
  now: Date,
  lookaheadHours: number,
): ColdEpisodeInfo | null {
  const from = now.getTime();
  const to = from + lookaheadHours * 3_600_000;
  const window = hours
    .map((h) => ({ h, t: new Date(h.time).getTime() }))
    .filter(({ t }) => t >= from && t <= to)
    .sort((a, b) => a.t - b.t);

  const startIdx = window.findIndex(({ h }) => reading(h) <= thresholdC);
  if (startIdx < 0) return null;

  let lowC = reading(window[startIdx]!.h);
  let endIdx = startIdx;
  for (let i = startIdx + 1; i < window.length; i++) {
    // Contiguous run only — a warm hour ends the episode, and the next cold
    // spell is separate news.
    if (reading(window[i]!.h) > thresholdC) break;
    endIdx = i;
    lowC = Math.min(lowC, reading(window[i]!.h));
  }
  return { from: window[startIdx]!.h.time, until: window[endIdx]!.h.time, lowC };
}

/** What was last sent for a subscriber, so a repeat tick stays quiet. */
export interface ColdAlerted {
  from: string;
  /** End of the episode as last seen — the stable half of its identity. */
  until?: string;
  lowC: number;
  /** Which of the two messages have already gone out for this episode. */
  sent?: ColdStage[];
}

/**
 * Is this the cold snap we already alerted on?
 *
 * NOT a start-time comparison. `from` is derived from the future window only,
 * so it walks forward as the night is consumed (04:00, then 05:00, then 06:00),
 * and keying on it made each tick look like a fresh episode — which would have
 * re-sent the jacket nudge every hour until dawn. `until` moves too, as the
 * lookahead reveals more of the run. Overlap is what stays true: an episode
 * starting no later than the stored one ended is the same snap.
 */
export function isSameEpisode(episode: ColdEpisodeInfo, last: ColdAlerted | undefined): boolean {
  if (!last) return false;
  const lastEnd = new Date(last.until ?? last.from).getTime();
  return new Date(episode.from).getTime() <= lastEnd;
}

/**
 * A materially colder revision of an episode already sent is worth re-sending.
 *
 * The lookahead truncates an episode running past its edge, so the first alert
 * can understate the night: on 2026-07-31 the 20:00 tick saw 6.1C and the 22:00
 * tick saw 3.8C for the same episode. Deduping on start time alone would leave
 * someone packing for the wrong night.
 */
const MATERIAL_DROP_C = 2;

/** Fire once per episode, and again only if it gets materially colder. */
export function shouldAlert(episode: ColdEpisodeInfo, last: ColdAlerted | undefined): boolean {
  if (!last || episode.from !== last.from) return true;
  return episode.lowC <= last.lowC - MATERIAL_DROP_C;
}

/**
 * Which message an episode is due, if any.
 *
 * A second message was asked for right after the first shipped: "ping me when
 * it's getting cold just so I don't forget to put the jacket on." The advance
 * warning is for planning; the nudge is for acting. Same episode, two jobs.
 */
export type ColdStage = "ahead" | "imminent";

/** How close the drop has to be before the nudge replaces the planning warning. */
const IMMINENT_MS = 90 * 60_000;

export function dueStage(
  episode: ColdEpisodeInfo,
  now: Date,
  sent: ColdStage[],
): ColdStage | null {
  const t = now.getTime();
  // Once the whole episode is behind us there is nothing to put a jacket on for.
  if (t > new Date(episode.until).getTime()) return null;

  const close = new Date(episode.from).getTime() - t <= IMMINENT_MS;
  // Up close, the nudge is the only useful message — an episode first seen 20
  // minutes out must not open with a "hours from now" warning.
  if (close) return sent.includes("imminent") ? null : "imminent";
  return sent.includes("ahead") ? null : "ahead";
}

export interface ColdSubscriber {
  handle: string;
  channel: ChannelRef;
  belowC: number;
}

interface PrefEntry {
  channel?: { kind?: string; id?: string | number };
  chat_id?: string;
  coldAlert?: { belowC?: number };
}

/** Handles that opted in, from prefs.json. A malformed entry is skipped, not fatal. */
export function coldSubscribers(prefs: Record<string, PrefEntry>): ColdSubscriber[] {
  const out: ColdSubscriber[] = [];
  for (const [handle, p] of Object.entries(prefs)) {
    if (!p?.coldAlert) continue;
    const ref = parseChannel(p.channel ?? p.chat_id);
    if (!ref) continue;
    out.push({ handle, channel: ref, belowC: p.coldAlert.belowC ?? 7 });
  }
  return out;
}

const LOOKAHEAD_HOURS = 8;

type ColdState = Record<string, ColdAlerted>;

export interface ColdTickIo {
  log: (s: string) => void;
  hours: () => Promise<ColdHour[]>;
  prefs: () => Record<string, PrefEntry>;
  readState: () => ColdState;
  writeState: (s: ColdState) => void;
  now: () => Date;
}

/** One tick. Prints nothing unless an alert is due. */
export async function runColdTickWith(io: ColdTickIo): Promise<void> {
  const subs = coldSubscribers(io.prefs());
  if (!subs.length) return;

  let hours: ColdHour[];
  try {
    hours = await io.hours();
  } catch {
    // A flaky forecast is not worth waking anyone over; the retry layer already
    // rides out Open-Meteo's 503s, and the next tick is 20 minutes away.
    return;
  }

  const state = io.readState();
  const now = io.now();
  let changed = false;

  for (const s of subs) {
    const ep = coldEpisode(hours, s.belowC, now, LOOKAHEAD_HOURS);
    if (!ep) continue;

    const prev = state[s.handle];
    const sameEpisode = isSameEpisode(ep, prev);
    // A materially colder revision reopens the episode: both messages are worth
    // re-sending when the night turns out much worse than first forecast.
    const colder = sameEpisode && ep.lowC <= (prev?.lowC ?? Infinity) - MATERIAL_DROP_C;
    const sent: ColdStage[] = sameEpisode && !colder ? (prev?.sent ?? []) : [];

    const stage = dueStage(ep, now, sent);
    if (!stage) continue;

    io.log(
      `COLD ALERT (${ACTIVE_FESTIVAL}) [${stage}] ${s.handle} chat=${s.channel.id}: feels-like ` +
        `${ep.lowC.toFixed(1)}C (threshold ${s.belowC}C) from ${ep.from} until ${ep.until}`,
    );
    state[s.handle] = { from: ep.from, until: ep.until, lowC: ep.lowC, sent: [...sent, stage] };
    changed = true;
  }
  if (changed) io.writeState(state);
}

export async function runColdTick(): Promise<void> {
  const stateFile = join(cacheDir(ACTIVE_FESTIVAL), "cold_alert_state.json");
  const { loadRuntime } = await import("./runtime.js");
  const { loadActiveFestival } = await import("./festivals.js");
  const rt = await loadRuntime(loadActiveFestival());
  const weather = rt.module.sources.weather;
  if (!weather) return;

  await runColdTickWith({
    log: (s) => console.log(s),
    hours: async () => {
      const hs = await weather.hourly(LOOKAHEAD_HOURS + 4);
      return hs.map((h) => ({ time: h.time, tempC: h.tempC, apparentC: h.apparentC }));
    },
    prefs: () => JSON.parse(readFileSync(join(process.cwd(), "data", "prefs.json"), "utf8")),
    readState: () => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {}),
    writeState: (s) => writeFileSync(stateFile, JSON.stringify(s, null, 2) + "\n"),
    now: () => new Date(),
  });
}
