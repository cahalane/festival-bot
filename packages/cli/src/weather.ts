/**
 * `weather` — festival-window forecast summary.
 *
 * The Open-Meteo adapter (packages/adapters/src/weather.ts) has existed since the
 * AccuWeather MCP was dropped, but nothing exposed it on the CLI. This is that
 * surface: pull the daily forecast, mark which rows fall inside the festival, and
 * call out the two things that actually change plans — the wettest day (ponchos,
 * arrival timing) and the coldest night (the 3am walk back to the tent).
 *
 * Rendering is pure over `WeatherDaily[]`, so it is unit-testable without HTTP.
 */
import type { WeatherDaily } from "@festival-bot/core";
import { esc, writeCardPng } from "./card.js";
import { tempGraphGeometry, rollingWindow } from "./temp-graph.js";

export interface WeatherRow extends WeatherDaily {
  /** Human label, e.g. "Thu 30 Jul". */
  label: string;
  isFestivalDay: boolean;
}

export interface WeatherReport {
  rows: WeatherRow[];
  /** True if the forecast horizon actually reaches at least one festival day. */
  coversFestival: boolean;
  /** Wettest festival day, or null if the festival window is dry / uncovered. */
  wettest: WeatherRow | null;
  /** Festival day with the lowest overnight minimum, or null if uncovered. */
  coldestNight: WeatherRow | null;
  /**
   * The morning AFTER the last act — pack-up and travel home. A user asked for it
   * (2026-07-26) and rightly so: at a camping festival the crew are still on site
   * striking tents, so that half-day is weather they actually stand in.
   */
  getaway: WeatherRow | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Day after the last festival date, as YYYY-MM-DD. Null if there are no dates. */
export function getawayDate(festivalDates: string[]): string | null {
  if (!festivalDates.length) return null;
  const last = [...festivalDates].sort().at(-1)!;
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Hours of the getaway morning worth showing: midnight to midday inclusive. */
export const GETAWAY_LAST_HOUR = 12;

/** "2026-07-30" -> "Thu 30 Jul". Parsed as UTC so the machine TZ can't shift the day. */
export function labelForDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * The night a given day's minimum belongs to.
 *
 * A daily minimum lands at DAWN, so calling it by its own calendar date points
 * the reader at the wrong night: the card labelled 5.5C at 06:00 on Saturday as
 * "Sat 1 Aug", which everyone reasonably read as Saturday night — when Saturday
 * evening was 13.7C (caught by the operator, 2026-07-31). Naming the night removes the
 * ambiguity in the one place people act on it.
 */
export function nightLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${labelForDate(d.toISOString().slice(0, 10))} night`;
}

/** Manifest `days` (`{ thu: [2026, 7, 30], … }`) -> ISO dates the forecast is keyed by. */
export function festivalDates(days: Record<string, readonly [number, number, number]>): string[] {
  return Object.values(days).map(
    ([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  );
}

/**
 * Coldest night STILL TO COME.
 *
 * The Sat 09:00 card said "coldest night: Fri 31 Jul night" — a night the crew
 * had already slept through, while that evening's real low went unmentioned.
 * A minimum they have survived is not a number to pack against.
 *
 * The subtlety that made the first fix wrong: a row's minimum lands at ITS
 * dawn, so the 1 Aug row describes FRIDAY night. Filtering `date >= today`
 * therefore still returns the night just gone — it has to be `> today`. Falls
 * back to the last night rather than going empty on the final day.
 */
function coldestAhead(rows: WeatherRow[], today?: string): WeatherRow | null {
  if (!rows.length) return null;
  const ahead = today ? rows.filter((r) => r.date > today) : rows;
  const pool = ahead.length ? ahead : rows.slice(-1);
  return pool.reduce((a, b) => (b.tempMinC < a.tempMinC ? b : a));
}

export function buildWeatherReport(
  daily: WeatherDaily[],
  festivalDates: string[],
  opts: { today?: string } = {},
): WeatherReport {
  const festival = new Set(festivalDates);
  const rows: WeatherRow[] = daily.map((d) => ({
    ...d,
    label: labelForDate(d.date),
    isFestivalDay: festival.has(d.date),
  }));

  const festivalRows = rows.filter((r) => r.isFestivalDay);
  const wet = festivalRows.filter((r) => r.precipMm > 0);

  const getawayIso = getawayDate(festivalDates);

  return {
    rows,
    getaway: (getawayIso && rows.find((r) => r.date === getawayIso)) || null,
    coversFestival: festivalRows.length > 0,
    wettest: wet.length ? wet.reduce((a, b) => (b.precipMm > a.precipMm ? b : a)) : null,
    // The pack-up morning is a candidate: on the LAST festival day its dawn IS
    // tonight, and without it the callout falls back to the night just gone.
    coldestNight: coldestAhead(
      [...festivalRows, ...(getawayIso ? rows.filter((r) => r.date === getawayIso) : [])],
      opts.today,
    ),
  };
}

export interface CardCommentary {
  headline: string;
  standfirst: string;
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];

const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);

/** A festival day is "wet" once it carries enough rain to change what you pack. */
const WET_DAY_MM = 1;

/** Night/day spread (deg C) at which the cold, not the rain, is the story. */
const COLD_NIGHT_SPREAD = 10;

/**
 * Absolute overnight low (deg C) below which a night counts as cold. Spread alone
 * is not enough: 28C days over 18C nights clear the spread threshold but nobody
 * shivers in an 18C tent, and the card would have called that "cold at night".
 */
const COLD_NIGHT_MAX = 12;

/**
 * The card's headline and standfirst, DERIVED from the forecast.
 *
 * These were hardcoded prose, written by hand against one particular forecast and
 * then rendered unattended every day after — so the card would have gone on
 * announcing a "mild and mostly dry" weekend through a washout. Anything the card
 * says about the weather now has to come out of the numbers it is drawing.
 */
export function cardCommentary(
  report: WeatherReport,
  /**
   * How much rain a day carries. Defaults to the daily endpoint's total, but the
   * card passes its hourly sum: the two genuinely disagree, and every rainfall
   * figure on one card must come from the same measure or the standfirst ends up
   * quoting 7.9mm above a callout reading 10.0mm for the same day.
   */
  mmFor: (row: WeatherRow) => number = (r) => r.precipMm,
): CardCommentary {
  const days = report.rows.filter((r) => r.isFestivalDay);
  if (!report.coversFestival) {
    return {
      headline: "The forecast does not reach the festival yet",
      standfirst:
        "Open-Meteo only forecasts about 16 days ahead. This card fills in as the festival comes inside that window.",
    };
  }

  const wet = days.filter((r) => mmFor(r) >= WET_DAY_MM);
  const high = Math.max(...days.map((r) => r.tempMaxC));
  const low = Math.min(...days.map((r) => r.tempMinC));
  const spread = high - low;
  const n = countWord(days.length);
  // By the final morning there is exactly one festival day left, and every
  // headline template assumed a plural: Sunday's card led with "One days, one
  // of them wet".
  const dayWord = days.length === 1 ? "day" : "days";

  const headline =
    days.length === 1
      ? wet.length
        ? `Last day, and it's the wet one`
        : `Last day, and it's dry`
      : wet.length >= 2
        ? `${n} ${dayWord}, and rain on ${countWord(wet.length).toLowerCase()} of them`
        : wet.length === 1
          ? `${n} ${dayWord}, one of them wet`
          : spread >= COLD_NIGHT_SPREAD && low <= COLD_NIGHT_MAX
            ? `${n} ${dayWord}, and the cold comes at night`
            : `${n} ${dayWord}, and the nights stay mild`;

  const wettest = wet.length ? wet.reduce((a, b) => (mmFor(b) > mmFor(a) ? b : a)) : null;
  const rain = wettest
    ? `The wet day is ${wettest.label} (${mmFor(wettest).toFixed(1)}mm).`
    : "No measurable rain forecast across the festival days.";

  return {
    headline,
    standfirst: `Highs around ${high.toFixed(0)}°C, nights down to ${low.toFixed(1)}°C. ${rain}`,
  };
}

/**
 * May the hourly series be drawn alongside the daily rows?
 *
 * Only when both came from the same generation of data. On 2026-07-28 the hourly
 * fetch 503'd, fell back to a 24-hour-old cache, and the card rendered today's
 * temperatures against yesterday's rain — a "Sun 2 Aug 10.0mm" headline on a day
 * the fresh daily data called dry. A card mixing two forecast runs is worse than
 * a stale card: every figure on it looks current and they contradict each other.
 */
export function shouldUseHourly(o: { dailyStale: boolean; hourlyStale: boolean }): boolean {
  return o.dailyStale === o.hourlyStale;
}

export interface TempAxis {
  min: number;
  max: number;
}

/**
 * Where a day's low->high bar sits on the card's SHARED temperature axis.
 * Shared is the whole point: scaling each bar to its own range would hide the
 * signal that actually matters (a colder night reaching further left).
 */
export function tempBarGeometry(
  day: { tempMinC: number; tempMaxC: number },
  axis: TempAxis,
): { leftPct: number; widthPct: number } {
  const span = axis.max - axis.min;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const left = clamp(((day.tempMinC - axis.min) / span) * 100);
  const right = clamp(((day.tempMaxC - axis.min) / span) * 100);
  return { leftPct: left, widthPct: Math.max(0, right - left) };
}

/** Axis wide enough for the data, snapped outward to whole degrees. */
export function axisFor(rows: WeatherRow[]): TempAxis {
  const lows = rows.map((r) => r.tempMinC);
  const highs = rows.map((r) => r.tempMaxC);
  return {
    min: Math.floor(Math.min(...lows) - 1),
    max: Math.ceil(Math.max(...highs) + 1),
  };
}

/** One hour of the forecast, reduced to what the card plots. */
export interface GateHour {
  hour: number;
  tempC: number;
  precipMm: number;
  precipProbPct: number;
  cloudCoverPct?: number;
  /** True for camping-night hours (23:00-08:00) — occupied, but in a tent. */
  isNight?: boolean;
}

/**
 * ATN is a CAMPING festival: the site is occupied 24 hours, so there is no window
 * of "irrelevant" weather (operator note, 2026-07-26). Overnight conditions matter MORE
 * than daytime ones, not less — rain at 4am lands on tents, and here it lands on
 * tents in 8.5C. So the card plots the whole day and distinguishes night rather
 * than discarding it.
 */
const NIGHT_FROM = 23;
const NIGHT_TO = 8;

const isNightHour = (hour: number): boolean => hour >= NIGHT_FROM || hour < NIGHT_TO;

/** Every forecast hour of `date`, tagged with whether it is a camping-night hour. */
export function dayHours(
  hourly: {
    time: string;
    tempC: number;
    precipMm: number;
    precipProbPct: number;
    cloudCoverPct?: number;
  }[],
  date: string,
): GateHour[] {
  return hourly
    .filter((h) => h.time.startsWith(date))
    .map((h) => {
      const hour = Number(h.time.slice(11, 13));
      return {
        hour,
        tempC: h.tempC,
        precipMm: h.precipMm,
        precipProbPct: h.precipProbPct,
        cloudCoverPct: h.cloudCoverPct,
        isNight: isNightHour(hour),
      };
    });
}

/**
 * Rain falling on the tents during the night that STARTS on `date` — 23:00 through
 * to 08:00 the following morning. Deliberately spans midnight: a night is one
 * continuous experience in a tent, not two calendar days.
 */
export function overnightRain(
  hourly: { time: string; tempC: number; precipMm: number; precipProbPct: number }[],
  date: string,
): { mm: number; peakProbPct: number; minTempC: number | null } {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);

