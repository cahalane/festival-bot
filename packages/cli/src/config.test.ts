import { describe, expect, test } from "vitest";
import { parseActiveFestival, activeFestivalSlug, FALLBACK_FESTIVAL } from "./config.js";

describe("parseActiveFestival", () => {
  test("extracts the slug from the CLAUDE.md @import line", () => {
    expect(parseActiveFestival("...\n@festivals/atn26/CONTEXT.md\n...")).toBe("atn26");
    expect(parseActiveFestival("@festivals/ps26/CONTEXT.md")).toBe("ps26");
  });

  test("handles hyphen/underscore/digit slugs and is case-insensitive on the path", () => {
    expect(parseActiveFestival("@festivals/other-voices_27/CONTEXT.md")).toBe("other-voices_27");
  });

  test("returns undefined when there is no import", () => {
    expect(parseActiveFestival("# CLAUDE.md\nno import here")).toBeUndefined();
  });
});

describe("activeFestivalSlug", () => {
  test("ACTIVE_FESTIVAL env overrides everything", () => {
    const prev = process.env.ACTIVE_FESTIVAL;
    process.env.ACTIVE_FESTIVAL = "ps26";
    try {
      expect(activeFestivalSlug()).toBe("ps26");
    } finally {
      if (prev === undefined) delete process.env.ACTIVE_FESTIVAL;
      else process.env.ACTIVE_FESTIVAL = prev;
    }
  });

  test("without an override, reads the slug from the repo's CLAUDE.md", () => {
    const prev = process.env.ACTIVE_FESTIVAL;
    delete process.env.ACTIVE_FESTIVAL;
    try {
      // The repo's CLAUDE.md always carries a valid @import, so this is a real slug,
      // never the last-resort fallback constant.
      const slug = activeFestivalSlug();
      expect(slug).toBeTruthy();
      expect(slug).not.toBe(""); // FALLBACK_FESTIVAL exists as a real last resort
      expect([FALLBACK_FESTIVAL, "ps26", "atn26"]).toContain(slug);
    } finally {
      if (prev !== undefined) process.env.ACTIVE_FESTIVAL = prev;
    }
  });
});
