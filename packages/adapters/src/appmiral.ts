/**
 * Appmiral Content API (v7) lineup adapter — cross-festival reusable.
 *
 * Appmiral (CM.com) powers 100+ festivals behind one host + path template:
 *   https://app.appmiral.com/api/v7/events/{event}/editions/{edition}/...
 * so a single adapter parameterised by (event, edition, x-protect) serves any of
 * them. The read API is gated only by a STATIC `x-protect` header (no x-api-key);
 * the value is embedded per-app and lives in config/secrets.json → appmiral.xProtect.
 *
 * The `/artists?include_related=true` response carries each artist's nested
 * performances (stage_name + start/end as ISO UTC) plus inline `body` (bio), so it
 * maps directly to ArtistSet with no separate scrape. Times are converted from UTC
 * by the engine via the festival timezone.
 *
 * Politeness: the API rate-limits by IP (observed 403 after a burst of probes), so
 * prefer a bundled snapshot / disk cache over hammering it.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { ArtistSet, LineupSource, VenueInfo, ArtistInfo, ArtistInfoSource } from "@festival-bot/core";
import { httpGetJson, cachedJson } from "./http.js";
import { refreshDecision, classifyRemoved } from "./refresh.js";

export interface AppmiralPerformance {
  id: number;
  published?: boolean;
  stage_id?: number;
  stage_name?: string;
  start_time?: string | null;
  end_time?: string | null;
  show_in_schedule?: boolean;
  show_in_line_up?: boolean;
  /** A cancelled performance comes back as a tombstone: { id, deleted_at }, no times. */
  deleted_at?: string;
}

export interface AppmiralArtist {
  id: number;
  name: string;
  published?: boolean;
  body?: string;
  performances?: AppmiralPerformance[];
}

export interface AppmiralLineupResponse {
  data: AppmiralArtist[];
  _meta?: unknown;
}

/**
 * Return a copy of the lineup response with a STABLE, deterministic record order:
 * artists sorted by numeric `id`, and each artist's `performances` sorted by `id`.
 * The Appmiral API returns records in an arbitrary/changing order, so writing the
 * snapshot as-is produces huge spurious diffs on every re-fetch — sorting by id keeps
 * a genuine change (an added/removed/moved set) as a small, readable diff. Pure.
 */
export function sortLineupById(raw: AppmiralLineupResponse): AppmiralLineupResponse {
  const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
  return {
    ...raw,
    data: [...(raw.data ?? [])]
      .map((a) => (a.performances ? { ...a, performances: [...a.performances].sort(byId) } : a))
      .sort(byId),
  };
}

export const APPMIRAL_BASE = "https://app.appmiral.com/api/v7";

/** Stable slug from a stage/artist name: lowercase, non-alnum -> "-", trimmed. */
export function appmiralSlugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A performance counts for the schedule if it's published, has both times, AND
 * has a stage.
 *
 * The stage requirement was added 2026-07-31: ATN published "Memory" with
 * `stage_name: null` and no `stage_id`, and the parser fell back to the literal
 * slug "unknown" — which keys into no venue and no walk edge, so the planner
 * would happily route someone to a stage that does not exist. A set nobody can
 * be directed to is not schedulable.
 *
 * NOTE the cost: the act stays REAL and in the feed, it just stops being
 * plannable, and schedule-tick reports it once as a phantom REMOVED when this
 * filter first takes effect (it did, for Memory, 2026-07-31 — the only set on
 * the whole ATN bill this affects, 479 of 480). If ATN assign it a stage later
 * it simply reappears as an ADD. Do NOT be tempted to infer the stage from
 * sibling sets: five of the six Seanchoíche sessions sit on seancho-che, which
 * makes a guess look safe right up until it puts someone in the wrong field.
 */
function isSchedulable(p: AppmiralPerformance): boolean {
  const hasStage = !!p.stage_name || p.stage_id != null;
  return p.published !== false && !!p.start_time && !!p.end_time && hasStage;
}

/** Map an Appmiral artists response into engine ArtistSets (one per performance). */
export function parseAppmiralLineup(raw: AppmiralLineupResponse): ArtistSet[] {
  const out: ArtistSet[] = [];
  for (const a of raw.data ?? []) {
    if (a.published === false) continue;
    for (const p of a.performances ?? []) {
      if (!isSchedulable(p)) continue;
      const start = new Date(p.start_time!);
      const end = new Date(p.end_time!);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      // isSchedulable has already guaranteed one of these exists.
      const stage = p.stage_name ? appmiralSlugify(p.stage_name) : `stage-${p.stage_id}`;
      out.push({
        name: a.name,
        slug: appmiralSlugify(a.name),
        stage,
        start,
        end,
        durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
      });
    }
  }
  return out;
}

/** Distinct venues (slug + display name) seen across the lineup's stage names.
 *  Handy for (re)generating a festival's venues.json when an edition publishes. */
export function appmiralVenuesFromLineup(raw: AppmiralLineupResponse): VenueInfo[] {
  const bySlug = new Map<string, string>();
  for (const a of raw.data ?? []) {
    for (const p of a.performances ?? []) {
      if (!p.stage_name) continue;
      const slug = appmiralSlugify(p.stage_name);
      if (slug && !bySlug.has(slug)) bySlug.set(slug, p.stage_name);
    }
  }
  return [...bySlug].sort(([a], [b]) => a.localeCompare(b)).map(([slug, name]) => ({ slug, name }));
}

