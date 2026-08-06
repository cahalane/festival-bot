/**
 * Shared HTTP + disk-cache helper for adapters.
 *
 * `cachedJson` generalises the outage-resilience pattern proven during PS26: serve
 * a fresh cache without fetching; otherwise fetch and rewrite; and on a network
 * failure fall back to a stale cache (flagged) rather than blinding the planner.
 * Only raise when there is no cache at all.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** A fetch that failed for network reasons (offline/timeout/outage) — eligible for stale fallback. */
export class NetworkError extends Error {
  override name = "NetworkError";
}

/**
 * Is this HTTP status a transient outage (retry/serve-stale) rather than a
 * permanent error (surface it)? 5xx = the server is having a moment; 429 = we are
 * being rate limited. Everything else (esp. 401/403/404) means OUR request is
 * wrong and stale data would hide that.
 */
export function isTransientHttpStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/** A response we DID receive, carrying a permanent status — never stale-eligible. */
export class HttpStatusError extends Error {
  override name = "HttpStatusError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Decide what an error escaping `fetch()` means.
 *
 * Deliberately does NOT enumerate transport error types: node's fetch throws
 * TypeError for a dead connection, but bun — which `./festplan` actually runs on —
 * throws a plain Error. Enumerating them meant real outages went unclassified in
 * the runtime we use, so the stale-cache fallback never engaged (2026-07-26).
 *
 * So: anything we already classified passes through; ANYTHING ELSE reaching here
 * came out of the transport and is treated as a network failure.
 */
export function classifyFetchError(e: unknown): Error {
  if (e instanceof NetworkError || e instanceof HttpStatusError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new NetworkError(`network failure: ${msg}`);
}

export async function httpGet(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "festival-bot/1.0", ...opts.headers },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // A transient server-side failure is an OUTAGE, not a bad request, so it must
      // be eligible for cachedJson's stale-cache fallback. Classifying it as a plain
      // Error blinded the 13:00 weather tick on an Open-Meteo 503 (2026-07-26) even
      // though a usable cache was on disk — the same shape as the 2026-05-27
      // Clashfinder incident. A 4xx still throws hard: serving stale data for an
      // auth/not-found error would mask a real, actionable problem.
      const msg = `HTTP ${res.status} for ${url}`;
      throw isTransientHttpStatus(res.status) ? new NetworkError(msg) : new HttpStatusError(msg, res.status);
    }
    return await res.text();
  } catch (e) {
    throw classifyFetchError(e);
  } finally {
    clearTimeout(timer);
  }
}

export async function httpGetJson<T>(url: string, opts?: { timeoutMs?: number; headers?: Record<string, string> }): Promise<T> {
  return JSON.parse(await httpGet(url, opts)) as T;
}

function ageMs(file: string): number | null {
  try {
    return Date.now() - statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export interface CachedJsonResult<T> {
  data: T;
  /** True if the data came from a stale cache after a failed refresh. */
  stale: boolean;
}

export async function cachedJson<T>(opts: {
  file: string;
  maxAgeMs: number;
  fetch: () => Promise<T>;
}): Promise<CachedJsonResult<T>> {
  const age = ageMs(opts.file);
  if (age !== null && age < opts.maxAgeMs) {
    return { data: readJson<T>(opts.file), stale: false };
  }
  try {
    const data = await opts.fetch();
    writeJson(opts.file, data);
    return { data, stale: false };
  } catch (e) {
    if (e instanceof NetworkError && age !== null) {
      return { data: readJson<T>(opts.file), stale: true };
    }
    throw e;
  }
}
