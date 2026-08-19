# Demo Fest 2026

**Demo Fest 2026 is a fictional festival that does not exist; its acts and data are invented for testing purposes.**

**demofest** is a synthetic, offline festival built into every fresh clone as the default when no real festival is configured. It has no network dependency, no secrets, and no cache — only a committed `schedule.json` and walk graph. Three stages, sixteen invented sets across two nights (Friday 14 August → Saturday 15 August 2026), deliberately including a clash and a tight walk so the planner is exercised.

Use demofest to test the CLI and planner in isolation. To swap in a real festival — the one-line `CLAUDE.md` import that decides what both the CLI and this session plan against — see [`docs/setup/getting-started.md`](../../docs/setup/getting-started.md).

**No favourites source is wired up.** demofest deliberately declares no Clashfinder mirror and no
`data/users.json` favourites, on purpose — it needs no network access or secrets. That means
`./festplan favs <anyone>` returns `0 matched, 0 unmatched` and `./festplan vibecheck <anyone>`
reports nothing to see, for *any* name you pass, real or not. That is demofest having no
favourites data wired in, not the tool failing to match a real user's picks — don't read an empty
result from these two commands against demofest as a bug. `now`/`at`/`after`/`myday` (with no
favourites weighting) all work normally.

## Venues

- **The Meadow** (meadow)
- **The Barn** (barn)
- **The Grove** (grove) — limited capacity

## Dates & times

- Friday 14 August 2026: 17:00–23:30 (9 sets)
- Saturday 15 August 2026: 16:00–00:15 (7 sets)

Day boundary at 06:00 (Europe/Dublin timezone).
