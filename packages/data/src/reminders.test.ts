import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addReminder, loadReminders, removeReminder } from "./reminders.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "rem-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("removeReminder", () => {
  test("drops the matching reminder, leaves the rest", () => {
    const a = addReminder(
      { handle: "h", channel: { kind: "telegram", id: "1" }, fireIso: "2026-06-06T21:00:00+02:00", text: "a" },
      dir,
    );
    addReminder(
      { handle: "h", channel: { kind: "telegram", id: "1" }, fireIso: "2026-06-06T22:00:00+02:00", text: "b" },
      dir,
    );
    removeReminder(a.id, dir);
    const left = loadReminders(dir);
    expect(left).toHaveLength(1);
    expect(left[0]!.text).toBe("b");
  });
});

const diskDir = () => mkdtempSync(join(tmpdir(), "rem-"));

describe("reminders on disk", () => {
  test("reads the channel ref", () => {
    const d = diskDir();
    writeFileSync(
      join(d, "reminders.json"),
      JSON.stringify([
        { id: "a", handle: "someone", channel: { kind: "telegram", id: "123" }, fire_iso: "2026-08-01T20:00:00+01:00", text: "x", fired: false },
      ]),
    );
    expect(loadReminders(d)[0]!.channel).toEqual({ kind: "telegram", id: "123" });
  });

  test("still reads a legacy chat_id queue, so an in-flight reminder is not lost", () => {
    // The queue is the source of truth and may hold items written by the previous
    // schema. Dropping them on upgrade would silently un-schedule real reminders.
    const d = diskDir();
    writeFileSync(
      join(d, "reminders.json"),
      JSON.stringify([
        { id: "a", handle: "someone", chat_id: "123", fire_iso: "2026-08-01T20:00:00+01:00", text: "x", fired: false },
      ]),
    );
    expect(loadReminders(d)[0]!.channel).toEqual({ kind: "telegram", id: "123" });
  });

  test("writes the channel ref back", () => {
    const d = diskDir();
    addReminder(
      { handle: "someone", channel: { kind: "discord", id: "abc" }, fireIso: "2026-08-01T20:00:00+01:00", text: "x" },
      d,
      () => "id1",
    );
    const raw = JSON.parse(readFileSync(join(d, "reminders.json"), "utf8"));
    expect(raw[0].channel).toEqual({ kind: "discord", id: "abc" });
    expect(raw[0].chat_id).toBeUndefined();
  });
});
