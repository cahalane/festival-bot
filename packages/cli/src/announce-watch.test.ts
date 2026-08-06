import { describe, expect, test } from "vitest";
import type { Announcement } from "@festival-bot/core";
import { selectNew, runAnnounceTick, type AnnounceTickIo, type AnnounceSeen } from "./announce-watch.js";

const ann = (id: string, createdAt: string): Announcement => ({ id, text: `notif ${id}`, createdAt });

function fakeIo(over: Partial<AnnounceTickIo> & { fails?: number; seen?: AnnounceSeen | null }): {
  io: AnnounceTickIo;
  logs: string[];
  changes: string[];
  state: { fails: number; seen: AnnounceSeen | null };
} {
  const logs: string[] = [];
  const changes: string[] = [];
  const state = { fails: over.fails ?? 0, seen: (over.seen ?? null) as AnnounceSeen | null };
  const io: AnnounceTickIo = {
    festival: "atn26",
    readFails: () => state.fails,
    writeFails: (f) => {
      state.fails = f;
    },
    latest: async () => [],
    readSeen: () => state.seen,
    writeSeen: (s) => {
      state.seen = s;
    },
    appendChange: (e) => changes.push(e),
    log: (l) => logs.push(l),
    now: () => new Date("2026-07-31T12:00:00Z"),
    ...over,
  };
  return { io, logs, changes, state };
}

describe("selectNew", () => {
  test("excludes seen ids and anything at/older than lastRunIso", () => {
    const seen: AnnounceSeen = { ids: ["a"], lastRunIso: "2026-07-31T10:00:00.000Z" };
    const items = [
      ann("a", "2026-07-31T11:00:00.000Z"),
      ann("b", "2026-07-31T09:00:00.000Z"),
      ann("c", "2026-07-31T11:30:00.000Z"),
    ];
    expect(selectNew(items, seen).map((a) => a.id)).toEqual(["c"]);
  });
});

describe("runAnnounceTick", () => {
  test("first run seeds silently", async () => {
    const f = fakeIo({ seen: null, latest: async () => [ann("a", "2026-07-31T11:00:00.000Z")] });
    await runAnnounceTick(f.io);
    expect(f.logs).toEqual([]);
    expect(f.state.seen?.ids).toEqual(["a"]);
  });

  test("a new item fires once, then is silent on repeat", async () => {
    const items = [ann("a", "2026-07-31T11:00:00.000Z")];
    const f = fakeIo({ seen: { ids: [], lastRunIso: "2026-07-31T09:00:00.000Z" }, latest: async () => items });
    await runAnnounceTick(f.io);
    expect(f.logs.some((l) => l.includes("SOCIAL POST") || l.includes("ANNOUNCEMENT"))).toBe(true);
    expect(f.changes.length).toBe(1);
    const f2 = fakeIo({ seen: f.state.seen, latest: async () => items });
    await runAnnounceTick(f2.io);
    expect(f2.logs).toEqual([]);
  });

  test("lastRunIso backstop suppresses old items even if ids were reset", async () => {
    const items = [ann("old", "2026-07-30T09:00:00.000Z")];
    const f = fakeIo({ seen: { ids: [], lastRunIso: "2026-07-31T09:00:00.000Z" }, latest: async () => items });
    await runAnnounceTick(f.io);
    expect(f.logs).toEqual([]);
  });

  test("announces a feed outage only on the 3rd consecutive failure", async () => {
    const boom = {
      latest: async () => {
        throw new Error("502 bad gateway");
      },
    };
    const a = fakeIo({ fails: 2, ...boom });
    await runAnnounceTick(a.io);
    expect(a.state.fails).toBe(3);
    expect(a.logs.some((l) => l.includes("TICK ERROR"))).toBe(true);
  });
});
