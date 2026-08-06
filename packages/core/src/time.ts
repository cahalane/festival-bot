/**
 * Festival-agnostic time handling.
 *
 * A festival defines its own timezone, a day-cutoff hour (a "day" runs
 * cutoff->cutoff next morning, so post-midnight sets group with the right
 * evening), and a map of day-name -> calendar date. All wall-clock parsing is
 * done in the festival's timezone; the rest of the engine works in absolute
 * instants (JS Date), so it is timezone-neutral.
 *
 * Timezone math is dependency-free via Intl (no luxon/moment). Accurate outside
 * the ~1h DST-transition window, which festival set times never fall in.
 */

export interface FestivalCalendar {
  /** IANA timezone, e.g. "Europe/Madrid". */
  timezone: string;
  /** Hour (0-23) at which one festival "day" ends and the next begins. */
  dayCutoffHour: number;
  /** Day name (lowercase, matched by 3-letter prefix) -> [year, month(1-12), day]. */
  days: Record<string, readonly [number, number, number]>;
}

/** Offset (ms) of `tz` from UTC at instant `at`. Positive = east of UTC. */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(at)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const asUTC = Date.UTC(
    map.year!,
    map.month! - 1,
    map.day!,
    map.hour! % 24,
    map.minute!,
    map.second!,
  );
  return asUTC - at.getTime();
}

/** Convert a wall-clock time in `tz` to the absolute UTC instant. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // One correction pass resolves the offset for the instant in question.
  const off = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - off);
}

function dayKey(name: string): string {
  return name.trim().toLowerCase().slice(0, 3);
}

/**
 * Parse a festival time. Accepts:
 *   - "Thu 22:00" / "sat 01:30": night-relative — hours before the day-cutoff
 *     roll into the next calendar morning.
 *   - ISO-8601: with offset honoured as-is; without offset, interpreted as
 *     festival-timezone wall-clock.
 */
export function parseWhen(text: string, cal: FestivalCalendar): Date {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 2) {
    const key = dayKey(parts[0]!);
    const date = cal.days[key];
    if (date && /^\d{1,2}:\d{2}$/.test(parts[1]!)) {
      const [hh, mm] = parts[1]!.split(":").map(Number) as [number, number];
      let [y, mo, d] = date;
      let when = zonedWallTimeToUtc(y, mo, d, hh, mm, cal.timezone);
      if (hh < cal.dayCutoffHour) {
        when = new Date(when.getTime() + 24 * 60 * 60 * 1000);
      }
      return when;
    }
  }
  // ISO path.
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed); // explicit offset/Z
  }
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return zonedWallTimeToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, cal.timezone);
  }
  throw new Error(`unparseable time: ${JSON.stringify(text)}`);
}

/** [start, end) of a festival day: [cutoff that morning, cutoff next morning). */
export function dayWindow(day: string, cal: FestivalCalendar): [Date, Date] {
  const key = dayKey(day);
  const date = cal.days[key];
  if (!date) {
    throw new Error(`unknown day ${JSON.stringify(day)}; use one of ${Object.keys(cal.days).join(", ")}`);
  }
  const [y, mo, d] = date;
  const start = zonedWallTimeToUtc(y, mo, d, cal.dayCutoffHour, 0, cal.timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start, end];
}

/** Render an instant as wall-clock text in a timezone. */
export function formatInZone(
  d: Date,
  tz: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", hour: "2-digit", minute: "2-digit" },
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, ...opts }).format(d);
}
