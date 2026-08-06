import { describe, expect, test } from "vitest";
import { buildWalkMatrix } from "./walk.js";
import { createPlanner, type ArtistSet } from "./planner.js";

const T0 = Date.UTC(2026, 5, 4, 16, 0); // arbitrary base instant
const at = (min: number) => new Date(T0 + min * 60_000);
const mk = (name: string, stage: string, startMin: number, dur: number): ArtistSet => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  stage,
  start: at(startMin),
  end: at(startMin + dur),
  durationMin: dur,
});

// main--10--second--5--far  (so main->far = 15 via second)
const walk = buildWalkMatrix({ edges: [["main", "second", 10], ["second", "far", 5]] });
const planner = createPlanner({ walk, catchFraction: 0.5, nightGapHours: 3 });

describe("whatson", () => {
  const sets = [mk("A", "main", 0, 60), mk("B", "second", 30, 60), mk("C", "main", 120, 60)];
  test("reports sets live now (by stage) and upcoming within the window", () => {
    const { now, next } = planner.whatson(sets, at(45), 120);
    expect(now.map((s) => s.name).sort()).toEqual(["A", "B"]);
    expect(next.map((s) => s.name)).toEqual(["C"]);
  });
  test("nothing upcoming beyond the window", () => {
    const { next } = planner.whatson(sets, at(45), 30);
    expect(next).toEqual([]);
  });
});

describe("reachable", () => {
  test("includes a set you can still catch most of, with missed minutes", () => {
    const sets = [mk("F", "second", 0, 40)]; // walk main->second=10 -> miss 10 of 40 (<=50%)
    const [r] = planner.reachable(sets, "main", at(0));
    expect(r?.name).toBe("F");
    expect(r?.missedMin).toBe(10);
    expect(r?.walkMin).toBe(10);
  });
  test("excludes a set you'd miss most of", () => {
    const sets = [mk("G", "second", 0, 15)]; // arrive +10, would miss 10 of 15 (>50%)
    expect(planner.reachable(sets, "main", at(0))).toEqual([]);
  });
  test("excludes a set already over by the time you arrive", () => {
    const sets = [mk("E", "second", 0, 8)]; // arrive +10 >= end +8
    expect(planner.reachable(sets, "main", at(0))).toEqual([]);
  });
  test("no from-stage means no travel cost", () => {
    const sets = [mk("F", "second", 0, 40)];
    const [r] = planner.reachable(sets, null, at(0));
    expect(r?.missedMin).toBe(0);
    expect(r?.walkMin).toBe(0);
  });
  test("trims at the overnight gap by default but not when disabled", () => {
    const sets = [mk("A", "main", 0, 60), mk("Late", "main", 200, 60)]; // gap 200 > 180
    expect(planner.reachable(sets, "main", at(0)).map((s) => s.name)).toEqual(["A"]);
    expect(planner.reachable(sets, "main", at(0), { trimNight: false }).map((s) => s.name))
      .toEqual(["A", "Late"]);
  });
});

describe("canFollow", () => {
  test("true when you can watch A fully then catch most of B", () => {
    expect(planner.canFollow(mk("A", "main", 0, 60), mk("B", "second", 65, 40))).toBe(true);
  });
  test("false when travel makes you miss most of B", () => {
    expect(planner.canFollow(mk("A", "main", 0, 60), mk("D", "second", 61, 10))).toBe(false);
  });
});

