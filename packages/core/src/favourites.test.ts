import { describe, expect, test } from "vitest";
import { resolveFavourites, type FavouriteTier } from "./favourites.js";

const lineup = ["Big Thief", "The Cure", "PinkPantheress", "res_", "Mechatok Live", "Nick León Live"];

describe("resolveFavourites — Clashfinder tiers", () => {
  test("exact matches get priority by tier order (1 = highest)", () => {
    const tiers: FavouriteTier[] = [
      { label: "set 1", names: ["Big Thief"] },
      { label: "set 2", names: ["The Cure"] },
    ];
    const { favs, unmatched } = resolveFavourites(lineup, { tiers });
    expect(favs.get("Big Thief")).toBe(1);
    expect(favs.get("The Cure")).toBe(2);
    expect(unmatched).toEqual([]);
  });

  test("suffix variant: a pick matches a lineup name that starts with it (Mechatok -> Mechatok Live)", () => {
    const tiers: FavouriteTier[] = [{ label: "set 1", names: ["Mechatok", "Nick León"] }];
    const { favs, unmatched } = resolveFavourites(lineup, { tiers });
    expect(favs.get("Mechatok Live")).toBe(1);
    expect(favs.get("Nick León Live")).toBe(1);
    expect(unmatched).toEqual([]);
  });

  test("REGRESSION: 'res_' does not phantom-match inside 'PinkPantheress' and vice versa", () => {
    const tiers: FavouriteTier[] = [
      { label: "set 1", names: ["PinkPantheress"] },
      { label: "set 2", names: ["res_"] },
    ];
    const { favs } = resolveFavourites(lineup, { tiers });
    expect(favs.get("PinkPantheress")).toBe(1);
    expect(favs.get("res_")).toBe(2);
    expect(favs.size).toBe(2); // no spurious extra matches
  });

  test("same artist in two tiers keeps the highest (lowest-numbered) priority", () => {
    const tiers: FavouriteTier[] = [
      { label: "set 1", names: ["Big Thief"] },
      { label: "set 2", names: ["Big Thief"] },
    ];
    const { favs } = resolveFavourites(lineup, { tiers });
    expect(favs.get("Big Thief")).toBe(1);
  });

  test("an unresolved/absent pick is reported as unmatched, not dropped silently", () => {
    const tiers: FavouriteTier[] = [{ label: "set 1", names: ["?geese-1-2", "Big Thief"] }];
    const { favs, unmatched } = resolveFavourites(lineup, { tiers });
    expect(favs.get("Big Thief")).toBe(1);
    expect(unmatched).toContain("?geese-1-2");
  });
});

describe("resolveFavourites — manual list", () => {
  test("manual favs are appended as a tier below the Clashfinder sets", () => {
    const tiers: FavouriteTier[] = [{ label: "set 1", names: ["Big Thief"] }];
    const { favs } = resolveFavourites(lineup, { tiers, manual: ["The Cure"] });
    expect(favs.get("Big Thief")).toBe(1);
    expect(favs.get("The Cure")).toBe(2); // below the single CF set
  });

  test("manual favs fuzzy-match approximate user typing (>=5 char overlap)", () => {
    const { favs } = resolveFavourites(lineup, { manual: ["pink pantheress"] });
    expect(favs.get("PinkPantheress")).toBe(1);
  });

  test("a too-short manual token does not fuzzy-match a longer name", () => {
    const { favs, unmatched } = resolveFavourites(lineup, { manual: ["pink"] });
    expect(favs.has("PinkPantheress")).toBe(false);
    expect(unmatched).toContain("pink");
  });
});
