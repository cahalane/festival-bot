import { describe, expect, test } from "vitest";
import { reminderChannel } from "./reminder-channel.js";

describe("reminderChannel", () => {
  test("uses the stored profile's channel kind, not a hardcoded one", () => {
    // A person reachable on a non-Telegram plugin must get a reminder that
    // carries THEIR kind, not an assumed "telegram".
    expect(reminderChannel("abc123", { kind: "discord", id: "abc123" })).toEqual({
      kind: "discord",
      id: "abc123",
    });
  });

  test("preserves telegram for a person stored as telegram", () => {
    expect(reminderChannel("999", { kind: "telegram", id: "999" })).toEqual({
      kind: "telegram",
      id: "999",
    });
  });

  test("falls back to telegram when the handle has no stored channel", () => {
    expect(reminderChannel("555", undefined)).toEqual({ kind: "telegram", id: "555" });
  });
});
