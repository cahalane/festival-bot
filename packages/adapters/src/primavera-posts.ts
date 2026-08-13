/**
 * PS26 editorial "posts" API — the second half of the Primavera GraphQL surface,
 * discovered by decompiling the official Android app (com.primaverasound.barcelona
 * v1.0.41; see docs/research/primavera-graphql-api.md).
 *
 * The app reads ALL of its editorial content — artist write-ups and festival news —
 * from two fields on the same unauthenticated endpoint the lineup comes from:
 *
 *   - getPostsBySlugName(slugnames)      one or MANY posts by slug, batched
 *   - getPostsListWithTotal(category…)   the paged news feed, newest-first
 *
 * The key discovery is `components`: a post's body is not in `postDescription`
 * (which comes back empty for artists — the stub our earlier note recorded) but in
 * a nested `components` tree of `text.{en,es,ca,pt}` blocks. That tree is byte-for-byte
 * what the website ships in `window.__INITIAL_DATA__`, which is why the same
 * `longestTextEn` walker reads both — the scrape was reading the API's output all
 * along, just through an HTML page. Going direct drops the HTML parse, batches N
 * artists into ONE request, and is a documented app endpoint rather than page shape.
 *
 * Content-tree helpers live here (not in artist-info) because both surfaces need
 * them; artist-info re-exports them so its existing import site keeps working.
 */
import type { PageDetail, PageRef, PagesSource } from "@festival-bot/core";
import { httpGetJson } from "./http.js";
import { PS_ENDPOINT } from "./primavera-graphql.js";

/** Public site root — post `url`s are site-relative. */
export const PS_SITE = "https://www.primaverasound.com";

/**
 * Barcelona-scoped news. Posts are multi-tagged (`["news","barcelona","home"]`);
 * filtering on `barcelona` keeps São Paulo / Porto / Primavera Pro out of a
 * Barcelona crew's feed.
 */
export const PS_NEWS_CATEGORY = "barcelona";

// ---- Content tree --------------------------------------------------------

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/**
 * The write-up is the largest `text.en` HTML string (one containing a tag) anywhere
 * in the tree. Shared by the GraphQL `components` tree and the website's
 * `__INITIAL_DATA__` blob — they are the same structure.
 */
export function longestTextEn(o: unknown): string {
  let best = "";
  if (Array.isArray(o)) {
    for (const v of o) {
      const c = longestTextEn(v);
      if (c.length > best.length) best = c;
    }
  } else if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>;
    const t = rec.text;
    if (t && typeof t === "object") {
      const en = (t as Record<string, unknown>).en;
      if (typeof en === "string" && en.includes("<")) best = en;
    }
    for (const v of Object.values(rec)) {
      const c = longestTextEn(v);
      if (c.length > best.length) best = c;
    }
  }
  return best;
}

// ---- Wire shapes ---------------------------------------------------------

interface Multilang {
  en?: string | null;
}
export interface PsPostDescription {
  title?: Multilang | null;
  subtitle?: Multilang | null;
  description?: Multilang | null;
  image?: Multilang | null;
  url?: string | null;
  date?: string | null; // epoch ms, as a string
}
export interface PsPost {
  slugName: string;
  postName?: string | null;
  /** e.g. `["artist","bits"]` — `bits` marks a separately-ticketed Primavera Bits act. */
  postCategory?: string[] | null;
  components?: unknown;
  postDescription?: PsPostDescription | null;
}
interface PostsBySlugResponse {
  data?: { getPostsBySlugName?: PsPost[] | null } | null;
  errors?: { message?: string }[];
}
interface PostsListResponse {
  data?: { getPostsListWithTotal?: { posts?: PsPost[] | null } | null } | null;
  errors?: { message?: string }[];
}

// ---- Queries -------------------------------------------------------------

const POSTS_BY_SLUG = `query P($slugnames: [String]!) {
  getPostsBySlugName(slugnames: $slugnames) {
    slugName
    postName
    postCategory
    components
    postDescription { title { en } subtitle { en } description { en } image { en } url date }
  }
}`;

const POSTS_LIST = `query L($category: [String], $from: Int!, $to: Int!) {
  getPostsListWithTotal(category: $category, from: $from, to: $to) {
    posts {
      slugName
      postCategory
      postDescription { title { en } subtitle { en } description { en } image { en } url date }
    }
  }
}`;

export function gqlUrl(query: string, variables: unknown, operationName: string): string {
  const q = new URLSearchParams({
    query,
    operationName,
    variables: JSON.stringify(variables),
  });
  return `${PS_ENDPOINT}?${q.toString()}`;
}

export function postsBySlugUrl(slugs: string[]): string {
  return gqlUrl(POSTS_BY_SLUG, { slugnames: slugs }, "P");
}

export function postsListUrl(opts: { category?: string; from?: number; to?: number } = {}): string {
  const category = opts.category ?? PS_NEWS_CATEGORY;
  return gqlUrl(POSTS_LIST, { category: [category], from: opts.from ?? 0, to: opts.to ?? 20 }, "L");
}

