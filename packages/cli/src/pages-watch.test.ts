import { describe, expect, test } from "vitest";
import type { PageRef } from "@festival-bot/adapters";
import { runPagesTick, type PagesTickIo } from "./pages-watch.js";

const ref = (id: string, modifiedAt: string, title = `page ${id}`): PageRef => ({ id, title, modifiedAt });

function fakeIo(over: Partial<PagesTickIo> & { fails?: number; baseline?: PageRef[] | null }): {
  io: PagesTickIo;
  logs: string[];
  changes: string[];
  state: { fails: number; baseline: PageRef[] | null };
} {
  const logs: string[] = [];
  const changes: string[] = [];
  const state = { fails: over.fails ?? 0, baseline: (over.baseline ?? null) as PageRef[] | null };
  const io: PagesTickIo = {
    festival: "atn26",
    readFails: () => state.fails,
    writeFails: (f) => {
      state.fails = f;
    },
    fetchRefs: async () => [],
    fetchBody: async () => null,
    readBaseline: () => state.baseline,
    writeBaseline: (r) => {
      state.baseline = r;
    },
    appendChange: (e) => changes.push(e),
    log: (l) => logs.push(l),
    now: () => new Date("2026-07-31T12:00:00Z"),
    ...over,
  };
  return { io, logs, changes, state };
}

describe("runPagesTick", () => {
  test("first run seeds the baseline silently", async () => {
    const f = fakeIo({ baseline: null, fetchRefs: async () => [ref("1", "A")] });
    await runPagesTick(f.io);
    expect(f.logs).toEqual([]);
    expect(f.state.baseline?.map((r) => r.id)).toEqual(["1"]);
  });

  test("added / removed / changed fire once, then silent on repeat", async () => {
    const base = [ref("1", "A"), ref("2", "B"), ref("3", "C")];
    const next = [ref("1", "A"), ref("2", "B2"), ref("4", "D")]; // 2 changed, 4 added, 3 removed
    const f = fakeIo({ baseline: base, fetchRefs: async () => next });
    await runPagesTick(f.io);
    expect(f.logs.some((l) => l.includes("PAGE UPDATE") && l.includes("1 added, 1 removed, 1 changed"))).toBe(true);
    expect(f.changes.length).toBe(1);
    const f2 = fakeIo({ baseline: f.state.baseline, fetchRefs: async () => next });
    await runPagesTick(f2.io);
    expect(f2.logs).toEqual([]);
  });

  test("inlines the body of added/changed pages (not removed), logged + persisted", async () => {
    const base = [ref("1", "A"), ref("9", "Z")];
    const next = [ref("1", "A2"), ref("5", "N")]; // 1 changed, 5 added, 9 removed
    const bodies: Record<string, string> = { "1": "changed body", "5": "new body" };
    const f = fakeIo({ baseline: base, fetchRefs: async () => next, fetchBody: async (id) => bodies[id] ?? null });
    await runPagesTick(f.io);
    const out = f.logs.join("\n");
    expect(out).toContain("--- page 5 (id 5) ---\nnew body");
    expect(out).toContain("--- page 1 (id 1) ---\nchanged body");
    expect(out).toContain("REMOVED: page 9 (id 9)"); // removed page still reported
    expect(out).not.toContain("--- page 9"); // ...but no body block pulled for it
    expect(f.changes[0]).toContain("new body"); // persisted to the changes log too
  });

  test("a body-fetch failure is non-fatal — change still reported", async () => {
    const base = [ref("1", "A")];
    const next = [ref("1", "A2")];
    const f = fakeIo({
      baseline: base,
      fetchRefs: async () => next,
      fetchBody: async () => {
        throw new Error("boom");
      },
    });
    await runPagesTick(f.io);
    const out = f.logs.join("\n");
    expect(out).toContain("PAGE UPDATE");
    expect(out).toContain("(body unavailable: boom)");
    expect(f.state.baseline?.map((r) => r.id)).toEqual(["1"]); // baseline still advanced
  });

  test("announces a fetch outage only on the 3rd consecutive failure", async () => {
    const boom = {
      fetchRefs: async () => {
        throw new Error("500");
      },
    };
    const a = fakeIo({ fails: 2, ...boom });
    await runPagesTick(a.io);
    expect(a.state.fails).toBe(3);
    expect(a.logs.some((l) => l.includes("TICK ERROR"))).toBe(true);
  });
});
