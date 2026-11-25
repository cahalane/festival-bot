# ov26 walk graph — what it is, and what it is not

Built 2026-11-25 by `tools/derive-walk-graph.mjs` from `venue_coords.json`.

- **18 of 20 venues**: 16 are positioned from **OpenStreetMap** (Overpass, element ids in
  `venue_coords.json`), matched to the Aloompa feed by name. The feed itself has no coordinates
  (every place's latitude/longitude is null).
- **Murphy's Ice Cream**: OSM has two shops ~150 m apart on Strand Street; the app doesn't say
  which. The midpoint is used (≤ ~1 min error either way).
- **An Díseart + its garden**: not in OSM; positioned from the operator's Plus Code `4PRH+RP`
  (Green Street), both at the same point.
- **No position: Wave** — unidentified, not in OSM. Falls back to `defaultMinutes: 10`, a
  placeholder. Add coordinates to `venue_coords.json` and re-run the tool when known.
- **Páidí Ó Sé's** is in Ventry (~8 km). Only Powers Golden Hours (Sun) is there, and its ticket
  includes a return shuttle from Dingle. Its edges (positioned venues only) are a flat **30 min bus estimate**, not a walk —
  and the 16:00 start in the feed is **doors**; the music starts 17:30 (othervoices.ie).
- Heuristic per docs/setup/walk-graph.md (×1.3 path factor, 1.1 m/s). 171 edges (153 walk + 18 bus); median 5 min;
  longest walk Barr na Sráide ↔ Dingle Skellig Hotel, 20 min.
- Pub gigs in a small town are capacity-limited in practice (the Music Trail is first come, first
  served). Only St James' Church is marked `limitedCapacity` (golden-ticket only).
