/**
 * Exponential backoff for TRANSIENT fetch failures.
 *
 * Open-Meteo returns 503s often enough to be a fact of life rather than an
 * incident — seen at the 13:00 weather tick on 2026-07-26, -28 and -29. They are
 * also flaky rather than sustained: the same request typically succeeds moments
 * later. A single attempt therefore throws away a forecast we could have had,
 * and on 2026-07-29 that cost the card its entire hourly half without anything
 * user-visible saying so.
 *
 * Operator standing instruction, 2026-07-29: "OpenMeteo should try with exponential
 * backoff until success. The 503s are common but flaky."
 *
 * Bounded by an ELAPSED BUDGET rather than truly unbounded, deliberately: this
 * runs inside `./festplan weather`, which a person can be sitting in front of,
 * and an infinite loop against a genuinely dead service would hang the terminal
 * and the daily Monitor with it. Spending the budget and then throwing lets
 * `cachedJson` fall back to stale cache — degraded but honest and flagged —
 * which is the behaviour the rest of the stack is built around.
 *
 * Only NetworkError is retried. An HttpStatusError (4xx) means our request is
 * wrong; repeating it just wastes the budget and delays a real error.
 */
import { NetworkError } from "./http.js";

export interface RetryOptions {
  /** First delay; each subsequent wait doubles from here. */
  baseDelayMs?: number;
  /** Ceiling on any single wait, so a long outage doesn't back off to hours. */
  maxDelayMs?: number;
  /** Total time budget across all waits. Once spent, the last error is rethrown. */
  maxElapsedMs?: number;
  /** Called before each wait — wire this to a log so an outage is visible, not silent. */
  onRetry?: (info: { attempt: number; delayMs: number; error: Error }) => void;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Fraction of the base step to add as jitter; defaults to random in [0,1). */
  jitter?: () => number;
}

const DEFAULTS = {
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  maxElapsedMs: 120_000,
};

export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const baseDelayMs = opts.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const maxElapsedMs = opts.maxElapsedMs ?? DEFAULTS.maxElapsedMs;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const jitter = opts.jitter ?? Math.random;

  const started = now();
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (e) {
      // Permanent errors are rethrown untouched — retrying a 404 only delays it.
      if (!(e instanceof NetworkError)) throw e;
      attempt++;

      const step = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delayMs = Math.round(step + baseDelayMs * jitter());
      const spent = now() - started;
      // Check the budget BEFORE sleeping: waiting past it and then giving up
      // would blow the deadline the caller is relying on.
      if (spent + delayMs > maxElapsedMs) throw e;

      opts.onRetry?.({ attempt, delayMs, error: e });
      await sleep(delayMs);
    }
  }
}
