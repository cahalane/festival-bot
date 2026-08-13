/**
 * PS26 artist-info source. The lineup feed has no bio (and `artistSetGenres` is
 * null/empty even on a full edition), so the editorial write-up comes from the
 * posts API.
 *
 * PRIMARY: `getPostsBySlugName(slugnames){ components }` on the same GraphQL
 * endpoint as the lineup — the route the official Android app uses (see
 * docs/research/primavera-graphql-api.md). Earlier notes recorded this query as
 * returning "only a routing stub"; that was true of `postDescription`, which is
 * empty for artists. The body lives in `components`, which nobody had requested.
 *
 * FALLBACK: the website artist page's `window.__INITIAL_DATA__` blob (the previous
 * sole implementation, ported from artist_info.py). It is the SAME content tree —
 * the page is a render of this API — so the same walker reads both. Kept because it
 * covers artists the posts API omits, and because a scrape and an API rarely fail
 * together.
 */
import type { ArtistInfo, ArtistInfoSource } from "@festival-bot/core";
import { httpGet } from "./http.js";
import { fetchPostsBySlug, longestTextEn, postBody, postTitle, stripHtml, PS_SITE } from "./primavera-posts.js";

// Re-exported: these moved to posts.ts (both surfaces need them), but this stays
// their public import site.
export { stripHtml, longestTextEn };

const PAGE = (slug: string) => `${PS_SITE}/en/artist/${slug}`;

export function extractInitialData(html: string): unknown {
  const m =
    html.match(/window\.__INITIAL_DATA__\s*=\s*([\s\S]*?);?\s*<\/script>/) ??
    html.match(/window\.__INITIAL_DATA__\s*=\s*([^<]*)/);
  if (!m) throw new Error("no __INITIAL_DATA__ in page");
  return JSON.parse(m[1]!.replace(/;\s*$/, "").trim());
}

/** Parse a scraped page blob into an ArtistInfo (the fallback path). */
export function infoFromInitialData(blob: unknown, slug: string): ArtistInfo {
  const d = (blob ?? {}) as Record<string, unknown>;
  const postDesc = (d.postDescription ?? {}) as Record<string, unknown>;
  const title = (postDesc.title ?? {}) as Record<string, unknown>;
  const name = (typeof title.en === "string" ? title.en : undefined) ?? String(d.postName ?? slug);
  return { name, bio: stripHtml(longestTextEn(d)), url: PAGE(slug) };
}

export function createPsArtistInfoSource(
  opts: {
    fetchText?: (url: string) => Promise<string>;
    fetchJson?: <T>(url: string) => Promise<T>;
    /** Set false to skip the GraphQL path entirely (scrape only). */
    useApi?: boolean;
    /** Slugs per batched request in `infoMany` (default 50, to bound the GET URL). */
    chunkSize?: number;
  } = {},
): ArtistInfoSource {
  const fetchText = opts.fetchText ?? ((u: string) => httpGet(u, { headers: { "User-Agent": "Mozilla/5.0" } }));
  const useApi = opts.useApi ?? true;

  const scrape = async (slug: string): Promise<ArtistInfo> =>
    infoFromInitialData(extractInitialData(await fetchText(PAGE(slug))), slug);

  return {
    async info(slug: string): Promise<ArtistInfo> {
      if (useApi) {
        try {
          const [post] = await fetchPostsBySlug([slug], opts.fetchJson);
          // An artist with no write-up yet comes back with an empty body; that is a
          // real "nothing published", but the scrape may still have it, so try there
          // before settling for a blank bio.
          if (post) {
            const bio = postBody(post);
            if (bio) return { name: postTitle(post), bio, url: PAGE(slug) };
          }
        } catch {
          // API down or query rejected — fall through to the scrape rather than
          // failing the lookup outright.
        }
      }
      return scrape(slug);
    },

    /**
     * Batched bios. `getPostsBySlugName` takes the whole slug list in one request
     * (60 slugs = one 1.5KB URL, ~400ms, measured 2026-08-12), which is what makes
     * a full-lineup Clashfinder push practical: it was one HTTP round trip per act.
     *
     * Chunked because this is a GET — the slug list rides in the query string, and
     * a few hundred acts would build a URL long enough for an intermediary to
     * reject. 50 keeps it comfortably under 2KB.
     *
     * Returns only slugs that produced a real bio, per the ArtistInfoSource
     * contract. Anything absent — unknown slug, no write-up published, or a chunk
     * that errored — is left for the caller's per-slug `info()` fallback, which
     * still has the scrape. So this can only ever be faster, never lossier.
     */
    async infoMany(slugs: string[]): Promise<Map<string, ArtistInfo>> {
      const out = new Map<string, ArtistInfo>();
      if (!useApi) return out;
      const chunkSize = opts.chunkSize ?? 50;
      const unique = [...new Set(slugs.filter(Boolean))];
      for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        let posts;
        try {
          posts = await fetchPostsBySlug(chunk, opts.fetchJson);
        } catch {
          continue; // this chunk falls back to per-slug lookups
        }
        for (const post of posts) {
          const bio = postBody(post);
          if (post.slugName && bio) {
            out.set(post.slugName, { name: postTitle(post), bio, url: PAGE(post.slugName) });
          }
        }
      }
      return out;
    },
  };
}
