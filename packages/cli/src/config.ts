/** Repo-root paths + secrets loading for the CLI/runtime. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src -> cli -> packages -> repo root
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export interface Secrets {
  clashfinder?: {
    authUsername: string;
    authPublicKey: string;
    privateKey?: string;
    /** Account password — used to derive the login cookie locally (sha1). */
    password?: string;
    write?: { userLogin?: string; phpsessid?: string };
  };
  appmiral?: { xProtect: string };
  "setlist.fm"?: { apiKey: string };
}

export function loadSecrets(): Secrets {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, "config", "secrets.json"), "utf8")) as Secrets;
  } catch {
    return {};
  }
}

export const cacheDir = (slug: string): string => join(REPO_ROOT, "cache", slug);

/** Default slug if CLAUDE.md can't be read / has no import (last-resort only). */
export const FALLBACK_FESTIVAL = "demofest";

/**
 * Parse the active-festival slug from CLAUDE.md's `@festivals/<slug>/CONTEXT.md`
 * import — the single line a human edits to switch festivals. Returns undefined if
 * no import is present, so callers can fall back.
 */
export function parseActiveFestival(claudeMd: string): string | undefined {
  return claudeMd.match(/@festivals\/([a-z0-9_-]+)\/CONTEXT\.md/i)?.[1];
}

/**
 * The active festival slug — the SINGLE source of truth is the `@festivals/<slug>/
 * CONTEXT.md` import in CLAUDE.md, so switching festivals there also switches what
 * the CLI plans against. `ACTIVE_FESTIVAL` env overrides (tests / one-off runs).
 */
export function activeFestivalSlug(): string {
  if (process.env.ACTIVE_FESTIVAL) return process.env.ACTIVE_FESTIVAL;
  try {
    const slug = parseActiveFestival(readFileSync(join(REPO_ROOT, "CLAUDE.md"), "utf8"));
    if (slug) return slug;
  } catch {
    // CLAUDE.md missing/unreadable — fall through to the constant.
  }
  return FALLBACK_FESTIVAL;
}