  const inNight = hourly.filter((h) => {
    const hour = Number(h.time.slice(11, 13));
    if (h.time.startsWith(date)) return hour >= NIGHT_FROM;
    if (h.time.startsWith(nextDate)) return hour < NIGHT_TO;
    return false;
  });

  const mm = inNight.reduce((a, h) => a + h.precipMm, 0);
  return {
    mm: Math.round(mm * 10) / 10,
    peakProbPct: inNight.reduce((a, h) => Math.max(a, h.precipProbPct), 0),
    minTempC: inNight.length ? Math.min(...inNight.map((h) => h.tempC)) : null,
  };
}

/**
 * Hourly rain volume -> a discrete intensity step (0 = none, 4 = heaviest).
 *
 * Discrete rather than a continuous gradient, following Forecaster's colour guide
 * (operator's reference, 2026-07-26): stepped bands stay readable at 24-bars-wide and,
 * crucially, can actually be explained in a legend. A smooth ramp cannot.
 * Thresholds are mm in a single hour.
 */
export function rainIntensityStep(mm: number): 0 | 1 | 2 | 3 | 4 {
  if (mm <= 0) return 0;
  if (mm < 0.2) return 1;
  if (mm < 0.5) return 2;
  if (mm < 1) return 3;
  return 4;
}

