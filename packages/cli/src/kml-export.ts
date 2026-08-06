/**
 * `festplan kml [--out FILE]` — every known POI as a KML file for Google My Maps.
 *
 * Assembles three sources into one coordinate space:
 *   - stages          festivals/<slug>/stage-positions.json  (site-map pixels)
 *   - amenities       festivals/<slug>/amenities.json        (site-map pixels)
 *   - arrival points  car parks / entrances read off the official map
 * converted to real coordinates by fitting against stages whose genuine 2025
 * coordinates we hold (cache/<slug>/map_raw_2025.json).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildKml, fitStaticToLatLng, fitResidualMetres, type Control, type Folder, type Place, type LatLng } from "./kml.js";
import { REPO_ROOT, cacheDir } from "./config.js";
import { ACTIVE_FESTIVAL } from "./festivals.js";

/** 2025 POI stage names -> our venue slugs (sponsor renames, not repositionings). */
const STAGE_NAME_TO_SLUG: Record<string, string> = {
  "ATN Main Stage": "atn-main-stage",
  "The Well": "the-well",
  "The Last City": "the-last-city",
  "The Circle": "the-circle-by-jameson-music",
  "Something Kind Of Wonderful": "something-kind-of-wonderful",
  IMMERSE: "immerse-ava-x-smirnoff",
  "Hidden Sounds": "hidden-sounds",
  "Bandstand Arena": "the-temporary-bandstand",
  "Global Roots": "global-roots-main-stage",
  Arcadia: "arcadia-afterburner",
  "Ping Pong Disco": "ping-pong-disco",
  "Born Social": "born-social-by-schweppes",
  "Theatre of Food": "theatre-of-food",
  "Flourish With Imro": "flourish-with-district-music",
  "Lovely Days With Guinness": "road-to-nowhere",
};

/**
 * Google My Maps allows only 10 layers, and one-per-category came to 16
 * (operator note, 2026-07-29). Categories therefore collapse into a handful of layers and are
 * told apart by icon + colour instead. `layer` is the My Maps layer; `style` is
 * the per-category pin.
 */
const CATEGORY: Record<string, { layer: string; label: string; icon: string; color: string }> = {
  bar: { layer: "Food & drink", label: "Bar", icon: "bars", color: "#e6a020" },
  food: { layer: "Food & drink", label: "Food", icon: "dining", color: "#e2571e" },
  retail: { layer: "Food & drink", label: "Shop", icon: "shopping", color: "#c4a000" },
  toilets: { layer: "Facilities", label: "Toilets", icon: "toilets", color: "#2f6fb5" },
  water: { layer: "Facilities", label: "Water", icon: "water", color: "#39a9e0" },
  showers: { layer: "Facilities", label: "Showers", icon: "swimming", color: "#1f9c8f" },
  medical: { layer: "Facilities", label: "Medical", icon: "hospitals", color: "#d0342c" },
  info: { layer: "Facilities", label: "Info", icon: "info_circle", color: "#3f8f3f" },
  lockers: { layer: "Facilities", label: "Lockers", icon: "police", color: "#7a7a7a" },
  activity: { layer: "Experiences", label: "Experience", icon: "arts", color: "#c2379c" },
  wellness: { layer: "Experiences", label: "Wellness", icon: "parks", color: "#69b34c" },
  venue: { layer: "Experiences", label: "Venue", icon: "ranger_station", color: "#8a5a2b" },
};

const ICON_BASE = "http://maps.google.com/mapfiles/kml/shapes/";

const AREA_STYLE: Record<string, { fill: string; outline: string }> = {
  camping: { fill: "#4caf50", outline: "#2e7d32" },
  parking: { fill: "#9e9e9e", outline: "#5f5f5f" },
};

/**
 * Car parks and entrances, in COMPOSITE map pixels (6000x7500), read off the
 * official raster on 2026-07-29 while answering a "which car park?" question.
 * These are label centres in large fields, so they are approximate by nature —
 * flagged in each description rather than presented as precise points.
 */
