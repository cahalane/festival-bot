/**
 * PS26 artist-info source (festival-specific scrape). The lineup feed has no
 * genre/bio (artistSetGenres is null); the website artist page embeds a
 * `window.__INITIAL_DATA__` blob whose largest `text.en` HTML block is the
 * editorial write-up. Ported from artist_info.py.
 */
import type { ArtistInfo, ArtistInfoSource } from "@festival-bot/core";
import { httpGet } from "@festival-bot/adapters";

const PAGE = (slug: string) => `https://www.primaverasound.com/en/artist/${slug}`;

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/** The bio is the largest `text.en` HTML string (containing a tag) in the tree. */
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

export function extractInitialData(html: string): unknown {
  const m =
    html.match(/window\.__INITIAL_DATA__\s*=\s*([\s\S]*?);?\s*<\/script>/) ??
    html.match(/window\.__INITIAL_DATA__\s*=\s*([^<]*)/);
  if (!m) throw new Error("no __INITIAL_DATA__ in page");
  return JSON.parse(m[1]!.replace(/;\s*$/, "").trim());
}

export function createArtistInfoSource(opts: { fetchText?: (url: string) => Promise<string> } = {}): ArtistInfoSource {
  const fetchText = opts.fetchText ?? ((u: string) => httpGet(u, { headers: { "User-Agent": "Mozilla/5.0" } }));
  return {
    async info(slug: string): Promise<ArtistInfo> {
      const d = extractInitialData(await fetchText(PAGE(slug))) as Record<string, unknown>;
      const postDesc = (d.postDescription ?? {}) as Record<string, unknown>;
      const title = (postDesc.title ?? {}) as Record<string, unknown>;
      const name = (typeof title.en === "string" ? title.en : undefined) ?? String(d.postName ?? slug);
      return { name, bio: stripHtml(longestTextEn(d)), url: PAGE(slug) };
    },
  };
}
