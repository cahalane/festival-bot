/**
 * Lineup -> Clashfinder "setup text" exporter (cross-festival reusable).
 *
 * Translates the engine's ArtistSet model into Clashfinder's config language so we
 * can keep our OWN Clashfinder event (clashfinder.com/m/<event>) current from the
 * same lineup data the planner uses, and re-emit when a festival's timetable
 * changes. Uses the JSON `act` form (one self-contained line per set): it carries
 * absolute local date+time and its own stage, so there's no day/stage state
 * machine, and act names with commas are safe inside the JSON string.
 *
 * Clashfinder times are LOCAL wall-clock (yyyy-mm-dd hh:mm, no timezone), so each
 * instant is rendered in the festival timezone. See
 * docs/research/clashfinder-config-reference.md for the command reference.
 */
import { createHash } from "node:crypto";
import type { ArtistSet } from "@festival-bot/core";
import { stripActSuffixes } from "./musicbrainz.js";

/**
 * Turn a festival's HTML bio into a Clashfinder `blurb`: strip tags, decode common
 * entities, and render paragraph/line breaks as blank lines (`\n\n`). Used for both
 * ATN (inline `body`) and PS (scraped bio).
 */
export function htmlToBlurb(html: string): string {
  if (!html) return "";
  const text = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(?:p|div|li|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'");
  return text
    .split(/\n+/)
    .map((p) => p.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Clashfinder login-cookie token: `user,sha1(user+password)`. CF hashes the
 * password client-side and never sends it; the server validates this token. So
 * the login can be minted/refreshed locally — the cookie is long-lived (10y), so
 * recompute only if the password changes. Keep the password in gitignored secrets.
 */
export function clashfinderUserLogin(user: string, password: string): string {
  return `${user},${createHash("sha1").update(user + password).digest("hex")}`;
}

/** Render an instant as Clashfinder local wall time "yyyy-mm-dd hh:mm" in `tz`. */
export function clashfinderLocalTime(d: Date, tz: string): string {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`;
}

export interface ClashfinderActOptions {
  /** Festival timezone for local wall-time conversion (e.g. "Europe/Madrid"). */
  timezone: string;
  /** Stage slug -> display name (default: the slug itself). */
  stageName?: (slug: string) => string;
  /** Canonical artist name -> CF "artist" (default: act name with suffixes stripped). */
  artist?: string;
  /** Brief description -> CF "blurb". */
  blurb?: string;
  /** Act website -> CF "url". */
  url?: string;
  /** Mark the set's times as estimated -> CF "estd":"1". */
  estimated?: boolean;
  /** MusicBrainz ID -> CF "mbid". */
  mbid?: string;
}

/** One `act = {json}` line for a single set. */
export function toClashfinderAct(set: ArtistSet, opts: ClashfinderActOptions): string {
  const name = opts.stageName ? opts.stageName(set.stage) : set.stage;
  const act: Record<string, string> = {
    start: clashfinderLocalTime(set.start, opts.timezone),
    end: clashfinderLocalTime(set.end, opts.timezone),
    stage: name,
    act: set.name,
  };
  // CF "artist" = the act name without performance suffixes ("(DJ Set)", "(Live)").
  // Only emit it when it differs from the displayed act name.
  const artist = opts.artist ?? stripActSuffixes(set.name);
  if (artist && artist !== set.name) act.artist = artist;
  if (opts.blurb) act.blurb = opts.blurb;
  if (opts.url) act.url = opts.url;
  if (opts.estimated) act.estd = "1";
  if (opts.mbid) act.mbid = opts.mbid;
  return `act = ${JSON.stringify(act)}`;
}

type Extras = (set: ArtistSet) => {
  artist?: string;
  blurb?: string;
  url?: string;
  estimated?: boolean;
  mbid?: string;
};

export interface ClashfinderSetupOptions
  extends Omit<ClashfinderActOptions, "blurb" | "url" | "estimated" | "artist" | "mbid"> {
  /** Event title shown at the top of every page. */
  mainTitle?: string;
  /** Footer lines (bottom-right; ~3 fit). */
  footer?: string[];
  /** Twitter hashtags/handles for the Tweet button. */
  hashtags?: string[];
  /** Display defaults as key=>value (e.g. end-tm=>04:00). */
  defaults?: Record<string, string>;
  /** Per-set extras (artist/blurb/url/estimated/mbid). */
  extras?: Extras;
}

/** Sorted `act = {json}` lines for a set list (shared by text export + editor push). */
function clashfinderActLines(
  sets: ArtistSet[],
  opts: {
    timezone: string;
    stageName?: (slug: string) => string;
    extras?: Extras;
    stageOrder?: (slug: string) => number;
  },
): string[] {
  // Clashfinder renders stages in the order their first act appears in the pushed
  // act list. When a stageOrder is supplied, group acts by stage in that order (then
  // by time within a stage) so the mirror's stage order matches it — e.g. the ATN
  // app's stage order. Without it, fall back to pure chronological order.
  const ord = opts.stageOrder;
  const ordered = [...sets].sort((a, b) => {
    if (ord) {
      const d = ord(a.stage) - ord(b.stage);
      if (d !== 0) return d;
    }
    return a.start.getTime() - b.start.getTime() || a.stage.localeCompare(b.stage);
  });
  return ordered.map((s) => {
    const extra = opts.extras?.(s) ?? {};
    return toClashfinderAct(s, {
      timezone: opts.timezone,
      stageName: opts.stageName,
      artist: extra.artist,
      blurb: extra.blurb,
      url: extra.url,
      estimated: extra.estimated,
      mbid: extra.mbid,
    });
  });
}

/** Full Clashfinder setup text: header block + one act line per set (sorted). */
export function toClashfinderSetup(sets: ArtistSet[], opts: ClashfinderSetupOptions): string {
  const head: string[] = [];
  if (opts.mainTitle) head.push(`mainTitle = ${opts.mainTitle}`);
  for (const [k, v] of Object.entries(opts.defaults ?? {})) head.push(`defaults = ${k}=>${v}`);
  if (opts.hashtags?.length) head.push(`hashtags = ${opts.hashtags.join(" ")}`);
  const acts = clashfinderActLines(sets, opts);
  const foot = (opts.footer ?? []).map((f) => `footer = ${f}`);
  return [...head, ...acts, ...foot].join("\n") + "\n";
}

const CRLF = "\r\n";
const CINFO_XLSETUP =
  "colTypeSel=date|starttime|endtime|name|stg|unused|unused|unused," +
  "dataImportUsDateFmt=false,dataImportReplaceData=false," +
  // Retain the stage order as pushed (stages render in first-act-appearance order),
  // so a stageOrder-sorted act list keeps its order rather than being re-sorted by CF.
  "dataImportRetainStageOrder=true,dataImportAddDayToEarlyActs=false";

export interface ClashfinderFieldsOptions {
  timezone: string;
  stageName?: (slug: string) => string;
  mainTitle?: string;
  /** Festival day cutoff hour -> CF `daychangeover = hh:00` (post-midnight grouping). */
  dayChangeoverHour?: number;
  dateFormat?: string;
  printAdvisory?: number;
  footer?: string[];
  hashtags?: string[];
  /** Emit lpRevisions/lpComments landing-page blocks (default true). */
  landingPage?: boolean;
  extras?: Extras;
  /** Stage slug -> sort rank; stages render in this order on the mirror (default: chronological). */
  stageOrder?: (slug: string) => number;
}

export interface ClashfinderFields {
  /** Editor field 0: setup directives. */
  input0: string;
  /** Editor field 1: act lines. */
  input1: string;
}

/** Split setup text into the editor's two fields (directives vs acts). */
export function toClashfinderFields(sets: ArtistSet[], opts: ClashfinderFieldsOptions): ClashfinderFields {
  const head: string[] = [];
  if (opts.mainTitle) head.push(`maintitle = ${opts.mainTitle}`);
  head.push(`timezone = ${opts.timezone}`);
  head.push(`dateFormat = ${opts.dateFormat ?? "dddd dS mmmm"}`);
  head.push(`printAdvisory = ${opts.printAdvisory ?? 2}`);
  for (const f of opts.footer ?? []) head.push(`footer = ${f}`);
  if (opts.hashtags?.length) head.push(`hashtags = ${opts.hashtags.join(" ")}`);
  if (opts.dayChangeoverHour != null) {
    head.push(`daychangeover = ${String(opts.dayChangeoverHour).padStart(2, "0")}:00`);
  }
  if (opts.landingPage !== false) {
    head.push("lpRevisions");
    head.push("lpComments");
  }
  return { input0: head.join(CRLF), input1: clashfinderActLines(sets, opts).join(CRLF) };
}

export interface ClashfinderPushFields extends ClashfinderFields {
  /** Event description (cinfo-desc). */
  desc: string;
  /** Revision note recorded with the edit. */
  revNote: string;
}

/** Form-urlencoded body for the editor save POST. */
export function buildClashfinderPushBody(f: ClashfinderPushFields): string {
  const p = new URLSearchParams();
  p.set("input0", f.input0);
  p.set("input1", f.input1);
  p.set("user", "");
  p.set("revNote", f.revNote);
  p.set("entData", "Update");
  p.set("cinfo-desc", f.desc);
  p.set("cinfo-private", "0");
  p.set("cinfo-privateExceptUsers", "");
  p.set("cinfo-adminList", "");
  p.set("cinfo-whoCanEdit", "anyone");
  p.set("cinfo-whoCanTag", "anyone");
  p.set("cinfo-autoMbIdTagging", "1");
  p.set("cinfo-editWhitelist", "");
  p.set("cinfo-editBlacklist", "");
  p.set("cinfo-xlSetup", CINFO_XLSETUP);
  return p.toString();
}

export interface ClashfinderWriteCreds {
  /** Durable login token cookie ("user,token") — the whole of the write auth. */
  userLogin: string;
}

export interface ClashfinderPushResult {
  ok: boolean;
  status: number;
  /** True if the response looks like a login wall (session needs refresh). */
  staleSession: boolean;
  finalUrl: string;
  body: string;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  url: string;
  text(): Promise<string>;
}
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponseLike>;

/**
 * Push setup text to a Clashfinder event via the editor save endpoint. Auth is the
 * operator's `userLogin` cookie alone (NOT the read API key). Detects a login wall
 * so the caller can refresh credentials rather than silently no-op.
 */
export async function pushClashfinder(
  event: string,
  fields: ClashfinderPushFields,
  creds: ClashfinderWriteCreds,
  opts: { fetchImpl?: FetchLike } = {},
): Promise<ClashfinderPushResult> {
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<FetchResponseLike>);
  const cookie = `userLogin=${creds.userLogin}`;
  const url = `https://clashfinder.com/s/${encodeURIComponent(event)}/?edit`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: buildClashfinderPushBody(fields),
  });
  const body = await res.text();
  const finalUrl = res.url || url;
  const staleSession = /\/login/i.test(finalUrl) || /please log in|log ?in to continue|sign in to/i.test(body);
  return { ok: res.ok && !staleSession, status: res.status, staleSession, finalUrl, body };
}