/** What one hour's sky looks like: dry conditions by cloud, or rain by volume. */
export type SkyStep = "clear" | "partly" | "cloudy" | "r1" | "r2" | "r3" | "r4";

/**
 * Fold cloud and rain into ONE scale, following Forecaster's colour guide (operator's
 * reference, 2026-07-26): rain outranks cloud, and dry hours split at 25% / 75%
 * cover into clear / partly cloudy / cloudy.
 *
 * Missing cloud data falls back to "cloudy" rather than "clear" — a source that
 * omits the field must never be rendered as sunshine we cannot vouch for.
 */
export function skyStep(precipMm: number, cloudPct: number | undefined): SkyStep {
  if (precipMm > 0) return `r${rainIntensityStep(precipMm)}` as SkyStep;
  if (cloudPct === undefined) return "cloudy";
  if (cloudPct < 25) return "clear";
  if (cloudPct < 75) return "partly";
  return "cloudy";
}

/** Legend bands, kept in step with skyStep. Sky first, then rain by mm/hour. */
const SKY_LEGEND: { step: SkyStep; label: string }[] = [
  { step: "clear", label: "clear" },
  { step: "partly", label: "part" },
  { step: "cloudy", label: "cloud" },
];
const INTENSITY_LEGEND: { step: SkyStep; label: string }[] = [
  { step: "r1", label: "<0.2" },
  { step: "r2", label: "0.2-0.5" },
  { step: "r3", label: "0.5-1" },
  { step: "r4", label: "1mm+" },
];

