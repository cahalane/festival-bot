/**
 * `announce-tick` — the unattended, SILENT half of the Appmiral notifications
 * watch (for the Monitor loop). Pulls the announcements source (ATN's official
 * push/news inbox), diffs against a seen-ID baseline, and prints NOTHING unless a
 * genuinely new notification landed. On a new item it logs + appends to the
 * changelog + advances the baseline, so each fires once and is on disk even if the
 * session was down. A down feed announces only on every 3rd consecutive failure
 * (shared with schedule-tick via onFetchFailure).
 *
 * The crew are NOT pinged by this tick — a new item is handed to a lightweight
 * classifier subagent that decides if it's crew-worthy (see the arm-schedule-watch
 * skill). IO is injected so the diff + failure state machine is unit-testable.
 */
import type { Announcement } from "@festival-bot/core";
import { onFetchFailure } from "./tick.js";

export interface AnnounceSeen {
  ids: string[];
  /** Newest createdAt seen so far; backstop that stops a reset seen-set re-firing old items. */
  lastRunIso: string;
}

export interface AnnounceTickIo {
  festival: string;
  readFails(): number;
  writeFails(fails: number): void;
  latest(): Promise<Announcement[]>;
  readSeen(): AnnounceSeen | null;
  writeSeen(seen: AnnounceSeen): void;
  appendChange(entry: string): void;
  log(line: string): void;
  now(): Date;
}

const MAX_SEEN_IDS = 300;

/** New = not previously seen by id AND newer than the last successful run. */
export function selectNew(items: Announcement[], seen: AnnounceSeen): Announcement[] {
  const ids = new Set(seen.ids);
  return items.filter((a) => !ids.has(a.id) && a.createdAt > seen.lastRunIso);
}

function advance(prev: AnnounceSeen, items: Announcement[]): AnnounceSeen {
  const maxCreated = items.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), prev.lastRunIso);
  const mergedIds = [...prev.ids, ...items.map((a) => a.id)];
  return { ids: mergedIds.slice(-MAX_SEEN_IDS), lastRunIso: maxCreated };
}

export async function runAnnounceTick(io: AnnounceTickIo): Promise<void> {
  let items: Announcement[];
  try {
    items = await io.latest();
  } catch (e) {
    const { fails, announce } = onFetchFailure(io.readFails());
    io.writeFails(fails);
    if (announce) {
      io.log(`TICK ERROR: ${io.festival} announcements fetch failed ${fails}x in a row — ${(e as Error).message}`);
    }
    return;
  }
  io.writeFails(0);

  const prev = io.readSeen();
  if (!prev) {
    const maxCreated = items.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), io.now().toISOString());
    io.writeSeen({ ids: items.map((a) => a.id).slice(-MAX_SEEN_IDS), lastRunIso: maxCreated });
    return;
  }

  const fresh = selectNew(items, prev);
  io.writeSeen(advance(prev, items));
  if (!fresh.length) return;

  io.log(`ANNOUNCEMENT (${io.festival}): ${fresh.length} new official post(s)`);
  const lines = fresh.map((a) => {
    const oneLine = (a.text || "(image only)").replace(/\s+/g, " ").slice(0, 160);
    return `  ${a.createdAt} ${oneLine}${a.imageUrl ? " [img]" : ""}`;
  });
  for (const l of lines) io.log(l);
  io.appendChange(`${io.now().toISOString()}\n${lines.join("\n")}\n`);
}
