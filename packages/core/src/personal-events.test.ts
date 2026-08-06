import { describe, expect, test } from "vitest";
import { createPersonalEvent, forHandleAndWindow, toArtistSet, type PersonalEvent } from "./personal-events.js";

describe("createPersonalEvent", () => {
  test("builds an event with defaults and a deterministic id", () => {
    const made = createPersonalEvent(
      { handle: "alex", name: "Rise saunas", startIso: "2026-08-01T18:00:00+01:00", endIso: "2026-08-01T19:00:00+01:00" },
      () => "fixed123",
    );
    expect(made).toEqual({
      id: "fixed123",
      handle: "alex",
      name: "Rise saunas",
      startIso: "2026-08-01T18:00:00+01:00",
      endIso: "2026-08-01T19:00:00+01:00",
      stage: null,
      mandatory: true,
      notes: undefined,
    });
  });

  test("accepts an explicit stage and mandatory:false", () => {
    const made = createPersonalEvent(
      {
        handle: "alex",
        name: "Borgo brunch",
        startIso: "2026-08-02T11:00:00+01:00",
        endIso: "2026-08-02T12:30:00+01:00",
        stage: "the-last-city",
        mandatory: false,
        notes: "with Jo and Sam",
      },
      () => "fixed456",
    );
    expect(made.stage).toBe("the-last-city");
    expect(made.mandatory).toBe(false);
    expect(made.notes).toBe("with Jo and Sam");
  });

  test("rejects an invalid timestamp", () => {
    expect(() =>
      createPersonalEvent({ handle: "h", name: "x", startIso: "not-a-date", endIso: "2026-08-01T19:00:00+01:00" }),
    ).toThrow();
  });

  test("rejects end before start", () => {
    expect(() =>
      createPersonalEvent({
        handle: "h",
        name: "x",
        startIso: "2026-08-01T19:00:00+01:00",
        endIso: "2026-08-01T18:00:00+01:00",
      }),
    ).toThrow();
  });
});

const ev = (handle: string, startIso: string, endIso = startIso): PersonalEvent => ({
  id: `${handle}-${startIso}`,
  handle,
  name: "E",
  startIso,
  endIso,
  stage: null,
  mandatory: true,
});

describe("forHandleAndWindow", () => {
  test("filters to one handle's events starting in the window", () => {
    const items = [
      ev("alex", "2026-08-01T18:00:00+01:00"),
      ev("alex", "2026-08-02T11:00:00+01:00"),
      ev("jo-cf", "2026-08-01T18:00:00+01:00"),
    ];
    const lo = new Date("2026-08-01T06:00:00+01:00");
    const hi = new Date("2026-08-02T06:00:00+01:00");
    expect(forHandleAndWindow(items, "alex", [lo, hi]).map((e) => e.startIso)).toEqual([
      "2026-08-01T18:00:00+01:00",
    ]);
  });
});

describe("toArtistSet", () => {
  test("maps a located event to its own stage", () => {
    const e = createPersonalEvent({
      handle: "alex",
      name: "Borgo brunch",
      startIso: "2026-08-02T11:00:00+01:00",
      endIso: "2026-08-02T12:30:00+01:00",
      stage: "the-last-city",
    });
    const set = toArtistSet(e);
    expect(set.stage).toBe("the-last-city");
    expect(set.name).toBe("Borgo brunch");
    expect(set.durationMin).toBe(90);
    expect(set.start.toISOString()).toBe(new Date("2026-08-02T11:00:00+01:00").toISOString());
    expect(set.end.toISOString()).toBe(new Date("2026-08-02T12:30:00+01:00").toISOString());
  });

  test("maps an unlocated event to the off-graph placeholder stage", () => {
    const e = createPersonalEvent({
      handle: "alex",
      name: "Rise saunas",
      startIso: "2026-08-01T18:00:00+01:00",
      endIso: "2026-08-01T19:00:00+01:00",
    });
    expect(toArtistSet(e).stage).toBe("personal:unlocated");
  });
});
