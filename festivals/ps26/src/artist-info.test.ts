import { describe, expect, test } from "vitest";
import { stripHtml, longestTextEn, extractInitialData, infoFromInitialData, createArtistInfoSource } from "./artist-info.js";

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
      c: { text: { en: "plain no tags ignored" } }, // no '<' -> not a bio block
    };
    expect(longestTextEn(blob)).toBe("<p>this is the much longer editorial bio block</p>");
  });

  test("returns empty string when there is no write-up", () => {
    expect(longestTextEn({ postName: "x", nested: { foo: 1 } })).toBe("");
  });
});

describe("extractInitialData", () => {
  test("pulls the blob out of the page script", () => {
    const html = `<html><script>window.__INITIAL_DATA__ = {"postName":"Wet Leg"};</script></html>`;
    expect(extractInitialData(html)).toEqual({ postName: "Wet Leg" });
  });

  test("raises when the page has no blob (shape changed / blocked)", () => {
    expect(() => extractInitialData("<html>nope</html>")).toThrow(/no __INITIAL_DATA__/);
  });
});

describe("infoFromInitialData", () => {
  test("prefers the localised title over postName", () => {
    const info = infoFromInitialData(
      { postName: "Wet Leg (GB)", postDescription: { title: { en: "Wet Leg" } }, body: { text: { en: "<p>bio</p>" } } },
      "wet-leg",
    );
    expect(info).toEqual({ name: "Wet Leg", bio: "bio", url: "https://www.primaverasound.com/en/artist/wet-leg" });
  });
});

describe("createArtistInfoSource", () => {
  const apiPost = {
    slugName: "wet-leg",
    postName: "Wet Leg (GB)",
    postDescription: { title: { en: "Wet Leg" } },
    components: [{ text: { en: "<p>Where to start? Chaise Longue.</p>" } }],
  };
  const okJson = async <T>(): Promise<T> => ({ data: { getPostsBySlugName: [apiPost] } }) as T;
  const failText = async (): Promise<string> => {
    throw new Error("scrape should not have been used");
  };

  test("reads the bio from the GraphQL components tree, without scraping", async () => {
    const src = createArtistInfoSource({ fetchJson: okJson, fetchText: failText });
    expect(await src.info("wet-leg")).toEqual({
      name: "Wet Leg",
      bio: "Where to start? Chaise Longue.",
      url: "https://www.primaverasound.com/en/artist/wet-leg",
    });
  });

  test("falls back to the page scrape when the API errors", async () => {
    const boom = async <T>(): Promise<T> => {
      throw new Error("graphql down");
    };
    const html = `<script>window.__INITIAL_DATA__ = {"postName":"Wet Leg","body":{"text":{"en":"<p>scraped bio</p>"}}};</script>`;
    const src = createArtistInfoSource({ fetchJson: boom, fetchText: async () => html });
    expect((await src.info("wet-leg")).bio).toBe("scraped bio");
  });

  test("falls back to the scrape when the API knows the artist but has no write-up", async () => {
    const empty = async <T>(): Promise<T> =>
      ({ data: { getPostsBySlugName: [{ slugName: "absolute", components: [] }] } }) as T;
    const html = `<script>window.__INITIAL_DATA__ = {"postName":"Absolute.","body":{"text":{"en":"<p>from the page</p>"}}};</script>`;
    const src = createArtistInfoSource({ fetchJson: empty, fetchText: async () => html });
    expect((await src.info("absolute")).bio).toBe("from the page");
  });

  test("useApi:false keeps the scrape-only behaviour", async () => {
    const html = `<script>window.__INITIAL_DATA__ = {"postName":"X","body":{"text":{"en":"<p>page only</p>"}}};</script>`;
    const src = createArtistInfoSource({
      useApi: false,
      fetchJson: async () => {
        throw new Error("API must not be called");
      },
      fetchText: async () => html,
    });
    expect((await src.info("x")).bio).toBe("page only");
  });
});
