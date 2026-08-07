# ATN26 walk graph — provenance & derivation

Provenance for the inter-stage walk graph in `festivals/atn26/venues.json` (the `walk.edges`
list). The `_note` in `venues.json` itself carries the venue-ORDER warning;
the history and method live here.

## Current state
- **As committed today, `venues.json` holds 23 stages and 247 edges.** 6 of the 253 possible pairs
  are absent and fall back to `defaultMinutes` (12): All Curious Minds↔Global Roots Cambium,
  All Curious Minds↔Lover's Rock, Global Roots Cambium↔Heineken Garden, Global Roots
  Cambium↔Seanchoíche, Heineken Garden↔Lover's Rock, Lover's Rock↔Seanchoíche.
- ⚠️ **That is three stages more than the 2026-07-28 rebuild below produced**, and this file does
  not record where the extra three came from. So the "no mixed provenance left" claim no longer
  holds: most edges trace to the rebuild, but the newest stages don't have a documented derivation.
  Re-derive the whole graph (or document the addition) before treating it as uniform.
- The Arcadia↔Main calibration anchor still holds: it remains the longest edge at **14 min**.

## The 2026-07-28 rebuild — the method most edges still come from
- **Rebuilt from the OFFICIAL 2026 site map (2026-07-28).** 20 stages, all-pairs graph
  (**190 edges**), every edge derived the same way.
- **The 2026 map is an IMAGE, not geodata.** ATN published it as `static_map_image` on the
  edition object (750/1500/3000px JPEGs on media.appmiral.com) with a `Map` menu item pointing at
  `appmiral-alltogethernow://staticmap`. Both are server-side config, which is why a map tab
  appeared in the app with no app update. `/maps` and `/pois` return `data: []` and always will
  for this edition — **`walk-refine` cannot run on 2026**, as it needs real lat/lngs.
- **Method:** stage positions read off the 3000x3000 image in pixels
  (`festivals/atn26/stage-positions.json`), each read twice from independently-cropped tiles,
  agreeing within ~15px. Scale calibrated at **0.792 m/px** by taking three stage pairs whose real
  2025 coordinates we still hold and dividing real metres by measured pixels — the three pairs give
  0.713/0.772/0.892, so the scale is good to about ±11%. Then
  `pixels x 0.792 x 1.3 (path factor) / 1.1 m/s`, rounded, minimum 1.
- **Cross-check against the previous graph:** of the 120 edges that existed before, 57 were
  unchanged, 58 moved by 1 minute, 5 by 2 minutes, and **nothing moved by 3 or more**. The
  image-derived positions reproduce the coordinate-derived graph closely, which is the strongest
  validation either method has had.
- **70 edges are new** — the four stages that had no position at all and were falling back to
  `defaultMinutes` (12): The Big Romance Dome x Altos, Dance Forever: Red Bull x Izakaya,
  Lover's Rock and GoLoud. Lounge. Dance Forever turns out to be 3 min from the Main Stage, not 12.
- **Still not ground truth.** Straight-line pixels times a factor. It ignores the lake, which any
  route around the south of the site must physically go around, and the 1.3/1.1 constants remain
  assumptions. Refine from on-site experience if a timing feels wrong.
- `limitedCapacity` is still unknown (empty array).

## Superseded: refined from 2025 real coordinates (2026-07-22)
- 16 stages, 120 edges; 47 recomputed from real 2025 lat/lon centroids via the 2025 `maps`/`pois`
  API, the other 73 still carrying an eyeballed-off-the-2025-map estimate. Replaced wholesale by
  the 2026 rebuild above, which covers all 20 stages by one consistent method.

## Derivation method (2026-07-10, the operator)
- Venue list from the `alltogethernow2026` published snapshot (16 stages), pulled 2026-07-10.
- Positions eyeballed off the **2025 arena map** (no 2026 map available yet), then **cross-checked by
  a second independent read**: 12/16 stages agreed within ~15px. Scale calibrated so the
  Arcadia↔Main diagonal ≈ 14 min.
- Venue array **order = the app's stage display order** (Appmiral stage `priority` ascending: ATN Main
  Stage, Something Kind of Wonderful, Road To Nowhere, …). The Clashfinder mirror export
  (`cf-push atn2026`) uses this index as its stage display order, so keep the order stable.

## Per-stage corrections from the cross-check
- **The Last City** — moved north off the lakeshore (first guess sat on the water).
- **Born Social by Schweppes** — anchored to the 2025 "Schweppes Born Social" marker in the NE
  corridor (first guess had landed on GoLoud); later re-anchored (see below).
- **Road To Nowhere** (2026-07-10) — occupies the 2025 "Lovely Days with Guinness" cinema tent
  (central cluster, adjacent Ping Pong / The Circle / The Well). Its 15 edges were re-derived from
  that anchor, replacing an earlier south-central guess.
- **Born Social by Schweppes** (2026-07-10) — re-anchored to the Schweppes logo on an older map crop:
  NW of Something Kind of Wonderful, S of the Arcadia ferris wheel, E of The Circle (central-north
  cluster). All 15 edges re-derived, replacing the earlier NE-limb guess.

## Remaining unknowns
- Real path timings around the lake (euclidean underestimates any route that must go around it).
- `limitedCapacity` per stage.
- Refresh the whole graph if/when a 2026 site map is published.
