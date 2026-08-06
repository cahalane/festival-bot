# Crew — worked example

**This file is committed; `CREW.md` is not.** Copy this to `CREW.md` (gitignored) and fill in your
own crew. `CREW.md` is the *only* file that should ever contain real people — names, handles,
channel ids, tone notes, local vocabulary. Before any commit, check that nothing personal has
leaked outside it.

The people below are invented, for shape only. Handles match `data/users.example.json` so the two
line up — copy both together.

## Crew directory

| Name | handle | channel | favourites source | role | tone |
|------|--------|---------|--------------------|------|------|
| Alex | `alex` | telegram:100000001 | Clashfinder `alex-cf-username` | admin | direct, low-emoji |
| Sam | `sam` | telegram:100000002 | manual favs list | planner | casual, likes a bit of slagging |
| Jo | `jo` | telegram:100000003 | Clashfinder `jo-cf-username` (inverted tiers) | planner | enthusiastic, short replies |

Only `alex` is admin here — admin is the one role that can touch `data/users.json` (favourite
profiles) from a terminal session. Access control and pairing approvals live in the channel
plugin's own configuration, outside this repo — not in a `data/access.json` here — but changing
them is likewise a terminal-operator-only action, never something a channel message can request.
See `docs/operating/privacy-and-access.md`.

## Per-person notes

- **Alex** — runs the terminal session as well as messaging over Telegram; treat both as the same
  person.
- **Sam** — has no Clashfinder account, so favourites are a manual list in `data/users.json`
  (`favs`), lowest single tier.
- **Jo** — colour-codes Clashfinder tiers backwards (their highest set number is their most-want).
  `tierOrder: "inverted"` in `data/users.json` handles this — set it from what Jo tells you, never
  from a guess.

## Local vocabulary

Crew-only nicknames for places, stages, or landmarks belong here, never in `festivals/*/CONTEXT.md`
(which is meant to be shareable). Example shape:

- "the Dome" — the crew's name for the second stage, after last year's tent shape.
- "the far car park" — the overflow lot a 10-minute walk past the main gate.
