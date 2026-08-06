/**
 * The route card: one person's day as a timeline image.
 *
 * Operator ask, 2026-07-27 — "I think the route, with alternate options. The
 * full grid is served by clashfinder." So this deliberately does NOT draw the whole timetable:
 * it draws the spine of what you are actually doing, what it costs you to get
 * between those things, and what you gave up to do it.
 *
 * Pure: `buildRouteCard` turns a MydayResult into display strings, and
 * `renderRouteCardHtml` turns those into HTML. No Runtime, no clock, no IO — so
 * the layout can be tested without rendering anything.
 */
import type { MydayResult, MydayPick } from "@festival-bot/core";
import { CARD_TOKENS, CARD_WIDTH, esc } from "./card.js";

export interface RouteCardAlt {
  time: string;
  name: string;
  stage: string;
  priority: number;
  why: string;
}

export interface RouteCardRow {
  time: string;
  name: string;
  stage: string;
  priority: number;
  /** Present only when the set is caught partially, e.g. "catch 23:20–00:15, ~55m of 90m". */
  catchNote?: string;
  /** A personal event: shown for context, never routed against and never tiered. */
  annotation?: boolean;
  /** Favourites this pick displaced. */
  alts: RouteCardAlt[];
}

export interface RouteCard {
  title: string;
  subtitle: string;
  rows: RouteCardRow[];
  dropped: string[];
  unmatched: string[];
  stale: boolean;
}

/** The display conversions the card needs, injected so the builder stays pure. */
export interface RouteCardIo {
  hhmm(d: Date): string;
  venueName(stage: string): string;
}

const whyLabel = (why: string): string =>
  why === "clash" ? "clashes" : why === "dip" ? "you could dip out for this" : "tight connection";

export function buildRouteCard(
  io: RouteCardIo,
  handle: string,
  dayLabel: string,
  res: MydayResult,
  unmatched: string[],
  stale: boolean,
): RouteCard {
  const rows: RouteCardRow[] = res.route.map((c: MydayPick, i: number) => {
    const catchNote =
      c.partial && c.enter && c.leave
        ? `catch ${io.hhmm(c.enter)}–${io.hhmm(c.leave)}, ~${c.caughtMin}m of ${c.durationMin}m`
        : undefined;
    return {
      time: io.hhmm(c.start),
      name: c.name,
      stage: io.venueName(c.stage),
      priority: c.priority,
      ...(catchNote ? { catchNote } : {}),
      ...(c.annotation ? { annotation: true as const } : {}),
      alts: (res.alts[i] ?? []).map((a) => ({
        time: io.hhmm(a.set.start),
        name: a.set.name,
        stage: io.venueName(a.set.stage),
        priority: a.set.priority,
        why: whyLabel(a.why),
      })),
    };
  });

  return {
    title: `${dayLabel} — ${handle}`,
    // Derived from the counts, never a fixed phrase: the card must not describe a
    // day it isn't showing.
    subtitle: `${res.meta.nSeen} of ${res.meta.nFavsToday} favourites playing today`,
    rows,
    dropped: res.dropped.map((s) => `${s.name} (${io.hhmm(s.start)}, ${io.venueName(s.stage)})`),
    unmatched,
    stale,
  };
}

// Height budget, in CSS px. Chromium screenshots a fixed window, so this has to
// track the template below — every block that can appear is priced here.
const CHROME = 188; // header + subtitle + padding
const ROW = 84; // one pick on the spine
const CATCH = 22; // the partial-catch line under a pick
const ALT = 30; // one displaced favourite
const ALTS_BOX = 18; // padding around a pick's alternates block
const NOTE = 54; // dropped / not-in-lineup block
const STALE = 44;
const FOOTER = 62;

export function routeCardHeightPx(card: RouteCard): number {
  let h = CHROME + FOOTER;
  if (card.stale) h += STALE;
  if (!card.rows.length) return h + NOTE;
  for (const r of card.rows) {
    h += ROW;
    if (r.catchNote) h += CATCH;
    if (r.alts.length) h += ALTS_BOX + r.alts.length * ALT;
  }
  if (card.dropped.length) h += NOTE;
  // card.unmatched is deliberately NOT rendered (raw Clashfinder codes mean
  // nothing to a reader), so it costs no height.
  return h;
}

const tierClass = (p: number): string => (p <= 1 ? "t1" : p === 2 ? "t2" : "t3");

