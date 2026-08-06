/**
 * `pages-tick` — the unattended, SILENT half of the Appmiral info-pages watch.
 * The CMS pages (campsite/event times, drop-off, etc.) are static reference, but
 * each carries `modified_at`, so we diff `{id -> modifiedAt}` against a baseline
 * and print NOTHING unless a page was added / removed / edited. It only SURFACES
 * the change (title + what happened) — the agent decides whether a given update is
 * worth pulling the body and acting on. Advances the baseline + logs so each change
 * fires once and survives downtime. A down feed announces on every 3rd failure.
 */
import { diffPages, type PageRef } from "@festival-bot/adapters";
import { onFetchFailure } from "./tick.js";

export interface PagesTickIo {
  festival: string;
  readFails(): number;
  writeFails(fails: number): void;
  fetchRefs(): Promise<PageRef[]>;
  /** Fetch one page's full text body by id — used to inline the content of added/changed pages. */
  fetchBody(id: string): Promise<string | null>;
  readBaseline(): PageRef[] | null;
  writeBaseline(refs: PageRef[]): void;
  appendChange(entry: string): void;
  log(line: string): void;
  now(): Date;
}

export async function runPagesTick(io: PagesTickIo): Promise<void> {
  let cur: PageRef[];
  try {
    cur = await io.fetchRefs();
  } catch (e) {
    const { fails, announce } = onFetchFailure(io.readFails());
    io.writeFails(fails);
    if (announce) {
      io.log(`TICK ERROR: ${io.festival} info-pages fetch failed ${fails}x in a row — ${(e as Error).message}`);
    }
    return;
  }
  io.writeFails(0);

  const base = io.readBaseline();
  if (!base) {
    io.writeBaseline(cur); // first run: seed, stay quiet
    return;
  }

  const d = diffPages(base, cur);
  if (!d.added.length && !d.removed.length && !d.changed.length) return; // nothing changed

  const lines = [
    ...d.added.map((p) => `ADDED:   ${p.title} (id ${p.id})`),
    ...d.removed.map((p) => `REMOVED: ${p.title} (id ${p.id})`),
    ...d.changed.map((p) => `CHANGED: ${p.title} (id ${p.id})`),
  ];

  // Inline the full body of every added/changed page (removed ones are gone). The monitor
  // event lands in the agent's context regardless, so carrying the content here saves a
  // separate `page <id>` fetch round-trip. A body-fetch failure is non-fatal — the change
  // is still reported; we just note the body couldn't be pulled.
  const bodyLines: string[] = [];
  for (const p of [...d.added, ...d.changed]) {
    let body: string | null = null;
    try {
      body = await io.fetchBody(p.id);
    } catch (e) {
      body = null;
      bodyLines.push(`--- ${p.title} (id ${p.id}) ---`, `(body unavailable: ${(e as Error).message})`);
      continue;
    }
    bodyLines.push(`--- ${p.title} (id ${p.id}) ---`, body ?? "(no body / page gone)");
  }

  const all = bodyLines.length ? [...lines, "", ...bodyLines] : lines;
  io.log(`PAGE UPDATE (${io.festival}): ${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed`);
  for (const l of all) io.log(l);
  io.appendChange(`${io.now().toISOString()}\n${all.map((l) => `  ${l}`).join("\n")}\n`);
  io.writeBaseline(cur); // advance so each change fires once
}
