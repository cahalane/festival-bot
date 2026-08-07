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
  module: no API, a scraped-and-snapshotted lineup, and favourites read from **an existing
  Clashfinder event this deployment doesn't own** (for PS26, one an independent user runs — the
  opposite topology from ATN's mirror; see `clashfinder.md` for the distinction). Follow
  `scraped-lineup.md`.

Start from `festivals/_template`, a skeleton with the files in place and the decisions marked
`CHANGEME`. Copy it to `festivals/<your-slug>/` and rename `package.json.template` to
`package.json` — it ships with that suffix deliberately, so the skeleton is not itself picked up
as a workspace package or built.

The steps below (scaffold → identify source → manifest → implement the lineup source → fetch →
timezone anchor → walk graph → favourites → verify) are also automated as the `.claude/skills/
new-festival/` skill — it runs the same procedure interactively, asking you one decision at a time
and verifying each step before moving on. Either walk through this doc by hand or invoke that
skill; they describe the same process.

Each module is a small workspace package:

| File | What it holds |
|---|---|
| `package.json` | workspace entry, named `@festival/<slug>` |
| `festival.json` | name, timezone, `dayCutoffHour`, dates, coordinates (coordinates are what enable the weather source) |
| `venues.json` | stage list + walk graph — see `walk-graph.md` |
| `schedule.json` | the lineup snapshot |
| `src/` | the lineup source and any vendor-specific glue |
| `CONTEXT.md` | the festival-specific facts your assistant reads |
| `knowledge/` | longer notes read on demand, not loaded every session |

Then register the builder in `packages/cli/src/festivals.ts` alongside `demofest`/`atn26`/`ps26`,
and add the dependency to `packages/cli/package.json`.

The template gets you the shape; for the substance, read whichever of `atn26` (vendor API) or
`ps26` (scrape) matches your path and copy how it wires its sources.

## 4. Point the CLI at your festival

The active festival is decided by a single line in a root `CLAUDE.md` you create:
`@festivals/<slug>/CONTEXT.md`. There's no root `CLAUDE.md` in a fresh checkout, so the CLI falls
back to `demofest` until you add one. For a one-off run without touching `CLAUDE.md`, use the env
override:

```
ACTIVE_FESTIVAL=<slug> ./festplan now
```

## 5. Configure people-data

- `CREW.md` — **copy `CREW.example.md` to `CREW.md` and fill it in.** This is the file your
  assistant reads to know who it is talking to: names, handles, channel ids, each person's tone,
  and your crew's own vocabulary for places. It is gitignored, and it is the *only* file that
  should ever contain real people — which is what makes the rest of this repo safe to publish or
  share. `CLAUDE.md` imports it; until you create it, that import simply resolves to nothing.
- `data/users.json` — one entry per crew member: a handle, a `channel` reference
  (`{ "kind": "telegram", "id": "…" }` — the `kind` records which channel plugin the id belongs
  to), and either a Clashfinder username or a manual `favs` list. Copy `data/users.example.json`
  and edit directly. (`demofest` deliberately ships with none of this wired up — trying
  `./festplan favs`/`vibecheck` against it returns an empty result for anyone, by design, not as a
  bug — see `festivals/demofest/CONTEXT.md`.)
- `data/prefs.json` — per-user tone/notes, same handles. Copy `data/prefs.example.json`.
- `data/reminders.json` — the reminder queue; starts empty, see `data/reminders.json.example` for
  the shape `./festplan reminders add` writes.

All four are gitignored. The `*.example.*` files are the committed templates.

## 6. Secrets

`config/secrets.json` (gitignored — never commit it) holds credentials the adapters need:

```json
{
  "clashfinder": { "authUsername": "...", "authPublicKey": "...", "password": "..." },
  "appmiral": { "xProtect": "..." },
  "setlist.fm": { "apiKey": "..." }
}
```

Only fill in what your festival's path needs: `appmiral` for the vendor-API path
(`appmiral-discovery.md`), `clashfinder` for favourites/mirror pushes (`clashfinder.md`),
`setlist.fm` optionally for the `setlist` command. Pushing to a Clashfinder mirror needs
`clashfinder.password` — the CLI derives the login cookie from it locally (Clashfinder hashes
passwords client-side, so the password never leaves your machine). If you'd rather not store it,
put the derived cookie in `clashfinder.write.userLogin` instead and omit the password.

Missing keys degrade the relevant command gracefully rather than crashing the CLI.

## 7. Arm the background watches

Several commands are designed to run unattended and print nothing unless something changed:
`schedule-tick` (lineup diff), `announce-tick` (official announcements), `pages-tick` (CMS info
pages), `cold-tick` / `rain-tick` (weather alerts), `map-check` (fires once, when the festival's
site map publishes real points of interest rather than just a backdrop image).
Use the `.claude/skills/bootstrap/` skill (`/bootstrap`, or ask the agent to "arm the watches") to
wire these into your session's scheduler/cron/Monitor loop — it inspects the **active** festival
module's `sources` object (`packages/core/src/festival.ts`) and arms only the watches that module
actually declares a source for (a festival with no announcements feed gets no announcements watch,
one with no site-map source gets no map watch), reporting what it armed vs. skipped and why
(not-implemented for this festival vs. implemented-but-missing-secret). One Monitor per applicable
watch, all but the weather one silent-unless-changed; a few times an hour is typical cadence for
schedule/announcement watches.

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
