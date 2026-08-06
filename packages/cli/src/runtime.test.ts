import { describe, expect, test } from "vitest";
import { parseWhen, dayWindow, type ArtistSet, type FavouriteTier } from "@festival-bot/core";
import { createFestival } from "@festival/demofest";
import { loadRuntime, resolveUserFavourites, type Runtime } from "./runtime.js";

/** Minimal Runtime carrying just what resolveUserFavourites reads: sets + a
 *  favourites source returning fixed tiers. */
function stubRuntime(names: string[], tiers: FavouriteTier[]): Runtime {
  const sets = names.map((name) => ({ name }) as ArtistSet);
  return {
    sets,
    module: { sources: { favourites: { tiersFor: async () => tiers } } },
  } as unknown as Runtime;
}

describe("loadRuntime (demofest end-to-end through core)", () => {
  test("wires module -> planner -> sets and reproduces a known on-now set", async () => {
    const rt = await loadRuntime(createFestival());
    expect(rt.sets.length).toBeGreaterThan(10);
    expect(rt.venueName("grove")).toBe("The Grove");
    expect(rt.limited("grove")).toBe(true);

    const { now } = rt.planner.whatson(rt.sets, parseWhen("Sat 17:00", rt.calendar));
    expect(now.map((s) => s.name)).toContain("Quiet Machines"); // Sat 17:00-18:00 @ Barn
  });

  test("myday plans a day from resolved favourites (manual, offline)", async () => {
    const rt = await loadRuntime(createFestival());
    const { favs, unmatched } = await resolveUserFavourites(rt, { manual: ["Cedar Line", "Paper Ghosts"] });
    expect(favs.size).toBe(2);
    expect(unmatched).toEqual([]);

    const result = rt.planner.myday(rt.sets, favs, dayWindow("fri", rt.calendar));
    expect(result.meta.nFavsToday).toBe(2);
    expect(result.route.length).toBeGreaterThanOrEqual(1);
  });
});

describe("resolveUserFavourites tier ordering", () => {
  const tiers: FavouriteTier[] = [
    { label: "set1", names: ["A"] },
    { label: "set2", names: ["B"] },
    { label: "set3", names: ["C"] },
  ];

  test("normal ordering: set 1 is priority 1", async () => {
    const rt = stubRuntime(["A", "B", "C"], tiers);
    const { favs } = await resolveUserFavourites(rt, { user: "someone" });
    expect(favs.get("A")).toBe(1);
    expect(favs.get("B")).toBe(2);
    expect(favs.get("C")).toBe(3);
  });

  test("inverted ordering: highest set number becomes priority 1", async () => {
    const rt = stubRuntime(["A", "B", "C"], tiers);
    const { favs } = await resolveUserFavourites(rt, { user: "sam-cf", tierOrder: "inverted" });
    expect(favs.get("C")).toBe(1); // set3 = MUST see
    expect(favs.get("B")).toBe(2);
    expect(favs.get("A")).toBe(3); // set1 = like to see
  });
});

/**
 * Someone else's picks living in the same Clashfinder.
 *
 * User note, 2026-07-31: "pink entries (the 3rd colour) are things my partner wants to
 * see". Their profile still assumed two tiers, and blind inversion put the partner's
 * 6 acts ABOVE their own 17 must-sees — the Friday route was preferring Cable Boy (partner's)
 * over MOIO (their blue). A partner tier must never outrank the owner of the
 * Clashfinder, whatever colour it happens to be.
 */
