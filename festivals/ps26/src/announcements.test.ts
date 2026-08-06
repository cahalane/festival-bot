import { describe, expect, test } from "vitest";
import { mapFeed } from "./announcements.js";

describe("mapFeed", () => {
  const feed = {
    feed: [
      {
        post: {
          uri: "at://did:plc:abc/app.bsky.feed.post/xyz",
          record: {
            text: "Main stages paused due to weather",
            createdAt: "2026-06-04T18:47:00.000Z",
            embed: { images: [{ image: { ref: { $link: "bafyimg1" } }, alt: "" }] },
          },
        },
      },
    ],
  };

  test("maps a bsky author feed to announcements with a CDN image URL", () => {
    const [a] = mapFeed(feed);
    expect(a).toEqual({
      id: "at://did:plc:abc/app.bsky.feed.post/xyz",
      text: "Main stages paused due to weather",
      createdAt: "2026-06-04T18:47:00.000Z",
      imageUrl: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/bafyimg1@jpeg",
    });
  });

  test("handles posts with no embedded image", () => {
    const [a] = mapFeed({ feed: [{ post: { uri: "at://did:plc:x/app.bsky.feed.post/1", record: { text: "hi", createdAt: "t" } } }] });
    expect(a?.imageUrl).toBeUndefined();
    expect(a?.text).toBe("hi");
  });
});
