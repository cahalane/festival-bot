import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { REPO_ROOT } from "./config.js";

const CLI = join(REPO_ROOT, "packages", "cli", "src", "index.ts");

function runCli(args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("npx", ["tsx", CLI, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
}

describe("active-festival subcommand", () => {
  test("prints the resolved slug and nothing else", () => {
    const out = runCli(["active-festival"], { ACTIVE_FESTIVAL: "demofest" });
    expect(out).toBe("demofest");
  });

  test("respects the ACTIVE_FESTIVAL env override", () => {
    const out = runCli(["active-festival"], { ACTIVE_FESTIVAL: "atn26" });
    expect(out).toBe("atn26");
  });

  test("--json emits slug and timezone for demofest", () => {
    const out = runCli(["active-festival", "--json"], { ACTIVE_FESTIVAL: "demofest" });
    expect(JSON.parse(out)).toEqual({ slug: "demofest", timezone: "Europe/Dublin" });
  });

  test("--json emits slug and timezone for atn26", () => {
    const out = runCli(["active-festival", "--json"], { ACTIVE_FESTIVAL: "atn26" });
    expect(JSON.parse(out)).toEqual({ slug: "atn26", timezone: "Europe/Dublin" });
  });

  test("--json emits slug and timezone for ps26", () => {
    const out = runCli(["active-festival", "--json"], { ACTIVE_FESTIVAL: "ps26" });
    expect(JSON.parse(out)).toEqual({ slug: "ps26", timezone: "Europe/Madrid" });
  });
});
