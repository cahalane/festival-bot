/**
 * Aloompa "Dragonfly" adapter — cross-festival reusable.
 *
 * Aloompa (Flutter apps whose `assets/flutter_assets/properties.json` names a
 * `staticParamsEndpoint` on `*.aloompa.com`) serves many festival apps. First seen
 * with Other Voices (`com.othervoices.othervoices`, 2026). The pipeline:
 *
 *   1. GET  {buildParamsUrl}?appId=<appId>   header `Authorization: <buildParamsToken>`
 *        -> { dragonflyApiUrl, dragonflyApiKey, publicBucketPath }
 *   2. POST {dragonflyApiUrl}  (AWS AppSync GraphQL)   header `x-api-key: <dragonflyApiKey>`
 *        query getSubApp(appId, id, versionId) { listSubAppEvents, listSubAppPlaces }
 *
 * The app ID / sub-app ID are public (they appear in every share link). The
 * build-params token is shipped in the APK, like Appmiral's `x-protect` — and like
 * it, it is NOT committed here (config/secrets.json -> `aloompa.buildParamsToken`;
 * see docs/setup/aloompa-discovery.md). Resolving the AppSync key at fetch time
 * rather than storing it matters: AppSync API keys expire (365 days max) and the
 * vendor rotates them through build-params without shipping a new app.
 *
 * Feed properties the parser relies on:
 *   - Times are `{ date: <unix seconds, UTC>, timezoneName }`. The epoch is already an
 *     absolute instant — do NOT re-apply `timezoneName` (that would double-shift).
 *   - `timeIsTBD: true` events carry a placeholder time (observed: a 0-minute slot at
 *     10:57 on day 1). They are not plannable and are dropped.
 *   - Place names can carry trailing spaces ("Foxy John's "); slugs are trimmed.
 *   - Each event *is* one slot: the event `name` is the act/session name.
 */
import type { ArtistSet, LineupSource, VenueInfo } from "@festival-bot/core";

export const ALOOMPA_BUILD_PARAMS_URL = "https://skeeter-hawk.aloompa.com/build-params";

export interface AloompaTime {
  /** Unix seconds (UTC). */
  date: number | null;
  timezoneName?: string | null;
}

export interface AloompaEvent {
  id: string;
  name: string;
  status?: string | null;
  timeIsTBD?: boolean | null;
  statusMessage?: string | null;
  startsAt?: AloompaTime | null;
  endsAt?: AloompaTime | null;
  eventPlace?: { id: string; name: string } | null;
}

export interface AloompaPlace {
  id: string;
  name: string;
  placeType?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** The slice of `getSubApp` this adapter reads (and what snapshots store). */
export interface AloompaSubApp {
  id: string;
  name: string;
  timezoneName?: string | null;
  listSubAppEvents: { items: AloompaEvent[]; nextToken?: string | null };
  listSubAppPlaces?: { items: AloompaPlace[]; nextToken?: string | null };
}

export interface AloompaConfig {
  appId: string;
  subAppId: string;
  /** Content version selector the app sends; "1.0.0" for every app seen so far. */
  versionId?: string;
  /** From the APK's properties.json `staticParamsEndpointAuthToken`. Not committed. */
  buildParamsToken: string;
  buildParamsUrl?: string;
}

export function aloompaSlugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Map a sub-app's events to engine ArtistSets. */
export function parseAloompaLineup(sub: AloompaSubApp): ArtistSet[] {
  const out: ArtistSet[] = [];
  for (const e of sub.listSubAppEvents?.items ?? []) {
    if (e.status && e.status !== "PUBLIC") continue;
    if (e.timeIsTBD) continue;
    const name = e.name?.trim();
    const place = e.eventPlace?.name?.trim();
    // Same rule as the other vendor adapters: no stage = not routable = not plannable.
    if (!name || !place) continue;
    const s = e.startsAt?.date;
    const en = e.endsAt?.date;
    if (typeof s !== "number" || typeof en !== "number" || en <= s) continue;
    out.push({
      name,
      slug: aloompaSlugify(name),
      stage: aloompaSlugify(place),
      start: new Date(s * 1000),
      end: new Date(en * 1000),
      durationMin: Math.round((en - s) / 60),
    });
  }
  out.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() || a.stage.localeCompare(b.stage) || a.name.localeCompare(b.name),
  );
  return out;
}

