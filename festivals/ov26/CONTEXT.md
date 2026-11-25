# Other Voices Dingle 2026 — active-festival context

> ⚠️ **2026 edition** (25th anniversary). Dated facts here are this year's.

## Status
Upcoming, Fri 27 – Sun 29 Nov 2026. Lineup is **live-synced** from the official app (Aloompa);
snapshot `snapshot/subapp.json` (195 sets / 20 venues on 2026-11-25).

## Festival facts (2026)
- **Dingle town, Co Kerry**; timezone **Europe/Dublin**; `dayCutoffHour` 6 (last gigs end ~00:15,
  late-night slots past midnight belong to the previous evening).
- **Access is by strand, and it matters for every recommendation** — the feed's per-set note says
  which: *Jameson Music Trail Wristband* (most pub gigs; **sold out**, first come first served — pubs
  fill, arrive early), *St James' Church Golden Ticket* (**competition only**, not wristband — never
  recommend the Church as if someone can just walk in; it's streamed on YouTube + RTÉ2 Sat 8pm),
  *Ireland's Edge Wristband* (talks, Dingle Skellig Hotel, Fri–Sat), *Free Entry* (Banter at Foxy
  John's, Cogar at An Díseart), *Powers Golden Hours Ticket* (Sun, Páidí Ó Sé's in **Ventry**, bus).
- Powers Golden Hours shows **16:00** in the app — that's **doors**; music 17:30–20:30.
- **Timezone sanity anchor:** BABYRAT, The Dingle Pub, **Sun 29 Nov 18:20–19:00** (operator-confirmed).
  `now "Sun 18:20"` must show it.
- **Surprise sets** are a feature of this festival: the schedule watch ticks every 4–6 min
  (`watch.conf`) and relays `ADDED:` sets to people with `surpriseSets: true` (see the bootstrap skill).
  **Draft events** (acts staged but unpublished — e.g. the J Music Stage strand) can be spotted
  *before* they hit the schedule, via performer→draft-event links (`draft-tick` watch); see `knowledge/data-source.md`.

## Favourites
Clashfinder event **`ov2026`** ("Other Voices Dingle 2026 (unofficial)") — run by an independent
user, **read-only for us: never `cf-push` to it.** Mechanics: `knowledge/data-source.md`.

## Knowledge index (Read on demand)
- `knowledge/data-source.md` — the Aloompa feed, secrets, refresh, quirks.
- `knowledge/walk-graph.md` — how walk times were derived and which venues are placeholders.
- `knowledge/venue_coords.json` — venue coordinates (OSM + operator Plus Code).