/**
 * GraphQL answers 200 with an `errors` array, so a failed query looks like a
 * successful fetch. Surface it as an error rather than returning an empty feed —
 * a silent [] reads downstream as "nothing announced", which is exactly the
 * quiet-guess failure the data-accuracy rules forbid.
 */
function unwrap<T>(res: { data?: T | null; errors?: { message?: string }[] }, what: string): T {
  if (res.errors?.length) {
    throw new Error(`Primavera GraphQL error on ${what}: ${res.errors.map((e) => e.message ?? "?").join("; ")}`);
  }
  if (!res.data) throw new Error(`Primavera GraphQL returned no data for ${what}`);
  return res.data;
}

type FetchJson = <T>(url: string) => Promise<T>;
const defaultFetch: FetchJson = (u) => httpGetJson(u);

/**
 * Fetch posts by slug, batched. Unknown slugs are silently omitted by the API
 * (5 requested, 4 returned), so callers must match on `slugName`, never on index.
 */
export async function fetchPostsBySlug(slugs: string[], fetchJson: FetchJson = defaultFetch): Promise<PsPost[]> {
  if (!slugs.length) return [];
  const res = await fetchJson<PostsBySlugResponse>(postsBySlugUrl(slugs));
  return unwrap(res, "getPostsBySlugName").getPostsBySlugName ?? [];
}

/**
 * A post's rendered write-up: the `components` tree, HTML stripped.
 *
 * Not every post has extractable prose. Artist write-ups and most articles are
 * `text.en` blocks, but some news posts (e.g. the daily festival "Journal") ship
 * their body as an `Embed` holding an entire HTML newsletter email under `code.en`
 * — boilerplate tables and inline CSS with no clean article text. We deliberately
 * do NOT scrape those: the extractable summary plus a link is honest, where a
 * de-tagged email dump would be noise dressed up as content.
 */
export function postBody(p: PsPost): string {
  const fromComponents = stripHtml(longestTextEn(p.components));
  if (fromComponents) return fromComponents;
  // Feed posts (list view) carry no components — fall back to the summary fields.
  const d = p.postDescription ?? {};
  return stripHtml(d.description?.en ?? d.subtitle?.en ?? "");
}

/**
 * Page body for terminal display: the write-up plus the canonical link. When a post
 * has no real body, its "summary" is often just the title echoed back — showing that
 * twice reads as broken, so fall back to the link alone.
 */
export function pageBody(p: PsPost): string {
  const body = postBody(p);
  const link = postUrl(p);
  return body && body !== postTitle(p) ? `${body}\n\n${link}` : link;
}

export function postTitle(p: PsPost): string {
  return p.postDescription?.title?.en?.trim() || (p.postName ?? "").trim() || p.slugName;
}

/** Absolute URL for a post — `url` is site-relative when present. */
export function postUrl(p: PsPost): string {
  const u = p.postDescription?.url;
  if (u) return u.startsWith("http") ? u : `${PS_SITE}${u}`;
  return `${PS_SITE}/en/news/${p.slugName}`;
}

/** `date` is epoch milliseconds as a string; render ISO. Empty when absent. */
export function postDateIso(p: PsPost): string {
  const raw = p.postDescription?.date;
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  return new Date(n).toISOString();
}

export function isBits(p: PsPost): boolean {
  return (p.postCategory ?? []).includes("bits");
}

export function toPageRef(p: PsPost): PageRef {
  return { id: p.slugName, title: postTitle(p), modifiedAt: postDateIso(p) };
}

// ---- Pages source (official news, change-watchable) ----------------------

/**
 * The festival's OFFICIAL editorial feed, shaped as a PagesSource so ps26 gets the
 * `page` command and the `pages-tick` change-watch that atn26 already has off
 * Appmiral's CMS. It is the counterpart to — NOT a replacement for — the BlueSky
 * announcements source: BlueSky is the live ops channel (stage delays, weather),
 * this is the slower editorial one (programme news, ticket waves, line-up reveals).
 */
export function createPsPagesSource(
  opts: { category?: string; limit?: number; fetchJson?: FetchJson } = {},
): PagesSource {
  const fetchJson = opts.fetchJson ?? defaultFetch;
  const listPosts = async (): Promise<PsPost[]> => {
    const res = await fetchJson<PostsListResponse>(
      postsListUrl({ category: opts.category, from: 0, to: opts.limit ?? 20 }),
    );
    return unwrap(res, "getPostsListWithTotal").getPostsListWithTotal?.posts ?? [];
  };
  return {
    async refs(): Promise<PageRef[]> {
      return (await listPosts()).map(toPageRef);
    },
    async page(id: string): Promise<PageDetail | null> {
      // Detail needs the by-slug query: the list view carries no `components`.
      const [p] = await fetchPostsBySlug([id], fetchJson);
      if (!p) return null;
      return { ...toPageRef(p), body: pageBody(p) };
    },
  };
}
