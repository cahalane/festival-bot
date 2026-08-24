/**
 * Greencopper (Leap Event Technology) content adapter — cross-festival reusable.
 *
 * Greencopper powers 300+ festival apps (Electric Picnic, Roskilde, Leeds, Download,
 * …), all with the Android package shape `com.greencopper.android.<name>`. Unlike
 * Appmiral there is no per-resource REST API: the app ships a *content bundle* and
 * updates it over the air, so this adapter speaks that pipeline instead.
 *
 *   1. GET  {otaApiUrl}                    -> a JSON array of OTAContent entries
 *   2. pick the highest `version` with `type: "release"` (drafts are unpublished)
 *   3. GET  entry.url                      -> content_v<N>.zip, WinZip AES-256
 *   4. decrypt with `greencopperBundlePassword(fileName, secret)`
 *   5. read event/data/*.json + core/strings/<locale>.json out of it
 *
 * The `secret` and the `otaApiUrl` are per-project, extracted once from the app
 * (see docs/setup/greencopper-discovery.md). Like Appmiral's `x-protect` they are
 * embedded in the shipped binary rather than being per-user credentials — and like
 * it, they are NOT committed to this repo (config/secrets.json -> `greencopper`).
 *
 * Two properties of the bundle drive the parsing code below:
 *
 *   - **Names are indirected.** A scheduleItem's `name` is not "Fontaines DC", it is
 *     the key `activity_name_1711518959704347748`, resolved against the locale
 *     strings table. An unresolved key must never be shown to a user as if it were
 *     an act name, so `parseGreencopperLineup` drops those rows (see isSchedulable).
 *   - **Times already carry the local offset** (`2026-08-30T22:30:00+01:00`). Parse
 *     as an instant and let the engine render in the festival timezone; do NOT
 *     re-apply the zone, which would shift every set by the offset.
 */
import type { ArtistSet, LineupSource, VenueInfo, ArtistInfo } from "@festival-bot/core";

/** One entry of the OTA manifest (`OTAContent` in the app). */
export interface GreencopperOtaEntry {
  version: number;
  schema: number;
  url: string;
  project: string;
  /** "release" is published; "in_progress"/"draft" are not and must be ignored. */
  type: string;
  date?: string;
}

export interface GreencopperStage {
  id: number;
  /** A strings-table key (`location_name_<id>`), not a display name. */
  name: string;
  order?: number;
}

export interface GreencopperScheduleItem {
  id: number;
  activityId?: number;
  /** A strings-table key (`activity_name_<id>`), not a display name. */
  name: string;
  description?: string;
  stageId?: number;
}

export interface GreencopperTimeSlot {
  id: number;
  scheduleItemId: number;
  dayOfEvent?: string;
  /** ISO-8601 WITH a local offset, e.g. "2026-08-30T22:30:00+01:00". */
  startDate?: string;
  endDate?: string;
}

/** The decrypted bundle, reduced to the files this adapter reads. */
export interface GreencopperBundle {
  strings: Record<string, string>;
  stages: GreencopperStage[];
  scheduleItems: GreencopperScheduleItem[];
  timeSlots: GreencopperTimeSlot[];
}

/** Stable slug from a display name: lowercase, non-alnum -> "-", trimmed. */
export function greencopperSlugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The content bundle's AES password.
 *
 * Recovered from `ConcreteContentArchiveOpener.kt`, which builds it as
 * `fileName.replace(".zip", secret + "zip")` — so `content_v39.zip` with secret `s`
 * gives `content_v39` + `s` + `zip`. It is per-*file*, not per-project: every OTA
 * version has a different password even though the secret never changes, which is
 * why callers must pass the filename they actually downloaded.
 *
 * Throws rather than guessing when the name has no `.zip`: a silently wrong
 * password surfaces as an unhelpful "bad archive" much later.
 */
export function greencopperBundlePassword(fileName: string, secret: string): string {
  if (!fileName.endsWith(".zip")) {
    throw new Error(`greencopper bundle must be a .zip (got "${fileName}") — cannot derive password`);
  }
  return fileName.replace(/\.zip$/, `${secret}zip`);
}

/**
 * The newest *published* bundle, or null if the project has none yet.
 *
 * The app also lists `in_progress` (and `draft`) entries, which are editor
 * previews with a higher version than the live one. Serving those would show the
 * crew a schedule the festival has not published — so only `release` counts.
 */
export function pickLatestRelease(entries: GreencopperOtaEntry[]): GreencopperOtaEntry | null {
  let best: GreencopperOtaEntry | null = null;
  for (const e of entries) {
    if (e.type !== "release") continue;
    if (!best || e.version > best.version) best = e;
  }
  return best;
}

