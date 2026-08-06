# Demo Fest 2026

**Demo Fest 2026 is a fictional festival that does not exist; its acts and data are invented for testing purposes.**

**demofest** is a synthetic, offline festival built into every fresh clone as the default when no real festival is configured. It has no network dependency, no secrets, and no cache — only a committed `schedule.json` and walk graph. Three stages, sixteen invented sets across two nights (Friday 14 August → Saturday 15 August 2026), deliberately including a clash and a tight walk so the planner is exercised.

Use demofest to test the CLI and planner in isolation. To plan a real festival, replace it by adding the festival's module under `festivals/<slug>/` and pointing your root `CLAUDE.md` at it with an `@festivals/<slug>/CONTEXT.md` import line — the CLI (see `packages/cli/src/config.ts`) parses that import out of `CLAUDE.md` to decide what it plans against. There's no `CLAUDE.md` in a fresh checkout, so the CLI falls back to `demofest` until you add one. `ACTIVE_FESTIVAL=<slug>` overrides for a one-off/test run. See `docs/setup/getting-started.md` for details.

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
