# ov26 walk graph — what it is, and what it is not

Built by `tools/derive-walk-graph.mjs` from `venue_coords.json`; re-run it after editing coordinates.

- **All 19 town venues are positioned.** 16 come from **OpenStreetMap** (Overpass, element ids in
  `venue_coords.json`), matched to the Aloompa feed by name. The feed itself has no coordinates
  (every place's latitude/longitude is null).
- **From the operator's Plus Codes** (not in OSM): An Díseart and An Díseart Garden `4PRH+RP`
  (Green Street, same point for both), Wave `4PRC+23`.
- **Murphy's Ice Cream**: OSM has two shops ~150 m apart on Strand Street; the app doesn't say
  which. The midpoint is used (≤ ~1 min error either way).
- **Páidí Ó Sé's** is in Ventry (~8 km). Only Powers Golden Hours (Sun) is there, and its ticket
  includes a return shuttle from Dingle. Its edges are a flat **30 min bus estimate**, not a walk —
  and the 16:00 start in the feed is **doors**; the music starts 17:30 (othervoices.ie).
- Heuristic per docs/setup/walk-graph.md (×1.3 path factor, 1.1 m/s). 190 edges (171 walk + 19
  bus); median 5 min; longest walk Barr na Sráide ↔ Dingle Skellig Hotel, 20 min.
- `defaultMinutes: 10` now only covers a venue that appears in a future feed update before it's
  positioned — add it to `venue_coords.json` and re-run the tool.
- Pub gigs in a small town are capacity-limited in practice (the Music Trail is first come, first
  served). Only St James' Church is marked `limitedCapacity` (golden-ticket only).
