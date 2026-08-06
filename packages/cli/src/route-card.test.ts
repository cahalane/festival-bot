import { describe, expect, test } from "vitest";
import type { MydayResult, MydayPick } from "@festival-bot/core";
import { buildRouteCard, renderRouteCardHtml, routeCardHeightPx } from "./route-card.js";

const at = (hhmm: string): Date => new Date(`2026-07-31T${hhmm}:00+01:00`);

const pick = (
  name: string,
  start: string,
  stage: string,
  priority: number,
  extra: Partial<MydayPick> = {},
): MydayPick =>
  ({
    name,
    stage,
    start: at(start),
    durationMin: 60,
    priority,
    ...extra,
  }) as MydayPick;

// The card is rendered from already-resolved display strings so it stays pure:
// no Runtime, no timezone work, no venue lookups inside the renderer.
const io = {
  hhmm: (d: Date) =>
    d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Dublin" }),
  venueName: (s: string) => s,
};

const result = (over: Partial<MydayResult> = {}): MydayResult => ({
  route: [],
  alts: [],
  dropped: [],
  meta: { nFavsToday: 0, nSeen: 0 },
  ...over,
});

describe("buildRouteCard", () => {
  test("keeps the route in time order with time, act and stage", () => {
    const card = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Echo North Star", "15:15", "The Well", 1), pick("Pulp", "22:45", "ATN Main Stage", 1)],
      alts: [[], []],
      meta: { nFavsToday: 2, nSeen: 2 },
    }), [], false);

    expect(card.rows.map((r) => r.name)).toEqual(["Echo North Star", "Pulp"]);
    expect(card.rows[0]!.time).toBe("15:15");
    expect(card.rows[1]!.stage).toBe("ATN Main Stage");
  });

  test("carries the partial-catch window, the detail that changes the plan", () => {
    const card = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [
        pick("Pulp", "22:45", "ATN Main Stage", 1, {
          durationMin: 90,
          enter: at("23:20"),
          leave: at("24:15"),
          caughtMin: 55,
          partial: true,
        }),
      ],
      alts: [[]],
      meta: { nFavsToday: 1, nSeen: 1 },
    }), [], false);

    expect(card.rows[0]!.catchNote).toContain("55m of 90m");
    expect(card.rows[0]!.catchNote).toContain("23:20");
  });

  test("hangs each displaced favourite off the pick that displaced it", () => {
    const card = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Lullahush", "00:00", "Global Roots", 1)],
      alts: [[{ set: pick("Floating Points (Live)", "00:15", "Something Kind", 2), why: "clash" }]],
      meta: { nFavsToday: 2, nSeen: 1 },
    }), [], false);

    expect(card.rows[0]!.alts).toHaveLength(1);
    expect(card.rows[0]!.alts[0]!.name).toBe("Floating Points (Live)");
    expect(card.rows[0]!.alts[0]!.why).toMatch(/clash/i);
  });

  test("reports dropped favourites, and keeps unmatched codes for diagnosis only", () => {
    const card = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Pulp", "22:45", "ATN Main Stage", 1)],
      alts: [[]],
      dropped: [pick("Cardinals", "18:45", "Road To Nowhere", 2)],
      meta: { nFavsToday: 3, nSeen: 1 },
    }), ["?tradfo-1"], false);

    expect(card.dropped[0]).toContain("Cardinals");
    // Still on the card OBJECT (the operator needs it) but never rendered — see
    // the render test below.
    expect(card.unmatched).toEqual(["?tradfo-1"]);
  });

  test("summarises coverage from the counts rather than a fixed phrase", () => {
    const card = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Pulp", "22:45", "ATN Main Stage", 1)],
      alts: [[]],
      meta: { nFavsToday: 21, nSeen: 16 },
    }), [], false);

    expect(card.subtitle).toContain("16");
    expect(card.subtitle).toContain("21");
  });

  test("marks a personal-event annotation as informational, not a routed pick", () => {
    const card = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Dinner with the crew", "19:00", "Campsite", 0, { annotation: true })],
      alts: [[]],
      meta: { nFavsToday: 0, nSeen: 0 },
    }), [], false);

    expect(card.rows[0]!.annotation).toBe(true);
  });

  test("flags a plan built from a stale favourites cache", () => {
    const card = buildRouteCard(io, "alex", "Fri 31 Jul", result(), [], true);
    expect(card.stale).toBe(true);
  });
});

