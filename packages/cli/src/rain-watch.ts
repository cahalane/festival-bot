/**
 * `festplan rain-tick` — the standing "is rain about to arrive" watch.
 *
 * Operator ask, 2026-07-31: "there should be a standing [watch] ... watching
 * the day ahead. Changes implying imminent rain should be brought into the
 * context and a warning should be sent out."
 *
 * The daily card is a planning document written once each morning. This is the
 * thing that catches weather ARRIVING after it was written — the case the card
 * structurally cannot cover.
 *
 * Deliberately the same shape as the cold watch: forecast-based, silent unless
 * something is due, one alert per episode with a re-alert only if it gets
 * materially worse, state on disk so an episode that lands while the session is
 * down still fires once. The failure mode is the same too — a watch that
 * repeats itself every 20 minutes gets muted, and a muted watch warns nobody.
 *
 * It requires actual millimetres, not just a high probability: a 60% chance of
 * 0.0mm is a cloudy afternoon, and firing on that would cry wolf through an
 * entire dry weekend and train everyone to ignore it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheDir } from "./config.js";
import { ACTIVE_FESTIVAL } from "./festivals.js";

export interface RainHour {
  /** ISO with offset, festival-local. */
  time: string;
  precipMm: number;
  precipProbPct: number;
}

export interface RainEpisodeInfo {
  from: string;
  until: string;
  /** Wettest single hour, mm. */
  peakMm: number;
  /** Total across the episode, mm. */
  totalMm: number;
}

/** Below this, an hour is not rain anyone changes plans for. */
const WET_HOUR_MM = 0.1;

/** How far ahead to look. Enough warning to get back to a tent, not so far it is speculation. */
export const RAIN_LOOKAHEAD_HOURS = 6;

const isWet = (h: RainHour): boolean => h.precipMm >= WET_HOUR_MM;

/** The next contiguous run of wet hours within the lookahead, or null. */
export function rainEpisode(hours: RainHour[], now: Date, lookaheadHours: number): RainEpisodeInfo | null {
  const from = now.getTime();
  const to = from + lookaheadHours * 3_600_000;
  const window = hours
    .map((h) => ({ h, t: new Date(h.time).getTime() }))
    .filter(({ t }) => t >= from && t <= to)
    .sort((a, b) => a.t - b.t);

  const startIdx = window.findIndex(({ h }) => isWet(h));
  if (startIdx < 0) return null;

  let peakMm = window[startIdx]!.h.precipMm;
  let totalMm = peakMm;
  let endIdx = startIdx;
  for (let i = startIdx + 1; i < window.length; i++) {
    if (!isWet(window[i]!.h)) break;
    endIdx = i;
    peakMm = Math.max(peakMm, window[i]!.h.precipMm);
    totalMm += window[i]!.h.precipMm;
  }
  return {
    from: window[startIdx]!.h.time,
    until: window[endIdx]!.h.time,
    peakMm: Math.round(peakMm * 100) / 100,
    totalMm: Math.round(totalMm * 100) / 100,
  };
}

export type RainSeverity = "drizzle" | "rain" | "downpour";

/**
 * Plain word for how bad it is. Escalates on TOTAL as well as peak — four hours
 * of steady 1.2mm is a soaking whatever the wettest hour says.
 */
export function rainSeverity(e: { peakMm: number; totalMm: number }): RainSeverity {
  if (e.peakMm >= 4 || e.totalMm >= 8) return "downpour";
  if (e.peakMm >= 1 || e.totalMm >= 2) return "rain";
  return "drizzle";
}

/**
 * Is an episode worth telling anyone about?
 *
 * Separate question from WET_HOUR_MM, which only decides what counts as a wet
 * hour when measuring an episode's extent. On 2026-08-02 the watch fired at
 * 01:05 for "0.1mm peak, 0.1mm total" at 08:00 — one hour at exactly the floor,
 * six hours out. A 1am notification about a tenth of a millimetre is how a
 * watch gets muted.
 *
 * Tuned twice on 2026-08-02. First the floor was one wet hour (0.1mm), which
 * fired at 01:05 over a tenth of a millimetre. Raising it to 0.3mm total was
 * still too low: Sunday was persistent light drizzle, each dry hour split the
 * day into a fresh episode, and the watch fired THREE times in twelve hours. I
 * relayed none of them — the tell that the bar was wrong, not that judgement
 * was needed three times.
 *
 * So it now defers to rainSeverity: drizzle never alerts, rain and downpour do.
 * That matches the runbook line that a drizzle is usually not worth changing
 * plans for, and keeps ONE definition of "how bad is this" instead of two.
 */
export function alertWorthy(e: { peakMm: number; totalMm: number }): boolean {
  return rainSeverity(e) !== "drizzle";
}

/** A materially wetter revision is worth re-sending; a small one is not. */
const MATERIAL_WORSE_MM = 1;

interface RainAlerted {
  from: string;
  until?: string;
  peakMm: number;
}

type RainState = Record<string, RainAlerted>;

function isSameEpisode(e: RainEpisodeInfo, last: RainAlerted | undefined): boolean {
  if (!last) return false;
  return new Date(e.from).getTime() <= new Date(last.until ?? last.from).getTime();
}

export interface RainTickIo {
  log: (s: string) => void;
  hours: () => Promise<RainHour[]>;
  readState: () => RainState;
  writeState: (s: RainState) => void;
  now: () => Date;
}

/** One tick. Prints nothing unless rain is newly imminent or has got worse. */
export async function runRainTickWith(io: RainTickIo): Promise<void> {
  let hours: RainHour[];
  try {
    hours = await io.hours();
  } catch {
    // The retry layer already rides out Open-Meteo's 503s; the next tick is 20
    // minutes away and a flaky forecast is not worth waking anyone over.
    return;
  }

  const now = io.now();
  const ep = rainEpisode(hours, now, RAIN_LOOKAHEAD_HOURS);
  if (!ep || !alertWorthy(ep)) return;

  const state = io.readState();
  const prev = state.crew;
  if (isSameEpisode(ep, prev) && ep.peakMm < (prev?.peakMm ?? Infinity) + MATERIAL_WORSE_MM) return;

  const mins = Math.round((new Date(ep.from).getTime() - now.getTime()) / 60_000);
  io.log(
    `RAIN WARNING (${ACTIVE_FESTIVAL}): ${rainSeverity(ep)} from ${ep.from} until ${ep.until} — ` +
      `${ep.peakMm}mm peak hour, ${ep.totalMm}mm total, starts in ~${mins}min`,
  );
  state.crew = { from: ep.from, until: ep.until, peakMm: ep.peakMm };
  io.writeState(state);
}

export async function runRainTick(): Promise<void> {
  const stateFile = join(cacheDir(ACTIVE_FESTIVAL), "rain_alert_state.json");
  const { loadRuntime } = await import("./runtime.js");
  const { loadActiveFestival } = await import("./festivals.js");
  const rt = await loadRuntime(loadActiveFestival());
  const weather = rt.module.sources.weather;
  if (!weather) return;

  await runRainTickWith({
    log: (s) => console.log(s),
    hours: async () => {
      const hs = await weather.hourly(RAIN_LOOKAHEAD_HOURS + 4);
      return hs.map((h) => ({ time: h.time, precipMm: h.precipMm, precipProbPct: h.precipProbPct }));
    },
    readState: () => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {}),
    writeState: (s) => writeFileSync(stateFile, JSON.stringify(s, null, 2) + "\n"),
    now: () => new Date(),
  });
}
