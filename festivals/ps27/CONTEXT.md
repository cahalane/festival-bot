# PS27 — festival context (Primavera Sound 2027, Barcelona)

> 🚧 **DORMANT SKELETON — do not activate.** Prepared 2026-08-13, expected to go live around
> **May 2027**. As of preparation, Primavera had announced nothing for 2027: no dates, no lineup,
> and `getLineupEvent("primavera-sound-2027-barcelona")` returns **null**. This module exists so
> the plumbing is ready and reviewed *before* the scramble, not because there is anything to plan.
>
> It is registered in `packages/cli/src/festivals.ts` and reachable with
> `ACTIVE_FESTIVAL=ps27 ./festplan …` for setup work, but `CLAUDE.md` still points elsewhere.
> **Everything dated in here is a placeholder or carried over from 2026.** Work the checklist
> below before letting anyone plan against it.

## What is real vs. placeholder

| Thing | State |
|---|---|
| Vendor integration (lineup, bios, news, Spotify ids) | **Real.** Shared adapter, exercised by ps26 against the live API. |
| Favourites topology (`psb27` mirror) | **Real decision**, mirror to be published by the operator. |
| Coordinates, timezone, day cutoff | **Real.** Site-stable facts. |
| `festival.json` → `days` | **Empty on purpose.** Unannounced; a guess would be fabricated schedule data. |
| `venues.json` | **Provisional.** 2026 stage list + walk graph. Site geography is stable; sponsor stage *names* mostly will not be. |
| `knowledge/geography.md`, `amenities.md` | **Provisional**, carried from 2026 and banner-flagged. |
| `schedule.json` | **Absent.** `loadSets()` says so rather than returning an empty timetable. |

## The topology change from PS26 — read this first

PS26 **read** favourites from `clashfinder.com/m/ps26`, an event an independent Clashfinder user
maintains. We never pushed to it; it was not ours.

PS27 uses a mirror **this deployment owns and publishes**: `clashfinder.com/s/psb27`. That is the
`festivals/atn26` model, and it changes three things:

1. **`cf-push psb27` is now a thing we do.** It writes the lineup, MusicBrainz ids and bios to the
   mirror. Bios come in batches (see `docs/setup/clashfinder.md`).
2. **The foreign-edit guard is live.** `cf-push` replaces the *whole* event, so if a crew member
   hand-edits the mirror the guard holds the push and asks for a decision. That is intended
   behaviour, not a fault — it exists because a push once deleted someone's hand-entered acts.
3. **Stars do not migrate.** Nobody's ps26 highlights carry over. Everyone re-stars on `psb27`,
   and they should be told once rather than discovering it when `favs` comes back thin.

## Activation checklist (work top to bottom)

1. **Confirm the event exists.** `ACTIVE_FESTIVAL=ps27 ./festplan fetch-lineup` — if PS still
   hasn't created it, this fails and there is nothing further to do. Do not fabricate a lineup.
2. **Fill in `festival.json` → `days`** from the *announced* dates, and add the `_note` sanity
   anchor (pick a set with a known start; ps26 used Cameron Winter). Re-check `dayCutoffHour`.
3. **Re-derive `venues.json`** from the 2027 site map: stage slugs, `limitedCapacity`, and the
   walk graph. Update `knowledge/geography.md` to match and drop its provisional banner.
4. **Refresh `knowledge/amenities.md`**, drop its banner. Add a `knowledge/2027/` for
   edition-specific facts (late stages, city programme, data-quality flags).
5. **Add the Ciutat event** to `PS27_EVENTS` if PS runs one — until then the adapter deliberately
   refuses a `ciutat` refresh rather than fetching the Fòrum lineup into the wrong snapshot.
6. **Write `knowledge/data-source.md`** (ps26's is a good base) and `knowledge/runbook.md`.
7. **Publish and populate the mirror**: `ACTIVE_FESTIVAL=ps27 ./festplan cf-push psb27`. Check the
   star report afterwards.
8. **Point `CLAUDE.md`'s import at `@festivals/ps27/CONTEXT.md`** — that, and only that, is what
   makes it active. Rewrite this header to describe a live festival.
9. **Decide ps26's fate.** It is the worked example for the read-only topology in the public repo;
   if it stays, it stays as a reference, not as something to refresh.

## Knowledge index (Read on demand)

- `knowledge/geography.md` — site clusters and walk times. **2026 values, unverified.**
- `knowledge/amenities.md` — water / toilets / bars / food by zone. **2026 values, unverified.**

Not yet written: `data-source.md`, `runbook.md`, `knowledge/2027/`. See ps26's equivalents.