describe("resolveUserFavourites partner tiers", () => {
  const tiers: FavouriteTier[] = [
    { label: "set1", names: ["wildcard"] },
    { label: "set2", names: ["mustsee"] },
    { label: "set3", names: ["sidepick"] },
  ];
  const names = ["wildcard", "mustsee", "sidepick"];

  test("ranks the owner's tiers above the partner's", async () => {
    const rt = stubRuntime(names, tiers);
    const { favs } = await resolveUserFavourites(rt, {
      user: "sam-cf",
      tierOrder: "inverted",
      partnerTiers: [3],
    });
    expect(favs.get("mustsee")).toBe(1);
    expect(favs.get("wildcard")).toBe(2);
    expect(favs.get("sidepick")).toBe(3);
  });

  test("inverts only the owner's own tiers", async () => {
    // The inversion describes how the owner colours their own picks; pulling the partner
    // tier out first is what stops it dragging the partner's picks to the top.
    const rt = stubRuntime(names, tiers);
    const { favs } = await resolveUserFavourites(rt, {
      user: "sam-cf",
      tierOrder: "inverted",
      partnerTiers: [3],
    });
    expect(favs.get("mustsee")).toBeLessThan(favs.get("wildcard")!);
  });

  test("keeps the partner's picks visible rather than dropping them", async () => {
    const rt = stubRuntime(names, tiers);
    const { favs } = await resolveUserFavourites(rt, {
      user: "sam-cf",
      tierOrder: "inverted",
      partnerTiers: [3],
    });
    expect(favs.has("sidepick")).toBe(true);
  });

  test("an act the owner ALSO picked keeps their own, better ranking", async () => {
    // Cable Boy and Pulp sit in the owner's green as well as the partner's pink —
    // the owner marked them too, so they are the owner's picks too.
    const shared: FavouriteTier[] = [
      { label: "set1", names: ["shared"] },
      { label: "set2", names: ["mustsee"] },
      { label: "set3", names: ["shared"] },
    ];
    const rt = stubRuntime(["shared", "mustsee"], shared);
    const { favs } = await resolveUserFavourites(rt, {
      user: "sam-cf",
      tierOrder: "inverted",
      partnerTiers: [3],
    });
    expect(favs.get("shared")).toBe(2); // owner's wildcard tier, not partner's tier 3
  });

  test("behaves exactly as before when no partner tier is declared", async () => {
    const rt = stubRuntime(names, tiers);
    const { favs } = await resolveUserFavourites(rt, { user: "sam-cf", tierOrder: "inverted" });
    expect(favs.get("sidepick")).toBe(1);
  });
});

/**
 * Unresolved Clashfinder refs.
 *
 * User note, 2026-07-31: "Where is FTIL? It's set 1??" — For Those I Love was set 1
 * on their Clashfinder and absent from every route built for them. The star comes
 * back as the opaque ref "?fortho-1-2" rather than a name, so the matcher never
 * mapped it to the lineup and the planner never knew it was a pick.
 *
 * The fix is an EXPLICIT per-user alias, not stem-guessing: "?mooncu-1" could
 * be Moonchild Sanelly or Mooncup, and silently picking one would put someone
 * at the wrong stage. An alias is a stated fact; a stem match is a guess.
 */
describe("resolveUserFavourites ref aliases", () => {
  const tiers: FavouriteTier[] = [
    { label: "set1", names: ["?fortho-1-2", "Real Act"] },
    { label: "set2", names: ["Other"] },
  ];

  test("maps an unresolved ref to its real lineup name, keeping its tier", async () => {
    const rt = stubRuntime(["For Those I Love", "Real Act", "Other"], tiers);
    const { favs } = await resolveUserFavourites(rt, {
      user: "alex-cf",
      refAliases: { "?fortho-1-2": "For Those I Love" },
    });
    expect(favs.get("For Those I Love")).toBe(1);
  });

  test("leaves the rest of the tier untouched", async () => {
    const rt = stubRuntime(["For Those I Love", "Real Act", "Other"], tiers);
    const { favs } = await resolveUserFavourites(rt, {
      user: "alex-cf",
      refAliases: { "?fortho-1-2": "For Those I Love" },
    });
    expect(favs.get("Real Act")).toBe(1);
    expect(favs.get("Other")).toBe(2);
  });

  test("drops the ref from unmatched once aliased", async () => {
    const rt = stubRuntime(["For Those I Love", "Real Act", "Other"], tiers);
    const { unmatched } = await resolveUserFavourites(rt, {
      user: "alex-cf",
      refAliases: { "?fortho-1-2": "For Those I Love" },
    });
    expect(unmatched).not.toContain("?fortho-1-2");
  });

  test("still reports a ref with no alias, rather than hiding it", async () => {
    const rt = stubRuntime(["For Those I Love", "Real Act", "Other"], tiers);
    const { unmatched } = await resolveUserFavourites(rt, { user: "alex-cf" });
    expect(unmatched).toContain("?fortho-1-2");
  });
});