const ARRIVAL_COMPOSITE_PX: Array<{ name: string; px: number; py: number }> = [
  { name: "Car Park 5", px: 1753, py: 4076 },
  { name: "Car Park 4", px: 1476, py: 3114 },
  { name: "Car Park 2", px: 1996, py: 2890 },
  { name: "Car Park 3", px: 1648, py: 1558 },
  { name: "Car Park 6", px: 390, py: 2283 },
  { name: "General Camping Entrance", px: 1218, py: 5170 },
];

// Overlay-tile bounds from cache/<slug>/map_raw.json — the composite georeference.
const COMPOSITE = { lat0: 52.2838361, lat1: 52.3056716, lng0: -7.3829981, lng1: -7.3544336, w: 6000, h: 7500 };

function compositeToLatLng(px: number, py: number) {
  return {
    lat: COMPOSITE.lat1 - (py / COMPOSITE.h) * (COMPOSITE.lat1 - COMPOSITE.lat0),
    lng: COMPOSITE.lng0 + (px / COMPOSITE.w) * (COMPOSITE.lng1 - COMPOSITE.lng0),
  };
}

interface PoiDoc {
  coordinates?: Array<{ lat: number; lng: number }>;
  name?: string;
  category_id?: number;
}

function centroid(c: Array<{ lat: number; lng: number }>) {
  return {
    lat: c.reduce((s, x) => s + x.lat, 0) / c.length,
    lng: c.reduce((s, x) => s + x.lng, 0) / c.length,
  };
}

