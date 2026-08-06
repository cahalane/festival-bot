import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWeatherSource, weatherCacheFile } from "./weather.js";
import { NetworkError } from "./http.js";

const dailyFixture = {
  daily: {
    time: ["2026-06-04", "2026-06-05"],
    temperature_2m_max: [24.1, 26.3],
    temperature_2m_min: [17.2, 18.0],
    precipitation_sum: [9.4, 0.0],
    precipitation_probability_max: [80, 10],
  },
};

const hourlyFixture = {
  hourly: {
    time: ["2026-06-04T20:00", "2026-06-04T21:00"],
    temperature_2m: [21.0, 20.2],
    precipitation: [2.1, 4.3],
    precipitation_probability: [70, 90],
  },
};

/**
 * Feels-like was added on 2026-07-31 for the cold watch: a crew member asked to be
 * warned "below 7 or preferably a feels like temp", and a tent at 3am goes by
 * apparent temperature, not the air reading.
 */
describe("hourly apparent temperature", () => {
  const withApparent = {
    hourly: {
      ...hourlyFixture.hourly,
      apparent_temperature: [19.4, 17.8],
    },
  };

  test("requests apparent_temperature from Open-Meteo", async () => {
    let calledUrl = "";
    const w = createWeatherSource({ lat: 52.29, lon: -7.36 }, "Europe/Dublin", {
      fetchJson: async <T>(url: string) => {
        calledUrl = url;
        return withApparent as T;
      },
    });
    await w.hourly(6);
    expect(calledUrl).toContain("apparent_temperature");
  });

  test("maps it onto each hour", async () => {
    const w = createWeatherSource({ lat: 52.29, lon: -7.36 }, "Europe/Dublin", {
      fetchJson: async <T>() => withApparent as T,
    });
    const hours = await w.hourly(6);
    expect(hours[0]!.apparentC).toBe(19.4);
    expect(hours[1]!.apparentC).toBe(17.8);
  });

  test("leaves it undefined when the response omits it, rather than faking the air temp", async () => {
    // Silently substituting tempC would make the cold watch quietly wrong on
    // exactly the windy nights it exists for.
    const w = createWeatherSource({ lat: 52.29, lon: -7.36 }, "Europe/Dublin", {
      fetchJson: async <T>() => hourlyFixture as T,
    });
    const hours = await w.hourly(6);
    expect(hours[0]!.apparentC).toBeUndefined();
  });
});

describe("weatherCacheFile", () => {
  // Regression: the cache file used to be a fixed "weather-daily.json", so a
  // 4-day request was served the cached 10-day payload (and vice versa).
  test("varies with the requested horizon", () => {
    expect(weatherCacheFile("daily", 4)).not.toBe(weatherCacheFile("daily", 10));
  });

  test("is stable for the same kind and horizon", () => {
    expect(weatherCacheFile("daily", 10)).toBe(weatherCacheFile("daily", 10));
  });

  test("keeps daily and hourly in separate files", () => {
    expect(weatherCacheFile("daily", 24)).not.toBe(weatherCacheFile("hourly", 24));
  });
});

