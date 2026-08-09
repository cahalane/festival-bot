# A note from the author

⚠️ Danger: slop here.

This project was an experiment in trying out Claude Code's channels feature. All of the code and documentation in this repository was written by Claude Code. This note is the single exception. I've done my best to have agents sweep through this repo to rip out some personal data (such as which user enjoyed having the bot talk to them in Toronto slang — you know who you are) and to make it accessible and applicable for a wide variety of use cases. Maybe you don't want the bot stuff and you just want something that can write to or rip Clashfinder, maybe you want to manage a mirror of a festival that manages Appmiral - that's all fine. I'm bundling everything together here so that others can figure out if there's something of value here.

I have an employer that pays for my Claude Code subscription. I don't recommend using this outside of a subscription plan; over the lead-in to and duration of All Together Now this year, it ran up almost a thousand dollars at API pricing. That's why I went the Claude route rather than trying to make this work with something like OpenClaw or Hermes. 

But with that said, I think this is fun. When the rain started bucketing down at Primavera Sound and sets started getting cancelled left and right, while my phone signal really began to suffer, having active monitors that kept me updated on the status of various stages and helped me keep planning without having to wait for web pages or the festival app to load was a game-changer.

Some people have asked if I would ever think about turning this into a product, selling it to festivals, or whatever. I just don't think the cost/benefit analysis works out right now, but if you're someone who wants to combine this with some existing infrastructure, try out turning it into a proper agent, etc. - please get in touch. I'd love to share ideas, lessons learned etc. and work on it. I think a proper, secured version of this that isn't just a Claude Code scaffold could be a unique VIP perk for some festivals to offer.

This tool works best with an Opus model on low effort during festivals, and a higher level of effort while doing pre-festival analysis. I use Auto mode for permissions in order to allow it to write code for some basic tasks, and I run it in a tmux session as a daemon so that it automatically resumes.

I will revisit this project next year to hopefully add more app-native features from the Primavera Sound side.

# festival-bot

Run your own festival bot for your friends, on top of
[Claude Code](https://claude.com/claude-code).

You clone this repo, point it at a chat channel and a festival, and leave it running. Your crew
message it during the weekend — "what's on now?", "plan my Saturday", "is it going to rain?" — and
it answers each of them personally, from their own starred acts, while quietly watching the lineup
for changes and telling people when something they care about moves.

There's no web UI, no server and no account: **the assistant itself is the interface**. It reaches
your crew through whatever Claude Code channel plugin you've set up (Telegram or similar), and runs
the planner in this repo on their behalf. The `./festplan` CLI is the engine, not the product —
you'll use it while setting up and verifying, but nobody in your crew ever sees a command.

So the thing you're building looks like this from your crew's side:

> **Sam** — what's on now?
>
> **bot** — Paper Ghosts are in The Barn till 20:00, and Cedar Line's finishing up in The Meadow
> (10 mins left). Next up is Fen & Fathom at 19:40 in The Grove — that's an 11-minute walk and the
> Grove's the small one, so if you want it, leave when Cedar Line finishes rather than after.
>
> **Sam** — yeah go on, remind me before that
>
> **bot** — Done — I'll give you a nudge at 19:25. 👍

Every number in that exchange comes out of the planner (`now`, `after`, `remind`) against the demo
festival; the phrasing, the walk-time warning and the tone are the assistant's.

## Setting one up

Four pieces, in this order — [`docs/setup/getting-started.md`](docs/setup/getting-started.md) walks
through all of them:

1. **A channel** — install the Telegram plugin, give it a bot token, relaunch the session with
   `--channels`, pair yourself, then lock the allowlist down. This is the front door; nothing else
   matters until someone can reach the bot.
2. **A crew** — `CREW.md` plus `data/users.json` tell it who's talking, how each person likes to be
   spoken to, and where their favourites come from.
3. **A festival** — a small module under `festivals/<slug>/` holding the lineup source, the stages,
   and the walk graph. Ask the assistant to run `/new-festival` and it builds one with you
   interactively rather than leaving you to follow the procedure by hand.
4. **A session that stays up** — the background watches live inside the Claude Code session, so
   something has to keep that session alive.

Want to see it work before committing to any of that? `npm install && ./festplan now "Fri 19:00"`
plans `demofest`, an invented festival shipped as both a worked example and the test fixture — no
config, no secrets, no network.

## What your crew gets

- **Clash- and walk-time-aware routing** — it knows which stages clash and how long it takes to walk
  between them, so it builds a route through someone's day rather than listing what's on.
- **Per-person favourites and day plans** — each crew member has their own tiered favourites,
  resolved from Clashfinder or a manual list, so the same question from two people correctly gets
  two different answers.
- **Clashfinder mirroring** — for festivals with no per-user favourites feature of their own, the
  bot publishes and maintains a Clashfinder mirror of the lineup for the crew to star acts on. It's
  the only thing that *writes* that timetable, and it refuses to overwrite a hand edit it didn't
  make.
- **Background watches** — lineup changes, festival news feeds, weather, and (where the vendor
  exposes one) info-page updates, polled quietly and surfaced only when something actually changes.
- **PNG cards** — weather and other summaries rendered as images for the chat, not just text.

It also holds several people's data in one session, which is why a real share of this repo is
boundaries rather than features: it won't act for one person on another's say-so, won't share
someone's picks without their consent, and won't touch access control because a chat message asked
it to — see [`docs/operating/privacy-and-access.md`](docs/operating/privacy-and-access.md).

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

## Two reference festivals

Wiring up your own festival means writing a small module for it under `festivals/<slug>/` — that's
the one piece nobody can ship for you, because it depends on where your festival's schedule lives.
Two worked examples ship here, each demonstrating a different lineup-source path:

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