describe("renderRouteCardHtml", () => {
  const card = () =>
    buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [
        pick("Donal Dineen's Backstory", "01:30", "Cambium & Co", 2),
        pick("Pulp", "22:45", "ATN Main Stage", 1),
      ],
      alts: [[], [{ set: pick("Rory Sweeney (Live)", "23:00", "The Circle", 1), why: "clash" }]],
      dropped: [pick("Cardinals", "18:45", "Road To Nowhere", 2)],
      meta: { nFavsToday: 21, nSeen: 16 },
    }), ["?tradfo-1"], false);

  test("escapes apostrophes and ampersands in act and stage names", () => {
    const html = renderRouteCardHtml(card());
    expect(html).toContain("Cambium &amp; Co");
    expect(html).not.toContain("Cambium & Co");
  });

  test("never shows unmatched Clashfinder codes — they mean nothing to the reader", () => {
    // Operator note, 2026-07-27: "You're also including the 'not in the lineup' section,
    // despite me making it clear how to interpret it on your side and how it is
    // largely useless to users." A raw code like ?tradfo-1 is a diagnostic for
    // whoever runs the bot, not information anyone can act on at a festival.
    const html = renderRouteCardHtml(card());
    expect(html).not.toContain("tradfo");
    expect(html.toLowerCase()).not.toContain("not in the lineup");
  });

  test("shows the route, the displaced alternates and the drops", () => {
    const html = renderRouteCardHtml(card());
    expect(html).toContain("Pulp");
    expect(html).toContain("Rory Sweeney (Live)");
    expect(html).toContain("Cardinals");
  });

  test("warns on the image itself when favourites came from a stale cache", () => {
    const stale = buildRouteCard(io, "alex", "Fri 31 Jul", result(), [], true);
    expect(renderRouteCardHtml(stale).toUpperCase()).toContain("STALE");
  });

  test("says so plainly when nothing is on rather than rendering an empty spine", () => {
    const empty = buildRouteCard(io, "alex", "Fri 31 Jul", result(), [], false);
    expect(renderRouteCardHtml(empty).toLowerCase()).toContain("no favourites");
  });
});

describe("routeCardHeightPx", () => {
  // Chromium screenshots a fixed window, so the height has to be computed from the
  // content or the card comes out clipped or padded with dead space.
  test("grows with the number of route rows", () => {
    const one = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Pulp", "22:45", "ATN Main Stage", 1)],
      alts: [[]],
      meta: { nFavsToday: 1, nSeen: 1 },
    }), [], false);
    const two = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Pulp", "22:45", "ATN Main Stage", 1), pick("MIKE", "21:30", "The Circle", 2)],
      alts: [[], []],
      meta: { nFavsToday: 2, nSeen: 2 },
    }), [], false);

    expect(routeCardHeightPx(two)).toBeGreaterThan(routeCardHeightPx(one));
  });

  test("allows for the alternates hanging off a pick", () => {
    const bare = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Lullahush", "00:00", "Global Roots", 1)],
      alts: [[]],
      meta: { nFavsToday: 1, nSeen: 1 },
    }), [], false);
    const withAlts = buildRouteCard(io, "alex", "Fri 31 Jul", result({
      route: [pick("Lullahush", "00:00", "Global Roots", 1)],
      alts: [[{ set: pick("Floating Points (Live)", "00:15", "Something Kind", 2), why: "clash" }]],
      meta: { nFavsToday: 2, nSeen: 1 },
    }), [], false);

    expect(routeCardHeightPx(withAlts)).toBeGreaterThan(routeCardHeightPx(bare));
  });
});
