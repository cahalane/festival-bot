# ATN26 — festival context (All Together Now 2026)

> **A reference module, not the active festival.** This repo defaults to `demofest`
> (see `FALLBACK_FESTIVAL` in `packages/cli/src/config.ts`). ATN26 ships as the worked
> example of the **vendor-API** path: an authed lineup fetch, news and info-page
> watches, site-map POIs, and favourites resolved from a Clashfinder mirror this
> deployment publishes. For the other path — no API, scrape it — see `festivals/ps26`.
>
> Activate it deliberately: point `CLAUDE.md`'s active-festival import at
> `@festivals/atn26/CONTEXT.md`, or use `ACTIVE_FESTIVAL=atn26 ./festplan …` for a
> one-off run. Bulky detail lives in `knowledge/`, Read on demand.
>
> ✅ **2026 edition timetable is real.** The Appmiral `alltogethernow2026` edition
> published its full timetable and the snapshot was taken on **2026-07-10**; the dated
> facts below are that real schedule data, not invented fixtures.

## Status — read before planning ATN
- **Festival:** All Together Now, **Curraghmore Estate, Portlaw, Co. Waterford**, Ireland.
  Vendor = **Appmiral** (event `alltogethernow`). Timezone **Europe/Dublin**; `dayCutoffHour = 6`.
- **2026 dates:** **Thu 30 July → Sun 2 Aug 2026** (bank-holiday weekend). Sets span **30 Jul 18:00
  → 03 Aug 02:00 IST**. Night split (06:00 cutoff): **Thu 19 sets / Fri 100 / Sat 122 / Sun 119**.
- ✅ **`schedule.json` is the published alltogethernow2026 timetable** (763 artist records / **364
  performances** / **16 stages**), pulled live 2026-07-10 via the Appmiral Content API. `festival.json`
  `days` are the 2026 dates, verified against the snapshot. `now/at/after/myday/vibecheck` all work.
- ✅ **Walk graph anchored to the map.** `venues.json` carries a full all-pairs graph — **120 edges
  across all 16 stages**, positions eyeballed off the 2025 arena map and cross-checked by a second
  independent read (provenance in `knowledge/walk-graph.md`). `myday` routes travel over these, so
  **which sets it picks are sound.** Caveat: edge minutes are euclidean-from-map estimates, not on-site
  path timings (they ignore lake/tree obstacles) — good for routing, refine from the 2026 map / on-site
  if a timing looks off. `defaultMinutes` (12) is now only a fallback for any pair the graph misses.
  `limitedCapacity` still unknown (empty).
- **Auth note:** the Appmiral `x-protect` token **rotated with app v6.0.0** — the 2026 token is in
  `config/secrets.json` (`appmiral.xProtect`); the old one now only authorises 2025. Re-extract from
  the app if a future edition 401s (see `docs/research/appmiral-lineup-api.md`).
- **TZ sanity anchor:** **Pulp** headlines **ATN Main Stage, Fri 31 Jul 22:45 IST**. If a conversion
  doesn't reproduce this, the TZ math is wrong.

## Favourites
Appmiral has no public per-user highlights equivalent, so ATN favourites come from **our own
read-only Clashfinder mirror at `clashfinder.com/s/atn2026`** (pushed via `./festplan cf-push
atn2026`). `festivals/atn26/src/favourites.ts` wires the shared Clashfinder client to that `atn2026`
event, so crew members star acts on the mirror and their tiers resolve back to lineup names — exactly
like PS26's official CF event, just on a mirror we publish. **Every ATN profile in `data/users.json`
uses `clashfinder`**; none uses manual `favs`.
Manual `favs` remain supported as a fallback for a user with no Clashfinder, but nobody uses them for
ATN. (⚠️ One crew member colour-codes their Clashfinder sets **inverted** — set 3 = highest want;
see `tierOrder` in `data/users.example.json`, which the resolver flips.)

## Knowledge index (Read on demand)
- `knowledge/amenities.md` — site geography & amenities from the 2025 maps: zone vocabulary + water/
  toilets/medical/showers/food/bars by zone (for "nearest X to stage Y"), entrances, car parks,
  campsites. ⚠️ sponsor bar names are 2025 (provisional); positions stable until a 2026 map lands.
- `knowledge/runbook.md` — the 2026 rebuild / refresh checklist (evergreen procedure).
- `knowledge/walk-graph.md` — provenance for `venues.json`'s walk graph: how the 16 stage positions
  were anchored to the 2025 map, the cross-check, and per-stage correction history. Read before
  re-deriving edges or debugging a suspicious `myday` travel time.
- `knowledge/2026/lineup.md` — the announced-acts-by-stage capture from before the timetable dropped;
  now **superseded by the live `schedule.json`** for timings/stages. Kept for provenance + any act
  the API omits. Use `./festplan` queries as the source of truth for who plays when.
