/**
 * Generic Clashfinder client + pure transforms (cross-festival reusable).
 *
 * A festival supplies its event slug + the operator's pre-minted auth credential
 * (authUsername/authPublicKey). Highlights come from a user's public mobile page
 * (no per-user key); short codes resolve to artist names via the authenticated
 * event JSON. Mirrors the PS26 cf_favs behaviour incl. stale-cache fallback.
 */
import type { FavouriteTier } from "@festival-bot/core";
import { httpGet, httpGetJson, cachedJson } from "./http.js";

/** Extract the balanced `cg.gets` object embedded in the mobile page HTML. */
export function parseGets(html: string): Record<string, string> {
  const anchor = html.indexOf("gets:");
  if (anchor < 0) throw new Error("could not find cg.gets");
  const seg = html.slice(anchor);
  const start = seg.indexOf("{");
  let depth = 0;
  for (let j = start; j < seg.length; j++) {
    if (seg[j] === "{") depth++;
    else if (seg[j] === "}") depth--;
    if (depth === 0) return JSON.parse(seg.slice(start, j + 1)) as Record<string, string>;
  }
  throw new Error("could not parse cg.gets");
}

interface EventJson {
  locations?: { events?: { short?: string; name: string }[] }[];
  auth?: { result?: string };
}

/** short code "ouinet(1)" -> highlight code "ouinet-1" -> artist name. */
export function buildEventMap(ev: EventJson): Map<string, string> {
  const m = new Map<string, string>();
  for (const loc of ev.locations ?? []) {
    for (const e of loc.events ?? []) {
      const code = (e.short ?? "").replaceAll("(", "-").replaceAll(")", "");
      if (code) m.set(code, e.name);
    }
  }
  return m;
}

/**
 * Second reading of a highlight code the event map doesn't carry.
 *
 * When one act has several performances, Clashfinder can store a highlight in a
 * THREE-segment form ("fortho-1-2") that the event feed never publishes — it
 * lists "fortho-1" and "fortho-2". A crew member re-starred For Those I Love on
 * 2026-07-27, it came back unmatched, and they were told the pick wasn't in their
 * favourites. It was; we couldn't read it.
 *
 * Deliberately narrow: base + final segment, and ONLY when the event map has that
 * exact code. Anything looser rebuilds the res/pinkpantheress phantom match,
 * where a near-miss silently routes someone to an act they never picked.
 */
function resolveNested(code: string, codeToName: Map<string, string>): string | undefined {
  const parts = code.split("-");
  if (parts.length < 3) return undefined;
  return codeToName.get(`${parts[0]}-${parts[parts.length - 1]}`);
}

/** Ordered highlight tiers (hl1..hl20). Unresolved codes preserved as "?code". */
export function resolveTiers(gets: Record<string, string>, codeToName: Map<string, string>): FavouriteTier[] {
  const tiers: FavouriteTier[] = [];
  for (let i = 1; i <= 20; i++) {
    const codes = gets[`hl${i}`];
    if (!codes) continue;
    const label = gets[`hl-name${i}`] || `set ${i}`;
    const names = codes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => codeToName.get(c) ?? resolveNested(c, codeToName) ?? `?${c}`);
    tiers.push({ label, names });
  }
  return tiers;
}

export interface ClashfinderAuth {
  event: string;
  authUsername: string;
  authPublicKey: string;
}

export interface ClashfinderClient {
  eventMap(): Promise<Map<string, string>>;
  tiersFor(user: string): Promise<{ tiers: FavouriteTier[]; stale: boolean }>;
}

export function createClashfinderClient(
  auth: ClashfinderAuth,
  opts: {
    cacheDir?: string;
    fetchText?: (url: string) => Promise<string>;
    fetchJson?: <T>(url: string) => Promise<T>;
  } = {},
): ClashfinderClient {
  const fetchText = opts.fetchText ?? ((u: string) => httpGet(u));
  const fetchJson = opts.fetchJson ?? (<T>(u: string) => httpGetJson<T>(u));
  const authQ = new URLSearchParams({ authUsername: auth.authUsername, authPublicKey: auth.authPublicKey });

  async function eventMap(): Promise<Map<string, string>> {
    const url = `https://clashfinder.com/data/event/${auth.event}.json?${authQ}`;
    const fetchEvent = async () => {
      const ev = await fetchJson<EventJson>(url);
      if (ev.auth?.result && ev.auth.result !== "pass") {
        throw new Error(`Clashfinder auth failed: ${ev.auth.result}`);
      }
      return ev;
    };
    const ev = opts.cacheDir
      ? (await cachedJson<EventJson>({ file: `${opts.cacheDir}/cf_event.json`, maxAgeMs: 24 * 3_600_000, fetch: fetchEvent })).data
      : await fetchEvent();
    return buildEventMap(ev);
  }

  async function tiersFor(user: string): Promise<{ tiers: FavouriteTier[]; stale: boolean }> {
    // The event map (codes->names) already rides a stale-cache fallback when a
    // cacheDir is set; the user's highlight page is small and fetched live.
    const url = `https://clashfinder.com/m/${auth.event}/?user=${encodeURIComponent(user)}`;
    const html = await fetchText(url);
    const tiers = resolveTiers(parseGets(html), await eventMap());
    return { tiers, stale: false };
  }

  return { eventMap, tiersFor };
}
