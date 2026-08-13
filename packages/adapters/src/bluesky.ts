/**
 * PS26 announcements source — the official BlueSky feed via the PUBLIC AT
 * Protocol API (no auth, no JS wall). This was the real-time channel during the
 * Thu 4 Jun weather chaos when the website/socials were unreadable. Note:
 * announcement graphics carry no alt-text — the content is in the image, so
 * `imageUrl` matters. Ported from bsky_watch.py.
 */
import type { Announcement, AnnouncementsSource } from "@festival-bot/core";
import { httpGetJson } from "./http.js";

const API = "https://public.api.bsky.app/xrpc";
const DEFAULT_ACTOR = "primavera-sound.bsky.social";

interface BskyImage {
  image?: { ref?: { $link?: string; link?: string } };
  alt?: string;
}
interface BskyFeedItem {
  post: {
    uri: string;
    record?: {
      text?: string;
      createdAt?: string;
      embed?: { images?: BskyImage[]; media?: { images?: BskyImage[] } };
    };
  };
}
interface BskyFeed {
  feed?: BskyFeedItem[];
}

export function mapFeed(data: BskyFeed): Announcement[] {
  const out: Announcement[] = [];
  for (const it of data.feed ?? []) {
    const p = it.post;
    const rec = p.record ?? {};
    const emb = rec.embed ?? {};
    const imgs = emb.images ?? emb.media?.images ?? [];
    const did = p.uri.split("/")[2]!;
    let imageUrl: string | undefined;
    for (const im of imgs) {
      const link = im.image?.ref?.$link ?? im.image?.ref?.link;
      if (link) {
        imageUrl = `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${link}@jpeg`;
        break;
      }
    }
    out.push({
      id: p.uri,
      text: rec.text ?? "",
      createdAt: rec.createdAt ?? "",
      ...(imageUrl ? { imageUrl } : {}),
    });
  }
  return out;
}

export function createBlueskyAnnouncementsSource(
  opts: { actor?: string; fetchJson?: <T>(url: string) => Promise<T> } = {},
): AnnouncementsSource {
  const actor = opts.actor ?? DEFAULT_ACTOR;
  const fetchJson = opts.fetchJson ?? (<T>(u: string) => httpGetJson<T>(u));
  return {
    async latest(limit = 20): Promise<Announcement[]> {
      const q = new URLSearchParams({ actor, limit: String(limit), filter: "posts_no_replies" });
      const data = await fetchJson<BskyFeed>(`${API}/app.bsky.feed.getAuthorFeed?${q}`);
      return mapFeed(data);
    },
  };
}
