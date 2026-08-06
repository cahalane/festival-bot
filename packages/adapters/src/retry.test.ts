import { describe, expect, test, vi } from "vitest";
import { retryTransient } from "./retry.js";
import { HttpStatusError, NetworkError } from "./http.js";

/**
 * Open-Meteo 503s are frequent but flaky (observed 2026-07-26, -28 and -29; the
 * -29 one silently cost the weather card its whole hourly half). Operator's call:
 * back off exponentially and keep trying rather than giving up on the first miss.
 *
 * Time is injected so the tests assert the backoff SHAPE without actually
 * sleeping — a retry test that really waits is a slow test nobody runs.
 */
function harness() {
  const slept: number[] = [];
  let clock = 0;
  return {
    slept,
    opts: {
      sleep: async (ms: number) => {
        slept.push(ms);
        clock += ms;
      },
      now: () => clock,
      jitter: () => 0, // deterministic: no random component
    },
  };
}

describe("retryTransient", () => {
  test("returns the value without sleeping when the first attempt succeeds", async () => {
    const h = harness();
    const fn = vi.fn(async () => "ok");
    expect(await retryTransient(fn, h.opts)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(h.slept).toEqual([]);
  });

  test("retries a transient NetworkError and returns the eventual success", async () => {
    const h = harness();
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new NetworkError("HTTP 503 for x");
      return "recovered";
    });
    expect(await retryTransient(fn, h.opts)).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("doubles the delay between attempts", async () => {
    const h = harness();
    let n = 0;
    await retryTransient(async () => {
      if (++n < 4) throw new NetworkError("503");
      return 1;
    }, { ...h.opts, baseDelayMs: 100 });
    expect(h.slept).toEqual([100, 200, 400]);
  });

  test("caps the delay so a long outage does not back off to hours", async () => {
    const h = harness();
    let n = 0;
    await retryTransient(async () => {
      if (++n < 6) throw new NetworkError("503");
      return 1;
    }, { ...h.opts, baseDelayMs: 100, maxDelayMs: 250 });
    expect(h.slept).toEqual([100, 200, 250, 250, 250]);
  });

  test("does NOT retry a permanent HTTP status — a 404 will never come good", async () => {
    const h = harness();
    const fn = vi.fn(async () => {
      throw new HttpStatusError("HTTP 404 for x", 404);
    });
    await expect(retryTransient(fn, h.opts)).rejects.toThrow(/404/);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(h.slept).toEqual([]);
  });

  test("gives up once the elapsed budget is spent and rethrows the last error", async () => {
    const h = harness();
    const fn = vi.fn(async () => {
      throw new NetworkError("HTTP 503 for x");
    });
    await expect(
      retryTransient(fn, { ...h.opts, baseDelayMs: 100, maxElapsedMs: 500 }),
    ).rejects.toThrow(/503/);
    // Budget-bounded, so the caller (and the daily loop above it) can still fall
    // back to stale cache rather than hanging forever on a real outage.
    expect(h.slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(500);
    expect(fn.mock.calls.length).toBeGreaterThan(1);
  });

  test("reports each retry so an outage is visible rather than silent", async () => {
    const h = harness();
    const seen: Array<{ attempt: number; delayMs: number; error: string }> = [];
    let n = 0;
    await retryTransient(
      async () => {
        if (++n < 3) throw new NetworkError("HTTP 503 for x");
        return 1;
      },
      { ...h.opts, baseDelayMs: 10, onRetry: (i) => seen.push({ ...i, error: i.error.message }) },
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]!.attempt).toBe(1);
    expect(seen[0]!.error).toMatch(/503/);
  });

  test("adds jitter so repeated failures do not resynchronise into a thundering herd", async () => {
    const h = harness();
    let n = 0;
    await retryTransient(async () => {
      if (++n < 2) throw new NetworkError("503");
      return 1;
    }, { ...h.opts, baseDelayMs: 100, jitter: () => 1 });
    // jitter() === 1 => full extra base delay on top of the 100ms step.
    expect(h.slept).toEqual([200]);
  });
});