describe("myday", () => {
  test("maximises favourites seen; ties broken by priority; loser becomes a clash alt", () => {
    const favs = new Map([["P1", 1], ["P3", 1], ["P2", 2]]);
    const sets = [
      mk("P1", "main", 0, 60),
      mk("P2", "second", 70, 60), // reachable after P1, prio 2
      mk("P3", "main", 65, 60), // reachable after P1, prio 1, overlaps P2
    ];
    const { route, alts } = planner.myday(sets, favs, [at(-100), at(1000)]);
    expect(route.map((s) => s.name)).toEqual(["P1", "P3"]); // prio-1 chain wins the tie
    const p3alts = alts[1]!.map((a) => `${a.set.name}:${a.why}`);
    expect(p3alts).toContain("P2:clash");
  });

  test("a non-overlapping fav unreachable even by leaving early is a 'tight' alt", () => {
    const isolated = buildWalkMatrix({ edges: [["main", "far", 200]] });
    const p2 = createPlanner({ walk: isolated, catchFraction: 0.5, nightGapHours: 3 });
    const favs = new Map([["A", 1], ["B", 1]]);
    // Even leaving A at its earliest (min 30, 50% of 60), the 200-min walk lands
    // at 230, long past B's 95 end — so B is a travel-unreachable 'tight' alt.
    const sets = [mk("A", "main", 0, 60), mk("B", "far", 65, 30)];
    const { route, alts } = p2.myday(sets, favs, [at(-100), at(1000)]);
    expect(route.map((s) => s.name)).toEqual(["A"]);
    expect(alts[0]!.map((a) => `${a.set.name}:${a.why}`)).toContain("B:tight");
  });

  test("still leaves a long set early to catch a higher pick it can reach ON TIME", () => {
    // Long (set 2) 0..120 on main; Big (set 1) 70..130 on second (walk 10).
    // Long's 50% catch is met at 60, the walk lands exactly on Big's 70 start —
    // both kept, which finish-then-walk chaining could never do (Long runs to 120).
    const favs = new Map([["Long", 2], ["Big", 1]]);
    const sets = [mk("Long", "main", 0, 120), mk("Big", "second", 70, 60)];
    const { route } = planner.myday(sets, favs, [at(-100), at(1000)]);
    expect(route.map((s) => s.name)).toEqual(["Long", "Big"]);
    const long = route.find((s) => s.name === "Long")!;
    expect(long.partial).toBe(true);
    expect(long.caughtMin).toBe(60); // left at 60, not its 120 end
    expect(route.find((s) => s.name === "Big")!.partial).toBeFalsy(); // joined on time
  });

  test("drops a lesser set rather than join a HIGHER one late (operator note, 2026-07-27)", () => {
    // Same geometry, but now the successor outranks: Long is set 2, Big set 1.
    // Long's own 50% catch (60m) cannot be met without arriving into Big ten
    // minutes after it starts, so Long goes rather than Big being shaved. This
    // is a deliberate change of the old both-kept behaviour.
    const favs = new Map([["Long", 2], ["Big", 1]]);
    const sets = [mk("Long", "main", 0, 120), mk("Big", "second", 60, 60)];
    const { route, alts } = planner.myday(sets, favs, [at(-100), at(1000)]);
    expect(route.map((s) => s.name)).toEqual(["Big"]);
    expect(route[0]!.partial).toBeFalsy();
    expect(alts[0]!.map((a) => a.set.name)).toContain("Long");
  });

  test("does NOT cut a set short for a lower-priority successor", () => {
    // Big (set 1) 0..120 on main; Minor (set 3) 60..120 on second (walk 10).
    // Leaving Big early for a lesser pick is disallowed; Big runs to 120, so the
    // walk lands at 130 — past Minor's end — and Minor can't be chained.
    const favs = new Map([["Big", 1], ["Minor", 3]]);
    const sets = [mk("Big", "main", 0, 120), mk("Minor", "second", 60, 60)];
    const { route } = planner.myday(sets, favs, [at(-100), at(1000)]);
    expect(route.map((s) => s.name)).toEqual(["Big"]);
  });

  test("worthwhileCatch drops a thin equal-tier catch that the floor alone would keep", () => {
    const favs = new Map([["X", 1], ["Y", 1]]);
    // X 0..60 main; Y 40..120 second (dur 80), walk main->second=10. Equal tier,
    // so you see X out to 60 and reach Y at 70 -> catch 50/80 = 62%: clears the
    // 50% floor but not a 70% worthwhile bar, and Y isn't a higher pick.
    const sets = [mk("X", "main", 0, 60), mk("Y", "second", 40, 80)];
    const gated = createPlanner({ walk, catchFraction: 0.5, worthwhileCatch: 0.7, nightGapHours: 3 });
    expect(gated.myday(sets, favs, [at(-100), at(1000)]).route.map((s) => s.name)).toEqual(["X"]);
    // Without the gate the 62% catch clears the floor and Y is crammed in.
    const ungated = createPlanner({ walk, catchFraction: 0.5, nightGapHours: 3 });
    expect(ungated.myday(sets, favs, [at(-100), at(1000)]).route.map((s) => s.name)).toEqual(["X", "Y"]);
  });

  test("worthwhileCatch still allows a thin catch when it reaches a STRICTLY higher pick", () => {
    const favs = new Map([["Low", 2], ["High", 1]]);
    // Low (set 2) 0..60 main; High (set 1) 40..120 second (dur 80). You leave Low
    // at its 50% mark (30) for the better pick, but the 10-min walk still lands at
    // 40 = High's start -> full catch; a thin reach-up is permitted, never blocked.
    const sets = [mk("Low", "main", 0, 60), mk("High", "second", 40, 80)];
    const gated = createPlanner({ walk, catchFraction: 0.5, worthwhileCatch: 0.7, nightGapHours: 3 });
    expect(gated.myday(sets, favs, [at(-100), at(1000)]).route.map((s) => s.name)).toEqual(["Low", "High"]);
  });

  test("an early island that is unreachable and precedes all chosen acts is dropped", () => {
    const isolated = buildWalkMatrix({ edges: [["main", "second", 10], ["main", "far", 200]] });
    const p2 = createPlanner({ walk: isolated, catchFraction: 0.5, nightGapHours: 3 });
    const favs = new Map([["Z", 1], ["P", 1], ["Q", 1]]);
    const sets = [
      mk("Z", "far", 0, 30), // far->main = 200; cannot reach P
      mk("P", "main", 100, 60),
      mk("Q", "main", 165, 60),
    ];
    const { route, dropped } = p2.myday(sets, favs, [at(-100), at(1000)]);
    expect(route.map((s) => s.name)).toEqual(["P", "Q"]);
    expect(dropped.map((s) => s.name)).toEqual(["Z"]);
  });

  test("a forced stop is always included even when it displaces a higher-count chain", () => {
    // Two same-tier favs (P1, P2) fit back to back with no forced stop. A forced
    // event overlaps P1 exactly; only one of {P1, forced-event} can be kept.
    const favs = new Map([["P1", 1], ["P2", 1]]);
    const sets = [mk("P1", "main", 0, 60), mk("P2", "main", 65, 60)];
    const forced = [mk("Sauna", "personal:unlocated", 0, 60)];
    const { route, alts } = planner.myday(sets, favs, [at(-100), at(1000)], forced);
    expect(route.map((s) => s.name)).toEqual(["Sauna", "P2"]);
    const saunaIdx = route.findIndex((s) => s.name === "Sauna");
    expect(alts[saunaIdx]!.map((a) => `${a.set.name}:${a.why}`)).toContain("P1:clash");
  });

  test("a forced stop's duration is never clipped to make a real fav that follows", () => {
    // Sauna 0..60 on main; Fav 65..125 on second (walk 10). Without protection the
    // DP could leave Sauna early to arrive Fav sooner — it must not, since Fav's
    // priority (>=1) is never strictly better than a forced stop's.
    const favs = new Map([["Fav", 1]]);
    const sets = [mk("Fav", "second", 65, 60)];
    const forced = [mk("Sauna", "main", 0, 60)];
    const { route } = planner.myday(sets, favs, [at(-100), at(1000)], forced);
    const sauna = route.find((s) => s.name === "Sauna")!;
    expect(sauna.partial).toBe(false);
    expect(sauna.caughtMin).toBe(60);
  });

  test("no forced stops behaves exactly as before (backward compatible)", () => {
    const favs = new Map([["P1", 1], ["P3", 1], ["P2", 2]]);
    const sets = [mk("P1", "main", 0, 60), mk("P2", "second", 70, 60), mk("P3", "main", 65, 60)];
    const { route } = planner.myday(sets, favs, [at(-100), at(1000)]);
    expect(route.map((s) => s.name)).toEqual(["P1", "P3"]);
  });

  test("an annotation always appears inline and never displaces a real pick", () => {
    // Fav "P1" 0..60 on main. Annotation "Note" fully overlaps it in time.
    const favs = new Map([["P1", 1]]);
    const sets = [mk("P1", "main", 0, 60)];
    const annotations = [mk("Note", "personal:unlocated", 0, 60)];
    const { route, alts } = planner.myday(sets, favs, [at(-100), at(1000)], [], annotations);
    expect(route.map((s) => s.name)).toEqual(["Note", "P1"]);
    const note = route.find((s) => s.name === "Note")!;
    expect(note.annotation).toBe(true);
    expect(note.partial).toBe(false);
    expect(note.caughtMin).toBe(60);
    // P1 is untouched — still full duration, not pushed to alts/dropped.
    const p1 = route.find((s) => s.name === "P1")!;
    expect(p1.partial).toBe(false);
    expect(alts.every((a) => a.every((x) => x.set.name !== "P1"))).toBe(true);
  });

  test("an annotation appears even with no favourites that day", () => {
    const annotations = [mk("Note", "personal:unlocated", 0, 60)];
    const { route } = planner.myday([], new Map(), [at(-100), at(1000)], [], annotations);
    expect(route.map((s) => s.name)).toEqual(["Note"]);
  });

  test("forced stops, favourites, and annotations sort together by time", () => {
    const favs = new Map([["Fav", 1]]);
    const sets = [mk("Fav", "main", 60, 60)];
    const forced = [mk("Sauna", "main", 120, 60)];
    const annotations = [mk("Note", "personal:unlocated", 0, 30)];
    const { route } = planner.myday(sets, favs, [at(-100), at(1000)], forced, annotations);
    expect(route.map((s) => s.name)).toEqual(["Note", "Fav", "Sauna"]);
  });
});

