import { describe, expect, test } from "vitest";
import {
  PS_NEWS_CATEGORY,
  createPsPagesSource,
  fetchPostsBySlug,
  isBits,
  longestTextEn,
  pageBody,
  postBody,
  postDateIso,
  postTitle,
  postUrl,
  postsBySlugUrl,
  postsListUrl,
  stripHtml,
  toPageRef,
  type PsPost,
} from "./primavera-posts.js";

/** Shaped after a real getPostsBySlugName response (wet-leg, trimmed). */
const artistPost: PsPost = {
  slugName: "wet-leg",
  postName: "Wet Leg (GB)",
  postCategory: ["artist"],
  components: [
    { key: "header-main" },
    {
      type: "Body",
      components: [
        { type: "TitleLineH1", text: { en: "Wet Leg" } }, // no tag -> not a bio block
        { type: "Paragraph", text: { en: "<p>Where to start? <b>Chaise Longue</b>&nbsp;&amp; more.</p>" } },
      ],
    },
  ],
  postDescription: { title: { en: "Wet Leg" }, url: "/en/artist/wet-leg", date: "1780833600000" },
};

describe("stripHtml", () => {
  test("removes tags and decodes the entities the feed uses", () => {
    expect(stripHtml("<p>Hi&nbsp;there &amp; welcome</p>")).toBe("Hi there & welcome");
  });
});

describe("longestTextEn", () => {
  test("finds the largest text.en HTML block anywhere in the tree", () => {
    const blob = {
      a: { text: { en: "<p>short</p>" } },
      b: [{ text: { en: "<p>this is the much longer editorial bio block</p>" } }],
      c: { text: { en: "plain no tags ignored" } },
    };
    expect(longestTextEn(blob)).toBe("<p>this is the much longer editorial bio block</p>");
  });

  test("returns empty string when there is no write-up", () => {
    expect(longestTextEn({ postName: "x", nested: { foo: 1 } })).toBe("");
  });
});

describe("url builders", () => {
  test("postsBySlugUrl batches every slug into ONE request", () => {
    const url = postsBySlugUrl(["wet-leg", "carl-cox"]);
    const q = new URL(url).searchParams;
    expect(JSON.parse(q.get("variables")!)).toEqual({ slugnames: ["wet-leg", "carl-cox"] });
    expect(q.get("query")).toContain("components");
  });

  test("postsListUrl defaults to the Barcelona-scoped news category", () => {
    const q = new URL(postsListUrl()).searchParams;
    expect(JSON.parse(q.get("variables")!)).toEqual({ category: [PS_NEWS_CATEGORY], from: 0, to: 20 });
  });
});

describe("post field mapping", () => {
  test("postBody reads the write-up out of the components tree", () => {
    expect(postBody(artistPost)).toBe("Where to start? Chaise Longue & more.");
  });

  test("postBody falls back to the summary when a list post has no components", () => {
    const feedPost: PsPost = { slugName: "n", postDescription: { description: { en: "<p>Summary</p>" } } };
    expect(postBody(feedPost)).toBe("Summary");
  });

  test("pageBody appends the canonical link to a real write-up", () => {
    expect(pageBody(artistPost)).toBe(
      "Where to start? Chaise Longue & more.\n\nhttps://www.primaverasound.com/en/artist/wet-leg",
    );
  });

  test("pageBody shows the link alone when the 'body' is just the title echoed back", () => {
    // Newsletter-embed posts: description == title, no extractable prose.
    const journal: PsPost = {
      slugName: "journal-day-3",
      postDescription: { title: { en: "Journal Day 3" }, description: { en: "Journal Day 3" }, url: "/news/journal-day-3" },
    };
    expect(pageBody(journal)).toBe("https://www.primaverasound.com/news/journal-day-3");
  });

  test("postDateIso converts the epoch-ms string the feed uses", () => {
    expect(postDateIso(artistPost)).toBe(new Date(1780833600000).toISOString());
    expect(postDateIso({ slugName: "x" })).toBe("");
  });

  test("postUrl absolutises the site-relative url", () => {
    expect(postUrl(artistPost)).toBe("https://www.primaverasound.com/en/artist/wet-leg");
  });

  test("postTitle prefers the localised title, then postName, then the slug", () => {
    expect(postTitle(artistPost)).toBe("Wet Leg");
    expect(postTitle({ slugName: "s", postName: "N" })).toBe("N");
    expect(postTitle({ slugName: "s" })).toBe("s");
  });

  test("isBits flags separately-ticketed Primavera Bits acts", () => {
    expect(isBits({ slugName: "carl-cox", postCategory: ["artist", "bits"] })).toBe(true);
    expect(isBits(artistPost)).toBe(false);
  });

  test("toPageRef fingerprints a post for change detection", () => {
    expect(toPageRef(artistPost)).toEqual({
      id: "wet-leg",
      title: "Wet Leg",
      modifiedAt: new Date(1780833600000).toISOString(),
    });
  });
});

