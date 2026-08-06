/**
 * Open-Meteo weather adapter — the keyless, free, durable replacement for the
 * AccuWeather MCP (dropped over pricing). Cross-festival reusable: a festival
 * supplies its coordinates + timezone. No API key, generous free limits.
 *
 * Docs: https://open-meteo.com/en/docs
 */
import type { GeoPoint, WeatherSource, WeatherDaily, WeatherHourly } from "@festival-bot/core";
import { httpGetJson, cachedJson } from "./http.js";
import { retryTransient, type RetryOptions } from "./retry.js";

const BASE = "https://api.open-meteo.com/v1/forecast";

interface DailyResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
  };
}

interface HourlyResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature?: number[];
    precipitation: number[];
    precipitation_probability: number[];
    cloud_cover?: number[];
  };
}

/**
 * Cache file for one forecast request. MUST vary with the horizon: the cache is
 * keyed by file name, so a fixed name would serve a 4-day request the cached
 * 10-day payload (and vice versa).
 */
export function weatherCacheFile(kind: "daily" | "hourly", horizon: number | string): string {
  return `weather-${kind}-${horizon}.json`;
}

export interface WeatherSourceOptions {
  /** Injectable fetcher (defaults to live HTTP). */
  fetchJson?: <T>(url: string) => Promise<T>;
  /** Optional disk cache to ride out brief outages and rate limits. */
  cache?: { dir: string; maxAgeMs?: number };
  /**
   * Backoff for Open-Meteo's frequent-but-flaky 503s. The default budget is
   * deliberately SHORT (30s), not the retry helper's own 120s: this runs inside
   * `./festplan weather`, which a person may be waiting on, and the daily loop
   * already retries the whole command three times two minutes apart. Layered,
   * that covers a ~5-minute outage without any single call appearing to hang.
   */
  retry?: RetryOptions;
}

function url(coords: GeoPoint, timezone: string, params: Record<string, string>): string {
  const q = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    timezone,
    ...params,
  });
  return `${BASE}?${q.toString()}`;
}

export function createWeatherSource(
  coords: GeoPoint,
  timezone: string,
  opts: WeatherSourceOptions = {},
): WeatherSource {
  const fetchJson = opts.fetchJson ?? (<T>(u: string) => httpGetJson<T>(u));
  let stale = false;

  /**
   * Open-Meteo's 503s are common but flaky (2026-07-26, -28, -29), so a single
   * attempt needlessly loses a forecast that a retry seconds later would get.
   * Backoff sits INSIDE cachedJson's fetch, so the stale-cache fallback only
   * engages once the retry budget is genuinely spent.
   */
  const withRetry = <T>(u: string) =>
    retryTransient(() => fetchJson<T>(u), {
      maxElapsedMs: 30_000,
      ...opts.retry,
      onRetry: ({ attempt, delayMs, error }) =>
        // Timestamped: the un-dated error log made it impossible to tell how
        // often these outages were actually happening (operator note, 2026-07-29).
        console.error(
          `${new Date().toISOString()} open-meteo retry ${attempt} in ${delayMs}ms — ${error.message}`,
        ),
    });

  async function getJson<T>(u: string, cacheName: string): Promise<T> {
    if (!opts.cache) {
      const data = await withRetry<T>(u);
      stale = false;
      return data;
    }
    const res = await cachedJson<T>({
      file: `${opts.cache.dir}/${cacheName}`,
      maxAgeMs: opts.cache.maxAgeMs ?? 3 * 3_600_000,
      fetch: () => withRetry<T>(u),
    });
    stale = res.stale;
    return res.data;
  }

  return {
    lastFetchStale: () => stale,

    async daily(days = 7): Promise<WeatherDaily[]> {
      const u = url(coords, timezone, {
        daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
        forecast_days: String(days),
      });
      const { daily } = await getJson<DailyResponse>(u, weatherCacheFile("daily", days));
      return daily.time.map((date, i) => ({
        date,
        tempMaxC: daily.temperature_2m_max[i]!,
        tempMinC: daily.temperature_2m_min[i]!,
        precipMm: daily.precipitation_sum[i]!,
        precipProbPct: daily.precipitation_probability_max[i]!,
      }));
    },

    /** Hourly across an explicit local date range — reaches days beyond forecast_hours. */
    async hourlyRange(startDate: string, endDate: string): Promise<WeatherHourly[]> {
      const u = url(coords, timezone, {
        hourly: "temperature_2m,apparent_temperature,precipitation,precipitation_probability,cloud_cover",
        start_date: startDate,
        end_date: endDate,
      });
      const { hourly } = await getJson<HourlyResponse>(
        u,
        weatherCacheFile("hourly", `${startDate}_${endDate}`),
      );
      return hourly.time.map((time, i) => ({
        time,
        tempC: hourly.temperature_2m[i]!,
        apparentC: hourly.apparent_temperature?.[i],
        precipMm: hourly.precipitation[i]!,
        precipProbPct: hourly.precipitation_probability[i]!,
        cloudCoverPct: hourly.cloud_cover?.[i],
      }));
    },

    async hourly(hours = 24): Promise<WeatherHourly[]> {
      const u = url(coords, timezone, {
        hourly: "temperature_2m,apparent_temperature,precipitation,precipitation_probability,cloud_cover",
        forecast_hours: String(hours),
      });
      const { hourly } = await getJson<HourlyResponse>(u, weatherCacheFile("hourly", hours));
      return hourly.time.map((time, i) => ({
        time,
        tempC: hourly.temperature_2m[i]!,
        apparentC: hourly.apparent_temperature?.[i],
        precipMm: hourly.precipitation[i]!,
        precipProbPct: hourly.precipitation_probability[i]!,
        cloudCoverPct: hourly.cloud_cover?.[i],
      }));
    },
  };
}