describe("myday — a top pick is not shaved to fit a lesser one", () => {
  // Stages 4 minutes apart, as the real Circle/Something Kind of Wonderful pair
  // are. With a 10-minute walk the second act is simply unreachable and the case
  // never arises; at 4 minutes both are catchable and the optimiser splits them.
  const near = buildWalkMatrix({ edges: [["main", "second", 4]] });
  const p = createPlanner({ walk: near, catchFraction: 0.5, nightGapHours: 3 });

  // Operator note, 2026-07-27: "The set-1 act on Friday should take
  // precedence on the card, and the set-2 act should be shown as the fallback."
  //
  // The weight is 1000 per set seen plus a small tier bonus, so COUNT dominates
  // TIER absolutely: the router would open on the set-2 act, leave it early, and
  // arrive late into the set-1 act — catching part of each rather than the one
  // that actually matters in full. Starting a strictly-higher pick late to
  // accommodate a lower-priority predecessor is the case being ruled out.
  test("does not join a set-1 act late just to open with a set-2 clash", () => {
    // Geometry matters: Top must be reachable late but WITHIN its miss budget
    // (75m set, catchFraction 0.5 -> 37.5m missable), so the old weighting could
    // take a slice of both. This is Friday's MIKE-vs-For Those I Love in miniature.
    const favs = new Map([["Top", 1], ["Lesser", 2]]);
    const sets = [
      mk("Lesser", "main", 0, 60), // set 2, same slot
      mk("Top", "second", 0, 75), // set 1, a short walk away
    ];

    const { route, alts } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(route.map((s) => s.name)).toEqual(["Top"]);
    expect(route[0]!.partial).toBeFalsy(); // caught whole, not joined late
    expect(alts[0]!.map((a) => a.set.name)).toContain("Lesser");
  });

  test("leaves equal-tier handling alone: see the first out, the other is a clash", () => {
    // Unchanged by the new rule. Two overlapping picks of the SAME tier already
    // resolve fewer-but-fuller — neither outranks the other, so the route watches
    // the first to its end rather than slicing both.
    const favs = new Map([["First", 1], ["Second", 1]]);
    const sets = [mk("First", "main", 0, 60), mk("Second", "second", 0, 75)];

    const { route, alts } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(route.map((s) => s.name)).toEqual(["First"]);
    expect(alts[0]!.map((a) => a.set.name)).toContain("Second");
  });

  test("still leaves a lesser set early to reach a higher one that starts later", () => {
    // Unchanged behaviour: the shave is only barred when it delays the TOP pick's
    // own start. A lower pick that finishes into a later top pick is still fine.
    const favs = new Map([["Warmup", 2], ["Headline", 1]]);
    const sets = [mk("Warmup", "main", 0, 60), mk("Headline", "second", 70, 60)];

    const { route } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(route.map((s) => s.name)).toEqual(["Warmup", "Headline"]);
  });
});

