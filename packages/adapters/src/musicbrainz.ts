/**
 * MusicBrainz artist lookup — cross-festival reusable. Resolves an act name to a
 * MusicBrainz ID (MBID) ONLY when there's a confident, unambiguous exact match, so
 * the Clashfinder `mbid` field is populated conservatively (no wrong tags).
 *
 * Politeness: MusicBrainz rate-limits anonymous use to ~1 req/s and requires a
 * descriptive User-Agent. So we throttle (default 1.1s) and cache results to disk
 * (hits AND misses) — after a first pass, repeat exports hit zero network.
 * Docs: https://musicbrainz.org/doc/MusicBrainz_API
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { httpGetJson } from "./http.js";

export interface MbCandidate {
  id: string;
  name: string;
  score: number | string;
}

interface MbSearchResponse {
  artists?: MbCandidate[];
}

/**
 * Strip trailing performance qualifiers — "(DJ Set)", "(Live)", "[DJ]", "(2026)" —
 * to improve MusicBrainz matching (the artist is the same act). Used only for the
 * lookup, not the displayed name. Leaves a name with no trailing bracket alone, and
 * never strips down to empty (e.g. "(Sandy) Alex G" — leading paren — is untouched).
 */
export function stripActSuffixes(name: string): string {
  let n = name.trim();
  let prev = "";
  while (n !== prev) {
    prev = n;
    n = n.replace(/\s*[([][^()[\]]*[)\]]\s*$/u, "").trim();
  }
  return n || name.trim();
}

/** Fold to a comparable form: diacritics removed, lowercased, whitespace collapsed. */
function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pick an MBID only for a unique, high-confidence exact name match. Returns null
 * when there's no exact-name candidate, when it's below the score threshold, or
 * when two *distinct* artists share the name (ambiguous — better no tag than wrong).
 */
export function pickExactMbid(
  query: string,
  candidates: MbCandidate[],
  opts: { minScore?: number } = {},
): string | null {
  const minScore = opts.minScore ?? 95;
  const q = normName(query);
  const exact = candidates.filter((c) => Number(c.score) >= minScore && normName(c.name) === q);
  const distinct = [...new Set(exact.map((c) => c.id))];
  return distinct.length === 1 ? distinct[0]! : null;
}

export interface MbidResolver {
  resolve(name: string): Promise<string | null>;
  resolveAll(names: string[]): Promise<Map<string, string>>;
  /** Cache-only lookup (no network): split names into already-found mbids and not-yet-resolved. */
  cachedOnly(names: string[]): { found: Map<string, string>; missing: string[] };
}

const DEFAULT_UA = "festival-bot/1.0 (Clashfinder mbid lookup; +https://clashfinder.com)";

function searchUrl(name: string): string {
  const query = `artist:"${name.replace(/["\\]/g, "\\$&")}"`;
  return `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&fmt=json&limit=8`;
}

/**
 * A cached, throttled MBID resolver. `cacheFile` persists name->mbid|null across
 * runs (negative cache included). Inject `fetchJson` for tests.
 */
export function createMbidResolver(opts: {
  fetchJson?: <T>(url: string) => Promise<T>;
  cacheFile?: string;
  minIntervalMs?: number;
  minScore?: number;
  userAgent?: string;
} = {}): MbidResolver {
  const minInterval = opts.minIntervalMs ?? 1100;
  const fetchJson =
    opts.fetchJson ??
    (<T>(url: string) => httpGetJson<T>(url, { headers: { "User-Agent": opts.userAgent ?? DEFAULT_UA } }));

  const cache = new Map<string, string | null>();
  if (opts.cacheFile) {
    try {
      const raw = JSON.parse(readFileSync(opts.cacheFile, "utf8")) as Record<string, string | null>;
      for (const [k, v] of Object.entries(raw)) cache.set(k, v);
    } catch {
      // no cache yet
    }
  }

  function save(): void {
    if (!opts.cacheFile) return;
    mkdirSync(dirname(opts.cacheFile), { recursive: true });
    writeFileSync(opts.cacheFile, JSON.stringify(Object.fromEntries(cache), null, 2));
  }

  let lastFetch = 0;
  async function throttle(): Promise<void> {
    const wait = minInterval - (Date.now() - lastFetch);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetch = Date.now();
  }

  async function resolve(name: string): Promise<string | null> {
    const lookup = stripActSuffixes(name);
    const key = normName(lookup);
    if (cache.has(key)) return cache.get(key)!;
    await throttle();
    let mbid: string | null = null;
    try {
      const res = await fetchJson<MbSearchResponse>(searchUrl(lookup));
      mbid = pickExactMbid(lookup, res.artists ?? [], { minScore: opts.minScore });
    } catch {
      // network/parse failure -> treat as a (non-persisted) miss for this run
      return null;
    }
    cache.set(key, mbid);
    save();
    return mbid;
  }

  async function resolveAll(names: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const name of [...new Set(names)]) {
      const mbid = await resolve(name);
      if (mbid) out.set(name, mbid);
    }
    return out;
  }

  function cachedOnly(names: string[]): { found: Map<string, string>; missing: string[] } {
    const found = new Map<string, string>();
    const missing: string[] = [];
    for (const name of names) {
      const key = normName(stripActSuffixes(name));
      if (cache.has(key)) {
        const v = cache.get(key);
        if (v) found.set(name, v); // cached null = known miss -> neither
      } else {
        missing.push(name);
      }
    }
    return { found, missing };
  }

  return { resolve, resolveAll, cachedOnly };
}
