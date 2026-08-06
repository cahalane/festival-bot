/**
 * `schedule-tick` — the unattended half of schedule-watch (for the Monitor loop):
 * re-pull the live lineup and diff it against the baseline. SILENT when nothing
 * changed (silence is the point, so an idle festival never wakes the session). On a
 * change it prints, THEN advances the baseline and appends to the changelog, so each
 * change announces once and is on disk even if the session was down when it landed.
 *
 * The side effects (fs, network, clock, stdout) are injected as `ScheduleTickIo` so
 * the state machine — announce a fetch outage only on every 3rd consecutive failure,
 * reset on success, report each real change exactly once — is unit-testable.
 */
import { diffLineups, type ArtistSet, type LineupRefreshResult } from "@festival-bot/core";

export interface ScheduleTickIo {
  festival: string;
  /** Consecutive prior failures from watch_state.json (0 if none/unreadable). */
  readFails(): number;
  writeFails(fails: number): void;
  refresh(): Promise<LineupRefreshResult>;
  loadSets(): Promise<ArtistSet[]>;
  readBaseline(): ArtistSet[] | null;
  writeBaseline(sets: ArtistSet[]): void;
  /** Append a timestamped entry to the changelog. */
  appendChange(entry: string): void;
  /** Emit a line to the operator (stdout). */
  log(line: string): void;
  fmtDay(d: Date): string;
  venueName(slug: string): string;
  now(): Date;
}

/**
 * Announce a fetch outage only once the source looks genuinely down (every 3rd tick
 * ~ 1h): one dropped request is noise (rate limits, router flakes), but a blind
 * planner that stays quiet is the 2026-05-27 failure. Returns the new failure count
 * and whether this tick should speak.
 */
export function onFetchFailure(priorFails: number): { fails: number; announce: boolean } {
  const fails = priorFails + 1;
  return { fails, announce: fails % 3 === 0 };
}

export async function runScheduleTick(io: ScheduleTickIo): Promise<void> {
  let res: LineupRefreshResult;
  try {
    res = await io.refresh();
  } catch (e) {
    const { fails, announce } = onFetchFailure(io.readFails());
    io.writeFails(fails);
    if (announce) {
      io.log(`TICK ERROR: ${io.festival} lineup fetch failed ${fails}x in a row — ${(e as Error).message}`);
    }
    return;
  }
  io.writeFails(0); // success resets the counter

  if (!res.written) {
    // The shrink guard kept the snapshot. That IS news: the live feed lost sets.
    io.log(`SCHEDULE WATCH (${io.festival}): guarded shrink — ${res.note}; fetch parked at ${res.file}`);
    return;
  }

  const cur = await io.loadSets();
  const ref = io.readBaseline();
  if (!ref) {
    io.writeBaseline(cur);
    return; // First run: nothing to compare against yet. Stay quiet.
  }

  const ch = diffLineups(ref, cur);
  if (!ch.added.length && !ch.removed.length && !ch.moved.length) return; // nothing changed — say nothing

  const lines = [
    ...ch.added.map((s) => `ADDED:   ${s.name} @ ${io.venueName(s.stage)} (${io.fmtDay(s.start)})`),
    ...ch.removed.map((s) => `REMOVED: ${s.name} @ ${io.venueName(s.stage)} (${io.fmtDay(s.start)})`),
    ...ch.moved.map((m) => {
      // A move can be a retime, a length change, or both.
      const retimed = m.fromStart.getTime() !== m.set.start.getTime();
      const relength = m.fromDurationMin !== m.set.durationMin;
      const when = retimed ? `${io.fmtDay(m.fromStart)} -> ${io.fmtDay(m.set.start)}` : io.fmtDay(m.set.start);
      const len = relength ? ` (${m.fromDurationMin}m -> ${m.set.durationMin}m)` : "";
      return `MOVED:   ${m.set.name} @ ${io.venueName(m.set.stage)}: ${when}${len}`;
    }),
  ];
  io.log(`SCHEDULE CHANGE (${io.festival}): ${ch.added.length} added, ${ch.removed.length} removed, ${ch.moved.length} moved`);
  for (const l of lines) io.log(l);

  io.appendChange(`${io.now().toISOString()}\n${lines.map((l) => `  ${l}`).join("\n")}\n`);
  io.writeBaseline(cur); // advance so each change fires exactly once
}
