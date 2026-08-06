import { describe, expect, test } from "vitest";
import { stripHtml, longestTextEn } from "./artist-info.js";

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