function rowHtml(r: RouteCardRow): string {
  if (r.annotation) {
    return `<div class="slot">
      <div class="when">${esc(r.time)}</div>
      <div class="rail"><div class="dot note"></div><div class="line"></div></div>
      <div class="body"><div class="act ann"><b>${esc(r.name)}</b><i>${esc(r.stage)} &middot; your own commitment, not routed against</i></div></div>
    </div>`;
  }
  // A dip is not a sacrifice — you can have both — so it must not be filed under
  // "instead of this". Operator note, 2026-07-27.
  const allDips = r.alts.length > 0 && r.alts.every((a) => a.why === "dip");
  const alts = r.alts.length
    ? `<div class="alts"><h4>${allDips ? "you could dip out for" : "instead of this you'd have had"}</h4>${r.alts
        .map(
          (a) =>
            `<div class="alt"><span class="sw">${esc(a.name)}</span> &middot; ${esc(a.stage)} &middot; ${esc(
              a.time,
            )} <em>&mdash; set ${a.priority}, ${esc(a.why)}</em></div>`,
        )
        .join("")}</div>`
    : "";
  return `<div class="slot">
    <div class="when">${esc(r.time)}</div>
    <div class="rail"><div class="dot ${tierClass(r.priority)}"></div><div class="line"></div></div>
    <div class="body">
      <div class="act ${tierClass(r.priority)}"><b>${esc(r.name)}</b><i>${esc(r.stage)} &middot; set ${r.priority}</i></div>
      ${r.catchNote ? `<div class="catch">${esc(r.catchNote)}</div>` : ""}
      ${alts}
    </div>
  </div>`;
}

export function renderRouteCardHtml(card: RouteCard): string {
  const body = card.rows.length
    ? card.rows.map(rowHtml).join("")
    : `<p class="empty">No favourites playing that day.</p>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  :root {${CARD_TOKENS}}
  * { box-sizing:border-box; }
  body { margin:0; background:var(--ink); color:var(--text); width:${CARD_WIDTH}px;
         font-family:var(--sans); padding:34px 40px 30px; }
  .eyebrow { font-size:12px; letter-spacing:.22em; text-transform:uppercase; color:var(--faint); }
  h1 { font-family:var(--serif); font-size:40px; font-weight:400; margin:12px 0 4px;
       text-wrap:balance; }
  .sub { font-size:17px; color:var(--dim); margin:0 0 24px; }
  .stale { background:#3A2A18; border-left:3px solid var(--accent); color:#EBD9B8;
           padding:10px 14px; border-radius:5px; font-size:15px; margin:0 0 20px; }
  .slot { display:flex; align-items:stretch; gap:16px; }
  .when { width:66px; padding-top:15px; font-size:17px; color:#C6CFC8; font-weight:600;
          font-variant-numeric:tabular-nums; text-align:right; font-family:var(--mono); }
  .rail { width:12px; display:flex; flex-direction:column; align-items:center; }
  .dot { width:12px; height:12px; border-radius:50%; margin-top:18px; flex:none;
         background:var(--accent); }
  .dot.t2 { background:var(--cool); } .dot.t3 { background:#7C8A82; }
  .dot.note { background:transparent; border:2px solid var(--faint); }
  .line { flex:1; width:2px; background:var(--line); }
  .body { flex:1; min-width:0; }
  .act { background:var(--raise); border-radius:6px; padding:10px 15px; margin:8px 0 0;
         border-left:3px solid var(--accent); }
  .act.t2 { border-left-color:var(--cool); } .act.t3 { border-left-color:#7C8A82; }
  .act.ann { border-left-style:dashed; border-left-color:var(--faint); background:#1D2522; }
  .act b { font-size:19px; font-weight:600; display:block; line-height:1.25; }
  .act i { font-style:normal; font-size:14px; color:var(--dim); }
  .catch { font-size:13.5px; color:var(--faint); padding:4px 0 0 15px; font-family:var(--mono); }
  .alts { margin:7px 0 0; padding:9px 14px 10px; border-radius:6px; background:#181F1C;
          border:1px dashed var(--line); }
  .alts h4 { margin:0 0 5px; font-size:11px; letter-spacing:.16em; text-transform:uppercase;
             color:var(--faint); font-weight:700; }
  .alt { font-size:15px; color:#B4BFB8; padding:2px 0; }
  .alt .sw { color:#8FA89B; font-weight:600; }
  .alt em { font-style:normal; color:var(--faint); font-size:13.5px; }
  .note { margin:18px 0 0; padding:11px 15px; border-radius:6px; background:var(--panel);
          font-size:15px; color:var(--dim); line-height:1.45; }
  .note b { color:#C6CFC8; display:block; font-size:11px; letter-spacing:.16em;
            text-transform:uppercase; margin-bottom:4px; }
  .empty { font-size:18px; color:var(--dim); }
  footer { margin-top:26px; padding-top:16px; border-top:1px solid var(--line);
           font-size:14px; color:var(--faint); line-height:1.5; }
</style></head><body>
  <div class="eyebrow">Route &middot; travel-aware</div>
  <h1>${esc(card.title)}</h1>
  <p class="sub">${esc(card.subtitle)}</p>
  ${card.stale ? `<p class="stale">Favourites came from a STALE cache — Clashfinder was unreachable, so these picks may be out of date.</p>` : ""}
  ${body}
  ${card.dropped.length ? `<div class="note"><b>Dropped — couldn't be reached</b>${esc(card.dropped.join(" &middot; ").replace(/&amp;middot;/g, "·"))}</div>` : ""}
  <footer>Routed to maximise the number of favourites seen, with walking time between stages;
    ties broken by set tier. Walk estimates come from the site map, not measured paths.</footer>
</body></html>`;
}
