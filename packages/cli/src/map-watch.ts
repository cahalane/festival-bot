/**
 * `map-check` / `amenities` — the ATN26 site-map watch (see festplan `case
 * "map-check"`). Appmiral's map is only wired up for ATN so far (event/edition
 * hardcoded below, same constants as festivals/atn26/src/index.ts); generalise via
 * FestivalSources if a second Appmiral festival needs it.
 *
 * `map-check` is the Monitor-loop half: silent while the edition's map/POI data is
 * still unpublished (`data: []`), same "no output = no news" contract as
 * schedule-tick. The moment POIs appear, it caches the raw dump to
 * cache/<festival>/map_raw.json and prints ONE line, then a marker file
 * (map_reported.flag) stops it re-firing.
 *
 * `amenities` reads that cache to report the nearest POI (by centroid distance) in
 * each amenity category to every stage — the amenities.md refresh input once real
 * 2026 coordinates land.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  fetchAppmiralMaps,
  fetchAppmiralPois,
  poiCentroid,
  haversineMeters,
  type AppmiralMap,
  type AppmiralPoi,
} from "@festival-bot/adapters";
import { loadSecrets, cacheDir } from "./config.js";
import { ACTIVE_FESTIVAL } from "./festivals.js";
import { REPO_ROOT } from "./config.js";
import { nearestByCategory as nearestPixelAmenity, type PixelAmenity } from "./amenities-pixels.js";
import { calibrateMetresPerPixel } from "./walk-pixels.js";

const APPMIRAL_EVENT = "alltogethernow";
const APPMIRAL_EDITION = "alltogethernow2026";

const AMENITY_CATEGORIES = [
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
function markerFile(): string {
  return join(cacheDir(ACTIVE_FESTIVAL), "map_reported.flag");
}

/**
 * POIs that tell us WHERE SOMETHING IS, as opposed to the raster backdrop.
 *
 * ATN's 2026 map published as four `map_overlay_image` corner polygons and
 * nothing else — every declared category (Stages, Bars, Toilets, …) empty. A
 * bare `pois.length` test counts those tiles as data, which is what made the
 * watch announce the map and self-stop on 2026-07-29 while the useful half was
 * still unpublished. A backdrop tile is identified two ways (either is enough):
 * it sits in the "Overlay" category, or it carries an overlay image.
 */
export function informationalPois(map: AppmiralMap, pois: AppmiralPoi[]): AppmiralPoi[] {
  const overlayCatId = map.categories.find((c) => c.name === "Overlay")?.id;
  return pois.filter((p) => {
    if (!p.coordinates || p.coordinates.length === 0) return false;
    if (overlayCatId !== undefined && p.category_id === overlayCatId) return false;
    const overlay = (p as { map_overlay_image?: Record<string, string> }).map_overlay_image;
    if (overlay && Object.values(overlay).some((u) => u)) return false;
    return true;
  });
}

export interface PlacedMove {
  id: number | string;
  name: string;
  metres: number;
}

/** Movement below this is map-editor jitter, not a repositioning worth waking anyone for. */
const MOVE_THRESHOLD_M = 10;

function poiCentre(p: AppmiralPoi): { lat: number; lng: number } {
  const c = p.coordinates!;
  return {
    lat: c.reduce((s, x) => s + x.lat, 0) / c.length,
    lng: c.reduce((s, x) => s + x.lng, 0) / c.length,
  };
}

/**
 * Diff two snapshots of the PLACED POIs, keyed by id.
 *
 * ATN populate the map incrementally — on 2026-07-29 they placed 4 of ~20 stages
 * and left two markers unnamed and uncoordinated — so a one-shot "the map is
 * live" signal announces the first batch and then goes silent for everything
 * after it. Keying by id means a rename in place reads as a move rather than as
 * a removal plus an addition, which matters because these records get renamed to
 * their sponsored names ("Born Social" -> "Born Social by Schweppes").
 */
export function diffPlacedPois(
  prev: AppmiralPoi[],
  next: AppmiralPoi[],
): { added: AppmiralPoi[]; removed: AppmiralPoi[]; moved: PlacedMove[] } {
  const byId = (list: AppmiralPoi[]) => new Map(list.map((p) => [String(p.id), p]));
  const before = byId(prev);
  const after = byId(next);

  const added = next.filter((p) => !before.has(String(p.id)));
  const removed = prev.filter((p) => !after.has(String(p.id)));
  const moved: PlacedMove[] = [];

  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) continue;
    const metres = haversineMeters(poiCentre(was), poiCentre(now));
    if (metres >= MOVE_THRESHOLD_M || was.name !== now.name) {
      moved.push({ id: now.id, name: now.name ?? "(unnamed)", metres: Math.round(metres) });
    }
  }
  return { added, removed, moved };
}