/** Resolve a strings-table key, or null when it does not resolve. */
function resolve(strings: Record<string, string>, key: string | undefined): string | null {
  if (!key) return null;
  const v = strings[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Map the decrypted bundle into engine ArtistSets (one per time slot). */
export function parseGreencopperLineup(bundle: GreencopperBundle): ArtistSet[] {
  const stageName = new Map<number, string>();
  for (const st of bundle.stages ?? []) {
    const name = resolve(bundle.strings, st.name);
    if (name) stageName.set(st.id, name);
  }

  // One schedule item can hold several slots (a set repeated across days).
  const slotsFor = new Map<number, GreencopperTimeSlot[]>();
  for (const ts of bundle.timeSlots ?? []) {
    const list = slotsFor.get(ts.scheduleItemId);
    if (list) list.push(ts);
    else slotsFor.set(ts.scheduleItemId, [ts]);
  }

  const out: ArtistSet[] = [];
  for (const item of bundle.scheduleItems ?? []) {
    const name = resolve(bundle.strings, item.name);
    // An unresolved key is a data gap, not an act called "activity_name_123".
    if (!name) continue;
    const stage = item.stageId != null ? stageName.get(item.stageId) : undefined;
    // Same rule as the Appmiral adapter: a set with no stage cannot be routed to,
    // so it is not plannable. Never infer the stage from sibling sets.
    if (!stage) continue;

    for (const ts of slotsFor.get(item.id) ?? []) {
      if (!ts.startDate || !ts.endDate) continue;
      const start = new Date(ts.startDate);
      const end = new Date(ts.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (end.getTime() <= start.getTime()) continue;
      out.push({
        name,
        slug: greencopperSlugify(name),
        stage: greencopperSlugify(stage),
        start,
        end,
        durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
      });
    }
  }

  // Deterministic order so a re-fetch diffs only genuine changes.
  out.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() || a.stage.localeCompare(b.stage) || a.name.localeCompare(b.name),
  );
  return out;
}

/** Distinct venues (slug + display name), for (re)generating venues.json. */
export function greencopperVenuesFromBundle(bundle: GreencopperBundle): VenueInfo[] {
  const bySlug = new Map<string, string>();
  for (const st of bundle.stages ?? []) {
    const name = resolve(bundle.strings, st.name);
    if (!name) continue;
    const slug = greencopperSlugify(name);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, name);
  }
  return [...bySlug].map(([slug, name]) => ({ slug, name }));
}

/**
 * Bios indexed by act slug, from each schedule item's `description` key. No extra
 * fetch — the bundle already carries them, as Appmiral's inline `body` does.
 */
export function greencopperArtistInfoMap(bundle: GreencopperBundle): Map<string, ArtistInfo> {
  const m = new Map<string, ArtistInfo>();
  for (const item of bundle.scheduleItems ?? []) {
    const name = resolve(bundle.strings, item.name);
    if (!name) continue;
    const slug = greencopperSlugify(name);
    if (m.has(slug)) continue;
    m.set(slug, { name, bio: resolve(bundle.strings, item.description) ?? "", url: "" });
  }
  return m;
}

export interface GreencopperConfig {
  /** Project tag, e.g. "electricpicnic-2026". */
  project: string;
  /** The per-project OTA manifest URL (from the app's core/config.json). */
  otaApiUrl: string;
  /** The bundle-decryption secret (from the app's assets/content/runConfig.json). */
  secret: string;
  /** Locale strings file to resolve names against (default "en-GB"). */
  locale?: string;
}

/**
 * A LineupSource for any Greencopper festival, reading a decrypted bundle that the
 * festival module supplies. Decryption itself needs a zip/AES implementation, which
 * this package deliberately does not bundle — the caller injects `readBundle`, so
 * this adapter stays pure/testable and the dependency choice stays at the edge.
 */
export function createGreencopperLineupSource(opts: {
  /** Load the bundle the planner should read (usually a committed snapshot). */
  loadBundle: () => Promise<GreencopperBundle>;
}): LineupSource {
  return {
    async loadSets(): Promise<ArtistSet[]> {
      return parseGreencopperLineup(await opts.loadBundle());
    },
  };
}

export interface GreencopperFetchDeps {
  /** Fetch the OTA manifest JSON. */
  fetchJson?: <T>(url: string) => Promise<T>;
  /** Fetch a bundle zip as bytes. */
  fetchBytes?: (url: string) => Promise<Buffer>;
}

/**
 * Resolve the newest published bundle for a project and return its decrypted,
 * parsed contents plus the version it came from.
 *
 * `decrypt` is injected rather than imported so this module stays free of the zip
 * reader (and so a caller can swap in a different one); `createGreencopperOtaFetcher`
 * below wires the in-repo pure-Node implementation.
 */
export async function fetchLatestGreencopperBundle(
  config: GreencopperConfig,
  decrypt: (zip: Buffer, password: string) => Map<string, Buffer>,
  readBundle: (entries: Map<string, Buffer>, locale?: string) => GreencopperBundle,
  deps: GreencopperFetchDeps = {},
): Promise<{ bundle: GreencopperBundle; version: number; url: string }> {
  const fetchJson =
    deps.fetchJson ??
    (async <T,>(u: string) => {
      const r = await fetch(u, { headers: { "User-Agent": "festival-bot/1.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
      return (await r.json()) as T;
    });
  const fetchBytes =
    deps.fetchBytes ??
    (async (u: string) => {
      const r = await fetch(u, { headers: { "User-Agent": "festival-bot/1.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
      return Buffer.from(await r.arrayBuffer());
    });

  const manifest = await fetchJson<GreencopperOtaEntry[]>(config.otaApiUrl);
  const latest = pickLatestRelease(manifest);
  if (!latest) {
    throw new Error(
      `greencopper project ${config.project} has no published (release) content yet — only drafts`,
    );
  }
  const fileName = latest.url.split("/").pop() ?? "";
  const zip = await fetchBytes(latest.url);
  const entries = decrypt(zip, greencopperBundlePassword(fileName, config.secret));
  return { bundle: readBundle(entries, config.locale), version: latest.version, url: latest.url };
}
