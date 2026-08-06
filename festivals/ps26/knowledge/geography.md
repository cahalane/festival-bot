# PS26 site geography & walking times

**Provenance:** stage clusters and walk-times below were read off the festival's official
arena map (Parc del Fòrum) and cross-checked against on-the-ground reports. The derived walk
graph — `../venues.json` (stage list + all-pairs edges in minutes) — is what ships in this
module, because it's ours: measurements and estimates, not artwork. The source map itself is
the festival's own artwork and is **not redistributed** here; when a fresh official map is
available, re-derive the edges from it the same way. This doc is the human narrative behind
the numbers in `venues.json`.

Crews often coin their own shorthand for a far-flung stage cluster (this one had a name for
the long seaside walk out to the mains) — that kind of local vocabulary belongs in a
deployment's own crew file, not in shared festival data.

The site is a chain of clusters running NE (sea, main stages) → SW (entrance). Within a
cluster travel is ~0; between clusters use `venues.json`. Full traverse
(Backstage → Revolut) ≤ **25 min** even at peak.

- **Main (NE/seaside):** `revolut` + `estrella-damm` are side by side, **alternating
  sets** (~0–1 min hop, designed for back-to-back). `plenitude` sits just behind, 2–3 min.
- Plenitude → central hub (`cupra`/`occident`): ~15 min (seaside past attractions to Cupra,
  or uphill to Occident).
- **Seaside attractions strip** (midway Plenitude→Cupra): `aperol-island-of-joy`,
  `barcelona-sona` (Estrella Damm Barcelona Sona), `disney-stage`, `adidas` (The Adidas Yard).
  Modelled ~7 min from Plenitude, ~8 min from Cupra.
- **Secondary (central):** `cupra` ↔ `occident` ~5 min, also an **alternating pair**.
- `occident` → `auditori-rockdelux` ~5 min. Indoor, **limited capacity** — arrive EARLY.
- **Far seaside (past Cupra):** `cupra` → `pulse-cupra` 2 min; → `port`/`schwarzkopf` ~4 min
  total. Port & Schwarzkopf face each other, **alternating pair** (~0–1 min between them).
- **Central triangle:** `warehouse` (The Levi's Warehouse) + `levis-501-club` — **limited
  capacity**, shared zone (~1 min apart).
- **Far-left uphill (~5 min from Occident):** `schwarzkopf-backstage` (The Backstage by
  Schwarzkopf) + `levis-501-plaza` (The Levi's 501 Plaza) — smaller segmented stages.

**Alternating pairs** (Revolut/Estrella Damm, Cupra/Occident, Port/Schwarzkopf) mean the
schedule is *designed* for back-to-back viewing within a cluster — surface that as the path
of least resistance. **Limited-capacity venues** (`auditori-rockdelux`, `warehouse`,
`levis-501-club`): flag "arrive early" and budget buffer before set start.

**Slug-alignment lesson (reconfirmed twice):** when a new stage appears in the feed, re-check
the walk graph slug matches the feed slug. Past silent failures: `backstage` vs
`schwarzkopf-backstage`; `levis-plaza` vs `levis-501-plaza` — both returned the wrong
(default 20-min) distance until caught.
