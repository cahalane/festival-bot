/**
 * `map-check` / `amenities` — the generic site-map watch (see festplan `case
 * "map-check"`). POIs come from the active festival's `sources.map`
 * (a `SiteMapSource`), so this file has no vendor knowledge; a festival that
 * declares no map source simply means the watch has nothing to do, and both
 * commands stay silent/no-op rather than erroring.
 *
 * `map-check` is the Monitor-loop half: silent while the map has no real
 * information in it yet (`poisPublished` — a map made only of raster backdrop
 * tiles counts as unpublished). The moment real POIs appear, it caches the raw
 * dump to cache/<festival>/map_raw.json and prints ONE line per change, keyed
 * by diffing against the previous placed set (a festival may populate its map
 * incrementally over days rather than all at once).
 *
 * `amenities` reads that cache to report the nearest POI (by centroid distance) in
 * each amenity category to every stage — the amenities.md refresh input once real
 * map coordinates land.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { poisPublished, isBackdrop, type SitePoi } from "@festival-bot/core";
import { haversineMeters } from "@festival-bot/adapters";
import { cacheDir, REPO_ROOT } from "./config.js";
import { ACTIVE_FESTIVAL, loadActiveFestival } from "./festivals.js";
import { nearestByCategory as nearestPixelAmenity, type PixelAmenity } from "./amenities-pixels.js";
import { calibrateMetresPerPixel } from "./walk-pixels.js";

/** Used when a festival's manifest doesn't set `amenityCategories`. */
const DEFAULT_AMENITY_CATEGORIES = [
  "Toilets",
  "Water Taps",
  "Food",
  "Bars",
  "Medical",
  "Showers",
  "Info Point",
  "Entrances",
  "Wheelchair Access",
];

function rawFile(): string {
  return join(cacheDir(ACTIVE_FESTIVAL), "map_raw.json");
}

/**
 * POIs that tell us WHERE SOMETHING IS, as opposed to the raster backdrop.
 *
 * One festival's map published as four `map_overlay_image` corner polygons and
 * nothing else — every real category empty. A bare `pois.length` test counts
 * those tiles as data, which is what made the watch announce the map and
 * self-stop while the useful half was still unpublished. Backdrop is
 * identified two ways (either is enough, via `isBackdrop`): the source-set
 * `backdrop` flag, or the vendor-neutral `map_overlay_image` category — so a
 * tile mis-filed under a real category is still caught.
 */
export function informationalPois(pois: SitePoi[]): SitePoi[] {
  return pois.filter((p) => !isBackdrop(p));
}

export interface PlacedMove {
  id: string;
  name: string;
  metres: number;
}

/** Movement below this is map-editor jitter, not a repositioning worth waking anyone for. */
const MOVE_THRESHOLD_M = 10;

/**
 * Diff two snapshots of the PLACED POIs, keyed by id.
 *
 * A festival may populate its map incrementally — placing a handful of stages
 * at a time and leaving the rest for later — so a one-shot "the map is live"
 * signal announces the first batch and then goes silent for everything after
 * it. Keying by id means a rename in place reads as a move rather than as a
 * removal plus an addition, which matters because these records get renamed to
 * their sponsored names.
 */
export function diffPlacedPois(
  prev: SitePoi[],
  next: SitePoi[],
): { added: SitePoi[]; removed: SitePoi[]; moved: PlacedMove[] } {
  const byId = (list: SitePoi[]) => new Map(list.map((p) => [p.id, p]));
  const before = byId(prev);
  const after = byId(next);

  const added = next.filter((p) => !before.has(p.id));
  const removed = prev.filter((p) => !after.has(p.id));
  const moved: PlacedMove[] = [];

  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) continue;
    const metres = haversineMeters(was, now);
    if (metres >= MOVE_THRESHOLD_M || was.name !== now.name) {
      moved.push({ id: now.id, name: now.name || "(unnamed)", metres: Math.round(metres) });
    }
  }
  return { added, removed, moved };
}

function placedBaselineFile(): string {
  return join(cacheDir(ACTIVE_FESTIVAL), "map_placed_ref.json");
}

