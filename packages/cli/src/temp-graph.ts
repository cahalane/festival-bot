/**
 * Labelled hourly temperature graph for the current day's card row.
 *
 * Operator request, 2026-07-31, with a Forecaster app screenshot: "replace the
 * temp with a labelled graph like the Forecaster app does", for the current
 * day. The min/max bar answers "how cold does it get"; it cannot answer "how
 * cold is it when I walk back at 3am", which is the question people actually
 * have.
 *
 * The reference design is a smooth line, a labelled dot every few hours, and a
 * time axis underneath. Two departures from labelling purely on an interval:
 * the day's coldest AND warmest hours are always labelled, because the overnight
 * low is the number people pack against and it must never be the one dot without
 * a figure on it.
 */

export interface GraphHour {
  /** ISO local, e.g. 2026-07-31T03:00 */
  time: string;
  tempC: number;
}

export interface GraphPoint {
  x: number;
  y: number;
  tempC: number;
  /** "03:00" */
  hour: string;
  /** Should this dot carry a printed figure? */
  labelled: boolean;
}

export interface GraphTick {
  x: number;
  label: string;
}

export interface TempGraph {
  points: GraphPoint[];
  ticks: GraphTick[];
  /** SVG path through every point. */
  path: string;
  minC: number;
  maxC: number;
}

/** Catmull-Rom through the points, emitted as cubic beziers. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  const r = (n: number): string => (Math.round(n * 100) / 100).toString();
  if (pts.length === 1) return `M${r(pts[0]!.x)},${r(pts[0]!.y)}`;

  let d = `M${r(pts[0]!.x)},${r(pts[0]!.y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    // Tension 1/6 keeps it visibly curved without overshooting a sharp dawn dip
    // into temperatures the day never actually reached.
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(p2.x)},${r(p2.y)}`;
  }
  return d;
}

/**
 * The next `hoursAhead` hours from `now`, inclusive of the hour in progress.
 *
 * Operator ask, 2026-07-31: "make the graph from time of card render to 24h
 * ahead". A calendar-day graph is mostly history by mid-afternoon; a rolling
 * window is entirely actionable and crosses midnight, which is where the cold
 * lives.
 *
 * The series carries festival-local ISO WITHOUT an offset, so it is compared as
 * local wall-clock text rather than parsed as UTC.
 */
export function rollingWindow<T extends { time: string }>(
  hours: T[],
  now: Date,
  hoursAhead: number,
  tz = "Europe/Dublin",
): T[] {
  if (!hours.length) return [];
  const local = (d: Date): string => {
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
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:00`;
  };
  const from = local(now);
  const to = local(new Date(now.getTime() + hoursAhead * 3_600_000));
  return hours.filter((h) => h.time >= from && h.time <= to);
}

export function tempGraphGeometry(
  hours: GraphHour[],
  opts: {
    width: number;
    height: number;
    labelEvery?: number;
    tickEvery?: number;
    /** Minimum px between two printed figures before one is dropped. */
    minLabelGapPx?: number;
  },
): TempGraph {
  if (!hours.length) return { points: [], ticks: [], path: "", minC: 0, maxC: 0 };

  const labelEvery = opts.labelEvery ?? 3;
  const tickEvery = opts.tickEvery ?? 3;
  const temps = hours.map((h) => h.tempC);
  const minC = Math.min(...temps);
  const maxC = Math.max(...temps);
  // A flat day has zero range; without this the scale divides by zero and every
  // point lands at NaN.
  const range = maxC - minC || 1;

  const coldestIdx = temps.indexOf(minC);
  const warmestIdx = temps.indexOf(maxC);
  const step = hours.length > 1 ? opts.width / (hours.length - 1) : 0;
  // Leave headroom so a printed figure above the warmest dot is not clipped.
  const pad = opts.height * 0.18;

  const points: GraphPoint[] = hours.map((h, i) => ({
    x: i * step,
    y: pad + (1 - (h.tempC - minC) / range) * (opts.height - pad * 2),
    tempC: h.tempC,
    hour: h.time.slice(11, 16),
    labelled: i % labelEvery === 0 || i === coldestIdx || i === warmestIdx,
  }));

  // Prune collisions. The first rolling render printed "18°18°" at the left
  // edge: the 3-hourly interval labelled hour 0 while the warmest hour happened
  // to be hour 1. Extremes win, because the high and the overnight low are the
  // two figures anyone actually reads off this.
  const gap = opts.minLabelGapPx ?? 0;
  if (gap > 0) {
    // Coldest outranks warmest outranks a plain interval tick: the overnight low
    // is the figure people pack against, so it must survive a clash with a
    // daytime high that merely happens to sit beside it.
    const rank = (i: number): number => (i === coldestIdx ? 2 : i === warmestIdx ? 1 : 0);
    let lastLabelled = -Infinity;
    let lastIdx = -1;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (!p.labelled) continue;
      if (p.x - lastLabelled >= gap) {
        lastLabelled = p.x;
        lastIdx = i;
        continue;
      }
      if (lastIdx >= 0 && rank(i) > rank(lastIdx)) {
        points[lastIdx]!.labelled = false;
        lastLabelled = p.x;
        lastIdx = i;
      } else {
        p.labelled = false;
      }
    }
  }

  const ticks: GraphTick[] = hours
    .map((h, i) => ({ i, h }))
    .filter(({ i }) => i % tickEvery === 0)
    .map(({ i, h }) => ({ x: i * step, label: h.time.slice(11, 16) }));

  return { points, ticks, path: smoothPath(points), minC, maxC };
}
