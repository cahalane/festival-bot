# <Festival Name> <YEAR> — active-festival context

> The active-festival **headline**, imported into `CLAUDE.md` when this festival is active
> (`@festivals/<slug>/CONTEXT.md`). Keep it SMALL — the few facts every reply needs. Bulky detail
> lives in `knowledge/` and is **Read on demand** via the index below, NOT `@`-imported (imports are
> eager: anything imported loads into every session while this festival is active).
>
> ⚠️ **<YEAR> edition** — dated facts here are this year's; the annual rebuild replaces them.

## Status
<one line: is it upcoming / live / over; is the lineup snapshot full or partial / placeholder?>

## Festival facts (<YEAR>)
- **Dates** + **timezone** (IANA) + the day-grouping cutoff (`dayCutoffHour`).
- Ticketing / scheduling quirks every reply needs (e.g. a separately-ticketed day, an opening day).
- A **timezone sanity anchor**: a known set → its exact local time, to catch TZ-math errors.

## Favourites
<how favourites are sourced for this festival — Clashfinder? manual `favs`? — and a pointer to
`knowledge/data-source.md` for the mechanics.>

## Knowledge index (Read on demand)
**Evergreen (persist year to year):**
- `knowledge/geography.md` — site layout + walk times.
- `knowledge/amenities.md` — water / food / bars / toilets.
- `knowledge/data-source.md` — lineup API + favourites source + feed quirks.
- `knowledge/runbook.md` — refresh / rebuild procedure.
- `assets/` — maps.

**<YEAR> edition (discard/replace in the rebuild):**
- `knowledge/<YEAR>/stages.md` — late-added / small stages + acts.
- `knowledge/<YEAR>/…` — anything else derived from this year's timetable.
