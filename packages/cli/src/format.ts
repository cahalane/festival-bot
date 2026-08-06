/** Console renderers for the CLI. Times shown in the festival timezone. */
import { formatInZone, type ArtistSet, type MydayResult, type ReachableSet } from "@festival-bot/core";
import type { Runtime } from "./runtime.js";

const tzOf = (rt: Runtime) => rt.module.manifest.timezone;
const hhmm = (rt: Runtime, d: Date) => formatInZone(d, tzOf(rt), { hour: "2-digit", minute: "2-digit" });
const dayhhmm = (rt: Runtime, d: Date) =>
  formatInZone(d, tzOf(rt), { weekday: "short", hour: "2-digit", minute: "2-digit" });

const cap = (rt: Runtime, slug: string) => (rt.limited(slug) ? "  *arrive early*" : "");

export function renderWhatson(rt: Runtime, when: Date, now: ArtistSet[], next: ArtistSet[], favs?: Set<string>): string {
  const star = (s: ArtistSet) => (favs?.has(s.name) ? "*" : " ");
  const lines = [`\nAt ${dayhhmm(rt, when)} (${tzOf(rt)})`, "", "  ON NOW:"];
  if (!now.length) lines.push("    (nothing — between sets)");
  for (const s of now) {
    const endsIn = Math.round((s.end.getTime() - when.getTime()) / 60000);
    lines.push(`  ${star(s)} ${s.name.slice(0, 28).padEnd(28)} ${rt.venueName(s.stage).padEnd(22)} till ${hhmm(rt, s.end)} (${endsIn}m left)`);
  }
  lines.push("", "  NEXT:");
  if (!next.length) lines.push("    (nothing starting soon)");
  for (const s of next) {
    const inMin = Math.round((s.start.getTime() - when.getTime()) / 60000);
    lines.push(`  ${star(s)} ${hhmm(rt, s.start)} (+${String(inMin).padStart(3)}m) ${s.name.slice(0, 28).padEnd(28)} ${rt.venueName(s.stage)}${cap(rt, s.stage)}`);
  }
  return lines.join("\n");
}

export function renderReachable(rt: Runtime, when: Date, fromStage: string | null, rows: ReachableSet[]): string {
  const lines = [`\nFree at ${dayhhmm(rt, when)}${fromStage ? ` near ${rt.venueName(fromStage)}` : ""}:`, ""];
  if (!rows.length) return lines.concat("  nothing reachable.").join("\n");
  for (const r of rows) {
    const flags: string[] = [];
    if (r.missedMin > 0) flags.push(`catch ${r.durationMin - r.missedMin}/${r.durationMin}m`);
    if (rt.limited(r.stage)) flags.push("limited cap — arrive early");
    const tag = flags.length ? `  (${flags.join("; ")})` : "";
    lines.push(`  ${hhmm(rt, r.start)} ${r.name.slice(0, 26).padEnd(26)} ${rt.venueName(r.stage).padEnd(22)} ${r.durationMin}m  walk ${r.walkMin}${tag}`);
  }
  return lines.join("\n");
}

export function renderAfter(rt: Runtime, base: ArtistSet, rows: ReachableSet[]): string {
  const head = `\n${base.name} — ${dayhhmm(rt, base.start)}→${hhmm(rt, base.end)} @ ${rt.venueName(base.stage)} (${base.durationMin}m)\n`;
  if (!rows.length) return head + "\n  nothing reachable after this set.";
  return head + "\n" + rows.map((r) => {
    const flags: string[] = [];
    if (r.missedMin > 0) flags.push(`catch ${r.durationMin - r.missedMin}/${r.durationMin}m`);
    if (rt.limited(r.stage)) flags.push("limited cap");
    const tag = flags.length ? `  (${flags.join("; ")})` : "";
    return `  ${hhmm(rt, r.start)} ${r.name.slice(0, 26).padEnd(26)} ${rt.venueName(r.stage).padEnd(22)} walk ${r.walkMin}${tag}`;
  }).join("\n");
}

export function renderMyday(rt: Runtime, handle: string, dayLo: Date, res: MydayResult, unmatched: string[], stale: boolean): string {
  const lines = [
    `\n${formatInZone(dayLo, tzOf(rt), { weekday: "short", day: "2-digit", month: "short" })} — ${handle} ` +
      `(route: ${res.meta.nSeen} of ${res.meta.nFavsToday} favourites playing)`,
  ];
  if (stale) lines.push("  ⚠ favourites from STALE cache (Clashfinder unreachable)");
  lines.push("");
  if (!res.route.length) lines.push("  no favourites playing that day.");
  res.route.forEach((c, i) => {
    if (c.annotation) {
      lines.push(`  ${hhmm(rt, c.start)} ${c.name.slice(0, 26).padEnd(26)} ${rt.venueName(c.stage).padEnd(22)} [note — informational, not routed]`);
      return;
    }
    const part =
      c.partial && c.enter && c.leave
        ? `  ⟨catch ${hhmm(rt, c.enter)}–${hhmm(rt, c.leave)}, ~${c.caughtMin}m of ${c.durationMin}m⟩`
        : "";
    lines.push(`  ${hhmm(rt, c.start)} ${c.name.slice(0, 26).padEnd(26)} ${rt.venueName(c.stage).padEnd(22)} [set ${c.priority}]${cap(rt, c.stage)}${part}`);
    for (const a of res.alts[i] ?? []) {
      const why = a.why === "clash" ? "clashes" : a.why === "dip" ? "dip out for this" : "tight connection";
      lines.push(`        or ${hhmm(rt, a.set.start)} ${a.set.name.slice(0, 26).padEnd(26)} ${rt.venueName(a.set.stage).padEnd(16)} [set ${a.set.priority}] — ${why}`);
    }
  });
  if (res.dropped.length) {
    lines.push("\n  DROPPED (unreachable): " + res.dropped.map((s) => `${s.name} (${hhmm(rt, s.start)})`).join(", "));
  }
  if (unmatched.length) lines.push("\n  NOT IN LINEUP: " + unmatched.join(", "));
  return lines.join("\n");
}
