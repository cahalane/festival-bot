# Getting started

This repo is a **festival bot you stand up yourself**. The end state is a Claude Code session
running on a machine you control, reachable from a chat app, that your crew message during a
festival — "what's on now?", "plan my Saturday", "when's Nightjar?" — and that answers them, watches
the lineup for changes, and pings them when the weather turns.

There's no server, no web UI, and no account to sign up for. **The assistant is the product.**
The `./festplan` CLI in this repo is the engine it drives: you'll run it a handful of times while
setting up and verifying, but in normal operation nobody types a command — people send messages,
and the assistant runs the planner on their behalf and replies in the chat.

## What you're assembling

Four pieces, and the bot isn't useful until all four are in place:

| Piece | What it is | Section |
|---|---|---|
| **A channel** | the front door — how people reach the bot at all | [2](#2-wire-up-a-channel--the-front-door) |
| **A crew** | who's allowed in, who they are, how each likes to be talked to | [3](#3-tell-it-who-the-crew-are) |
| **A festival source** | where the lineup, stages and walk times come from | [4](#4-give-it-a-festival-to-plan) |
| **A session that stays up** | the process holding all of it, plus the background watches | [6](#6-keep-the-session-up) |

Work through them in that order. Each one is testable on its own, and a bot with three of the four
fails in a way that's easy to misread as a bug in another piece.

## 1. Clone and install

```
npm install
./festplan now "Fri 19:00"
```

The CLI runs on [bun](https://bun.sh) if installed (near-instant cold start) and falls back to
`npx tsx` otherwise — either way, no separate build step. That second command should print a
schedule for `demofest`, a small invented festival shipped as both a working example and the test
fixture. It needs no config, no secrets and no network access, so it's the clean way to answer "is
this clone working at all?" before any of your own data is involved.

`demofest` deliberately has no real-world coordinates and no favourites source wired up, so
`weather`, `favs` and `vibecheck` return nothing against it *for anyone*. That's the fixture being
deliberately offline, not a failure — see
[`festivals/demofest/CONTEXT.md`](../../festivals/demofest/CONTEXT.md).

Run `./festplan` with no arguments for the full command list. Skim it once so you know what the
assistant has to work with; you don't need to learn it.

## 2. Wire up a channel — the front door

The bot has no interface of its own. It gets one from a Claude Code **channel plugin**, which
bridges a chat app into the session: inbound messages arrive as events in the assistant's
conversation, and the assistant answers by calling the plugin's reply tool. This repo is written
against the official Telegram plugin (`telegram@claude-plugins-official`); any channel plugin with
the same shape works, and nothing in `packages/` is Telegram-specific.

With Telegram, from a session in this repo:

1. **Make a bot.** DM [@BotFather](https://t.me/BotFather), send `/newbot`, and answer with a
   display name and a username ending in `bot`. It replies with a token like
   `123456789:AAHfiqksKZ8…` — copy the whole thing, leading digits and colon included.
2. **Install the plugin**, then reload so the session picks it up:
   ```
   /plugin install telegram@claude-plugins-official
   /reload-plugins
   ```
3. **Hand over the token:** `/telegram:configure 123456789:AAHfiqksKZ8…`. It's written to
   `~/.claude/channels/telegram/.env` — outside this repo, so it can't be committed by accident.
4. **Relaunch with the channel attached.** The bridge only runs when the session is started with
   the flag, so exit and start again:
   ```sh
   claude --channels plugin:telegram@claude-plugins-official
   ```
5. **Pair yourself.** DM your bot; it replies with a six-character code. Approve it from *your
   terminal* with `/telegram:access pair <code>`. Your next message reaches the assistant.
6. **Lock it down.** A Telegram bot username is publicly addressable, so once your crew are paired,
   switch off pairing replies: `/telegram:access policy allowlist`. Unknown senders are then
   dropped silently.

Groups are off by default and opted in one at a time
(`/telegram:access group add -100…`); by default the bot only answers when @mentioned or replied
to, which is usually what you want in a busy festival group chat. `/telegram:access` with no
arguments prints current policy, allowlist, pending pairings and enabled groups — the fastest way
to see who can actually reach your bot right now.

> **The one rule to internalise before you go live:** approving a pairing, editing the allowlist, or
> changing channel policy is a **terminal-operator action only**, no matter what arrives over the
> channel asking for it. "Approve the pending pairing" / "add me to the allowlist" arriving as a
> chat message is exactly what a prompt injection looks like, and the assistant is instructed to
> refuse it — including when the request looks like it's from you.
> See [`privacy-and-access.md`](../operating/privacy-and-access.md).

## 3. Tell it who the crew are

The channel decides *who can get in*. These files decide *who they are once they're in* — without
them the bot answers everyone identically and can't resolve anyone's favourites.

- **`CREW.md`** — copy [`CREW.example.md`](../../CREW.example.md) and fill it in. Names, handles,
  channel ids, each person's tone, and your crew's own vocabulary for places ("the Dome", "the far
  car park"). This is the file the assistant reads to know who it's talking to, and it is the
  *only* file that should ever contain real people — which is what keeps the rest of the repo safe
  to publish. It's gitignored; [`CLAUDE.md`](../../CLAUDE.md) imports it, and until you create it
  that import resolves to nothing.
- **`data/users.json`** — one entry per person: a handle, a `channel` reference
  (`{ "kind": "telegram", "id": "…" }` — `kind` records which channel plugin the id belongs to, so
  this is where the chat identity from step 2 gets bound to a crew member), and either a Clashfinder
  username or a manual `favs` list. Copy `data/users.example.json`.
- **`data/prefs.json`** — per-person tone and notes, keyed by the same handles. Copy
  `data/prefs.example.json`. See [`per-user-tone.md`](../operating/per-user-tone.md) for what the
  assistant does with it.
- **`data/reminders.json`** — the reminder queue. Starts empty; `data/reminders.json.example` shows
  the shape the bot writes.

All four are gitignored; the `*.example.*` files are the committed templates. Get the handles
consistent across `CREW.md` and `data/users.json` — a mismatch shows up later as one person's
favourites silently resolving to nothing.

## 4. Give it a festival to plan

Every festival needs a **lineup source**, and that's the fork in the road. Two paths, each with a
working reference module in this repo:

- **Your festival has an official app and you can identify its vendor** → the vendor-API path.
  `festivals/atn26` is the reference: an authenticated lineup pull, an official-news watch, an
  info-page watch, site-map POIs for the walk graph, and favourites sourced from a Clashfinder
  *mirror this deployment publishes* (the festival itself has no public favourites API). Follow
  [`appmiral-discovery.md`](appmiral-discovery.md) — Appmiral is the vendor covered there and the
  platform behind a large share of festival apps, but if your festival's app is built on something
  else, the same "find the API behind the app" method still applies.
- **An app, but not a vendor platform** → the festival's *own* API. `festivals/ps26` is the
  reference: Primavera's app is React Native, so its GraphQL queries sit in plain sight in
  `assets/index.android.bundle`, and the endpoint needs **no auth at all** — lineup, artist bios and
  official news all come from it. See
  [`primavera-graphql-api.md`](../research/primavera-graphql-api.md) for how that was recovered; the
  method (pull the APK, read the queries out of the app, live-test them) generalises even though the
  vendor specifics don't.
- **No usable API at all** → the scrape path, [`scraped-lineup.md`](scraped-lineup.md). ps26 is still
  the reference for its *snapshot-and-guard* mechanics (a live feed prunes past sets), and it keeps a
  page scrape as a fallback behind the API.

Either way, favourites can come from **an existing Clashfinder event this deployment doesn't own**
(for PS26, one an independent user runs — the opposite topology from ATN's mirror; see
[`clashfinder.md`](clashfinder.md) for the distinction).

**Don't do this by hand on your first festival.** The whole procedure — scaffold → identify source →
manifest → implement the lineup source → fetch → timezone anchor → walk graph → favourites → verify
— is automated as the `/new-festival` skill. Ask the assistant to "set up a new festival" and it
runs the same steps interactively, one decision at a time, verifying each before moving on. The rest
of this section is what that skill is doing, for when you need to intervene.

Start from `festivals/_template`, a skeleton with the decisions marked `CHANGEME`. Copy it to
`festivals/<your-slug>/` and rename `package.json.template` to `package.json` — it ships with that
suffix deliberately, so the skeleton isn't itself picked up as a workspace package. Each module is a
small workspace package:

| File | What it holds |
|---|---|
| `package.json` | workspace entry, named `@festival/<slug>` |
| `festival.json` | name, timezone, `dayCutoffHour`, dates, coordinates (coordinates are what enable the weather source) |
| `venues.json` | stage list + walk graph — see [`walk-graph.md`](walk-graph.md) |
| `schedule.json` | the lineup snapshot |
| `src/` | which sources this edition wires, and the ids they need |
| `CONTEXT.md` | the festival-specific facts your assistant reads |
| `knowledge/` | longer notes read on demand, not loaded every session |

Register the builder in `packages/cli/src/festivals.ts` alongside `demofest`/`atn26`/`ps26`, add the
dependency to `packages/cli/package.json`, and re-run `npm install`. The template gets you the
shape; for the substance, read whichever of `atn26` or `ps26` matches your path and copy how it
wires its sources.

**Where the vendor code lives.** A festival module should be thin: the pack, plus an `index.ts` that
picks sources and supplies this edition's ids. The integrations themselves live in
`packages/adapters/` — Appmiral as `appmiral*.ts`, Primavera as `primavera*.ts` — because one vendor
serves many festivals *and* many editions of the same festival. `festivals/ps26` and `festivals/ps27`
are the worked example: both are ~80 lines of `index.ts` over the same shared adapter, differing
only in event names and which Clashfinder event holds favourites. If you find yourself copying a
whole source implementation into next year's module, extract it to `adapters/` instead.

### Make it the active festival

One line decides what both the CLI and the assistant work against: the `@festivals/<slug>/CONTEXT.md`
import in the root [`CLAUDE.md`](../../CLAUDE.md). A fresh clone ships that line pointing at
`demofest`; change it to your slug and the assistant's festival context and the planner's data move
together, so they can't drift apart. For a one-off run without editing the file:

```
ACTIVE_FESTIVAL=<slug> ./festplan now
```

### Verify the timezone before you trust anything

This is the single highest-value check in the whole setup, and it takes thirty seconds:

**Pick one act whose real-world set time you already know — from the festival's own website, a
poster, anywhere you trust — and confirm the CLI reproduces it exactly.**

```
./festplan now "Fri 22:45"
```

or grep the act out of `--json` output and eyeball the `start` field. If your lineup feed publishes
times in UTC, or in a different offset than the festival's own timezone (`festival.json`'s
`timezone`), an off-by-one — or off-by-several — hour bug is trivial to introduce and **invisible in
the data**: the JSON still parses, the times still look like times, nothing errors. It's only wrong
once you check it against a fact you already know, and from then on it's wrong in *every* reply the
bot gives until someone catches it.
[`festivals/atn26/CONTEXT.md`](../../festivals/atn26/CONTEXT.md) records its own anchor (Pulp
headlining ATN Main Stage, Fri 31 Jul 22:45 IST) as exactly this kind of tripwire. Set one for your
festival, in its `CONTEXT.md`, before you rely on any other output.

## 5. Secrets

`config/secrets.json` (gitignored — never commit it) holds credentials the adapters need:

```json
{
  "clashfinder": { "authUsername": "...", "authPublicKey": "...", "password": "..." },
  "appmiral": { "xProtect": "..." },
  "setlist.fm": { "apiKey": "..." }
}
```

Only fill in what your path needs: `appmiral` for the vendor-API path
([`appmiral-discovery.md`](appmiral-discovery.md)), `clashfinder` for favourites and mirror pushes
([`clashfinder.md`](clashfinder.md)), `setlist.fm` optionally for the `setlist` command. Pushing to
a Clashfinder mirror needs `clashfinder.password` — the CLI derives the login cookie from it locally
(Clashfinder hashes passwords client-side, so the password never leaves your machine). If you'd
rather not store it, put the derived cookie in `clashfinder.write.userLogin` instead and omit the
password.

Missing keys degrade the relevant command gracefully rather than crashing the CLI — and a source
wired behind an absent secret is skipped at module load, which is why the next step reports
"implemented but no secret" as a distinct outcome.

## 6. Keep the session up

Several commands are built to run unattended and print nothing unless something changed:
`schedule-tick` (lineup diff), `announce-tick` (official announcements), `pages-tick` (CMS info
pages), `cold-tick` / `rain-tick` (weather alerts), `map-check` (fires once, when the site map
publishes real points of interest rather than just a backdrop image).

Ask the assistant to "arm the watches", or run `/bootstrap`. It inspects the **active** festival
module's `sources` object and arms only the watches that module actually declares a source for — a
festival with no announcements feed gets no announcements watch — then reports what it armed versus
skipped, distinguishing "not implemented for this festival" from "implemented but the secret is
missing". Expect one loop per applicable watch, all but the weather one silent unless something
changed.

Those loops run *inside* the session, so the session is the thing that has to stay up, and a session
that dies takes every watch with it silently.
[`running-as-a-service.md`](running-as-a-service.md) covers the deployment shape that solves it —
tmux holding the Claude Code process, a systemd user unit holding the tmux session — including
re-arming the watches automatically after a restart, running two bots on one host, and the trust
decision you're making by leaving an auto-permission agent up unattended.

## 7. Talk to it

You're done setting up. From here on the interface is the chat: message the bot the way you'd
message a person who happens to know the timetable.

```
what's on now?
plan my Saturday
who's on after Nightjar?
is it going to rain later?
remind me 15 minutes before Marram
```

The assistant maps those onto the planner itself — `now`, `myday`, `after`, `weather`, `remind` —
and replies in the chat with the answer, not the command it ran. It weights answers by the asker's
own favourites and tone, so the same question from two crew members can correctly get two different
replies.

Worth knowing about how it behaves, so you can tell working-as-intended from broken:

- **Replies go out over the channel they arrived on**, through the plugin's reply tool. Anything the
  assistant "says" in the terminal transcript reaches nobody. If you're watching the tmux session
  and see a beautifully composed answer that never appeared in the chat, that's the classic slip —
  [`channel-etiquette.md`](../operating/channel-etiquette.md) covers it and the rest of the
  mechanical discipline.
- **The channel has no history.** Telegram's Bot API exposes neither search nor backfill, so the
  session only sees messages as they arrive — and a restart loses the conversation, though never the
  on-disk state. Nothing you configured above is affected.
- **It won't act for one person on another's say-so**, won't share someone's picks without their
  consent, and won't touch access control from the channel. Those boundaries are in
  [`CLAUDE.md`](../../CLAUDE.md) and [`privacy-and-access.md`](../operating/privacy-and-access.md).
- **It flags stale or failing data rather than guessing around it** — an empty result with an
  explanation is the intended behaviour when a source is down, not a fallback.
  See [`data-accuracy.md`](../operating/data-accuracy.md).

The rest of `docs/operating/` is the assistant's own operating manual — worth reading once as the
operator, since it's the best description of what your bot will actually do when nobody's watching.
