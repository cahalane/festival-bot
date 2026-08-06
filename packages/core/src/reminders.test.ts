import { describe, expect, test } from "vitest";
import { due, pending, nextFireIso, createReminder, type Reminder } from "./reminders.js";

const r = (id: string, fireIso: string, fired = false): Reminder => ({
  id,
  handle: "h",
  channel: { kind: "telegram", id: "1" },
  fireIso,
  text: `t${id}`,
  fired,
});

describe("due", () => {
  test("returns unfired reminders at/before now, oldest first", () => {
    const items = [
      r("a", "2026-06-04T22:00:00+02:00"),
      r("b", "2026-06-04T20:00:00+02:00"),
      r("c", "2026-06-04T23:30:00+02:00"),
    ];
    const got = due(items, "2026-06-04T22:30:00+02:00").map((x) => x.id);
    expect(got).toEqual(["b", "a"]); // c is in the future
  });

  test("excludes already-fired reminders", () => {
    const items = [r("a", "2026-06-04T20:00:00+02:00", true)];
    expect(due(items, "2026-06-04T22:00:00+02:00")).toEqual([]);
  });

  test("compares by absolute instant across offsets, not wall clock", () => {
    // fire 22:00+02:00 == 21:00+01:00; now is 21:30+01:00 -> due
    const items = [r("a", "2026-06-04T22:00:00+02:00")];
    expect(due(items, "2026-06-04T21:30:00+01:00").map((x) => x.id)).toEqual(["a"]);
  });
});

describe("pending / nextFireIso", () => {
  test("pending excludes fired and sorts by fire time", () => {
    const items = [
      r("a", "2026-06-04T23:00:00+02:00"),
      r("b", "2026-06-04T20:00:00+02:00", true),
      r("c", "2026-06-04T21:00:00+02:00"),
    ];
    expect(pending(items).map((x) => x.id)).toEqual(["c", "a"]);
  });

  test("nextFireIso is the soonest pending fire time, or null when none", () => {
    expect(nextFireIso([r("a", "2026-06-04T23:00:00+02:00"), r("c", "2026-06-04T21:00:00+02:00")]))
      .toBe("2026-06-04T21:00:00+02:00");
    expect(nextFireIso([r("a", "2026-06-04T23:00:00+02:00", true)])).toBeNull();
  });
});

describe("createReminder", () => {
  test("builds an unfired reminder with the given fields and a deterministic id", () => {
    const made = createReminder(
      {
        handle: "jo-cf",
        channel: { kind: "telegram", id: "100000002" },
        fireIso: "2026-06-06T21:50:00+02:00",
        text: "MBV soon",
      },
      () => "fixed123",
    );
    expect(made).toEqual({
      id: "fixed123",
      handle: "jo-cf",
      channel: { kind: "telegram", id: "100000002" },
      fireIso: "2026-06-06T21:50:00+02:00",
      text: "MBV soon",
      fired: false,
    });
  });

  test("rejects an invalid fire timestamp", () => {
    expect(() =>
      createReminder({ handle: "h", channel: { kind: "telegram", id: "1" }, fireIso: "not-a-date", text: "x" }),
    ).toThrow();
  });
});

describe("reminder channel ref", () => {
  test("stores which channel to fire down, not a bare id", () => {
    const made = createReminder({
      handle: "someone",
      channel: { kind: "telegram", id: "123" },
      fireIso: "2026-08-01T20:00:00+01:00",
      text: "Headliner in 15",
    });
    expect(made.channel).toEqual({ kind: "telegram", id: "123" });
  });

  test("keeps the id a string so large ids survive", () => {
    const made = createReminder({
      handle: "someone",
      channel: { kind: "telegram", id: "100000003" },
      fireIso: "2026-08-01T20:00:00+01:00",
      text: "x",
    });
    expect(made.channel.id).toBe("100000003");
  });
});
