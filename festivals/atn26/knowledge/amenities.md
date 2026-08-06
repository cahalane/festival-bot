# Site geography & amenities — Curraghmore Estate, ATN26

## 2026 data (2026-07-28) — use this first
`festivals/atn26/amenities.json` holds amenity positions read off **ATN's official 2026 site map**
(the 3000x3000 `static_map_image` JPEG; there is no POI/vector data this year). Same pixel frame as
`stage-positions.json`, so `./festplan amenities [--json]` answers "nearest X to stage Y" directly,
scaled at 0.792 m/px.

- The **numbered entries (24-46) are complete** — they are the map's own "Experiences" list, so
  bars, Borgo, Londis, the saunas and the workshops are all there under their 2026 names.
- The **unnumbered facility points are NOT exhaustive.** The map draws long rows of identical
  toilet/food/water icons; only cluster anchors were recorded. "Nearest toilets" means nearest
  recorded cluster, which is the right answer at zone granularity and wrong if you want the
  literal closest cubicle.
- Straight-line distances. Same lake caveat as the walk graph.

The 2025-derived material below is **superseded for positions and brands** but kept for zone
vocabulary and the campsite/entrance detail the 2026 map renders less clearly.

---

## Superseded: from the 2025 official maps

Source: **2025 ATN arena map + full map** (Telegram inbox images, read by the operator + vision agent,
2026-07-10). These are the newest maps available — **the 2026 map hasn't landed yet**.
⚠️ **Sponsor branding is provisional:** every bar below carries its 2025 sponsor name
(Guinness / Jameson / Dingle Gin / Rockshore / Smirnoff / Schweppes / Kraken / WhiteClaw / Aperol),
and several — **especially Guinness** — are expected to swap for 2026. Treat **positions as stable,
brands as placeholders** until a 2026 map replaces this file.
Legend on the maps: ℹ Info Point · ➕ Medical · 🚰 Drinking Water · 🚿 Showers · 🚻 Toilets ·
Merchandise · Retails · 🍴 Food · Londis · yellow arrows = Festival Entrances · red arrows =
Arena Entrances. Pixel coords below are on the 1024×1280 arena map, origin top-left — same frame
as the walk graph.

## Zone vocabulary (stage clusters, for "nearest X to stage Y" answers)
- **NE corridor / Main Stage end:** ATN Main Stage, Flourish, ferris wheel, the big food row,
  Guest Area, Merch Shop, Mixmag Lab; runs N up past Born Social/Refresh Inn to the Boutique entrance.
- **Central:** IMMERSE AVA x Smirnoff, Something Kind of Wonderful, Lovely Days (Guinness cinema screen).
- **South-central woods:** The Circle, Hidden Sounds, Global Roots (+ Cambium), The Well, Bandstand Arena.
- **West end:** Arcadia, Ping Pong Disco; beyond the arena fence = Lovers Rock campsite village,
  Lios na Tine sauna village, Arty Party workshops.
- **SE estate quarter:** Theatre of Food, Achara, China Tang, GoLoud spot, Greencrafts Village,
  Curious Minds, Lawns of Tranquility, Kid Together, Curraghmore House itself.
- **South:** The Last City dome + the lake.

## Drinking water 🚰 (arena taps read off the map)
- **Central path (AVA/The Circle):** tap on the path just NE of AVA, by the Jameson Main Arena Bar (~604,528).
- **South-central woods:** tap at the Hidden Sounds/Circle crossing (~645,684) — best refill for
  Circle/Hidden Sounds/Global Roots.
- **East boulevard:** tap next to the info point east of Something Kind of Wonderful (~807,630) —
  serves SKOW + the food row + walk to Main Stage.
- **Bandstand/West:** tap west of Bandstand Arena (~507,877); another inside the Arcadia bar area (~335,690).
- **South:** tap right at The Last City arena entrance (~522,980).
- **SE quarter:** tap by Achara/Curraghmore House (~903,889).
- Campsites all have their own taps (Better Land, Both Sides Now, campervan fields, etc.).
- **Main Stage itself is tap-sparse** — nearest are the food-row/info-point tap (~807,630) or the
  NE-corridor facilities; grab water on the walk in.