describe("myday — tier beats count, not the other way round", () => {
  // Operator note, 2026-07-27: "Why is a Set 3 tipping a Set 1 there? Just because I won't
  // make the full Last City cypher doesn't mean you should knock it."
  //
  // The old weight was 1000 per set seen plus (maxSet - priority), i.e. about
  // three points of tier against a thousand points of count — so ANY two lesser
  // picks outranked one better one. A three-hour set-1 booking was dropped
  // wholesale because three set-3 acts fitted inside the window it occupied.
  const near = buildWalkMatrix({ edges: [["main", "second", 5]] });
  const p = createPlanner({ walk: near, catchFraction: 0.4, nightGapHours: 3 });

  test("keeps one set-1 act over three lesser ones that would fill the same window", () => {
    const favs = new Map([["Cypher", 1], ["Filler1", 3], ["Filler2", 3], ["Filler3", 3]]);
    const sets = [
      mk("Cypher", "main", 0, 180), // set 1, occupies the whole window
      mk("Filler1", "second", 0, 50),
      mk("Filler2", "second", 60, 50),
      mk("Filler3", "second", 120, 50),
    ];

    const { route } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(route.map((s) => s.name)).toEqual(["Cypher"]);
  });

  test("still prefers more picks when they are all of the same tier", () => {
    const favs = new Map([["Long", 2], ["A", 2], ["B", 2]]);
    const sets = [mk("Long", "main", 0, 180), mk("A", "second", 0, 50), mk("B", "second", 60, 50)];

    const { route } = p.myday(sets, favs, [at(-100), at(1000)]);

    // All set 2, so nothing outranks anything: the count objective still applies
    // and two picks beat one. (Which two is a tie the DP may break either way.)
    expect(route).toHaveLength(2);
  });

  test("keeps the top pick whole rather than trading it for a lesser later one", () => {
    // His objection was that the Cypher got binned, and it no longer does. It is
    // NOT left early for a set-2 act either — that is the same precedence rule he
    // asked for earlier today, applied consistently: the lesser act becomes the
    // alternate hanging off it.
    const favs = new Map([["Cypher", 1], ["Later", 2]]);
    const sets = [mk("Cypher", "main", 0, 180), mk("Later", "second", 135, 60)];

    const { route, alts } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(route.map((s) => s.name)).toEqual(["Cypher"]);
    expect(alts[0]!.map((a) => a.set.name)).toContain("Later");
  });
});

