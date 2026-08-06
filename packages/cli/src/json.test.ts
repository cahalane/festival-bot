import { describe, expect, test } from "vitest";
import type { ArtistSet, MydayResult, ReachableSet, Setlist } from "@festival-bot/core";
import {
  localIso,
  setJson,
  whatsonJson,
  reachableJson,
  afterJson,
  mydayJson,
  setlistJson,
  remindJson,
  type JsonCtx,
} from "./json.js";

const ctx: JsonCtx = {
  tz: "Europe/Madrid",
  venueName: (s) => (s === "revolut" ? "Revolut" : s),
  limited: (s) => s === "auditori-rockdelux",
};

const mbv: ArtistSet = {
  name: "My Bloody Valentine",
  slug: "mbv",
  stage: "revolut",
  start: new Date("2026-06-06T20:05:00Z"), // 22:05 CEST
  end: new Date("2026-06-06T21:05:00Z"), // 23:05 CEST
  durationMin: 60,
};
const charli: ArtistSet = {
  name: "Charli XCX",
  slug: "charli-xcx",
  stage: "auditori-rockdelux",
  start: new Date("2026-06-06T21:00:00Z"),
  end: new Date("2026-06-06T22:00:00Z"),
  durationMin: 60,
};

describe("localIso", () => {
  test("renders an instant in the festival timezone with offset", () => {
    expect(localIso(mbv.start, "Europe/Madrid")).toBe("2026-06-06T22:05:00+02:00");
  });
});

describe("setJson", () => {
  test("maps a set with local times and the display venue", () => {
    expect(setJson(ctx, mbv)).toEqual({
      name: "My Bloody Valentine",
      stage: "revolut",
      venue: "Revolut",
      start: "2026-06-06T22:05:00+02:00",
      end: "2026-06-06T23:05:00+02:00",
      durationMin: 60,
    });
  });
  test("flags limited-capacity venues", () => {
    expect(setJson(ctx, charli).limited).toBe(true);
  });
});

describe("whatsonJson", () => {
  test("includes now (with mins left) and next (with mins until)", () => {
    const when = new Date("2026-06-06T20:35:00Z");
    const j = whatsonJson(ctx, when, [mbv], [charli]);
    expect(j.query).toBe("now");
    expect(j.timezone).toBe("Europe/Madrid");
    expect(j.when).toBe("2026-06-06T22:35:00+02:00");
    expect(j.now[0]!.name).toBe("My Bloody Valentine");
    expect(j.now[0]!.endsInMin).toBe(30);
    expect(j.next[0]!.name).toBe("Charli XCX");
    expect(j.next[0]!.startsInMin).toBe(25);
  });
});

describe("reachableJson", () => {
  test("includes walk, missed and catch minutes per row", () => {
    const reach: ReachableSet = { ...charli, walkMin: 5, arrive: new Date("2026-06-06T21:05:00Z"), missedMin: 10 };
    const when = new Date("2026-06-06T20:35:00Z");
    const j = reachableJson(ctx, when, "revolut", [reach]);
    expect(j.query).toBe("reachable");
    expect(j.from).toBe("revolut");
    expect(j.reachable[0]).toMatchObject({ name: "Charli XCX", walkMin: 5, missedMin: 10, catchMin: 50 });
  });
});

describe("afterJson", () => {
  test("wraps the base set plus reachable rows", () => {
    const reach: ReachableSet = { ...charli, walkMin: 5, arrive: charli.start, missedMin: 0 };
    const j = afterJson(ctx, mbv, [reach]);
    expect(j.query).toBe("after");
    expect(j.base.name).toBe("My Bloody Valentine");
    expect(j.reachable[0]!.catchMin).toBe(60);
  });
});

describe("mydayJson", () => {
  test("serialises route (with priority + alts), dropped and not-in-lineup", () => {
    const res: MydayResult = {
      route: [{ ...mbv, priority: 1 }],
      alts: [[{ set: { ...charli, priority: 2 }, why: "clash" }]],
      dropped: [{ ...charli, name: "Dropped Act", priority: 3 }],
      meta: { nFavsToday: 3, nSeen: 1 },
    };
    const j = mydayJson(ctx, "alex", new Date("2026-06-06T08:00:00Z"), res, ["Unknown Act"], true);
    expect(j.query).toBe("myday");
    expect(j.handle).toBe("alex");
    expect(j.day).toBe("2026-06-06");
    expect(j.stale).toBe(true);
    expect(j.meta).toEqual({ seen: 1, favsToday: 3 });
    expect(j.route[0]).toMatchObject({ name: "My Bloody Valentine", priority: 1 });
    expect(j.route[0]!.alts[0]).toMatchObject({ name: "Charli XCX", priority: 2, why: "clash" });
    expect(j.dropped[0]).toMatchObject({ name: "Dropped Act" });
    expect(j.notInLineup).toEqual(["Unknown Act"]);
  });
});

describe("setlistJson", () => {
  test("wraps setlists with source attribution and a lag caveat", () => {
    const lists: Setlist[] = [{ id: "x", eventDate: "2025-12-16", artist: "The Cure", songs: [{ name: "Lullaby" }] }];
    const j = setlistJson("The Cure", lists);
    expect(j.query).toBe("setlist");
    expect(j.artist).toBe("The Cure");
    expect(j.source).toBe("setlist.fm");
    expect(j.caveat.toLowerCase()).toContain("lag");
    expect(j.setlists).toBe(lists);
  });
});

describe("remindJson", () => {
  test("includes the fire time and lead minutes", () => {
    const j = remindJson(ctx, mbv, 30);
    expect(j.name).toBe("My Bloody Valentine");
    expect(j.leadMin).toBe(30);
    expect(j.fireAt).toBe("2026-06-06T21:35:00+02:00"); // 30 min before 22:05 CEST
  });
});
