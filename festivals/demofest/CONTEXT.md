# Demo Fest 2026

**Demo Fest 2026 is a fictional festival that does not exist; its acts and data are invented for testing purposes.**

**demofest** is a synthetic, offline festival built into every fresh clone as the default when no real festival is configured. It has no network dependency, no secrets, and no cache — only a committed `schedule.json` and walk graph. Three stages, sixteen invented sets across two nights (Friday 14 August → Saturday 15 August 2026), deliberately including a clash and a tight walk so the planner is exercised.

Use demofest to test the CLI and planner in isolation. To plan a real festival, replace it by editing the `activeFestivalSlug` in `packages/cli/src/config.ts` and adding the festival's module under `festivals/<slug>/`. See `docs/setup/getting-started.md` for details.

## Venues

- **The Meadow** (meadow)
- **The Barn** (barn)
- **The Grove** (grove) — limited capacity

## Dates & times

- Friday 14 August 2026: 17:00–23:30 (9 sets)
- Saturday 15 August 2026: 16:00–00:15 (7 sets)

Day boundary at 06:00 (Europe/Dublin timezone).