## Toilets 🚻
- **NE corridor:** by the river west of the ferris wheel (~692,357); up near Kildare Village /
  boutique end (~862,243).
- **Central:** by Guinness Lovely Days (~515,595).
- **South-central:** west of Bandstand Arena (~497,855); small clusters (blue dots) along the
  Bandstand and food-row paths.
- **Every campsite** has toilet blocks (Better Land, A Hard Day's Night, Both Sides Now, This Must
  Be The Place, One For The Road, Family, campervans, boutique sites).

## Medical ➕
- **West:** by Arty Party workshops / Lovers Rock campsite village edge (~397,645) — closest for
  Arcadia/Ping Pong.
- **NE:** below Strawberry Hill Boutique campsite (~893,287) — closest for Main Stage/Flourish.

## Showers 🚿
Campsites only: Both Sides Now (central, with the Londis), the boutique campsites (Old Wood,
Strawberry Hill), plus sauna villages (Lios na Tine NW, RISE Sauna & Hot Tubs central) for the
paid hot-water experience.
**2026 opening hours (official, Appmiral "Toilets & Showers" info page, pulled 2026-07-24):**
showers open **07:00–14:00 and 16:00–19:00** (closed 14:00–16:00), "subject to change". Toilets
located around the whole site.

## Info points ℹ
East boulevard next to Something Kind of Wonderful (~808,615); south by the Family
campsite/Pre-Pitched approach (~430,1160).

## Bars (numbered "Experiences" 1–17 — **2025 sponsor names, provisional for 2026**)
| # | 2025 name | Where (zone) | ~px |
|---|-----------|--------------|-----|
| 1 | Guinness: 1759 Bar | south-central woods, NW of Bandstand | 495,808 |
| 2 | Jameson: The Circle Bar | at The Circle | 638,705 |
| 3 | Dingle Gin: Hidden Sounds Bar | at Hidden Sounds | 695,705 |
| 4 | Wine Bar | SE, between Global Roots and the GoLoud/Curious Minds lawns | 767,825 |
| 5 | Rockshore: Bar | just N of Global Roots | 700,658 |
| 6 | Aperol | east boulevard near Great Oven x Tang | 854,600 |
| 7 | WhiteClaw | N end of the food row | 780,459 |
| 8 | The T0.0ucan: Guinness 0.0 Pub | NE corridor above ferris wheel | 760,372 |
| 9 | Rockshore: Refresh Inn | NE corridor, below Strawberry Hill | 820,275 |
| 10 | Schweppes Born Social | NE corridor, just below Refresh Inn | 790,318 |
| 11 | Jameson: Main Arena Bar | central path N of AVA (the OTHER "J" logo) | 626,507 |
| 12 | Smirnoff: AVA IMMERSE Bar | at AVA | 592,549 |
| 13 | Guinness: Lovely Days Bar | at the Lovely Days screen | 510,610 |
| 14 | Arcadia Bar | in Arcadia | 402,685 |
| 15 | Smirnoff: Pingpong Bar | at Ping Pong Disco | 472,732 |
| 16 | Kraken Rum: Global Roots Bar | at Global Roots | 740,690 |
| 17 | Guinness on the lawns bar | SE lawns by Achara | 885,890 |

Rule of thumb: **every stage has its own sponsor bar on top of it**; the standalone ones are the
Wine Bar (SE), Aperol/WhiteClaw (east food row), and the NE-corridor trio (0.0 Pub, Refresh Inn,
Born Social).

## Food & restaurants 🍴
- **Main food row:** big diagonal strip of vendors on the east boulevard between Flourish/ferris
  wheel and Something Kind of Wonderful (~770–850, 470–540) — the arena's dense food court, on the
  walk to Main Stage.
- **Theatre of Food** (~802,920): SE estate quarter — talks/demos venue, treated as a lineup stage
  in 2026 but is also literally the food quarter's anchor.
- **Achara Restaurant** (#18, ~855,923) and **China Tang** (#19, SE quarter near Theatre of
  Food/Achara — exact pin unclear on map): sit-down restaurants by Curraghmore House.
