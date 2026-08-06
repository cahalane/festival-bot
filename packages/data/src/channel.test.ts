import { describe, expect, test } from "vitest";
import { parseChannel } from "./channel.js";

/**
 * A deployment talks to exactly one channel plugin today, but the queue has to
 * record WHICH — a reminder that knows only "100000001" cannot be delivered by
 * anything except the plugin that happened to be running when it was queued.
 */
describe("parseChannel", () => {
  test("reads the structured form", () => {
    expect(parseChannel({ kind: "telegram", id: "123" })).toEqual({ kind: "telegram", id: "123" });
  });

  test("migrates a bare legacy chat id to a telegram ref", () => {
    // Every id we have on disk today came from Telegram, so that is the only
    // honest default — but it is recorded explicitly rather than assumed forever.
    expect(parseChannel("123")).toEqual({ kind: "telegram", id: "123" });
  });

  test("coerces a numeric legacy id to a string", () => {
    // Telegram ids exceed 2^53 on some accounts; they are identifiers, not numbers.
    expect(parseChannel(100000002)).toEqual({ kind: "telegram", id: "100000002" });
  });

  test("returns undefined for a missing ref rather than inventing one", () => {
    expect(parseChannel(undefined)).toBeUndefined();
    expect(parseChannel(null)).toBeUndefined();
    expect(parseChannel("")).toBeUndefined();
  });

  test("rejects a structured ref with no id", () => {
    expect(parseChannel({ kind: "discord" })).toBeUndefined();
  });

  test("preserves a non-telegram kind", () => {
    expect(parseChannel({ kind: "discord", id: "abc" })).toEqual({ kind: "discord", id: "abc" });
  });
});
