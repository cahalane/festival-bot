# PS26 — festival context (Primavera Sound 2026, Barcelona)

> **A reference module, not the active festival.** This repo defaults to `demofest`
> (see `FALLBACK_FESTIVAL` in `packages/cli/src/config.ts`). PS26 ships as the worked
> example of the **no-vendor-API** path: the lineup is web-scraped and snapshotted
> (not pulled from an authed feed), favourites are resolved from a Clashfinder event
> the festival itself runs, and announcements arrive over the AT Protocol. For
> the other path — an authed vendor API + a self-published mirror — see `festivals/atn26`.
>
> Activate it deliberately: point `CLAUDE.md`'s active-festival import at
> `@festivals/ps26/CONTEXT.md`, or use `ACTIVE_FESTIVAL=ps26 ./festplan …` for a
> one-off run. Bulky detail is in `knowledge/` and is **Read on demand** via the index
> below, not loaded eagerly.
>
> ⚠️ **2026 edition.** The dated facts here are this year's. The annual rebuild replaces them
> (delete `knowledge/2026/`, refetch, re-verify evergreen files, update this headline + the pointer).

## Status (as of the last session)
PS26 ran **Wed 3 → Sun 7 June 2026** and is **over**. The committed lineup snapshot
(`schedule.json`) is a **partial 73-of-175-artist capture** from the last live fetch — frozen now,
so some picks/anchors won't resolve against it. Refresh guard: `./festplan fetch-lineup` won't
overwrite the snapshot with a smaller post-festival pull (see `knowledge/data-source.md`).

## Festival facts (2026)
- **Dates:** Wed 3 → Sun 7 June 2026 (sets span Wed 17:45 → Sun 20:00 local). **Timezone:
  Europe/Madrid** = CEST (UTC+2); the feed's `timezone` is `null`, so apply Europe/Madrid yourself.
- **Wed 3 = Jornada Inaugural** (opening day): a small Fòrum lineup before the main days, alongside
  the Ciutat city programme. All 4 acts on the **Parc Del Forum** stage: Ouineta 17:45, Yard Act
  18:55, Guitarricadelafuente 20:15, **Wet Leg 21:55**. (That one day the `parc-del-forum` slug
  hosts real acts, not the 720-min filler.)
- **Sun 7 at the Fòrum = Primavera Bits**, a SEPARATELY-TICKETED electronic lineup. Most of the
  crew don't have it / don't care → default to **Thu–Sat** unless a user says otherwise; flag Bits
  as a separate ticket if they ask about Sunday.
- **Day-grouping (all nights):** the **08:00 `DAY_CUTOFF`** applies every night — a set timestamped
  e.g. Fri 02:00 belongs to **Thursday night**. `./festplan myday` groups this way. Consequence:
  Saturday's post-midnight headliners (Gorillaz 01:15, Knocked Loose 01:35, Ninajirachi 03:40,
  Ecco2k 04:35, JVB 00:25 — all Sun-dated) belong to **Saturday night, NOT Primavera Bits** (Bits
  is Sunday daytime/evening proper). So a `myday … Sun` can show "no favourites" — their Sat night
  is filed under Sat.
- **Scale:** 175 artists (1 set each), 11 venues. Site layout + walk times in `knowledge/geography.md`.
- **TZ sanity anchor:** **Cameron Winter** = Thu 2026-06-04 **17:00 CEST**, Auditori Rockdelux, 60
  min. If a conversion doesn't reproduce this, the TZ math is wrong. (Cameron Winter is absent from
  the partial snapshot — it's a *math* check against full data.)

## Favourites
PS26 favourites come via **Clashfinder** (`clashfinder.com/m/ps26`); user profiles in
`data/users.json`, resolved by the engine. Mechanics (public highlights, auth, name-alignment) are
in `knowledge/data-source.md`.

## Knowledge index (Read on demand)
**Evergreen (persist year to year):**
- `knowledge/geography.md` — site clusters, walk times, alternating pairs, limited-capacity venues; provenance for the derived walk graph in `venues.json`.
- `knowledge/amenities.md` — water / toilets / bars / food by zone, Damm restaurant vendors, Fever House.
- `knowledge/data-source.md` — GraphQL lineup API + Clashfinder favourites + `artist-info` scrape + feed quirks (720 filler, null genres).
- `knowledge/runbook.md` — refresh / rebuild procedure.
- The festival's own map artwork is not redistributed with this module; `venues.json` ships the
  derived stage list and walk graph instead (see `knowledge/geography.md` for provenance).

**2026 edition (discard/replace in the rebuild):**
- `knowledge/2026/stages.md` — late-added small/brand stages + web-researched acts; data-quality flags (talk-slots that aren't bands: Bombificadas, Amiga Date Cuenta).
- `knowledge/2026/city-program.md` — Primavera a la Ciutat timetable (off-site, separate ticket; tracked, NOT auto-planned). Why a pick can be "NOT IN LINEUP".