describe("myday — dipping out of a long set", () => {
  // Operator note, 2026-07-27: "Multiple lower sets might be worth trading a bigger set
  // for, but they should be treated as parallel options, then; I would be up for
  // dropping in and out of the Last City rather than skipping it entirely."
  //
  // A clash with a 60-minute set is a real either/or. An act that fits INSIDE a
  // three-hour set is not — you leave, see it, come back, and still catch most of
  // the long one. Those are labelled "dip" so the card can say so, rather than
  // claiming you had to choose.
  const near = buildWalkMatrix({ edges: [["main", "second", 5]] });
  const p = createPlanner({ walk: near, catchFraction: 0.4, nightGapHours: 3 });

  test("an act that fits inside a long set is a dip-out, not a straight clash", () => {
    const favs = new Map([["Cypher", 1], ["Short", 2]]);
    const sets = [
      mk("Cypher", "main", 0, 180),
      mk("Short", "second", 60, 45), // leave at 55, back at 110 -> 125m of 180 still caught
    ];

    const { route, alts } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(route.map((s) => s.name)).toEqual(["Cypher"]);
    expect(alts[0]![0]!.why).toBe("dip");
  });

  test("an act you could not get back from in time is still a clash", () => {
    const favs = new Map([["Cypher", 1], ["Greedy", 2]]);
    const sets = [
      mk("Cypher", "main", 0, 180),
      mk("Greedy", "second", 20, 140), // out at 15, back at 165 -> only 30m of 180
    ];

    const { alts } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(alts[0]![0]!.why).toBe("clash");
  });

  test("an act overlapping the START of a long set is a clash, not a dip", () => {
    // You cannot dip out of something you never got into. Cypher starts at 10,
    // so Early cannot be seen first and still reach it on time either.
    const favs = new Map([["Cypher", 1], ["Early", 2]]);
    const sets = [mk("Cypher", "main", 10, 180), mk("Early", "second", 0, 60)];

    const { alts } = p.myday(sets, favs, [at(-100), at(1000)]);

    expect(alts[0]![0]!.why).toBe("clash");
  });
});
