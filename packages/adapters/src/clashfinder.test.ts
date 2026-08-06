import { describe, expect, test } from "vitest";
import { parseGets, buildEventMap, resolveTiers } from "./clashfinder.js";

describe("parseGets", () => {
  test("extracts the balanced cg.gets object from the mobile page HTML", () => {
    const html = `<script>var cg = { gets: {"hl1":"ouinet-1,wetleg-1","hl-name1":"Must See"}, foo: 2 };</script>`;
    expect(parseGets(html)).toEqual({ hl1: "ouinet-1,wetleg-1", "hl-name1": "Must See" });
  });
});

describe("buildEventMap", () => {
  test("maps the event 'short' code form (parens -> hyphen) to artist name", () => {
    const ev = {
      locations: [
        { events: [{ short: "ouinet(1)", name: "Ouineta" }, { short: "wetleg(1)", name: "Wet Leg" }] },
        { events: [{ short: "bigthief(1)", name: "Big Thief" }] },
      ],
    };
    const m = buildEventMap(ev);
    expect(m.get("ouinet-1")).toBe("Ouineta");
    expect(m.get("wetleg-1")).toBe("Wet Leg");
    expect(m.get("bigthief-1")).toBe("Big Thief");
  });
});

describe("resolveTiers", () => {
  const codeToName = new Map([
    ["bigthief-1", "Big Thief"],
    ["wetleg-1", "Wet Leg"],
  ]);

  test("builds ordered tiers with labels, resolving codes to names", () => {
    const gets = { hl1: "bigthief-1", "hl-name1": "MUST", hl2: "wetleg-1", "hl-name2": "maybe" };
    expect(resolveTiers(gets, codeToName)).toEqual([
      { label: "MUST", names: ["Big Thief"] },
      { label: "maybe", names: ["Wet Leg"] },
    ]);
  });

  test("an unresolved code is preserved as '?code' (reported as unmatched downstream)", () => {
    const gets = { hl1: "bigthief-1,geese-1-2" };
    expect(resolveTiers(gets, codeToName)).toEqual([
      { label: "set 1", names: ["Big Thief", "?geese-1-2"] },
    ]);
  });

  test("skips empty highlight slots", () => {
    const gets = { hl1: "bigthief-1", hl3: "" };
    expect(resolveTiers(gets, codeToName)).toHaveLength(1);
  });
});

describe("resolveTiers — Clashfinder's nested performance codes", () => {
  // A crew member re-starred For Those I Love on 2026-07-27 and it still came back
  // unmatched. Their highlight was stored as "fortho-1-2" while the event map
  // publishes "fortho-1" and "fortho-2": when one act has several performances,
  // Clashfinder can write a highlight in a THREE-segment form the event feed
  // never uses. Telling them the pick wasn't in their favourites was wrong — the
  // pick was there and we couldn't read it.
  const codeToName = new Map([
    ["fortho-1", "For Those I Love"],
    ["fortho-2", "For Those I Love"],
    ["davidk1-1", "David Kitt"],
  ]);

  test("resolves a three-segment code by its base and performance number", () => {
    const tiers = resolveTiers({ hl1: "fortho-1-2" }, codeToName);
    expect(tiers[0]!.names).toEqual(["For Those I Love"]);
  });

  test("still resolves ordinary two-segment codes untouched", () => {
    expect(resolveTiers({ hl1: "davidk1-1" }, codeToName)[0]!.names).toEqual(["David Kitt"]);
  });

  test("reports a code that resolves under no reading, rather than guessing", () => {
    // Guarded deliberately: a fallback that reached further would re-create the
    // res/pinkpantheress phantom match, silently routing someone to the wrong act.
    expect(resolveTiers({ hl1: "ghostx-9-9" }, codeToName)[0]!.names).toEqual(["?ghostx-9-9"]);
  });
});
