# A note from the author

⚠️ Danger: slop here.

This project was an experiment in trying out Claude Code's channels feature. All of the code and documentation in this repository was written by Claude Code. This note is the single exception. I've done my best to have agents sweep through this repo to rip out some personal data (such as which user enjoyed having the bot talk to them in Toronto slang — you know who you are) and to make it accessible and applicable for a wide variety of use cases. Maybe you don't want the bot stuff and you just want something that can write to or rip Clashfinder, maybe you want to manage a mirror of a festival that manages Appmiral - that's all fine. I'm bundling everything together here so that others can figure out if there's something of value here.

I have an employer that pays for my Claude Code subscription. I don't recommend using this outside of a subscription plan; over the lead-in to and duration of All Together Now this year, it ran up almost a thousand dollars at API pricing. That's why I went the Claude route rather than trying to make this work with something like OpenClaw or Hermes. 

But with that said, I think this is fun. When the rain started bucketing down at Primavera Sound and sets started getting cancelled left and right, while my phone signal really began to suffer, having active monitors that kept me updated on the status of various stages and helped me keep planning without having to wait for web pages or the festival app to load was a game-changer.

Some people have asked if I would ever think about turning this into a product, selling it to festivals, or whatever. I just don't think the cost/benefit analysis works out right now, but if you're someone who wants to combine this with some existing infrastructure, try out turning it into a proper agent, etc. - please get in touch. I'd love to share ideas, lessons learned etc. and work on it. I think a proper, secured version of this that isn't just a Claude Code scaffold could be a unique VIP perk for some festivals to offer.

This tool works best with an Opus model on low effort during festivals, and a higher level of effort while doing pre-festival analysis. I use Auto mode for permissions in order to allow it to write code for some basic tasks, and I run it in a tmux session as a daemon so that it automatically resumes.

I will revisit this project next year to hopefully add more app-native features from the Primavera Sound side.

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
  publish and maintain a Clashfinder mirror of the lineup that the crew stars acts on instead. The
  bot is the only thing that *writes* the timetable, and it refuses to overwrite a hand edit it
  didn't make.
- **Background watches** — lineup changes, festival news/announcement feeds, weather, and (where
  the vendor exposes one) info-page updates, all polled quietly and only surfaced when something
  actually changes.
- **PNG cards** — weather and other summaries rendered as images for the chat, not just text.

None of this needs a server process of its own: the watches run as long-lived polls inside a live
Claude Code session (see
[`docs/operating/watches-and-alerts.md`](docs/operating/watches-and-alerts.md)), and everything else
runs on demand when someone messages the bot.

## Keeping it up

Because the watches live *inside* the session, the session is the thing that has to stay running —
and if it dies, they die with it silently. The deployment shape that solves that is a **tmux**
session holding the Claude Code process and a **systemd user unit** holding the tmux session up:
tmux gives it a real terminal you can attach to (and that `send-keys` can type into), systemd gives
it start-on-boot and restart-on-crash. A restart brings back a *cold* session, which is survivable
only because every watch keeps its baseline on disk — so a change that lands while nothing was
watching still fires exactly once on the next tick.

[`docs/setup/running-as-a-service.md`](docs/setup/running-as-a-service.md) has the unit file, the
start script, and the reasoning for each piece — including why the script blocks on a
`tmux has-session` poll loop instead of just spawning and exiting, how to re-arm the watches after
a restart, how to run two bots on one host, and the trust decision you're making by leaving an
auto-permission agent up unattended.

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

Neither reference module is "the" festival this repo defaults to — that's `demofest`. They're there
to show the two shapes a real integration takes; see
[`docs/setup/appmiral-discovery.md`](docs/setup/appmiral-discovery.md) and
[`docs/setup/scraped-lineup.md`](docs/setup/scraped-lineup.md) for how each was actually built.

## Docs

- [`docs/setup/getting-started.md`](docs/setup/getting-started.md) — standing up your own bot
  end to end: wiring a chat channel, configuring your crew, giving it a festival to plan
  (vendor API vs. scrape), and what talking to it looks like.
- [`docs/setup/running-as-a-service.md`](docs/setup/running-as-a-service.md) — running the session
  unattended under tmux + systemd, so the background watches survive crashes and reboots.
- `docs/operating/` — how the bot behaves once it's live: channel etiquette, per-user tone,
  privacy and access boundaries, watches and alerts, data-accuracy caveats.

## What this is not

- Not a hosted service — there's no backend to sign up for; you run your own Claude Code session
  against your own clone.
- Not a web UI — the only interface is the chat channel.
- Not multi-tenant — one deployment plans for one crew, one active festival at a time. Which one is
  set by the `@festivals/<slug>/CONTEXT.md` import line in [`CLAUDE.md`](CLAUDE.md), so the docs the
  assistant reads and the festival the CLI plans against can't drift apart; `ACTIVE_FESTIVAL=<slug>`
  overrides it for a one-off run.
- Not an npm package — it's a repo you clone, configure, and run, not a library you `npm install`
  into something else.

## Licence

MIT — see `LICENSE`.