export async function runMapCheck(): Promise<void> {
  const festival = loadActiveFestival();
  const source = festival.sources.map;
  if (!source) return; // this festival publishes no map — nothing to watch, stay silent

  const pois = await source.loadPois();
  if (!poisPublished(pois)) return; // not published yet — silent tick, same as schedule-tick

  const useful = informationalPois(pois);

  // Keep the raw dump fresh even while only the raster exists — the corner tiles
  // carry the georeference, which is worth having on disk.
  const file = rawFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ pois }, null, 2));

  // Diff rather than fire once: festivals often place POIs incrementally, so a
  // one-shot signal reports the first batch and then goes quiet for the rest.
  const ref = placedBaselineFile();
  const prev: SitePoi[] = existsSync(ref) ? JSON.parse(readFileSync(ref, "utf8")) : [];
  const { added, removed, moved } = diffPlacedPois(prev, useful);
  if (!added.length && !removed.length && !moved.length) return;

  writeFileSync(ref, JSON.stringify(useful, null, 2));
  console.log(
    `MAP POIS (${ACTIVE_FESTIVAL}): ${added.length} placed, ${removed.length} removed, ${moved.length} moved (${useful.length} total)`,
  );
  for (const p of added) console.log(`  PLACED:  ${p.name || "(unnamed)"}`);
  for (const p of removed) console.log(`  REMOVED: ${p.name || "(unnamed)"}`);
  for (const m of moved) console.log(`  MOVED:   ${m.name} (${m.metres}m)`);
}

function nearestByCategory(pois: SitePoi[], categories: string[]): Map<string, SitePoi[]> {
  const out = new Map<string, SitePoi[]>();
  for (const catName of categories) {
    const matches = pois.filter((p) => p.category === catName);
    if (matches.length > 0) out.set(catName, matches);
  }
  return out;
}

export interface StageAmenities {
  stage: string;
  nearest: Record<string, { name: string; meters: number }>;
}

export function computeStageAmenities(pois: SitePoi[], categories: string[]): StageAmenities[] {
  const stages = pois.filter((p) => p.category === "Stages");
  const amenities = nearestByCategory(pois, categories);

  return stages.map((stage) => {
    const nearest: Record<string, { name: string; meters: number }> = {};
    for (const [cat, options] of amenities) {
      if (options.length === 0) continue;
      let best = options[0]!;
      let bestDist = haversineMeters(stage, best);
      for (const o of options.slice(1)) {
        const d = haversineMeters(stage, o);
        if (d < bestDist) {
          best = o;
          bestDist = d;
        }
      }
      nearest[cat] = { name: best.name || "(unnamed)", meters: Math.round(bestDist) };
    }
    return { stage: stage.name || "(unnamed)", nearest };
  });
}

export function runAmenities(args: string[]): void {
  // Some festivals' maps are a raster image, not POI data — prefer the pixel
  // dataset read off it when the festival ships one.
  const pxAmenities = join(REPO_ROOT, "festivals", ACTIVE_FESTIVAL, "amenities.json");
  const pxStages = join(REPO_ROOT, "festivals", ACTIVE_FESTIVAL, "stage-positions.json");
  if (existsSync(pxAmenities) && existsSync(pxStages)) {
    const { items } = JSON.parse(readFileSync(pxAmenities, "utf8")) as { items: PixelAmenity[] };
    const posDoc = JSON.parse(readFileSync(pxStages, "utf8")) as {
      positions: Record<string, [number, number]>;
      scaleReferences: { metres: number; pixels: number }[];
    };
    const mpp = calibrateMetresPerPixel(posDoc.scaleReferences);
    const rows = Object.entries(posDoc.positions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([stage, at]) => ({ stage, nearest: nearestPixelAmenity(at, items, mpp) }));
    if (args.includes("--json")) return void console.log(JSON.stringify(rows, null, 2));
    console.log(`(from the site-map image, ${mpp.toFixed(3)} m/px — straight-line estimates)\n`);
    for (const r of rows) {
      console.log(`## ${r.stage}`);
      for (const [cat, v] of Object.entries(r.nearest)) {
        if (v) console.log(`  ${cat.padEnd(10)} ${v.name.padEnd(42)} ~${v.metres}m`);
      }
      console.log("");
    }
    return;
  }
  const file = rawFile();
  if (!existsSync(file)) {
    console.log(
      `no map data cached yet for ${ACTIVE_FESTIVAL} (${file} missing) — the map-check watch hasn't seen it publish.`,
    );
    return;
  }
  const festival = loadActiveFestival();
  const categories = festival.manifest.amenityCategories ?? DEFAULT_AMENITY_CATEGORIES;
  const { pois } = JSON.parse(readFileSync(file, "utf8")) as { pois: SitePoi[] };
  const result = computeStageAmenities(pois, categories).sort((a, b) => a.stage.localeCompare(b.stage));

  if (args.includes("--json")) return void console.log(JSON.stringify(result, null, 2));

  for (const s of result) {
    console.log(`## ${s.stage}`);
    for (const [cat, v] of Object.entries(s.nearest)) {
      console.log(`  ${cat.padEnd(18)} ${v.name.padEnd(30)} ~${v.meters}m`);
    }
    console.log("");
  }
}