function placedBaselineFile(): string {
  return join(cacheDir(ACTIVE_FESTIVAL), "map_placed_ref.json");
}

export async function runMapCheck(): Promise<void> {
  const xProtect = loadSecrets().appmiral?.xProtect;
  if (!xProtect) return void console.log("MAP CHECK ERROR: no appmiral.xProtect in secrets");

  const cfg = { event: APPMIRAL_EVENT, edition: APPMIRAL_EDITION, xProtect };
  const maps = await fetchAppmiralMaps(cfg);
  if (maps.length === 0) return; // not published yet — silent tick, same as schedule-tick

  const pois = await fetchAppmiralPois(cfg);
  const useful = informationalPois(maps[0]!, pois);

  // Keep the raw dump fresh even while only the raster exists — the corner tiles
  // carry the georeference, which is worth having on disk.
  const file = rawFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ map: maps[0], pois }, null, 2));

  // Diff rather than fire once: ATN place these incrementally (4 of ~20 stages on
  // 2026-07-29), so a one-shot signal reports the first batch and then goes quiet
  // for every stage after it.
  const ref = placedBaselineFile();
  const prev: AppmiralPoi[] = existsSync(ref) ? JSON.parse(readFileSync(ref, "utf8")) : [];
  const { added, removed, moved } = diffPlacedPois(prev, useful);
  if (!added.length && !removed.length && !moved.length) return;

  writeFileSync(ref, JSON.stringify(useful, null, 2));
  console.log(
    `MAP POIS (${ACTIVE_FESTIVAL}): ${added.length} placed, ${removed.length} removed, ${moved.length} moved (${useful.length} total)`,
  );
  for (const p of added) console.log(`  PLACED:  ${p.name ?? "(unnamed)"}`);
  for (const p of removed) console.log(`  REMOVED: ${p.name ?? "(unnamed)"}`);
  for (const m of moved) console.log(`  MOVED:   ${m.name} (${m.metres}m)`);
}

function nearestByCategory(
  map: AppmiralMap,
  pois: AppmiralPoi[],
): Map<string, Array<{ name: string; pos: { lat: number; lng: number } }>> {
  const catIdByName = new Map(map.categories.map((c) => [c.name, c.id]));
  const out = new Map<string, Array<{ name: string; pos: { lat: number; lng: number } }>>();
  for (const catName of AMENITY_CATEGORIES) {
    const cid = catIdByName.get(catName);
    if (cid === undefined) continue;
    const matches = pois
      .filter((p) => p.category_id === cid && p.coordinates && p.coordinates.length > 0)
      .map((p) => ({ name: p.name ?? "(unnamed)", pos: poiCentroid(p.coordinates!) }));
    if (matches.length > 0) out.set(catName, matches);
  }
  return out;
}

export interface StageAmenities {
  stage: string;
  nearest: Record<string, { name: string; meters: number }>;
}

export function computeStageAmenities(map: AppmiralMap, pois: AppmiralPoi[]): StageAmenities[] {
  const stageCatId = map.categories.find((c) => c.name === "Stages")?.id;
  const stages = pois.filter((p) => p.category_id === stageCatId && p.coordinates && p.coordinates.length > 0);
  const amenities = nearestByCategory(map, pois);

  return stages.map((stage) => {
    const spos = poiCentroid(stage.coordinates!);
    const nearest: Record<string, { name: string; meters: number }> = {};
    for (const [cat, options] of amenities) {
      if (options.length === 0) continue;
      let best = options[0]!;
      let bestDist = haversineMeters(spos, best.pos);
      for (const o of options.slice(1)) {
        const d = haversineMeters(spos, o.pos);
        if (d < bestDist) {
          best = o;
          bestDist = d;
        }
      }
      nearest[cat] = { name: best.name, meters: Math.round(bestDist) };
    }
    return { stage: stage.name ?? "(unnamed)", nearest };
  });
}

export function runAmenities(args: string[]): void {
  // 2026 has no POI data — the map is an image — so prefer the pixel dataset read
  // off it when the festival ships one.
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
    console.log(`(from the 2026 site-map image, ${mpp.toFixed(3)} m/px — straight-line estimates)\n`);
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
  const { map, pois } = JSON.parse(readFileSync(file, "utf8")) as { map: AppmiralMap; pois: AppmiralPoi[] };
  const result = computeStageAmenities(map, pois).sort((a, b) => a.stage.localeCompare(b.stage));

  if (args.includes("--json")) return void console.log(JSON.stringify(result, null, 2));

  for (const s of result) {
    console.log(`## ${s.stage}`);
    for (const [cat, v] of Object.entries(s.nearest)) {
      console.log(`  ${cat.padEnd(18)} ${v.name.padEnd(30)} ~${v.meters}m`);
    }
    console.log("");
  }
}
