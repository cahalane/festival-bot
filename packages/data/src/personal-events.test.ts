import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addPersonalEvent, loadPersonalEvents, removePersonalEvent } from "./personal-events.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pev-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("addPersonalEvent / loadPersonalEvents", () => {
  test("round-trips through disk in snake_case, camelCase in memory", () => {
    const made = addPersonalEvent(
      { handle: "alex", name: "Rise saunas", startIso: "2026-08-01T18:00:00+01:00", endIso: "2026-08-01T19:00:00+01:00" },
      dir,
      () => "fixed1",
    );
    expect(made.id).toBe("fixed1");
    const loaded = loadPersonalEvents(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(made);
  });

  test("loadPersonalEvents returns [] when the file doesn't exist yet", () => {
    expect(loadPersonalEvents(dir)).toEqual([]);
  });
});

describe("removePersonalEvent", () => {
  test("drops the matching event, leaves the rest", () => {
    const a = addPersonalEvent(
      { handle: "alex", name: "Rise saunas", startIso: "2026-08-01T18:00:00+01:00", endIso: "2026-08-01T19:00:00+01:00" },
      dir,
    );
    addPersonalEvent(
      { handle: "alex", name: "Borgo brunch", startIso: "2026-08-02T11:00:00+01:00", endIso: "2026-08-02T12:30:00+01:00" },
      dir,
    );
    removePersonalEvent(a.id, dir);
    const left = loadPersonalEvents(dir);
    expect(left).toHaveLength(1);
    expect(left[0]!.name).toBe("Borgo brunch");
  });
});
