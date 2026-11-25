/**
 * `draft-tick` — unattended check for acts a lineup source has staged but not
 * published (Aloompa: performers linked to draft events). The earliest signal of an
 * upcoming addition: it fires before the set reaches the schedule, where
 * `schedule-tick` later reports it as ADDED.
 *
 * Same contract as every watch (docs/operating/watches-and-alerts.md): silent unless
 * a new draft event id appears, seen-set on disk and advanced only after reporting,
 * fetch failures announced only on every 3rd consecutive one. First run records the
 * current drafts quietly — they are already known, so they are not news.
 */
import type { DraftAct } from "@festival-bot/core";
import { onFetchFailure } from "./tick.js";

export interface DraftTickIo {
  festival: string;
  readFails(): number;
  writeFails(fails: number): void;
  fetchDrafts(): Promise<DraftAct[]>;
  /** Draft event ids already reported, or null on first run. */
  readSeen(): string[] | null;
  writeSeen(ids: string[]): void;
  appendChange(entry: string): void;
  log(line: string): void;
  now(): Date;
}

export async function runDraftTick(io: DraftTickIo): Promise<void> {
  let drafts: DraftAct[];
  try {
    drafts = await io.fetchDrafts();
  } catch (e) {
    const { fails, announce } = onFetchFailure(io.readFails());
    io.writeFails(fails);
    if (announce) io.log("TICK ERROR: " + io.festival + " draft check failed " + fails + "x in a row — " + (e as Error).message);
    return;
  }
  io.writeFails(0);

  const ids = [...new Set(drafts.flatMap((d) => d.eventIds))].sort();
  const seen = io.readSeen();
  if (!seen) {
    io.writeSeen(ids);
    return;
  }
  const prior = new Set(seen);
  const fresh = drafts.filter((d) => d.eventIds.some((id) => !prior.has(id)));
  if (fresh.length) {
    const lines = fresh.map((d) => "DRAFT:   " + d.name);
    io.log("DRAFT ACTS (" + io.festival + "): " + fresh.length + " new staged-but-unpublished act(s)");
    for (const l of lines) io.log(l);
    io.appendChange(io.now().toISOString() + "\n" + lines.map((l) => "  " + l).join("\n") + "\n");
  }
  // Track the current set: a draft that publishes drops out; one that reappears re-fires.
  if (fresh.length || ids.length !== seen.length || ids.some((x, i) => x !== seen[i])) io.writeSeen(ids);
}