export function runKmlExport(args: string[]): void {
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;

  const fest = join(REPO_ROOT, "festivals", ACTIVE_FESTIVAL);
  const posFile = join(fest, "stage-positions.json");
  const amenFile = join(fest, "amenities.json");
  const legacy = join(cacheDir(ACTIVE_FESTIVAL), "map_raw_2025.json");

  for (const [f, what] of [[posFile, "stage positions"], [amenFile, "amenities"], [legacy, "2025 POI dump"]] as const) {
    if (!existsSync(f)) return void console.log(`cannot export: ${what} missing (${f})`);
  }

  const positions = (JSON.parse(readFileSync(posFile, "utf8")) as { positions: Record<string, [number, number]> }).positions;
  const amenities = (JSON.parse(readFileSync(amenFile, "utf8")) as { items: Array<{ n?: number; name: string; category: string; at: [number, number] }> }).items;
  const legacyDoc = JSON.parse(readFileSync(legacy, "utf8")) as {
    map: { categories: Array<{ id: number; name: string }> };
    pois: PoiDoc[];
  };

  // Control points: stages present in BOTH the pixel frame and the 2025 coords.
  const stageCat = legacyDoc.map.categories.find((c) => c.name === "Stages")?.id;
  const controls: Control[] = [];
  for (const p of legacyDoc.pois) {
    if (p.category_id !== stageCat || !p.coordinates?.length) continue;
    const slug = STAGE_NAME_TO_SLUG[(p.name ?? "").trim()];
    const px = slug ? positions[slug] : undefined;
    if (!px) continue;
    const c = centroid(p.coordinates);
    controls.push({ px: px[0], py: px[1], lat: c.lat, lng: c.lng });
  }
  if (controls.length < 2) return void console.log("cannot export: too few stage control points to fit coordinates");

  const toLatLng = fitStaticToLatLng(controls);
  const residual = Math.round(fitResidualMetres(controls));
  const accuracy = `Position approximate (±~${residual}m) — derived from the official site-map image, not surveyed.`;

  const stagePlaces: Place[] = Object.entries(positions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, [px, py]]) => ({ name: slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()), ...toLatLng(px, py), description: accuracy }));

  // Group into LAYERS (not categories) and tag each pin with its category style.
  const byLayer = new Map<string, Place[]>();
  for (const a of amenities) {
    const cat = CATEGORY[a.category];
    const layer = cat?.layer ?? "Other";
    const name = a.n !== undefined ? `${a.n}. ${a.name}` : a.name;
    const list = byLayer.get(layer) ?? [];
    list.push({
      name,
      ...toLatLng(a.at[0], a.at[1]),
      // The category is in the description too: My Maps shows it on click, and
      // it keeps the type readable if icons ever fail to import.
      description: `${cat?.label ?? a.category} · ${accuracy}`,
      styleId: a.category,
    });
    byLayer.set(layer, list);
  }

  // Areas are traced in COMPOSITE pixels, so they convert through the exact
  // overlay georeference — no projection-fit error, unlike the pixel POIs above.
  const areasFile = join(fest, "areas.json");
  const areaFolders = new Map<string, Array<{ name: string; ring: LatLng[]; description?: string; styleId?: string }>>();
  if (existsSync(areasFile)) {
    const doc = JSON.parse(readFileSync(areasFile, "utf8")) as {
      categories: Record<string, string>;
      areas: Array<{ name: string; category: string; ring: Array<[number, number]> }>;
    };
    for (const a of doc.areas) {
      const label = doc.categories[a.category] ?? a.category;
      const list = areaFolders.get(label) ?? [];
      list.push({
        name: a.name,
        ring: a.ring.map(([x, y]) => compositeToLatLng(x, y)),
        description: "Boundary hand-traced from the official site map (~10m). Indicative, not surveyed.",
        styleId: `area-${a.category}`,
      });
      areaFolders.set(label, list);
    }
  }

  const arrival: Place[] = ARRIVAL_COMPOSITE_PX.map((a) => ({
    name: a.name,
    ...compositeToLatLng(a.px, a.py),
    description: "Approximate — read off the official map. Car parks are large fields and staff direct you to a space on arrival.",
  }));

  // Areas collapse into ONE layer too — campsites and car parks stay apart by
  // fill colour rather than by layer, since layers are the scarce resource.
  const allAreas = [...areaFolders.values()].flat();

  const LAYER_ORDER = ["Food & drink", "Facilities", "Experiences", "Other"];
  const folders: Folder[] = [
    { name: "Stages", places: stagePlaces },
    { name: "Campsites & car parks", places: [], areas: allAreas },
    { name: "Arrival: car parks & entrances", places: arrival },
    ...LAYER_ORDER.filter((l) => byLayer.has(l)).map((name) => ({ name, places: byLayer.get(name)! })),
  ];

  const styles = [
    ...Object.entries(CATEGORY).map(([id, c]) => ({ id, icon: `${ICON_BASE}${c.icon}.png`, color: c.color })),
    ...Object.entries(AREA_STYLE).map(([id, s]) => ({ id: `area-${id}`, polyFill: s.fill, polyOutline: s.outline })),
    { id: "stage", icon: `${ICON_BASE}music.png`, color: "#7b3fa0" },
    { id: "arrival", icon: `${ICON_BASE}parking_lot.png`, color: "#2f4f8f" },
  ];
  for (const p of stagePlaces) p.styleId = "stage";
  for (const p of arrival) p.styleId = "arrival";

  const kml = buildKml(`All Together Now 2026 — points of interest`, folders, styles);
  const points = folders.reduce((n, f) => n + f.places.length, 0);
  const areaCount = folders.reduce((n, f) => n + (f.areas?.length ?? 0), 0);
  const layers = folders.filter((f) => f.places.length || (f.areas?.length ?? 0)).length;

  if (!out) return void console.log(kml);
  writeFileSync(out, kml);
  console.log(
    `wrote ${out} — ${points} points + ${areaCount} areas across ${layers} layers (point fit residual ~${residual}m; areas georeferenced exactly)`,
  );
}
