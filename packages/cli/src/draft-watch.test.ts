import { describe, expect, test } from "vitest";
import type { DraftAct } from "@festival-bot/core";
import { runDraftTick, type DraftTickIo } from "./draft-watch.js";

function fake(drafts: DraftAct[] | Error, seen: string[] | null, fails = 0) {
  const logs: string[] = [];
  const changes: string[] = [];
  const state = { seen, fails };
  const io: DraftTickIo = {
    festival: "ov26",
    readFails: () => state.fails,
    writeFails: (f) => { state.fails = f; },
    fetchDrafts: async () => { if (drafts instanceof Error) throw drafts; return drafts; },
    readSeen: () => state.seen,
    writeSeen: (ids) => { state.seen = ids; },
    appendChange: (e) => changes.push(e),
    log: (l) => logs.push(l),
    now: () => new Date("2026-11-26T12:00:00Z"),
  };
  return { io, logs, changes, state };
}

const sprints: DraftAct = { name: "Sprints", eventIds: ["d1"] };
const avery: DraftAct = { name: "Daniel Avery", eventIds: ["d2"] };

describe("runDraftTick", () => {
  test("first run records current drafts silently", async () => {
    const f = fake([sprints, avery], null);
    await runDraftTick(f.io);
    expect(f.logs).toEqual([]);
    expect(f.state.seen).toEqual(["d1", "d2"]);
  });

  test("no new draft ids -> silent", async () => {
    const f = fake([sprints], ["d1"]);
    await runDraftTick(f.io);
    expect(f.logs).toEqual([]);
    expect(f.changes).toEqual([]);
  });

  test("a new draft id fires once, logs, and advances the seen-set", async () => {
    const f = fake([sprints, avery], ["d1"]);
    await runDraftTick(f.io);
    expect(f.logs).toEqual(["DRAFT ACTS (ov26): 1 new staged-but-unpublished act(s)", "DRAFT:   Daniel Avery"]);
    expect(f.changes).toHaveLength(1);
    expect(f.state.seen).toEqual(["d1", "d2"]);
    f.logs.length = 0;
    await runDraftTick(f.io);
    expect(f.logs).toEqual([]);
  });

  test("a published draft drops out of the seen-set without noise", async () => {
    const f = fake([avery], ["d1", "d2"]);
    await runDraftTick(f.io);
    expect(f.logs).toEqual([]);
    expect(f.state.seen).toEqual(["d2"]);
  });

  test("fetch failures announce only on the 3rd in a row; success resets", async () => {
    const f = fake(new Error("boom"), ["d1"]);
    await runDraftTick(f.io);
    await runDraftTick(f.io);
    expect(f.logs).toEqual([]);
    await runDraftTick(f.io);
    expect(f.logs).toEqual(["TICK ERROR: ov26 draft check failed 3x in a row — boom"]);
    const ok = fake([sprints], ["d1"], 3);
    await runDraftTick(ok.io);
    expect(ok.state.fails).toBe(0);
  });
});
