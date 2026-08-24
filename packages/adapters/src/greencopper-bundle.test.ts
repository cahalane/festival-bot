import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAesZipEntries, readGreencopperBundle } from "./greencopper-bundle.js";

/** Build a real WinZip-AES-256 zip with the system `7z`, to test against a
 *  reference implementation rather than against our own encoder. */
function makeAesZip(files: Record<string, string>, password: string): Buffer | null {
  const dir = mkdtempSync(join(tmpdir(), "gcz-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      const p = join(dir, name.replace(/\//g, "_"));
      writeFileSync(p, body);
    }
    const zip = join(dir, "out.zip");
    execFileSync("7z", ["a", "-tzip", "-mem=AES256", `-p${password}`, zip, join(dir, "*")], {
      stdio: "ignore",
    });
    return readFileSync(zip);
  } catch {
    return null; // 7z unavailable — caller skips.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PW = "content_v39deadbeefzip";
const zip = makeAesZip({ "a.json": '{"hello":"world"}', "b.txt": "x".repeat(5000) }, PW);

describe.skipIf(!zip)("readAesZipEntries", () => {
  test("decrypts and inflates AES-256 entries", () => {
    const entries = readAesZipEntries(zip!, PW);
    expect(entries.get("a.json")?.toString("utf8")).toBe('{"hello":"world"}');
    expect(entries.get("b.txt")?.toString("utf8")).toBe("x".repeat(5000));
  });

  test("rejects a wrong password rather than returning garbage", () => {
    // The 2-byte verifier catches this before any plaintext is produced.
    expect(() => readAesZipEntries(zip!, "wrong-password")).toThrow(/password/i);
  });
});

describe("readGreencopperBundle", () => {
  test("assembles the four files the lineup parser needs", () => {
    const entries = new Map<string, Buffer>([
      ["core/strings/en-GB.json", Buffer.from(JSON.stringify({ activity_name_1: "Act" }))],
      ["event/data/stages.json", Buffer.from(JSON.stringify([{ id: 1, name: "location_name_1" }]))],
      ["event/data/scheduleItems.json", Buffer.from(JSON.stringify([{ id: 1, name: "activity_name_1" }]))],
      ["event/data/timeSlots.json", Buffer.from(JSON.stringify([]))],
    ]);
    const b = readGreencopperBundle(entries);
    expect(b.strings.activity_name_1).toBe("Act");
    expect(b.stages).toHaveLength(1);
  });

  test("names the missing file when the bundle is not the shape we expect", () => {
    expect(() => readGreencopperBundle(new Map())).toThrow(/core\/strings/);
  });

  test("honours a non-default locale", () => {
    const entries = new Map<string, Buffer>([
      ["core/strings/fr-FR.json", Buffer.from(JSON.stringify({ k: "v" }))],
      ["event/data/stages.json", Buffer.from("[]")],
      ["event/data/scheduleItems.json", Buffer.from("[]")],
      ["event/data/timeSlots.json", Buffer.from("[]")],
    ]);
    expect(readGreencopperBundle(entries, "fr-FR").strings.k).toBe("v");
  });
});