- **Great Oven x Tang** (#20, ~895,575): east boulevard below Mixmag Lab.
- Smaller food clusters: NE corridor near Refresh Inn; SE quarter around Greencrafts.
- **Londis** convenience shop: inside **Both Sides Now campsite** (~560,885), next to the Beat unit.
- Retail: Kildare Village (~800,242, NE) and Vuse Velo (~753,348, NE corridor).

## Other experiences (2025 numbering)
- 21 **ATN Guest Area** (~963,480) + **Merch Shop** (~947,520) + **Mixmag Lab** (~925,552): all
  stacked just S of Main Stage.
- 22 **RISE Sauna & Hot Tubs** (~512,522): central, NW of AVA ("RISE: Hot Tub and Sauna").
- 23 **Lios na Tine** sauna village (~390,592): NW, outside the arena proper.
- 24 **Curious Minds** (Seanchoíche / Global Solidarity Hub / Waterford Library, ~830,970) and
  25 **Lawns of Tranquility** (~785,995): SE quarter, quiet zone.
- 26 **Kid Together Area** (~865,1050): SE by the lake.
- 27 **Campsite Village** (Lovers Rock, ~335,630): W, outside the Arcadia fence.
- **GoLoud** spot (~782,852): 2025 podcast/radio stage between Wine Bar and Theatre of Food —
  a candidate host location for a 2026 stage if one lands in the SE quarter.

## Entrances
**Festival entrances (yellow, from the FULL map):**
- **General Festival Entrance — SW** (~325,925 full-map): between 6 Car Park and the Better Land /
  A Hard Day's Night campsites. The main way in from the car parks and Bus/Taxi.
- **Campervan Entrance — S/SW bottom** (~255,1225): feeds the campervan fields.
- **Boutique Entrance — N** (~745,280 full-map): own gate + **1 Boutique Car Park** (~615,260),
  feeds Old Wood + Strawberry Hill boutique campsites.

**Arena entrances (red arrows, arena map):**
- **NE** by Refresh Inn (~770,282) — boutique campsites → Main Stage end.
- **W (upper)** from Lovers Rock campsite village into Arcadia (~362,645).
- **W (lower)** from Both Sides Now near Ping Pong Disco (~435,748).
- **S** at The Last City (~520,962) — from This Must Be The Place / southern campsites.
- **SE** near Kid Together / the lake (~662,1105) — from Family / Pre-Pitched.

## Car parks & transport (FULL map)
- **4, 5, 6 Car Park:** stacked N→S along the **west side**; 6 is closest to the General Entrance.
- **Boutique car park (1):** N, at the Boutique Entrance.
- **Bus/Taxi:** far **west**, on the road outside all the car parks — longest walk of all, budget
  extra time on arrival/exit.
- Access Campsite + Parking: SE of the Family campsite (accessible camping).

## Campsites (FULL map, direction relative to the arena)
| Campsite | Where | Notes |
|----------|-------|-------|
| Better Land | SW, at the General Entrance | first one inside the gate |
| A Hard Day's Night | W | two fields, toilets |
| Both Sides Now | centre-W, hard against the arena's west fence | **Londis + showers + Beat**; closest general camping to the arena (Arcadia/Ping Pong side) |
| This Must Be The Place | S centre | big field, feeds the Last City entrance |
| One For The Road | S | below This Must Be The Place |
| Family Campsite | S/SE | next to Kid Together arena entrance |
| Pre-Pitched | SE | tents provided |
| Campervans / Family Campervans | far SW | own entrance |
| Old Wood Boutique | N | at Boutique Entrance |
| Strawberry Hill Boutique | N/NE | closest beds to the Main Stage (NE arena entrance) |
| Lovers Rock Campsite Village (27) | W | the campsite hub: Arty Party, medical, Lios na Tine sauna nearby |

## Quick planning notes
- **Main Stage end is bar/food-rich but water-poor** — refill at the food-row info-point tap on the way over.
- The **south-central woods tap** (Hidden Sounds crossing) covers the densest stage cluster
  (Circle / Hidden Sounds / Global Roots / Well).
- **Arcadia/Ping Pong** are far from medical's NE post — their cover is the **west** medical by Arty Party.
- Camping trade-off: **Both Sides Now** = closest walk + Londis/showers; **Strawberry Hill
  (boutique)** = closest to Main Stage; southern fields (TMBTP / One For The Road / Family) enter
  via the Last City / lake gates.