/**
 * Height of the rendered card for a given number of festival days. Chromium
 * screenshots a fixed window, so this has to be derived rather than guessed:
 * too tall leaves dead space under the content, too short clips the footer.
 * Constants match the CSS block below — change them together.
 */
export function cardHeightPx(dayCount: number): number {
  const CHROME = 308; // eyebrow + h1 + standfirst + top padding
  const ROW = 152; // day row (temp track + 24h strip) + gap
  const AXIS = 30;
  const NOTES = 220;
  const GATENOTE = 46;
  const LEGEND = 58;
  const FOOTER = 74;
  return CHROME + dayCount * ROW + AXIS + GATENOTE + LEGEND + NOTES + FOOTER;
}


const rainLabel = (r: WeatherRow): string =>
  r.precipMm < 1 ? "dry" : `${r.precipMm.toFixed(1)} mm`;

/**
 * Self-contained HTML for the shareable forecast card, sized for a phone screen
 * and screenshotted to PNG by `festplan weather --png`. Committed to a single
 * dark treatment: a PNG has no theme toggle, so there is nothing to respond to.
 */

/** Graph dimensions inside the card's middle column. */
const GRAPH_W = 560;
const GRAPH_H = 96;

/**
 * The current day's temperature as a labelled curve, in the style requested
 * (Forecaster app, 2026-07-31). Inline SVG — the card is screenshotted by
 * chromium, so there is no chart library and no external asset to fetch.
 */
function tempGraphSvg(hrs: { time: string; tempC: number }[]): string {
  const g = tempGraphGeometry(hrs, { width: GRAPH_W, height: GRAPH_H, labelEvery: 3, tickEvery: 3, minLabelGapPx: 46 });
  if (!g.points.length) return "";
  const dots = g.points
    .filter((p) => p.labelled)
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"/>` +
        `<text class="t" x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}">${Math.round(p.tempC)}&deg;</text>`,
    )
    .join("");
  const ticks = g.ticks
    .map((t) => `<text class="x" x="${t.x.toFixed(1)}" y="${GRAPH_H + 14}">${t.label}</text>`)
    .join("");
  return `<svg class="tgraph" viewBox="-18 0 ${GRAPH_W + 36} ${GRAPH_H + 22}" preserveAspectRatio="none">
      <path class="line" d="${g.path}"/>${dots}${ticks}
    </svg>`;
}

