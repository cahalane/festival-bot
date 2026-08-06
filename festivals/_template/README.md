# Festival module template

Copy this directory to `festivals/<slug>/` to add a new festival (e.g. `festivals/atn26/`
for All Together Now, `festivals/ov26/` for Other Voices). A festival is a first-class
workspace package: declarative facts **plus** its own code for the data sources it has.

## Steps

1. **Copy & rename:** `cp -r festivals/_template festivals/<slug>`.
2. **`package.json`:** rename `package.json.template` → `package.json`, set `"name": "@festival/<slug>"`.
   Then run `npm install` at the repo root to wire the workspace symlink.
3. **`festival.json`:** the manifest — slug, name, IANA `timezone`, `dayCutoffHour`,
   `catchFraction`, `nightGapHours`, the `days` map (day-name → `[year, month, day]`), and site
   `coordinates` (for weather).
4. **`venues.json`:** stages (`slug` → `name`), the `walk` graph (undirected adjacent edges in
   minutes + a `defaultMinutes` penalty for off-graph stages), and the `limitedCapacity` list.
   ⚠️ Walk-graph slugs MUST match the lineup feed's stage slugs exactly, or distances silently
   fall back to the default penalty.
5. **`CONTEXT.md` + `knowledge/`:** `CONTEXT.md` is the small **always-on headline** (imported into
   `CLAUDE.md` when this festival is active — keep it short). `knowledge/*.md` is the bulky detail
   the agent **Reads on demand**. Put **evergreen** facts at `knowledge/`'s top level (amenities,
   geography, data-source, runbook) and **year/timetable-specific** facts in `knowledge/<year>/`
   (stages, city-program, …) — the annual rebuild discards the year folder. `loadKnowledge()` reads
   `knowledge/` **recursively**, so year-folder docs load too (keyed by basename).
6. **`src/`:** implement in `index.ts` only the sources this festival actually has. Reuse shared
   adapters from `@festival-bot/adapters` (e.g. Open-Meteo `createWeatherSource`) and write
   festival-specific ones (lineup, favourites) against the `@festival-bot/core` interfaces
   (`LineupSource`, `FavouritesSource`, …). A leaner festival registers fewer sources.

## What goes where (reminder)

- **Facts** → this module (json + knowledge md). **Shared logic** → `packages/`.
- **People** (users/prefs/reminders) → `data/` (cross-festival). **Caches/secrets** → gitignored.

See `docs/superpowers/specs/2026-06-18-multi-festival-architecture-design.md` for the full design.
