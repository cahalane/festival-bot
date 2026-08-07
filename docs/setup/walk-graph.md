# Walk graph — inter-stage travel time

`festivals/<slug>/venues.json` carries the walk graph: minutes between pairs of stages. It need not
be all-pairs — any pair with no edge falls back to `walk.defaultMinutes`, so a sparse graph covering
the hops that matter is a legitimate design (`ps26` does exactly that; `atn26` is near-complete). `packages/core`'s clash/route logic uses it directly — two sets are only reachable
back-to-back if the gap between them is at least the walk time, and `myday` routes over these
edges — so **an edge that's wrong makes a routing decision wrong**, silently (a bad recommendation
looks exactly like a good one). Getting this graph right is worth the setup time.

```json
{
  "venues": [ { "slug": "atn-main-stage", "name": "ATN Main Stage" }, ... ],
  "limitedCapacity": [],
  "walk": { "defaultMinutes": 12, "edges": [["stage-a", "stage-b", 7], ...] }
}
```

`defaultMinutes` is only a fallback for a pair the graph doesn't cover — every real edge should
come from one of the two methods below, not the default.

**Venue order matters.** The array order is treated as the festival's own canonical stage
order (matching however the festival itself orders stages — its map numbering, its app's
priority field) and `cf-push` uses that order verbatim for the Clashfinder mirror's column order.
Append new venues at the end; don't alphabetise or re-sort the list.

## Two paths to derive edges

### 1. Derive from map POIs — `walk-refine`

If your lineup source exposes real stage coordinates (lat/lng), use them directly:

```
./festplan walk-refine [--commit]
```

Without `--commit` it prints a diff of what would change; `--commit` writes it. It matches each
`venues.json` stage to a real-coordinate POI by name (pass a name map if the source's names have
drifted from your slugs — sponsor names change year to year), computes a distance for every
matched pair, and touches **only** edges where both endpoints have a matched coordinate — any
stage without one keeps its existing estimate untouched rather than falling back silently.

This path needs actual geodata (`maps`/`pois` returning coordinates), not just a map image. If
your vendor only publishes a static map picture — check by fetching `maps`/`pois` and seeing
whether you get real POIs or an empty array — `walk-refine` has nothing to work from, and you're
on path 2.

### 2. Anchor stage positions to the map by hand

Read stage positions directly off a map image (pixel coordinates), then apply the same distance
heuristic by hand: pick a couple of stage pairs whose real-world distance you know (or can
estimate) to calibrate a pixels-to-metres scale, then compute every other pair from their pixel
positions. Cross-check your pixel reads by reading each stage's position twice, independently, and
confirm they agree within a small tolerance before trusting the derived edges — a single
misread stage corrupts every edge touching it.

## The distance heuristic

Both paths use the same formula, in `walk-refine`'s implementation:

```
minutes = round( haversine(a, b) meters × 1.3 / 1.1 meters-per-second / 60 ), minimum 1
```

- **× 1.3** — a path factor: real festival footpaths are never a straight line between two
  points, so straight-line (haversine) distance underestimates actual walking distance. 1.3 is an
  estimate, not a measurement.
- **÷ 1.1 m/s** — an assumed crowd walking pace (slower than an unobstructed adult's ~1.4 m/s,
  because festival paths are crowded).

## Limitation — and when to override by hand

This heuristic is straight-line geometry with two constant fudge-factors. It has no idea a lake,
a fence line, a one-way crowd-flow corridor, or a closed gate sits between two stages — it will
happily estimate a short walk between two points that are actually separated by a body of water
you have to walk all the way around. Treat every derived edge as a starting estimate, and when a
route recommendation feels wrong or someone reports an actual walk taking noticeably longer or
shorter than the graph says, correct that specific edge by hand in `venues.json` rather than
re-deriving the whole graph — and note why, the same way `festivals/atn26/knowledge/walk-graph.md`
tracks per-stage corrections (e.g. a stage that first landed on a lakeshore before being moved
north off it). `limitedCapacity` (stages the graph should treat as gate-limited) is a separate,
still-manual field — populate it from on-site knowledge, nothing derives it automatically.
