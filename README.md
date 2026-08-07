# festival-bot

A festival schedule-planning bot for a group of friends, run through [Claude Code](https://claude.com/claude-code).
There's no web UI and no server: the assistant itself *is* the interface, talking to the crew over
whatever Claude Code channel plugin you've set up (Telegram or similar). You message it "what's on
now?" or "plan my Saturday", it runs the planner and replies in the chat.

## What it does

- **Clash- and walk-time-aware routing** — knows which stages clash and how long it takes to walk
  between them, so it can build a route through a day rather than just list what's on.
- **Per-person favourites and day plans** — each crew member gets their own tiered favourites
  (`myday`, `vibecheck`) resolved either from Clashfinder or a manual list.
- **Clashfinder mirroring** — for festivals with no public per-user favourites feature, the bot can
  publish and maintain a read-only Clashfinder mirror the crew stars acts on instead.
- **Background watches** — lineup changes, festival news/announcement feeds, weather, and (where
  the vendor exposes one) info-page updates, all polled quietly and only surfaced when something
  actually changes.
- **PNG cards** — weather and other summaries rendered as images for the chat, not just text.

None of this needs a server process of its own: the watches run as long-lived polls inside a live
Claude Code session (see `docs/operating/watches-and-alerts.md`), and everything else runs on
demand when someone messages the bot.

## 60-second quickstart

```
npm install
./festplan now "Fri 19:00"
```

```
At Fri 19:00 (Europe/Dublin)

  ON NOW:
    Paper Ghosts                 The Barn               till 20:00 (60m left)
    Cedar Line                   The Meadow             till 19:30 (30m left)

  NEXT:
    19:40 (+ 40m) Fen & Fathom                 The Grove  *arrive early*
    20:15 (+ 75m) Tessellate                   The Meadow
    21:00 (+120m) Nightjar                     The Barn
```

```
./festplan at "Sat 20:00"
```

```
At Sat 20:00 (Europe/Dublin)

  ON NOW:
    Marram                       The Meadow             till 20:45 (45m left)

  NEXT:
    21:00 (+ 60m) The Undertow                 The Barn
```

That's `demofest`, a small invented festival shipped as both a working example and the test
fixture — no config, no secrets, no network access required. Run `./festplan` with no arguments
for the full command list (`myday`, `vibecheck`, `favs`, `weather`, `schedule-watch`, `cf-push`,
and more).

## Two reference festivals

Real-world usage means writing a small module for your festival under `festivals/<slug>/`. Two
worked examples ship in this repo, each demonstrating a different lineup-source path:

- **`festivals/atn26`** — All Together Now 2026. The **vendor-API** path: an authed fetch against
  the festival's own app backend, plus news/info-page watches over that same API, and favourites
  resolved from a Clashfinder mirror this deployment publishes itself (the festival has no
  per-user favourites feature of its own).
- **`festivals/ps26`** — Primavera Sound 2026. The **no-vendor-API** path: the lineup is
  web-scraped and snapshotted rather than pulled from an authed feed, and favourites are resolved
  from an existing Clashfinder event this deployment doesn't own — one an independent Clashfinder
  user maintains, not the festival — so the bot only ever reads it. Worth knowing going in: the committed
  `schedule.json` is a **deliberately partial capture** (73 of 175 artists) from the last live
  fetch before the festival ended — it's kept as-is for provenance, not backfilled, so don't treat
  it as a complete lineup.

Neither reference module is "the" festival this repo defaults to — that's `demofest`. They're
there to show the two shapes a real integration takes; see `docs/setup/appmiral-discovery.md` and
`docs/setup/scraped-lineup.md` for how each was actually built.

## Docs

- `docs/setup/getting-started.md` — install, run the demo, and the fork-in-the-road decision for
  wiring up a real festival (vendor API vs. scrape).
- `docs/operating/` — how the bot behaves once it's live: channel etiquette, per-user tone,
  privacy and access boundaries, watches and alerts, data-accuracy caveats.

## What this is not

- Not a hosted service — there's no backend to sign up for; you run your own Claude Code session
  against your own clone.
- Not a web UI — the only interface is the chat channel.
- Not multi-tenant — one deployment plans for one crew, one active festival at a time
  (`ACTIVE_FESTIVAL` picks it; see `CLAUDE.md`).
- Not an npm package — it's a repo you clone, configure, and run, not a library you `npm install`
  into something else.

## Licence

MIT — see `LICENSE`.