/** Distinct venues actually used by events (slug + trimmed display name). */
export function aloompaVenues(sub: AloompaSubApp): VenueInfo[] {
  const bySlug = new Map<string, string>();
  for (const e of sub.listSubAppEvents?.items ?? []) {
    const n = e.eventPlace?.name?.trim();
    if (!n) continue;
    const slug = aloompaSlugify(n);
    if (!bySlug.has(slug)) bySlug.set(slug, n);
  }
  return [...bySlug].map(([slug, name]) => ({ slug, name }));
}

const EVENT_FIELDS = `id name status timeIsTBD statusMessage
  startsAt { date timezoneName } endsAt { date timezoneName } eventPlace { id name }`;

export const ALOOMPA_SUBAPP_QUERY = `query SubApp($appId: String!, $id: String!, $versionId: String!, $evToken: String) {
  getSubApp(appId: $appId, id: $id, versionId: $versionId) {
    id name timezoneName
    listSubAppEvents(nextToken: $evToken) { nextToken items { ${EVENT_FIELDS} } }
    listSubAppPlaces { nextToken items { id name placeType status latitude longitude } }
  }
}`;

export interface AloompaFetchDeps {
  fetch?: typeof fetch;
}

/** Step 1: resolve the live AppSync endpoint + key. */
export async function resolveAloompaEndpoint(
  config: AloompaConfig,
  deps: AloompaFetchDeps = {},
): Promise<{ apiUrl: string; apiKey: string }> {
  const f = deps.fetch ?? fetch;
  const url = `${config.buildParamsUrl ?? ALOOMPA_BUILD_PARAMS_URL}?appId=${encodeURIComponent(config.appId)}`;
  const r = await f(url, { headers: { Authorization: config.buildParamsToken, "User-Agent": "festival-bot/1.0" } });
  if (!r.ok) throw new Error(`aloompa build-params: HTTP ${r.status}`);
  const j = (await r.json()) as { dragonflyApiUrl?: string; dragonflyApiKey?: string };
  if (!j.dragonflyApiUrl || !j.dragonflyApiKey) throw new Error("aloompa build-params: no dragonflyApiUrl/ApiKey in response");
  return { apiUrl: j.dragonflyApiUrl, apiKey: j.dragonflyApiKey };
}

/** Steps 1+2: the live sub-app (all event pages), reduced to AloompaSubApp. */
export async function fetchAloompaSubApp(config: AloompaConfig, deps: AloompaFetchDeps = {}): Promise<AloompaSubApp> {
  const f = deps.fetch ?? fetch;
  const { apiUrl, apiKey } = await resolveAloompaEndpoint(config, deps);
  let sub: AloompaSubApp | null = null;
  let evToken: string | null = null;
  for (let page = 0; page < 50; page++) {
    const r = await f(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "User-Agent": "festival-bot/1.0" },
      body: JSON.stringify({
        query: ALOOMPA_SUBAPP_QUERY,
        variables: { appId: config.appId, id: config.subAppId, versionId: config.versionId ?? "1.0.0", evToken },
      }),
    });
    if (!r.ok) throw new Error(`aloompa graphql: HTTP ${r.status}`);
    const j = (await r.json()) as { data?: { getSubApp?: AloompaSubApp | null }; errors?: { message: string }[] };
    if (j.errors?.length) throw new Error(`aloompa graphql: ${j.errors.map((e) => e.message).join("; ")}`);
    const got = j.data?.getSubApp;
    if (!got) throw new Error(`aloompa graphql: sub-app ${config.subAppId} not found (wrong appId/versionId?)`);
    if (!sub) sub = got;
    else sub.listSubAppEvents.items.push(...got.listSubAppEvents.items);
    evToken = got.listSubAppEvents.nextToken ?? null;
    if (!evToken) break;
  }
  if (!sub) throw new Error("aloompa graphql: empty response");
  sub.listSubAppEvents.nextToken = null;
  return sub;
}

/** A LineupSource over a sub-app snapshot the festival module loads. */
export function createAloompaLineupSource(opts: { loadSubApp: () => Promise<AloompaSubApp> }): LineupSource {
  return {
    async loadSets() {
      return parseAloompaLineup(await opts.loadSubApp());
    },
  };
}
