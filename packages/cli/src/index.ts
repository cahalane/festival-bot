#!/usr/bin/env -S npx tsx
/**
 * festplan — operator/verification CLI for the festival-bot engine.
 *
 *   festplan now ["Sat 17:00"]                  on now + next 2h (default: real time)
 *   festplan at "Sat 17:15" [--from cupra]      what's on at a time / reachable from a stage
 *   festplan after "<artist>"                   reachable through the rest of that night
 *   festplan myday <cf-user> <day> [--favs ...] travel-aware day itinerary
 *   festplan remind "<artist>" [lead_min]       fire time + ISO for the reminder queue
 *
 * Active festival is read from CLAUDE.md's @festivals/<slug>/CONTEXT.md import
 * (see config.activeFestivalSlug); the ACTIVE_FESTIVAL env var overrides.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dayWindow, parseWhen, vibeCheck, diffLineups, forHandleAndWindow, toArtistSet, formatInZone } from "@festival-bot/core";
import {
  toClashfinderSetup,
  createMbidResolver,
  createSetlistSource,
} from "@festival-bot/adapters";
import type { Setlist } from "@festival-bot/core";
import {
  favouriteInputs,
  channelOf,
  addReminder,
  loadReminders,
  pendingReminders,
  dueReminders,
  markFired,
  removeReminder,
  nextReminderFire,
  addPersonalEvent,
  loadPersonalEvents,
  removePersonalEvent,
} from "@festival-bot/data";
import { loadSecrets, cacheDir } from "./config.js";
import { baselineFile, readBaseline, writeBaseline } from "./baseline.js";
import { loadActiveFestival, ACTIVE_FESTIVAL } from "./festivals.js";
import { loadRuntime, resolveUserFavourites, findSets, type Runtime } from "./runtime.js";
import { runScheduleTick } from "./tick.js";
import { runCfPush } from "./cf-push.js";
import { runMapCheck, runAmenities } from "./map-watch.js";
import { runAnnounceTick, type AnnounceSeen } from "./announce-watch.js";
import { runPagesTick } from "./pages-watch.js";
import type { PageRef } from "@festival-bot/adapters";
import { runWalkRefine } from "./walk-refine.js";
import {
  buildWeatherReport,
  renderWeatherReport,
  renderWeatherCardHtml,
  shouldUseHourly,
  writeWeatherCardPng,
  cardHeightPx,
  festivalDates,
} from "./weather.js";
import { renderAfter, renderMyday, renderReachable, renderWhatson } from "./format.js";
import { runKmlExport } from "./kml-export.js";
import { runKmlAugment } from "./kml-augment.js";
import { runPinMap } from "./pin-map.js";
import { runColdTick } from "./cold-watch.js";
import { parseCaps, applyCaps } from "./set-caps.js";
import { runRainTick } from "./rain-watch.js";
import { reminderChannel } from "./reminder-channel.js";
import { buildRouteCard, renderRouteCardHtml, routeCardHeightPx } from "./route-card.js";
import { writeCardPng } from "./card.js";
import {
  localIso,
  whatsonJson,
  reachableJson,
  afterJson,
  mydayJson,
  setlistJson,
  remindJson,
  vibecheckJson,
  scheduleWatchJson,
  type JsonCtx,
} from "./json.js";

const USAGE = `festplan (festival: ${ACTIVE_FESTIVAL})
  active-festival [--json]                    print the resolved active-festival slug (for shell scripts); --json adds timezone
  now ["Sat 17:00"]
  at "Sat 17:15" [--from <stage>]
  after "<artist>"
  myday <cf-user> <day> [--favs "A, B"] [--since "Fri 16:15"] [--cap "Cypher=60"] [--png FILE]
  remind "<artist>" [lead_min]
  clashfinder                                 emit Clashfinder setup text for the lineup
  cf-push <cf-event> [--note "..."] [--no-mbid] [--accept-remote]  push the lineup to a Clashfinder event (needs secrets; --accept-remote overrides a foreign-edit hold)
  setlist "<artist>" [--limit N] [--mbid <id>]  recent setlists for an artist (via setlist.fm; --mbid skips name resolution)
  reminders add|list|pending|due|fired|rm|next   reminder queue (wake-loop surface)
  events add|list|rm                          personal (non-lineup) fixed events (add --soft for an annotation-only one); myday routes around mandatory ones, always shows soft ones
  weather [--days N] [--png FILE]              forecast over the festival window (--png = shareable card)
  announcements [--limit N]                   latest festival announcements (official feed)
  vibecheck <cf-user> ["Sat 22:00"]           personalised now/next + clash decisions
  schedule-watch [--commit]                   lineup changes vs the saved baseline
  schedule-tick                               unattended: re-pull live + diff; SILENT unless something changed
  announce-tick                               unattended: pull official announcements; SILENT unless a new one
  pages-tick                                  unattended: diff info pages by modified_at; SILENT unless one changed
  cold-tick                                   unattended: forecast cold-snap alerts for opted-in users; SILENT unless one is due
  rain-tick                                   unattended: imminent-rain warning over the next 6h; SILENT unless rain is due or worsens
  page <id> [--json]                          full text of one info page by id (from a PAGE UPDATE line)
  fetch-lineup [--ciutat] [--force]           re-pull the lineup from the live source (--ciutat: a secondary programme some festival modules' lineup sources support)
  artist-info <slug> [slug ...]               per-artist genre/bio (festival artist page)
  favs <cf-user|handle>                       a user's matched picks (+ unmatched)
  map-check                                   site-map watch (SILENT unless the map just published; no-op for a festival with no map source)
  kml-augment --in FILE [--out FILE]          merge official POI coords into an existing My Maps KML export
  kml [--out FILE]                            every POI as KML for Google My Maps import
  pin "<place>" ["<place>" ...] [--png FILE]  official site map, cropped + pinned around named places
  amenities [--json]                          nearest amenity (toilets/water/food/bars/...) per stage, from the cached map
  walk-refine [--commit]                      recompute venues.json walk-graph edges from real map coordinates

  --json on active-festival/now/at/after/myday/setlist/remind/vibecheck/schedule-watch/announcements/reminders/events/page/fetch-lineup/artist-info/favs/amenities/weather for machine-readable output`;

function takeFlag(args: string[], flag: string): { value?: string; rest: string[] } {
  const i = args.indexOf(flag);
  if (i < 0) return { rest: args };
  return { value: args[i + 1], rest: [...args.slice(0, i), ...args.slice(i + 2)] };
}

function renderSetlists(artist: string, lists: Setlist[]): string {
  // Always attributed + caveated: setlist.fm is crowd-sourced, so this is "what
  // they've been playing", not a first-hand report of the stage right now.
  const head = `${artist} — recent setlists (setlist.fm; crowd-sourced, may lag / be incomplete)`;
  if (!lists.length) return `${head}\n  none found.`;
  const blocks = lists.map((l) => {
    const where = [l.venue, l.city].filter(Boolean).join(", ");
    const meta = [l.eventDate, where, l.tour].filter(Boolean).join(" · ");
    if (!l.songs.length) return `${meta}\n  (no songs entered yet)${l.url ? `\n  ${l.url}` : ""}`;
    const label = (s: { name: string; cover?: string; tape?: boolean; info?: string }) => {
      const tags = [s.cover && `${s.cover} cover`, s.tape && "tape", s.info].filter(Boolean).join("; ");
      return tags ? `${s.name} (${tags})` : s.name;
    };
    const main = l.songs.filter((s) => s.encore == null);
    const encores = [...new Set(l.songs.filter((s) => s.encore != null).map((s) => s.encore!))].sort();
    const lines = [`  ${main.map(label).join(", ")}`];
    for (const n of encores) {
      const songs = l.songs.filter((s) => s.encore === n);
      lines.push(`  Encore${encores.length > 1 ? ` ${n}` : ""}: ${songs.map(label).join(", ")}`);
    }
    if (l.url) lines.push(`  ${l.url}`);
    return `${meta}\n${lines.join("\n")}`;
  });
  return `${head}\n\n${blocks.join("\n\n")}`;
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0] ?? "";
  let args = argv.slice(1);

  const json = args.includes("--json"); args = args.filter((a) => a !== "--json");
  const from = takeFlag(args, "--from"); args = from.rest;
  const favsFlag = takeFlag(args, "--favs"); args = favsFlag.rest;
  const manual = favsFlag.value ? favsFlag.value.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  if (cmd === "active-festival") {
    if (json) {
      const { manifest } = loadActiveFestival();
      console.log(JSON.stringify({ slug: ACTIVE_FESTIVAL, timezone: manifest.timezone }, null, 2));
    } else {
      console.log(ACTIVE_FESTIVAL);
    }
    return;
  }

  // BOOTSTRAP: handled before loadRuntime, which parses the snapshot up front. A
  // festival module that has no snapshot yet (a newly-prepared edition — see
  // festivals/ps27) could otherwise never run the one command that creates it.
  if (cmd === "fetch-lineup") {
    const src = loadActiveFestival().sources.lineup;
    if (!src.refresh) return void console.log("this festival's lineup source has no live fetch.");
    const res = await src.refresh({
      variant: args.includes("--ciutat") ? "ciutat" : "forum",
      force: args.includes("--force"),
    });
    if (json) return void console.log(JSON.stringify({ query: "fetch-lineup", ...res }, null, 2));
    console.log(`${res.variant}: fetched ${res.fetched} sets (prev ${res.previous ?? "none"}) — ${res.note}`);
    console.log(`  ${res.written ? "wrote" : "GUARDED → sidecar"}: ${res.file}`);
    if (!res.written) console.log("  (re-run with --force to overwrite the snapshot)");
    return;
  }

  const rt: Runtime = await loadRuntime(loadActiveFestival());
  const tz = rt.module.manifest.timezone;
  const ctx: JsonCtx = { tz, venueName: (s) => rt.venueName(s), limited: (s) => rt.limited(s) };
  const emit = (obj: unknown): void => console.log(JSON.stringify(obj, null, 2));

  switch (cmd) {
    case "now":
    case "at": {
      const when = args.length ? parseWhen(args.join(" "), rt.calendar) : new Date();
      if (cmd === "at" && from.value) {
        const rows = rt.planner.reachable(rt.sets, from.value, when);
        if (json) emit(reachableJson(ctx, when, from.value, rows));
        else console.log(renderReachable(rt, when, from.value, rows));
      } else {
        const { now, next } = rt.planner.whatson(rt.sets, when);
        if (json) emit(whatsonJson(ctx, when, now, next));
        else console.log(renderWhatson(rt, when, now, next));
      }
      break;
    }
    case "after": {
      const hits = findSets(rt.sets, args.join(" "));
      if (!hits.length) return void (json ? emit({ query: "after", matches: [] }) : console.log("no artist matched."));
      for (const base of hits) {
        const rows = rt.planner.after(rt.sets, base);
        if (json) emit(afterJson(ctx, base, rows));
        else console.log(renderAfter(rt, base, rows));
      }
      break;
    }
    case "myday": {
      const handle = args[0];
      const day = args[1];
      if (!handle || !day) return void console.log("usage: myday <handle|cf-user> <day> [--favs \"A, B\"] [--since \"Fri 16:15\"] [--png FILE]");
      // Resolve a stored handle -> Clashfinder user / manual favs (bare cf-username
      // if unknown). --favs is a manual override.
      const favInputs = manual ? { manual } : favouriteInputs(handle);
      const { favs, unmatched, stale } = await resolveUserFavourites(rt, favInputs);
      const sinceFlag = takeFlag(args, "--since"); args = sinceFlag.rest;
      // `--cap "Cypher=60"` plans for attending only PART of a long set, so the
      // router can spend the time it gets back (operator note, 2026-08-01).
      const capFlag = takeFlag(args, "--cap"); args = capFlag.rest;
      const caps = parseCaps(capFlag.value ? [capFlag.value] : []);
      const fullWindow = dayWindow(day, rt.calendar);
      // `--since "Fri 16:15"` clips the START of the day (operator note, 2026-07-31:
      // "give me a half day card after echo"). The END is untouched, so the
      // night still runs to the day cutoff.
      const window: [Date, Date] = sinceFlag.value
        ? [parseWhen(sinceFlag.value, rt.calendar), fullWindow[1]]
        : fullWindow;
      const [lo] = window;
      const personal = forHandleAndWindow(loadPersonalEvents(), handle, window);
      const forced = personal.filter((e) => e.mandatory).map(toArtistSet);
      const annotations = personal.filter((e) => !e.mandatory).map(toArtistSet);
      const res = rt.planner.myday(applyCaps(rt.sets, caps), favs, window, forced, annotations);
      const mydayPng = takeFlag(args, "--png");
      if (mydayPng.value) {
        // Operator note, 2026-07-27: the route as an image, sent with the commentary
        // written separately per person. The card carries only what was computed.
        const card = buildRouteCard(
          {
            hhmm: (d: Date) => formatInZone(d, tz, { hour: "2-digit", minute: "2-digit" }),
            venueName: (st: string) => rt.venueName(st),
          },
          handle,
          formatInZone(lo, tz, { weekday: "short", day: "2-digit", month: "short" }),
          res,
          unmatched,
          stale,
        );
        writeCardPng(renderRouteCardHtml(card), mydayPng.value, routeCardHeightPx(card));
        console.log(`wrote ${mydayPng.value}`);
        break;
      }
      if (json) emit(mydayJson(ctx, handle, lo, res, unmatched, stale));
      else console.log(renderMyday(rt, handle, lo, res, unmatched, stale));
      break;
    }
    case "remind": {
      let lead = 15;
      if (args.length && /^\d+$/.test(args[args.length - 1]!)) lead = Number(args.pop());
      const hits = findSets(rt.sets, args.join(" "));
      if (!hits.length) return void (json ? emit({ query: "remind", matches: [] }) : console.log("no artist matched."));
      for (const s of hits) {
        if (json) { emit(remindJson(ctx, s, lead)); continue; }
        const fire = new Date(s.start.getTime() - lead * 60000);
        console.log(`\n${s.name} — ${localIso(s.start, tz)} @ ${rt.venueName(s.stage)}`);
        console.log(`  remind ${lead}m before -> fire ${localIso(fire, tz)}`);
      }
      break;
    }
    case "clashfinder": {
      // Emit Clashfinder setup text for the whole lineup (stdout; redirect to a
      // file, then paste into the CF editor). No live push — CF has no documented
      // write API; updating the event is a separate, confirmed step.
      const today = new Date().toISOString().slice(0, 10);
      console.log(
        toClashfinderSetup(rt.sets, {
          timezone: tz,
          mainTitle: rt.module.manifest.name,
          stageName: (s) => rt.venueName(s),
          footer: [`Generated by festival-bot ${today}`],
        }),
      );
      break;
    }
    case "cf-push": {
      await runCfPush(rt, tz, args);
      break;
    }
    case "setlist": {
      const limitFlag = takeFlag(args, "--limit");
      const mbidFlag = takeFlag(limitFlag.rest, "--mbid");
      const artist = mbidFlag.rest.join(" ").trim();
      if (!artist) return void console.log('usage: setlist "<artist>" [--limit N] [--mbid <id>]');
      const apiKey = loadSecrets()["setlist.fm"]?.apiKey;
      if (!apiKey) return void console.log('no "setlist.fm".apiKey in config/secrets.json — register at api.setlist.fm.');
      const limit = limitFlag.value ? Number(limitFlag.value) : 3;
      // Reuse the shared MusicBrainz resolver (cached) to key by mbid — far more
      // reliable than name search (which can return cover/tribute bands first).
      const resolver = createMbidResolver({ cacheFile: join(cacheDir("musicbrainz"), "mbid.json") });
      const setlists = createSetlistSource({
        apiKey,
        resolveMbid: (name) => resolver.resolve(name),
        cacheDir: cacheDir("setlistfm"),
      });
      const lists = await setlists.recent(artist, { mbid: mbidFlag.value, limit });
      if (json) emit(setlistJson(artist, lists));
      else console.log(renderSetlists(artist, lists));
      break;
    }
    case "reminders": {
      const sub = args[0] ?? "";
      if (sub === "add") {
        const [, handle, chatId, fireIso, ...rest] = args;
        const text = rest.join(" ");
        if (!handle || !chatId || !fireIso || !text)
          return void console.log('usage: reminders add <handle> <chat_id> <fire_iso> "<text>"');
        const r = addReminder({ handle, channel: reminderChannel(chatId, channelOf(handle)), fireIso, text });
        if (json) emit(r);
        else console.log(`added: ${r.id}`);
      } else if (sub === "due") {
        const items = dueReminders(args[1]);
        if (json) emit({ query: "reminders-due", due: items });
        else if (!items.length) console.log("(none due)");
        else for (const r of items) console.log(`DUE ${r.id} ${r.fireIso} -> ${r.channel.id} (${r.handle}): ${r.text}`);
      } else if (sub === "pending") {
        const items = pendingReminders();
        if (json) emit({ query: "reminders-pending", pending: items });
        else for (const r of items) console.log(`${r.id} ${r.fireIso} -> ${r.channel.id}: ${r.text.slice(0, 60)}`);
      } else if (sub === "list") {
        const items = loadReminders()
          .slice()
          .sort((a, b) => Number(a.fired) - Number(b.fired) || a.fireIso.localeCompare(b.fireIso));
        if (json) emit({ query: "reminders-list", reminders: items });
        else for (const r of items) console.log(`[${r.fired ? "x" : " "}] ${r.id} ${r.fireIso} -> ${r.channel.id} (${r.handle}): ${r.text.slice(0, 60)}`);
      } else if (sub === "fired") {
        if (!args[1]) return void console.log("usage: reminders fired <id>");
        markFired(args[1]);
        if (json) emit({ fired: args[1] });
        else console.log(`marked fired: ${args[1]}`);
      } else if (sub === "rm") {
        if (!args[1]) return void console.log("usage: reminders rm <id>");
        removeReminder(args[1]);
        if (json) emit({ removed: args[1] });
        else console.log(`removed: ${args[1]}`);
      } else if (sub === "next") {
        const iso = nextReminderFire();
        if (json) emit({ nextFire: iso });
        else console.log(iso ?? "(no pending reminders)");
      } else {
        console.log("usage: reminders add|list|pending|due [iso]|fired <id>|rm <id>|next");
      }
      break;
    }
    case "events": {
      const sub = args[0] ?? "";
      if (sub === "add") {
        const [, handle, name, startIso, endIso] = args;
        const rest = args.slice(5);
        const stageFlag = takeFlag(rest, "--stage");
        const soft = stageFlag.rest.includes("--soft");
        if (!handle || !name || !startIso || !endIso)
          return void console.log('usage: events add <handle> "<name>" <start_iso> <end_iso> [--stage <slug>] [--soft]');
        const e = addPersonalEvent({ handle, name, startIso, endIso, stage: stageFlag.value ?? null, mandatory: !soft });
        if (json) emit(e);
        else console.log(`added: ${e.id}`);
      } else if (sub === "list") {
        const handle = args[1];
        const items = loadPersonalEvents()
          .filter((e) => !handle || e.handle === handle)
          .sort((a, b) => a.startIso.localeCompare(b.startIso));
        if (json) emit({ query: "events-list", events: items });
        else
          for (const e of items)
            console.log(`[${e.mandatory ? "mandatory" : "soft"}] ${e.id} ${e.startIso}–${e.endIso} (${e.handle}): ${e.name}${e.stage ? ` @ ${e.stage}` : ""}`);
      } else if (sub === "rm") {
        if (!args[1]) return void console.log("usage: events rm <id>");
        removePersonalEvent(args[1]);
        if (json) emit({ removed: args[1] });
        else console.log(`removed: ${args[1]}`);
      } else {
        console.log('usage: events add <handle> "<name>" <start_iso> <end_iso> [--stage <slug>]|list [handle]|rm <id>');
      }
      break;
    }
    case "announcements": {
      const src = rt.module.sources.announcements;
      if (!src) return void console.log("no announcements source for this festival.");
      const limitFlag = takeFlag(args, "--limit");
      const limit = limitFlag.value ? Number(limitFlag.value) : 10;
      const items = await src.latest(limit);
      if (json) emit({ query: "announcements", festival: ACTIVE_FESTIVAL, items });
      else if (!items.length) console.log("no announcements.");
      else
        for (const a of items) {
          console.log(`\n${a.createdAt} ${a.text || "(image only)"}`);
          if (a.imageUrl) console.log(`  image: ${a.imageUrl}`);
        }
      break;
    }
    case "weather": {
      const src = rt.module.sources.weather;
      if (!src) return void console.log("no weather source for this festival.");
      const daysFlag = takeFlag(args, "--days");
      const days = daysFlag.value ? Number(daysFlag.value) : 10;
      const daily = await src.daily(days);
      // `today` in the FESTIVAL timezone, so the coldest-night callout names a
      // night still ahead rather than one already slept through.
      const todayIso = formatInZone(new Date(), rt.module.manifest.timezone, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .split("/")
        .reverse()
        .join("-");
      const report = buildWeatherReport(daily, festivalDates(rt.module.manifest.days), { today: todayIso });
      const stale = src.lastFetchStale?.() ?? false;
      const pngFlag = takeFlag(args, "--png");
      if (pngFlag.value) {
        if (!report.coversFestival)
          return void console.log("no festival days in the forecast window yet — nothing to card.");
        const fest = report.rows.filter((r) => r.isFestivalDay);
        // Camping festival: pull the hourly detail so the card can show WHEN rain
        // lands, including overnight on the tents. Best-effort — the card still
        // renders (daily-only) if the hourly call fails.
        let hourly: Awaited<ReturnType<NonNullable<typeof src.hourlyRange>>> | undefined;
        if (src.hourlyRange && fest.length) {
          try {
            const lastDate = fest[fest.length - 1]!.date;
            const end = new Date(`${lastDate}T00:00:00Z`);
            // +2, not +1: the pack-up morning needs one extra day, and the
            // rolling 24h graph needs another beyond that or it runs short when
            // the card renders late on the last day.
            end.setUTCDate(end.getUTCDate() + 2);
            hourly = await src.hourlyRange(fest[0]!.date, end.toISOString().slice(0, 10));
            // Staleness must be re-read HERE: `stale` above reflects daily() only,
            // so a stale hourly fetch used to slip through unflagged.
            const hourlyStale = src.lastFetchStale?.() ?? false;
            if (!shouldUseHourly({ dailyStale: stale, hourlyStale })) {
              console.log(
                "(hourly detail dropped: it came from a different forecast run than the daily figures)",
              );
              hourly = undefined;
            }
          } catch (e) {
            console.log(`(hourly detail unavailable: ${(e as Error).message})`);
          }
        }
        writeWeatherCardPng(
          // "Today" in the FESTIVAL's timezone, not the box's — the graph must
          // land on the day the crew are actually standing in.
          renderWeatherCardHtml(report, rt.module.manifest.name, {
            hourly,
            todayDate: formatInZone(new Date(), rt.module.manifest.timezone, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
              .split("/")
              .reverse()
              .join("-"),
            now: new Date(),
          }),
          pngFlag.value,
          cardHeightPx(fest.length + (report.getaway ? 1 : 0)),
        );
        console.log(`wrote ${pngFlag.value}${stale ? "  (WARNING: built from STALE cache)" : ""}`);
        break;
      }
      if (json)
        emit({
          query: "weather",
          festival: ACTIVE_FESTIVAL,
          stale,
          coversFestival: report.coversFestival,
          days: report.rows,
          wettest: report.wettest,
          coldestNight: report.coldestNight,
        });
      else console.log(renderWeatherReport(report, rt.module.manifest.name, { stale }));
      break;
    }
    case "page": {
      const src = rt.module.sources.pages;
      if (!src?.page) return void console.log("no info-pages source for this festival.");
      const id = args[0];
      if (!id) return void console.log("usage: page <id> [--json]   (id from a PAGE UPDATE line / pages-tick)");
      const p = await src.page(id);
      if (!p) {
        if (json) emit({ query: "page", festival: ACTIVE_FESTIVAL, id, page: null });
        else console.log(`no page with id ${id}.`);
        break;
      }
      if (json) emit({ query: "page", festival: ACTIVE_FESTIVAL, page: p });
      else console.log(`${p.title}  (id ${p.id}, modified ${p.modifiedAt})\n\n${p.body}`);
      break;
    }
    case "vibecheck": {
      const user = args[0];
      if (!user) return void console.log('usage: vibecheck <cf-user> ["Sat 22:00" | iso] [--json]');
      const when = args.length > 1 ? parseWhen(args.slice(1).join(" "), rt.calendar) : new Date();
      const { favs, stale } = await resolveUserFavourites(rt, favouriteInputs(user));
      const picks = rt.sets.filter((s) => favs.has(s.name));
      const vc = vibeCheck(picks, when);
      if (json) {
        emit(vibecheckJson(ctx, vc, favs, stale));
        break;
      }
      const hhmm = (d: Date) => localIso(d, tz).slice(11, 16);
      const emoji = (name: string) =>
        (({ 1: "🟢", 2: "🔵", 3: "🟣" }) as Record<number, string>)[favs.get(name) ?? 0] ?? "⭐";
      const out: string[] = [
        `NOW ${localIso(vc.now, tz).slice(0, 16).replace("T", " ")}${stale ? " (favs from stale cache)" : ""}`,
      ];
      if (vc.onNow.length)
        for (const s of vc.onNow) out.push(`ON NOW: ${emoji(s.name)} ${s.name} @ ${rt.venueName(s.stage)} (til ${hhmm(s.end)})`);
      else out.push("ON NOW: nothing of yours");
      if (vc.next.length) {
        out.push("NEXT ~90min:");
        for (const s of vc.next) out.push(`  ${emoji(s.name)} ${hhmm(s.start)} ${s.name} @ ${rt.venueName(s.stage)}`);
        for (const d of vc.decisions) out.push(`DECISION: ${d.a.name} (${hhmm(d.a.start)}) vs ${d.b.name} (${hhmm(d.b.start)}) — clash`);
      } else if (vc.later) {
        out.push(`LATER: next pick is ${emoji(vc.later.name)} ${localIso(vc.later.start, tz).slice(0, 16).replace("T", " ")} ${vc.later.name} @ ${rt.venueName(vc.later.stage)}`);
      } else {
        out.push("LATER: nothing else of yours coming up");
      }
      console.log(out.join("\n"));
      break;
    }
    case "schedule-watch": {
      const commit = args.includes("--commit");
      const refFile = baselineFile(ACTIVE_FESTIVAL);
      const ref = readBaseline(refFile);
      if (!ref) {
        writeBaseline(refFile, rt.sets);
        return void console.log("no baseline -> seeded schedule_ref.json from current; no diff this run");
      }
      const ch = diffLineups(ref, rt.sets);
      const fmtDay = (d: Date) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(d);
      if (json) emit(scheduleWatchJson(ctx, ch));
      else if (!ch.added.length && !ch.removed.length && !ch.moved.length) console.log("NO CHANGES");
      else {
        for (const s of ch.added) console.log(`ADDED:   ${s.name} @ ${rt.venueName(s.stage)} (${fmtDay(s.start)})`);
        for (const s of ch.removed) console.log(`REMOVED: ${s.name} @ ${rt.venueName(s.stage)} (${fmtDay(s.start)})`);
        for (const m of ch.moved) {
          // A move can be a retime, a length change, or both.
          const retimed = m.fromStart.getTime() !== m.set.start.getTime();
          const relength = m.fromDurationMin !== m.set.durationMin;
          const when = retimed ? `${fmtDay(m.fromStart)} -> ${fmtDay(m.set.start)}` : fmtDay(m.set.start);
          const len = relength ? ` (${m.fromDurationMin}m -> ${m.set.durationMin}m)` : "";
          console.log(`MOVED:   ${m.set.name} @ ${rt.venueName(m.set.stage)}: ${when}${len}`);
        }
      }
      if (commit) {
        writeBaseline(refFile, rt.sets);
        console.log("[baseline updated]");
      }
      break;
    }
    case "schedule-tick": {
      const src = rt.module.sources.lineup;
      if (!src.refresh) return void console.log("TICK ERROR: no live lineup source for this festival");
      const refresh = src.refresh.bind(src);
      const stateFile = join(cacheDir(ACTIVE_FESTIVAL), "watch_state.json");
      const logFile = join(cacheDir(ACTIVE_FESTIVAL), "schedule_changes.log");
      const refFile = baselineFile(ACTIVE_FESTIVAL);
      await runScheduleTick({
        festival: ACTIVE_FESTIVAL,
        readFails: () => {
          try {
            return (JSON.parse(readFileSync(stateFile, "utf8")) as { fails?: number }).fails ?? 0;
          } catch {
            return 0;
          }
        },
        writeFails: (fails) => {
          mkdirSync(dirname(stateFile), { recursive: true });
          writeFileSync(stateFile, JSON.stringify({ fails, at: new Date().toISOString() }));
        },
        refresh: () => refresh(),
        loadSets: () => src.loadSets(),
        readBaseline: () => readBaseline(refFile),
        writeBaseline: (sets) => writeBaseline(refFile, sets),
        appendChange: (entry) => {
          mkdirSync(dirname(logFile), { recursive: true });
          appendFileSync(logFile, entry);
        },
        log: (line) => console.log(line),
        fmtDay: (d) =>
          new Intl.DateTimeFormat("en-GB", {
            timeZone: tz, weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
          }).format(d),
        venueName: (s) => rt.venueName(s),
        now: () => new Date(),
      });
      break;
    }
    case "announce-tick": {
      const src = rt.module.sources.announcements;
      if (!src) return void console.log("TICK ERROR: no announcements source for this festival");
      const stateFile = join(cacheDir(ACTIVE_FESTIVAL), "announce_watch_state.json");
      const seenFile = join(cacheDir(ACTIVE_FESTIVAL), "announce_seen.json");
      const logFile = join(cacheDir(ACTIVE_FESTIVAL), "announce_changes.log");
      await runAnnounceTick({
        festival: ACTIVE_FESTIVAL,
        readFails: () => {
          try {
            return (JSON.parse(readFileSync(stateFile, "utf8")) as { fails?: number }).fails ?? 0;
          } catch {
            return 0;
          }
        },
        writeFails: (fails) => {
          mkdirSync(dirname(stateFile), { recursive: true });
          writeFileSync(stateFile, JSON.stringify({ fails, at: new Date().toISOString() }));
        },
        latest: () => src.latest(30),
        readSeen: () => {
          try {
            return JSON.parse(readFileSync(seenFile, "utf8")) as AnnounceSeen;
          } catch {
            return null;
          }
        },
        writeSeen: (seen) => {
          mkdirSync(dirname(seenFile), { recursive: true });
          writeFileSync(seenFile, JSON.stringify(seen));
        },
        appendChange: (entry) => {
          mkdirSync(dirname(logFile), { recursive: true });
          appendFileSync(logFile, entry);
        },
        log: (line) => console.log(line),
        now: () => new Date(),
      });
      break;
    }
    case "pages-tick": {
      const src = rt.module.sources.pages;
      if (!src) return void console.log("TICK ERROR: no pages source for this festival");
      const stateFile = join(cacheDir(ACTIVE_FESTIVAL), "pages_watch_state.json");
      const refFile = join(cacheDir(ACTIVE_FESTIVAL), "pages_ref.json");
      const logFile = join(cacheDir(ACTIVE_FESTIVAL), "pages_changes.log");
      await runPagesTick({
        festival: ACTIVE_FESTIVAL,
        readFails: () => {
          try {
            return (JSON.parse(readFileSync(stateFile, "utf8")) as { fails?: number }).fails ?? 0;
          } catch {
            return 0;
          }
        },
        writeFails: (fails) => {
          mkdirSync(dirname(stateFile), { recursive: true });
          writeFileSync(stateFile, JSON.stringify({ fails, at: new Date().toISOString() }));
        },
        fetchRefs: () => src.refs(),
        fetchBody: async (id) => (src.page ? (await src.page(id))?.body ?? null : null),
        readBaseline: () => {
          try {
            return JSON.parse(readFileSync(refFile, "utf8")) as PageRef[];
          } catch {
            return null;
          }
        },
        writeBaseline: (refs) => {
          mkdirSync(dirname(refFile), { recursive: true });
          writeFileSync(refFile, JSON.stringify(refs));
        },
        appendChange: (entry) => {
          mkdirSync(dirname(logFile), { recursive: true });
          appendFileSync(logFile, entry);
        },
        log: (line) => console.log(line),
        now: () => new Date(),
      });
      break;
    }
    // NOTE: `fetch-lineup` is handled above, before the runtime is built.
    case "artist-info": {
      const src = rt.module.sources.artistInfo;
      if (!src) return void console.log("no artist-info source for this festival.");
      if (!args.length) return void console.log("usage: artist-info <slug> [slug ...]");
      const infos = [];
      for (const slug of args) {
        const info = await src.info(slug);
        infos.push(info);
        if (!json) {
          console.log(`\n${info.name} — ${info.url}`);
          console.log(info.bio || "(no bio)");
        }
      }
      if (json) emit({ query: "artist-info", artists: infos });
      break;
    }
    case "favs": {
      const user = args[0];
      if (!user) return void console.log("usage: favs <cf-user|handle>");
      const { favs, unmatched, stale } = await resolveUserFavourites(rt, favouriteInputs(user));
      const sorted = [...favs].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
      if (json) {
        emit({ query: "favs", user, stale, matched: sorted.map(([name, priority]) => ({ name, priority })), unmatched });
        break;
      }
      console.log(`${user}${stale ? " (stale cache)" : ""}: ${sorted.length} matched, ${unmatched.length} unmatched`);
      for (const [name, prio] of sorted) console.log(`  [${prio}] ${name}`);
      if (unmatched.length) console.log(`  unmatched: ${unmatched.join(", ")}`);
      break;
    }
    case "map-check": {
      await runMapCheck();
      break;
    }
    case "kml-augment": {
      runKmlAugment(args);
      break;
    }
    case "kml": {
      runKmlExport(args);
      break;
    }
    case "pin": {
      runPinMap(args);
      break;
    }
    case "cold-tick": {
      await runColdTick();
      break;
    }
    case "rain-tick": {
      await runRainTick();
      break;
    }
    case "amenities": {
      // `--json` is stripped from args globally above, so runAmenities never saw
      // it and its JSON branch was unreachable — re-attach the parsed flag.
      runAmenities(json ? [...args, "--json"] : args);
      break;
    }
    case "walk-refine": {
      runWalkRefine(args);
      break;
    }
    default:
      console.log(USAGE);
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