describe("fetchPostsBySlug", () => {
  test("returns the posts the API did send, unknown slugs simply absent", async () => {
    const fake = async <T>(): Promise<T> =>
      ({ data: { getPostsBySlugName: [artistPost] } }) as T;
    const got = await fetchPostsBySlug(["wet-leg", "nope-not-real"], fake);
    expect(got.map((p) => p.slugName)).toEqual(["wet-leg"]);
  });

  test("does not hit the network for an empty slug list", async () => {
    let calls = 0;
    const fake = async <T>(): Promise<T> => {
      calls++;
      return {} as T;
    };
    expect(await fetchPostsBySlug([], fake)).toEqual([]);
    expect(calls).toBe(0);
  });

  test("raises on a GraphQL error rather than reporting an empty result", async () => {
    const fake = async <T>(): Promise<T> => ({ errors: [{ message: "boom" }] }) as T;
    await expect(fetchPostsBySlug(["x"], fake)).rejects.toThrow(/boom/);
  });
});

describe("createPsPagesSource", () => {
  const listResponse = {
    data: {
      getPostsListWithTotal: {
        posts: [
          {
            slugName: "impact-2026",
            postCategory: ["news", "barcelona"],
            postDescription: { title: { en: "The impact of PS 2026" }, date: "1784717537712", url: "/news/impact-2026" },
          },
        ],
      },
    },
  };

  test("refs fingerprints the official news feed", async () => {
    const fake = async <T>(): Promise<T> => listResponse as T;
    const refs = await createPsPagesSource({ fetchJson: fake }).refs();
    expect(refs).toEqual([
      { id: "impact-2026", title: "The impact of PS 2026", modifiedAt: new Date(1784717537712).toISOString() },
    ]);
  });

  test("page fetches the full body via the by-slug query", async () => {
    const seen: string[] = [];
    const fake = async <T>(url: string): Promise<T> => {
      seen.push(url);
      return { data: { getPostsBySlugName: [artistPost] } } as T;
    };
    const page = await createPsPagesSource({ fetchJson: fake }).page!("wet-leg");
    expect(page?.body).toBe(
      "Where to start? Chaise Longue & more.\n\nhttps://www.primaverasound.com/en/artist/wet-leg",
    );
    expect(seen[0]).toContain("getPostsBySlugName");
  });

  test("page returns null for a slug the feed does not have", async () => {
    const fake = async <T>(): Promise<T> => ({ data: { getPostsBySlugName: [] } }) as T;
    expect(await createPsPagesSource({ fetchJson: fake }).page!("ghost")).toBeNull();
  });

  test("a GraphQL error surfaces instead of an empty feed", async () => {
    const fake = async <T>(): Promise<T> => ({ errors: [{ message: "rate limited" }] }) as T;
    await expect(createPsPagesSource({ fetchJson: fake }).refs()).rejects.toThrow(/rate limited/);
  });
});
