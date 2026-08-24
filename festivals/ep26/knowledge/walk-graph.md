# ep26 walk graph — what it is, and what it is not

37 of 53 stages carry real positions, from **two sources of different quality**. Neither is a 2026
measurement. Read the caveats before trusting a tight connection.

## Source A — GPS survey, 8 stages (better)

An Garda Síochána's public EP planning map (ArcGIS Online):

- app: `garda.maps.arcgis.com/apps/instant/basic/index.html?appid=a6cb7958f28f4ffcb44fbec39bbf9b72`
- layer: `services2.arcgis.com/7PnQ6FpwxNXZjOqd/.../EP_STAGES_view/FeatureServer/0`

Points carry `esrignss_*` attributes (receiver "HUAWEI CLT-L09", HDOP, fix type) — collected on the
ground with a GPS handset, not drawn by eye.

**But the layer's `dataLastEditDate` is 2025-08-22, so these are 2025 positions.** The names confirm
the edition ("Jerry Fish Stage", "Late Night Arena", "Rankings Wood" *sic*); sibling layers in the
same webmap are named `_2026`, this one is not.

| 2025 Garda name | 2026 slug |
|---|---|
| Main Stage | `main-stage-presented-by-3` |
| Electric Arena | `electric-arena` |
| Rankings Wood *(sic)* | `rankins-wood` |
| Terminus | `red-bull-x-terminus` |
| Comedy Tent | `comedy-arena` |
| Salty Dog | `salty-dog` |
| The Theatre | `the-theatre` |
| Circus | `fosset-s-circus` |

"Late Night Arena" and "Jerry Fish Stage" were left **unmapped**: no unambiguous 2026 counterpart,
and a wrong stage match routes someone confidently into the wrong field.

## Source B — the 2024 festival map, 29 more stages (rougher)

The published 2024 site map (Irish Times, 5000x3375), which numbers 40 stages against a legend.

It is an *illustrated* map, not a survey — but it turns out to be geo-consistent enough to use,
because the 8 GPS stages above appear on it and give a calibration set. Fitting an affine
pixel→degree transform on those 8 and measuring the error against the GPS truth:

    residuals: median 38 m, mean 35 m, max 52 m (rankins-wood)

38 m is about 45 seconds at the walking pace below — inside the rounding of a walk-minute. That is
what makes this usable; had the residuals been in the hundreds of metres, it would have been thrown
away.

**Compounding caveats, though:** these are 2024 positions read by eye off an illustration, then
transformed by a fit calibrated on 2025 points. Two years of drift plus ~40 m of fit error plus
whatever I misread. Treat Source-B edges as "roughly right", never as a promise.

**Area stages share one position.** Where 2024 shows one marker for an area that 2026 splits into
several tents — Mindfield (5), Little Picnic (6), ArtLot (3), Theatre of Food (3) — every sub-stage
gets the area's coordinate. Walks *between* tents in one field therefore come out at 1 minute, which
is about right for a field, and walks *to* the area are as good as the area marker.

## Method

Identical to `walk-refine` (`packages/cli/src/walk-refine.ts`) so numbers stay comparable with other
festivals here:

    minutes = max(1, round(haversine(a, b) x 1.3 / 1.1 / 60))

`1.3` = path factor (real routes are not straight lines); `1.1 m/s` = crowd walking pace. Both are
estimates and neither was measured at Stradbally. A wet Sunday through a bottleneck is slower.

Result: **666 edges, 1 to 19 minutes** (median 7). Longest: Main Stage ↔ Anachronica, 966 m.

## What is still NOT covered

**16 stages have no position** and fall back to `defaultMinutes: 12` — a placeholder, not a
measurement, which will over-penalise a neighbouring tent and badly under-penalise a hike:

`coke-studio`, `croi-harp-ireland-stage`, `croi-intinn`, `croi-serenity-gardens-soft-landing`,
`croi-serenity-gardens-stage`, `fishtown-the-heart-anchor-bar`, `glow-depot-court-side`,
`glow-depot-stage`, `guinness-lovely-times-stage`, `metro`, `mother-afterdark`, `rockshore-stage`,
`schweppes-born-social`, `smirnoff-stage`, `transmission`, `white-claw-shore-club`.

Most are sponsor bars, which move year to year and are the *least* safe to carry forward from an old
map — hence left out rather than guessed.

## Why not `walk-refine`

The official app carries **no geodata at all**: `maps/config.json` has 128 named locations with
descriptions and images but zero coordinates, `MapsPeople` and `Core.Location` are disabled recipes,
and the only map asset is a 96x96 tab icon. So `walk-refine` has nothing to refine from, and
`map` / `kml` / `pin` / `amenities` have no source for this festival. Re-derive from a 2026 layer if
the Gardaí or EP publish one.
