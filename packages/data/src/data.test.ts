import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProfile, favouriteInputs } from "./users.js";
import { getPrefs, tone } from "./prefs.js";
import { loadReminders, addReminder, markFired, dueReminders } from "./reminders.js";

const dirs: string[] = [];
function fixture(files: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), "fb-data-"));
  dirs.push(d);
  mkdirSync(d, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(d, name), JSON.stringify(content));
  }
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const usersFixture = {
  "users.json": {
    users: {
      alex: { name: "Alex", channel: { kind: "telegram", id: "100000001" }, clashfinder: "alex-cf", role: "admin" },
      manualguy: { name: "Manu", favs: ["Big Thief", "Dijon"] },
      inverteduser: { name: "Sam-like", clashfinder: "sam-cf", tierOrder: "inverted" },
    },
  },
};

describe("users store", () => {
  test("getProfile reads a handle's profile from the users map", () => {
    const d = fixture(usersFixture);
    expect(getProfile("alex", d)?.clashfinder).toBe("alex-cf");
    expect(getProfile("nobody", d)).toBeUndefined();
  });

  test("favouriteInputs maps a Clashfinder handle to a cf user", () => {
    const d = fixture(usersFixture);
    expect(favouriteInputs("alex", d)).toEqual({ user: "alex-cf" });
  });

  test("favouriteInputs returns manual favs for a manual profile", () => {
    const d = fixture(usersFixture);
    expect(favouriteInputs("manualguy", d)).toEqual({ manual: ["Big Thief", "Dijon"] });
  });

  test("an unknown handle is treated as a bare Clashfinder username", () => {
    const d = fixture(usersFixture);
    expect(favouriteInputs("someuser", d)).toEqual({ user: "someuser" });
  });

  test("favouriteInputs surfaces tierOrder:inverted for an inverted profile", () => {
    const d = fixture(usersFixture);
    expect(favouriteInputs("inverteduser", d)).toEqual({ user: "sam-cf", tierOrder: "inverted" });
    // a normal Clashfinder profile carries no tierOrder
    expect(favouriteInputs("alex", d).tierOrder).toBeUndefined();
  });
});

describe("prefs store", () => {
  test("getPrefs and tone read a handle's preferences", () => {
    const d = fixture({ "prefs.json": { "100000002": { name: "Sam", tone: "toronto-slang", notes: ["x"] } } });
    expect(getPrefs("100000002", d).name).toBe("Sam");
    expect(tone("100000002", d)).toBe("toronto-slang");
    expect(tone("nobody", d)).toBeUndefined();
  });
});

describe("reminders store", () => {
  const remFixture = {
    "reminders.json": [
      { id: "a", handle: "jo-cf", chat_id: "100000003", fire_iso: "2026-06-06T21:50:00+02:00", text: "MBV", fired: false },
    ],
  };

  test("loads on-disk snake_case into the core camelCase model", () => {
    const d = fixture(remFixture);
    const [r] = loadReminders(d);
    expect(r).toEqual({
      id: "a",
      handle: "jo-cf",
      channel: { kind: "telegram", id: "100000003" },
      fireIso: "2026-06-06T21:50:00+02:00",
      text: "MBV",
      fired: false,
    });
  });

  test("addReminder persists in snake_case (stable on-disk format)", () => {
    const d = fixture(remFixture);
    const made = addReminder(
      { handle: "h", channel: { kind: "telegram", id: "1" }, fireIso: "2026-06-06T22:00:00+02:00", text: "later" },
      d,
      () => "newid",
    );
    expect(made.id).toBe("newid");
    const onDisk = JSON.parse(readFileSync(join(d, "reminders.json"), "utf8"));
    expect(onDisk).toHaveLength(2);
    expect(onDisk[1]).toMatchObject({
      id: "newid",
      channel: { kind: "telegram", id: "1" },
      fire_iso: "2026-06-06T22:00:00+02:00",
      fired: false,
    });
  });

  test("markFired flips the on-disk flag", () => {
    const d = fixture(remFixture);
    markFired("a", d);
    expect(loadReminders(d)[0]?.fired).toBe(true);
  });

  test("dueReminders applies the core due selector at a given instant", () => {
    const d = fixture(remFixture);
    expect(dueReminders("2026-06-06T21:00:00+02:00", d)).toEqual([]); // before fire
    expect(dueReminders("2026-06-06T22:00:00+02:00", d).map((r) => r.id)).toEqual(["a"]);
  });
});