export interface AppmiralConfig {
  event: string;
  edition: string;
  xProtect: string;
  /** Override the API host/version (default APPMIRAL_BASE). */
  baseUrl?: string;
  /** Accept-Language for localised content (default "en"). */
  acceptLanguage?: string;
}

export function appmiralLineupUrl(c: AppmiralConfig): string {
  const base = c.baseUrl ?? APPMIRAL_BASE;
  return `${base}/events/${c.event}/editions/${c.edition}/artists?include_related=true`;
}

export function appmiralHeaders(c: AppmiralConfig): Record<string, string> {
  return {
    "x-protect": c.xProtect,
    "x-platform": "android",
    "Accept-Language": c.acceptLanguage ?? "en",
  };
}

export interface AppmiralLineupOptions {
  /** The bundled snapshot: read by loadSets (unless `live`), written by refresh(). */
  file?: string;
  /** Fetch the live edition in loadSets instead of reading the snapshot. */
  live?: boolean;
  /** Injectable fetcher (defaults to live HTTP). */
  fetchJson?: <T>(url: string, headers: Record<string, string>) => Promise<T>;
  /** Disk cache dir to ride out the rate limiter / brief outages. */
  cacheDir?: string;
  cacheMaxAgeMs?: number;
}

/**
 * A LineupSource for any Appmiral festival. By default it reads the bundled
 * snapshot at `file` (offline/deterministic, and polite to the rate-limited API);
 * `live: true` reads the edition over HTTP instead, optionally through the disk cache.
 *
 * `refresh()` (available whenever `file` is set) always goes to the live API and
 * re-writes the snapshot, behind the shared shrink guard.
 */
export function createAppmiralLineupSource(config: AppmiralConfig, opts: AppmiralLineupOptions = {}): LineupSource {
  const fetchJson = opts.fetchJson ?? (<T>(u: string, h: Record<string, string>) => httpGetJson<T>(u, { headers: h }));
  const fetchLive = () =>
    fetchJson<AppmiralLineupResponse>(appmiralLineupUrl(config), appmiralHeaders(config));

  const source: LineupSource = {
    async loadSets(): Promise<ArtistSet[]> {
      if (opts.file && !opts.live) {
        return parseAppmiralLineup(JSON.parse(readFileSync(opts.file, "utf8")) as AppmiralLineupResponse);
      }
      const raw = opts.cacheDir
        ? (
            await cachedJson<AppmiralLineupResponse>({
              file: `${opts.cacheDir}/appmiral-${config.event}-${config.edition}.json`,
              maxAgeMs: opts.cacheMaxAgeMs ?? 6 * 3_600_000,
              fetch: fetchLive,
            })
          ).data
        : await fetchLive();
      return parseAppmiralLineup(raw);
    },
  };

  const dest = opts.file;
  if (dest) {
    source.refresh = async ({ force = false } = {}) => {
      const raw = await fetchLive();
      const nextSets = parseAppmiralLineup(raw);
      const prevSets = existsSync(dest)
        ? parseAppmiralLineup(JSON.parse(readFileSync(dest, "utf8")) as AppmiralLineupResponse)
        : null;
      const fetched = nextSets.length;
      const previous = prevSets?.length ?? null;
      // WHICH sets went missing is what separates pruning from a cancellation:
      // past ones are pruning, future ones are news. Counts alone can't tell.
      const decision = refreshDecision(fetched, previous, force, {
        removed: prevSets ? classifyRemoved(prevSets, nextSets) : undefined,
      });
      // On a guarded shrink, keep the snapshot and park the fetch in a sidecar.
      const file = decision.write ? dest : `${dest}.fetched.json`;
      // Write id-sorted (+ trailing newline) so a re-fetch only diffs genuine changes, not reordering.
      writeFileSync(file, JSON.stringify(sortLineupById(raw), null, 2) + "\n");
      return { variant: config.edition, fetched, previous, written: decision.write, file, note: decision.reason };
    };
  }

  return source;
}

/** Index each artist's inline `body` (HTML bio) by slug — for an ArtistInfoSource
 *  and for populating Clashfinder blurbs. No network: works off any lineup response. */
export function appmiralArtistInfoMap(raw: AppmiralLineupResponse): Map<string, ArtistInfo> {
  const m = new Map<string, ArtistInfo>();
  for (const a of raw.data ?? []) {
    if (!a.name) continue;
    m.set(appmiralSlugify(a.name), { name: a.name, bio: a.body ?? "", url: "" });
  }
  return m;
}

/**
 * ArtistInfoSource backed by the Appmiral lineup's inline bios (`body`). Loads the
 * same snapshot/live response as the lineup once and indexes by slug — so bios come
 * free with no extra fetch (unlike PS, which scrapes per artist).
 */
export function createAppmiralArtistInfoSource(
  config: AppmiralConfig,
  opts: AppmiralLineupOptions = {},
): ArtistInfoSource {
  const fetchJson = opts.fetchJson ?? (<T>(u: string, h: Record<string, string>) => httpGetJson<T>(u, { headers: h }));
  let cached: Map<string, ArtistInfo> | null = null;
  async function load(): Promise<Map<string, ArtistInfo>> {
    if (cached) return cached;
    const raw = opts.file
      ? (JSON.parse(readFileSync(opts.file, "utf8")) as AppmiralLineupResponse)
      : await fetchJson<AppmiralLineupResponse>(appmiralLineupUrl(config), appmiralHeaders(config));
    cached = appmiralArtistInfoMap(raw);
    return cached;
  }
  return {
    async info(slug: string): Promise<ArtistInfo> {
      return (await load()).get(slug) ?? { name: slug, bio: "", url: "" };
    },
  };
}
