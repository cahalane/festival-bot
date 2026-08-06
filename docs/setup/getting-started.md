# Getting started

This project plans a festival's schedule — clashes, travel time between stages, personal
favourites — and can watch a live festival for lineup changes and push its own Clashfinder
mirror. It ships with a synthetic offline festival (`demofest`) so you can run it with zero
configuration, then walk you through wiring up a real one.

## 1. Install

```
npm install
```

The CLI is `./festplan`. It runs on [bun](https://bun.sh) if installed (near-instant cold start)
and falls back to `npx tsx` otherwise — either way, no separate build step. Confirm it works:

```
./festplan
```

This prints the full command list for whichever festival is currently active (see below).

## 2. Run the demo festival

With no configuration at all, the CLI defaults to `demofest`, a small invented festival
(`festivals/demofest`) used as both a working example and the test fixture. Try:

```
./festplan now
./festplan at "Sat 20:00"
```

`demofest` has no real-world coordinates, so its weather source is intentionally unwired (see
`weather.md`) — that's expected, not a bug, and keeps the test suite off the network.

## 3. The fork in the road: which festival are you setting up?

Every festival needs a **lineup source** — where the schedule data comes from — and that splits
into two paths, each with a working reference module in this repo:

- **Your festival has an official app, and you can identify its vendor** → the vendor-API path.
  `festivals/atn26` is the reference module: an authenticated lineup pull, an official-news watch
  and an info-page watch, site-map POIs for the walk graph, and favourites sourced from a
  Clashfinder *mirror this deployment publishes* (the festival itself has no public favourites
  API). Follow `appmiral-discovery.md` to find and authenticate the feed — Appmiral is the vendor
  covered there, and the platform behind a large share of festival apps, but if your festival's
  app is built on something else, the same "find the API behind the app" method still applies.
- **No app, or no identifiable vendor API** → the scrape path. `festivals/ps26` is the reference
  module: no API, a scraped-and-snapshotted lineup, and favourites from a Clashfinder event **the
  festival itself runs** (the opposite topology from ATN's mirror — see `clashfinder.md` for the
  distinction). Follow `scraped-lineup.md`.

There is no `festivals/_template` skeleton or `/new-festival` scaffolding command in this repo as
of this writing — build a new festival module by copying whichever of `atn26` or `ps26` matches
your path and adapting it. Each module is a small workspace package: `package.json`,
`festival.json` (name/timezone/day-cutoff/dates), `venues.json` (stage list + walk graph — see
`walk-graph.md`), `schedule.json` (the lineup snapshot), `src/` (the lineup source + any
adapter-specific glue), and `CONTEXT.md` (the festival-specific facts your assistant reads).
Register the new module's builder in `packages/cli/src/festivals.ts` alongside `demofest`/`atn26`/
`ps26`.

## 4. Point the CLI at your festival

The active festival is decided by a single line in a root `CLAUDE.md` you create:
`@festivals/<slug>/CONTEXT.md`. There's no root `CLAUDE.md` in a fresh checkout, so the CLI falls
back to `demofest` until you add one. For a one-off run without touching `CLAUDE.md`, use the env
override:

```
ACTIVE_FESTIVAL=<slug> ./festplan now
```

## 5. Configure people-data

- `data/users.json` — one entry per crew member: a handle, chat id (if using the Telegram
  channel), and either a Clashfinder username or a manual `favs` list. Copy
  `data/users.example.json` and edit directly.
- `data/prefs.json` — per-user tone/notes, same handles. Copy `data/prefs.example.json`.
- `data/reminders.json` — the reminder queue; starts empty, see `data/reminders.json.example` for
  the shape `./festplan reminders add` writes.

## 6. Secrets

`config/secrets.json` (gitignored — never commit it) holds credentials the adapters need:

```json
{
  "clashfinder": { "authUsername": "...", "authPublicKey": "...", "password": "...",
                    "write": { "userLogin": "...", "phpsessid": "..." } },
  "appmiral": { "xProtect": "..." },
  "setlist.fm": { "apiKey": "..." }
}
```

Only fill in what your festival's path needs: `appmiral` for the vendor-API path
(`appmiral-discovery.md`), `clashfinder` for favourites/mirror pushes (`clashfinder.md`),
`setlist.fm` optionally for the `setlist` command. Missing keys degrade the relevant command
gracefully rather than crashing the CLI.

## 7. Arm the background watches

Several commands are designed to run unattended and print nothing unless something changed:
`schedule-tick` (lineup diff), `announce-tick` (official announcements), `pages-tick` (CMS info
pages), `cold-tick` / `rain-tick` (weather alerts), `map-check` (ATN-specific map-publish watch).
There is no `/bootstrap` slash command in this repo as of this writing; wire these into your
session's scheduler/cron/Monitor loop directly, one command per watch, on whatever cadence suits
your festival (a few times an hour is typical for schedule/announcement watches).

## 8. Verify the timezone before you trust anything — do this first, always

This is the single highest-value check in the whole setup, and it takes thirty seconds:

**Pick one act whose real-world set time you already know — from the festival's own website, a
poster, anywhere you trust — and confirm the CLI reproduces it exactly.**

```
./festplan now "Fri 22:45"
```

or grep the act directly out of `--json` output and eyeball the `start` field. If your festival
runs `./festplan artist-info`/`schedule.json` pipeline against a feed in UTC or a different
offset than the festival's own timezone (see `festival.json`'s `timezone` field), an off-by-one
(or off-by-several) hour bug is trivial to introduce and **invisible in the data** — the JSON
still parses, the times still look like times, nothing errors. It's only wrong once you check it
against a fact you already know, and from then on it's wrong in *every* reply the bot gives about
that festival until someone catches it. `festivals/atn26/CONTEXT.md` documents its own anchor
(Pulp headlining ATN Main Stage, Fri 31 Jul 22:45 IST) as exactly this kind of tripwire — set one
for your festival before you rely on any other output.