export function renderWeatherCardHtml(
  report: WeatherReport,
  festivalName: string,
  opts: {
    hourly?: {
      time: string;
      tempC: number;
      precipMm: number;
      precipProbPct: number;
      cloudCoverPct?: number;
    }[];
    /** ISO date of "today" — that row carries the labelled graph. */
    todayDate?: string;
    /**
     * Render instant. The graph spans from here to +24h rather than the
     * calendar day (operator note, 2026-07-31) — by mid-afternoon a day graph is mostly
     * history, and the rolling one crosses midnight where the cold is.
     */
    now?: Date;
  } = {},
): string {
  const days = report.rows.filter((r) => r.isFestivalDay);
  const hasHourly = Boolean(opts.hourly?.length);
  const axis = days.length ? axisFor(days) : { min: 8, max: 24 };

  const rows = days
    .map((r) => {
      const g = tempBarGeometry(r, axis);
      const [dayName, dayNum, mon] = r.label.split(" ");

      // Judge the day on the hours the site is OPEN, not the calendar total —
      // rain at 4am is not rain you stand in.
      const hrs = hasHourly ? dayHours(opts.hourly!, r.date) : [];
      // Honest full-day total: on a campsite there is no hour that does not count.
      const total = hrs.length ? Math.round(hrs.reduce((a, h) => a + h.precipMm, 0) * 10) / 10 : r.precipMm;
      const wet = total >= 1 ? " wet" : "";
      const label = total >= 0.1 ? `${total.toFixed(1)} mm` : "dry";
      const sub = `${r.precipProbPct}% peak`;

      const strip = hrs.length
        ? `<div class="hours">${hrs
            .map((h) => {
              // Two encodings on purpose (operator note, 2026-07-26): HEIGHT = chance of rain,
              // COLOUR = how much falls that hour. They can disagree — Thu 30 Jul is
              // 39%-but-0.00mm in the afternoon and 10%-but-0.3mm overnight — which is
              // real signal, not noise. It only misleads without a key, so the card
              // now carries one.
              return `<span class="hr ${skyStep(h.precipMm, h.cloudCoverPct)}" style="--p:${Math.max(5, h.precipProbPct)}%">${
                h.hour % 6 === 0 ? `<i>${h.hour}</i>` : ""
              }</span>`;
            })
            .join("")}</div>`
        : "";
      // TODAY gets a labelled hourly graph instead of the min/max bar (operator note,
      // 2026-07-31, per the Forecaster app). The bar answers "how cold does it
      // get"; only the curve answers "how cold is it when I walk back at 3am".
      const isToday = opts.todayDate === r.date;
      const graphHrs = isToday && hasHourly
        ? rollingWindow(opts.hourly!, opts.now ?? new Date(), 24)
        : [];
      const temperature = graphHrs.length > 1
        ? tempGraphSvg(graphHrs)
        : `<div class="track" style="--l:${g.leftPct.toFixed(1)}%; --w:${g.widthPct.toFixed(1)}%">
            <div class="bar"></div>
            <div class="lo">${r.tempMinC.toFixed(1)}&deg;</div>
            <div class="hi">${r.tempMaxC.toFixed(1)}&deg;</div>
          </div>`;
      return `
      <div class="day${graphHrs.length > 1 ? " today" : ""}">
        <div class="name">${esc(dayName!)} ${esc(dayNum!)}<span>${esc(mon!)}</span></div>
        <div class="mid">
          ${temperature}
          ${strip}
        </div>
        <div class="rain${wet}"><b>${label}</b><i>${sub}</i></div>
      </div>`;
    })
    .join("");

  // Pack-up morning: same encoding, truncated at midday, visually secondary to the
  // festival days without being dimmed into irrelevance.
  const g = report.getaway;
  const gHours = g && hasHourly ? dayHours(opts.hourly!, g.date).filter((h) => h.hour <= GETAWAY_LAST_HOUR) : [];
  const getawayRow = g
    ? `<div class="day getaway">
         <div class="name">${esc(g.label.split(" ").slice(0, 2).join(" "))}<span>pack-up</span></div>
         <div class="mid">
           <div class="track" style="--l:${tempBarGeometry(g, axis).leftPct.toFixed(1)}%; --w:${tempBarGeometry(g, axis).widthPct.toFixed(1)}%">
             <div class="bar"></div>
             <div class="lo">${g.tempMinC.toFixed(1)}&deg;</div>
             <div class="hi">${g.tempMaxC.toFixed(1)}&deg;</div>
           </div>
           ${
             gHours.length
               ? `<div class="hours partial">${gHours
                   .map(
                     (h) =>
                       `<span class="hr ${skyStep(h.precipMm, h.cloudCoverPct)}" style="--p:${Math.max(
                         5,
                         h.precipProbPct,
                       )}%">${h.hour % 6 === 0 ? `<i>${h.hour}</i>` : ""}</span>`,
                   )
                   .join("")}<span class="tomidday">to midday</span></div>`
               : ""
           }
         </div>
         <div class="rain"><b>${
           gHours.reduce((a, h) => a + h.precipMm, 0) >= 0.1
             ? `${gHours.reduce((a, h) => a + h.precipMm, 0).toFixed(1)} mm`
             : "dry"
         }</b><i>${g.precipProbPct}% peak</i></div>
       </div>`
    : "";

  const cold = report.coldestNight;
  // Derive the wettest day from the SAME numbers the rows show. Mixing the daily
  // endpoint's total with the hourly sum put "1.8 mm" in a row and "2.3 mm" in the
  // callout for the same day — the card must not contradict itself.
  const dayTotal = (r: WeatherRow): number =>
    hasHourly
      ? Math.round(dayHours(opts.hourly!, r.date).reduce((a, h) => a + h.precipMm, 0) * 10) / 10
      : r.precipMm;
  // Derived from the same dayTotal the rows and callouts use, so the headline
  // cannot disagree with the figures printed underneath it.
  const commentary = cardCommentary(report, dayTotal);
  const wetDays = days.filter((r) => dayTotal(r) >= 0.1);
  const wettest = wetDays.length
    ? wetDays.reduce((a, b) => (dayTotal(b) > dayTotal(a) ? b : a))
    : null;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width: 1000px; background:#161D1A; color:#E7EBE5;
    font-family: ui-sans-serif, system-ui, "DejaVu Sans", sans-serif;
    padding: 54px 58px 44px;
  }
  .eyebrow { font-size:15px; letter-spacing:.16em; text-transform:uppercase; color:#8B978F; }
  h1 { font-family: Georgia,"DejaVu Serif",serif; font-weight:400; font-size:50px;
       line-height:1.06; margin:16px 0 14px; letter-spacing:-.01em; }
  .sub { font-size:20px; color:#9AA69E; max-width:30em; line-height:1.5; }
  .sub b { color:#E7EBE5; font-weight:600; }
  .days { margin:38px 0 10px; display:flex; flex-direction:column; gap:10px; }
  .day { display:grid; grid-template-columns:140px 1fr 150px; align-items:center;
         gap:26px; background:#1D2622; border-left:4px solid #D9A244;
         border-radius:4px; padding:18px 22px; }
  .name { font-family:Georgia,"DejaVu Serif",serif; font-size:27px; line-height:1.1; }
  .name span { display:block; font-family:inherit; font-size:14px; letter-spacing:.12em;
               text-transform:uppercase; color:#D9A244; margin-top:3px; }
  .mid { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .track { position:relative; height:46px; }
  .track::before { content:""; position:absolute; left:0; right:0; bottom:0; height:1px; background:#2C3833; }
  .bar { position:absolute; top:6px; left:var(--l); width:var(--w); height:12px;
         border-radius:99px; background:linear-gradient(90deg,#78A6BD,#D9A244); }
  .lo,.hi { position:absolute; top:24px; font-size:17px;
            font-variant-numeric:tabular-nums; font-family:ui-monospace,"DejaVu Sans Mono",monospace; }
  .lo { left:var(--l); transform:translateX(-50%); color:#78A6BD; font-weight:700; }
  .hi { left:calc(var(--l) + var(--w)); transform:translateX(-50%); color:#9AA69E; }
  .rain { text-align:right; font-family:ui-monospace,"DejaVu Sans Mono",monospace;
          font-variant-numeric:tabular-nums; }
  .rain b { display:block; font-size:22px; color:#77837B; font-weight:700; }
  .rain i { font-style:normal; font-size:15px; color:#77837B; }
  .rain.wet b, .rain.wet i { color:#5E939D; }
  .hours { display:flex; gap:3px; align-items:flex-end; height:54px; padding-bottom:15px; }
  .hourcap { font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:#6E7A73; }
  .hr { position:relative; flex:1; height:var(--p); min-height:3px; background:#3A4A43;
        border-radius:2px 2px 0 0; }
  .hr.clear  { background:#D9A244; }
  .hr.partly { background:#9AA69E; }
  .hr.cloudy { background:#5C6862; }
  .hr.r1 { background:#46707F; }
  .hr.r2 { background:#4C93AC; }
  .hr.r3 { background:#42AEDC; }
  .hr.r4 { background:#2E9BEF; }
  .day.getaway { border-left-color:#5C6862; }
  .day.getaway .name span { color:#8B978F; }
  .hours.partial { width:54%; }
  .tomidday { align-self:flex-end; margin-left:10px; font-size:12px; color:#6E7A73;
              white-space:nowrap; font-family:ui-monospace,"DejaVu Sans Mono",monospace; }
  .legend { display:flex; align-items:center; gap:22px; flex-wrap:wrap;
            margin-top:16px; font-size:15px; color:#8B978F; }
  .legend .key { display:flex; align-items:center; gap:8px; }
  .legend .ramp { display:flex; gap:6px; align-items:flex-end; }
  .legend .band { display:flex; flex-direction:column; align-items:stretch; gap:4px; }
  .legend .band i { font-style:normal; font-size:12px; color:#6E7A73; white-space:nowrap;
                    text-align:center; font-family:ui-monospace,"DejaVu Sans Mono",monospace; }
  /* span is inline by default — without display:block the swatches have no box
     and render as nothing at all. */
  .legend .sw { display:block; min-width:38px; height:12px; border-radius:2px; }
  .sw.clear  { background:#D9A244; }
  .sw.partly { background:#9AA69E; }
  .sw.cloudy { background:#5C6862; }
  .sw.r1 { background:#46707F; }
  .sw.r2 { background:#4C93AC; }
  .sw.r3 { background:#42AEDC; }
  .sw.r4 { background:#2E9BEF; }
  .legend .unit { font-size:12px; color:#6E7A73;
                  font-family:ui-monospace,"DejaVu Sans Mono",monospace; }
  .legend .hgt { display:flex; gap:3px; align-items:flex-end; height:20px; }
  .legend .hgt span { width:7px; background:#7C8A83; border-radius:2px 2px 0 0; }
  .legend b { color:#B9C4BC; font-weight:600; }

  .hr i { position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:1px;
          font-style:normal; font-size:11px; color:#5C6862;
          font-family:ui-monospace,"DejaVu Sans Mono",monospace; }
  .gatenote b { color:#B9C4BC; font-weight:600; }
  .gatenote { font-size:15px; color:#8B978F; line-height:1.45; margin-top:14px; max-width:62em; }
  .axis { display:flex; justify-content:space-between; font-size:14px; color:#6E7A73;
          font-family:ui-monospace,"DejaVu Sans Mono",monospace;
          padding:6px 176px 0 188px; }
  .notes { display:flex; gap:14px; margin-top:30px; }
  .note { flex:1; background:#1D2622; border-top:3px solid #2C3833; border-radius:4px; padding:20px 22px; }
  /* Literal hex, NOT var(--…): this card defines no custom properties, so the
     first cut silently drew nothing — an unresolved var leaves stroke unset. */
  .tgraph { width:100%; height:132px; overflow:visible; display:block; }
  .tgraph .line { fill:none; stroke:#D9A244; stroke-width:2.5; stroke-linecap:round;
                  stroke-linejoin:round; vector-effect:non-scaling-stroke; }
  .tgraph circle { fill:#1D2622; stroke:#D9A244; stroke-width:2.5; vector-effect:non-scaling-stroke; }
  .tgraph .t { fill:#E8EDE9; font:600 15px "DejaVu Sans",system-ui,sans-serif; text-anchor:middle; }
  .tgraph .x { fill:#6E7A73; font:400 13px "DejaVu Sans Mono",monospace; text-anchor:middle; }
  .note.cold { border-top-color:#78A6BD; }
  .note.damp { border-top-color:#5E939D; }
  .note h3 { font-size:14px; letter-spacing:.13em; text-transform:uppercase;
             color:#8B978F; font-weight:600; }
  .note .fig { font-family:Georgia,"DejaVu Serif",serif; font-size:38px; margin:8px 0 6px;
               font-variant-numeric:tabular-nums; }
  .note.cold .fig { color:#78A6BD; }
  .note.damp .fig { color:#5E939D; }
  .note p { font-size:17px; color:#9AA69E; line-height:1.45; }
  footer { margin-top:32px; padding-top:18px; border-top:1px solid #2C3833;
           font-size:15px; color:#6E7A73; line-height:1.5; }
</style></head><body>
  <div class="eyebrow">${esc(festivalName)} &middot; Curraghmore Estate</div>
  <h1>${esc(commentary.headline)}</h1>
  <p class="sub">${esc(commentary.standfirst)}</p>
  <div class="days">${rows}${getawayRow}</div>
  <div class="axis"><span>${axis.min}&deg;C</span><span>${axis.max}&deg;C</span></div>
  ${
    hasHourly
      ? (() => {
          const nights = days
            .map((r) => ({ label: r.label, ...overnightRain(opts.hourly!, r.date) }))
            .filter((n) => n.mm >= 0.2);
          const coldest = days
            .map((r) => overnightRain(opts.hourly!, r.date))
            .filter((n) => n.minTempC !== null);
          const low = coldest.length ? Math.min(...coldest.map((n) => n.minTempC!)) : null;
          if (!nights.length) {
            return `<p class="gatenote">Strips run the full 24 hours, pack-up morning to midday. Every night dry on the tents${
              low !== null ? `, bottoming out around ${low.toFixed(1)}&deg;C` : ""
            }.</p>`;
          }
          return `<p class="gatenote">Strips run the full 24 hours, pack-up morning to midday. Rain on the tents overnight: ${esc(
              nights.map((n) => `${n.label} night ${n.mm.toFixed(1)}mm`).join(", "),
            )}${low !== null ? `, coldest around ${low.toFixed(1)}&deg;C` : ""}.</p>`;
        })()
      : ""
  }
  ${
    hasHourly
      ? `<div class="legend">
           <span class="key"><b>Height</b> = chance of rain
             <span class="hgt"><span style="height:25%"></span><span style="height:55%"></span><span style="height:100%"></span></span>
           </span>
           <span class="key"><b>Colour</b> = sky
             <span class="ramp">${SKY_LEGEND.map(
               (l) => `<span class="band"><span class="sw ${l.step}"></span><i>${esc(l.label)}</i></span>`,
             ).join("")}</span>
           </span>
           <span class="key">or rain
             <span class="ramp">${INTENSITY_LEGEND.map(
               (l) => `<span class="band"><span class="sw ${l.step}"></span><i>${esc(l.label)}</i></span>`,
             ).join("")}</span>
             <span class="unit">mm/hr</span>
           </span>
         </div>`
      : ""
  }
  <div class="notes">
    ${
      cold
        ? `<div class="note cold"><h3>Coldest night</h3><div class="fig">${cold.tempMinC.toFixed(1)}&deg;C</div>
           <p>${esc(nightLabel(cold.date))}, bottoming out around dawn &mdash; the lowest overnight temperature across the festival days. This is the number to pack a sleeping bag against.</p></div>`
        : ""
    }
    ${
      wettest
        ? `<div class="note damp"><h3>Wettest day</h3><div class="fig">${dayTotal(wettest).toFixed(1)} mm</div>
           <p>${esc(wettest.label)} &mdash; ${dayTotal(wettest) < 4 ? "drizzle rather than a washout" : "the one genuinely wet day"}, at ${wettest.precipProbPct}% chance.</p></div>`
        : `<div class="note damp"><h3>Rain</h3><div class="fig">None</div>
           <p>No measurable rain forecast across the festival days.</p></div>`
    }
  </div>
  <footer>Bars span each day&rsquo;s low to high on a shared ${axis.min}&ndash;${axis.max}&deg;C axis.
    Open-Meteo forecast only &mdash; no on-the-ground observation, and the grid point sits
    about 10&thinsp;km from the estate. Days this far out still move between runs.</footer>
</body></html>`;
}

export function renderWeatherReport(
  report: WeatherReport,
  festivalName: string,
  opts: { stale?: boolean } = {},
): string {
  const lines: string[] = [`${festivalName} — forecast`, ""];

  // Never present cache-served data as current: the standing rule after the
  // 2026-05-27 Clashfinder outage is to SAY when a plan is built on stale data.
  if (opts.stale) {
    lines.push(
      "!! STALE — the forecast API was unreachable; this is the last cached pull, not a current forecast.",
      "",
    );
  }

  for (const r of report.rows) {
    const mark = r.isFestivalDay ? "*" : " ";
    lines.push(
      `${mark} ${r.label.padEnd(10)} ${r.tempMaxC.toFixed(1).padStart(5)} / ${r.tempMinC
        .toFixed(1)
        .padStart(5)} C   ${r.precipMm.toFixed(1).padStart(5)} mm   ${String(r.precipProbPct).padStart(3)}%`,
    );
  }

  lines.push("");
  if (!report.coversFestival) {
    lines.push("forecast does not reach the festival window yet — check again nearer the time.");
    return lines.join("\n");
  }

  lines.push(
    report.wettest
      ? `wettest festival day: ${report.wettest.label} (${report.wettest.precipMm.toFixed(1)} mm, ${report.wettest.precipProbPct}%)`
      : "wettest festival day: none — the whole window is dry.",
  );
  if (report.coldestNight) {
    lines.push(
      `coldest night: ${nightLabel(report.coldestNight.date)} (min at dawn) down to ${report.coldestNight.tempMinC.toFixed(1)} C`,
    );
  }
  lines.push("");
  lines.push("(* = festival day. Forecast only — no on-the-ground observation.)");

  return lines.join("\n");
}

/**
 * Screenshot the weather card. The chromium plumbing now lives in `card.ts`,
 * shared with the route card; this stays as the weather-facing name.
 */
export function writeWeatherCardPng(html: string, outFile: string, heightPx: number): void {
  writeCardPng(html, outFile, heightPx);
}
