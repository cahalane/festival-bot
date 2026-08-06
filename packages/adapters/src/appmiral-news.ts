/**
 * Appmiral news adapter — the OFFICIAL ATN back-channel, on the same Content API
 * (and same static `x-protect` auth) we already pull the lineup from. Two surfaces:
 *
 *   - /notifications  the push-notification / news inbox feed (dated announcements)
 *   - /pages          the CMS info pages (campsite times, event times, …) — static
 *                     reference, but each carries `modified_at`, so edits are detectable
 *
 * This replaced the abandoned Instagram approach (see docs/research/
 * instagram-announcements-infeasible.md): official, reliable, no scraping/login/ban.
 * Never present its output as first-hand — it's what ATN posted, attributed as such.
 */
import type { Announcement, AnnouncementsSource, PageDetail, PageRef, PagesSource } from "@festival-bot/core";
import { httpGetJson } from "./http.js";

export type { PageDetail, PageRef, PagesSource };
import { APPMIRAL_BASE, appmiralHeaders, type AppmiralConfig } from "./appmiral.js";

// ---- Notifications -------------------------------------------------------

export interface AppmiralNotification {
  id: number;
  show_inbox?: boolean;
  title: string;
  body?: string;
  image?: string | null;
  sent_time: string; // ISO with offset
  deleted_at?: string | null;
}
export interface AppmiralNotificationsResponse {
  data: AppmiralNotification[];
  _meta?: { total_count?: number };
}

export function appmiralNotificationsUrl(c: AppmiralConfig): string {
  const base = c.baseUrl ?? APPMIRAL_BASE;
  return `${base}/events/${c.event}/editions/${c.edition}/notifications`;
}

/** Live, inbox-visible notifications → Announcements, newest-first. */
export function mapNotifications(raw: AppmiralNotificationsResponse): Announcement[] {
  return (raw.data ?? [])
    .filter((n) => !n.deleted_at && n.show_inbox !== false)
    .map((n) => {
      const text = n.body ? `${n.title}\n${n.body}` : n.title;
      return {
        id: String(n.id),
        text,
        createdAt: n.sent_time,
        ...(n.image ? { imageUrl: n.image } : {}),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createAppmiralNotificationsSource(
  config: AppmiralConfig,
  opts: { fetchJson?: <T>(url: string, headers: Record<string, string>) => Promise<T> } = {},
): AnnouncementsSource {
  const fetchJson = opts.fetchJson ?? (<T>(u: string, h: Record<string, string>) => httpGetJson<T>(u, { headers: h }));
  return {
    async latest(limit = 10): Promise<Announcement[]> {
      const raw = await fetchJson<AppmiralNotificationsResponse>(appmiralNotificationsUrl(config), appmiralHeaders(config));
      return mapNotifications(raw).slice(0, limit);
    },
  };
}

// ---- Pages (change-detection) -------------------------------------------

export interface AppmiralPage {
  id: number;
  title: string;
  modified_at: string; // ISO with offset
  body?: string;
}
export interface AppmiralPagesResponse {
  data: AppmiralPage[];
  _meta?: { total_count?: number };
}

export interface PagesDiff {
  added: PageRef[];
  removed: PageRef[];
  changed: PageRef[];
}

export function appmiralPagesUrl(c: AppmiralConfig): string {
  const base = c.baseUrl ?? APPMIRAL_BASE;
  return `${base}/events/${c.event}/editions/${c.edition}/pages`;
}

export function pageRefs(raw: AppmiralPagesResponse): PageRef[] {
  return (raw.data ?? []).map((p) => ({ id: String(p.id), title: p.title, modifiedAt: p.modified_at }));
}

/** Added = new id; removed = gone id; changed = same id, newer/different modifiedAt. */
export function diffPages(prev: PageRef[], cur: PageRef[]): PagesDiff {
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const curById = new Map(cur.map((p) => [p.id, p]));
  const added = cur.filter((p) => !prevById.has(p.id));
  const removed = prev.filter((p) => !curById.has(p.id));
  const changed = cur.filter((p) => {
    const was = prevById.get(p.id);
    return was && was.modifiedAt !== p.modifiedAt;
  });
  return { added, removed, changed };
}

export async function fetchPageRefs(
  config: AppmiralConfig,
  opts: { fetchJson?: <T>(url: string, headers: Record<string, string>) => Promise<T> } = {},
): Promise<PageRef[]> {
  const fetchJson = opts.fetchJson ?? (<T>(u: string, h: Record<string, string>) => httpGetJson<T>(u, { headers: h }));
  const raw = await fetchJson<AppmiralPagesResponse>(appmiralPagesUrl(config), appmiralHeaders(config));
  return pageRefs(raw);
}

/**
 * Render a CMS HTML body to plain text for terminal display: drop tags, decode the
 * handful of entities Appmiral emits, collapse each block-level element to its own line,
 * and squash runs of blank lines. Pure — unit-tested.
 */
export function renderPageBody(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/\r?\n/g, " ") // source line breaks are formatting, not content — only tags break lines
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fetch one page's full text body by id, or null if no page has that id. */
export async function fetchPage(
  config: AppmiralConfig,
  id: string,
  opts: { fetchJson?: <T>(url: string, headers: Record<string, string>) => Promise<T> } = {},
): Promise<PageDetail | null> {
  const fetchJson = opts.fetchJson ?? (<T>(u: string, h: Record<string, string>) => httpGetJson<T>(u, { headers: h }));
  const raw = await fetchJson<AppmiralPagesResponse>(appmiralPagesUrl(config), appmiralHeaders(config));
  const p = (raw.data ?? []).find((x) => String(x.id) === String(id));
  if (!p) return null;
  return { id: String(p.id), title: p.title, modifiedAt: p.modified_at, body: renderPageBody(p.body) };
}

export function createAppmiralPagesSource(
  config: AppmiralConfig,
  opts: { fetchJson?: <T>(url: string, headers: Record<string, string>) => Promise<T> } = {},
): PagesSource {
  return {
    refs: () => fetchPageRefs(config, opts),
    page: (id: string) => fetchPage(config, id, opts),
  };
}