describe("createWeatherSource (Open-Meteo)", () => {
  test("maps the daily forecast and queries Open-Meteo with the festival coordinates", async () => {
    let calledUrl = "";
    const w = createWeatherSource(
      { lat: 41.4106, lon: 2.2275 },
      "Europe/Madrid",
      {
        fetchJson: async <T>(url: string) => {
          calledUrl = url;
          return dailyFixture as T;
        },
      },
    );
    const days = await w.daily(2);
    expect(calledUrl).toContain("api.open-meteo.com");
    expect(calledUrl).toContain("latitude=41.4106");
    expect(calledUrl).toContain("longitude=2.2275");
    expect(calledUrl).toContain("timezone=Europe%2FMadrid");
    expect(days[0]).toEqual({
      date: "2026-06-04",
      tempMaxC: 24.1,
      tempMinC: 17.2,
      precipMm: 9.4,
      precipProbPct: 80,
    });
    expect(days).toHaveLength(2);
  });

  test("reports a fresh fetch as not stale", async () => {
    const w = createWeatherSource({ lat: 41.4106, lon: 2.2275 }, "Europe/Madrid", {
      fetchJson: async <T>() => dailyFixture as T,
    });
    await w.daily(2);
    expect(w.lastFetchStale?.()).toBe(false);
  });

  test("flags staleness when an outage forced a fall back to cache", async () => {
    // Standing rule: a plan built on stale data must SAY so. With 5xx now eligible
    // for the stale-cache fallback, silence here would be worse than the old hard
    // failure -- the planner would quietly serve yesterday's forecast as today's.
    const dir = mkdtempSync(join(tmpdir(), "fb-weather-"));
    try {
      writeFileSync(join(dir, weatherCacheFile("daily", 2)), JSON.stringify(dailyFixture));
      const w = createWeatherSource({ lat: 41.4106, lon: 2.2275 }, "Europe/Madrid", {
        fetchJson: async () => {
          throw new NetworkError("HTTP 503 for https://example.test");
        },
        cache: { dir, maxAgeMs: -1 }, // force a refresh attempt, which will fail
        // No retry budget: this test is about the stale FALLBACK, and the live
        // default would otherwise spend 30s of real backoff getting here.
        retry: { maxElapsedMs: 0 },
      });
      const days = await w.daily(2);
      expect(days).toHaveLength(2);
      expect(w.lastFetchStale?.()).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("retries a 503 before falling back, and still flags the fallback as stale", async () => {
    // The retry must not swallow the outage: if backoff is exhausted we still
    // want yesterday's cache AND the stale flag, not a hard failure. (2026-07-29
    // — retries added after Open-Meteo 503s cost the card its hourly half.)
    const dir = mkdtempSync(join(tmpdir(), "fb-weather-retry-"));
    try {
      writeFileSync(join(dir, weatherCacheFile("daily", 2)), JSON.stringify(dailyFixture));
      let attempts = 0;
      const w = createWeatherSource({ lat: 41.4106, lon: 2.2275 }, "Europe/Madrid", {
        fetchJson: async () => {
          attempts++;
          throw new NetworkError("HTTP 503 for https://example.test");
        },
        cache: { dir, maxAgeMs: -1 },
        retry: { baseDelayMs: 1, maxDelayMs: 2, maxElapsedMs: 10, jitter: () => 0 },
      });
      const days = await w.daily(2);
      expect(attempts).toBeGreaterThan(1); // it genuinely retried
      expect(days).toHaveLength(2); // and still served the cache
      expect(w.lastFetchStale?.()).toBe(true); // flagged, never silent
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a successful retry is NOT flagged stale — the data is current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-weather-ok-"));
    try {
      let attempts = 0;
      const w = createWeatherSource({ lat: 41.4106, lon: 2.2275 }, "Europe/Madrid", {
        fetchJson: async <T>() => {
          if (++attempts < 3) throw new NetworkError("HTTP 503 for https://example.test");
          return dailyFixture as T;
        },
        cache: { dir, maxAgeMs: -1 },
        retry: { baseDelayMs: 1, maxDelayMs: 2, maxElapsedMs: 5_000, jitter: () => 0 },
      });
      const days = await w.daily(2);
      expect(attempts).toBe(3);
      expect(days).toHaveLength(2);
      expect(w.lastFetchStale?.()).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("requests an explicit date range for hourly, not hours-from-now", async () => {
    // forecast_hours counts from the current hour, so it cannot reach a festival
    // 5-8 days out. The card needs named days, hence start_date/end_date.
    let calledUrl = "";
    const w = createWeatherSource({ lat: 52.296, lon: -7.353 }, "Europe/Dublin", {
      fetchJson: async <T>(url: string) => {
        calledUrl = url;
        return hourlyFixture as T;
      },
    });
    await w.hourlyRange!("2026-07-30", "2026-08-02");
    expect(calledUrl).toContain("start_date=2026-07-30");
    expect(calledUrl).toContain("end_date=2026-08-02");
    expect(calledUrl).not.toContain("forecast_hours");
  });

  test("caches each hourly range separately", () => {
    expect(weatherCacheFile("hourly", "2026-07-30_2026-08-02")).not.toBe(
      weatherCacheFile("hourly", "2026-08-03_2026-08-05"),
    );
  });

  test("maps the hourly forecast", async () => {
    const w = createWeatherSource({ lat: 41.4106, lon: 2.2275 }, "Europe/Madrid", {
      fetchJson: async <T>() => hourlyFixture as T,
    });
    const hours = await w.hourly(2);
    expect(hours[0]).toEqual({
      time: "2026-06-04T20:00",
      tempC: 21.0,
      precipMm: 2.1,
      precipProbPct: 70,
    });
  });
});
