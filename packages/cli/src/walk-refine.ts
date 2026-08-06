/**
 * `walk-refine` — recompute venues.json's walk-graph edges from real stage
 * coordinates in the cached Appmiral map dump (cache/<festival>/map_raw.json,
 * written by `map-check`). Same shape as `schedule-watch`: prints a diff by
 * default, only writes venues.json with `--commit`.
 *
 * Method: haversine(stageA, stageB) x PATH_FACTOR / WALK_MPS, rounded to the
 * nearest minute (min 1). The two constants are estimates, not measured — see
 * festivals/<slug>/knowledge/walk-graph.md for the reasoning and caveats. Only
 * edges where BOTH stages have a matched real-coordinate POI are touched; the
 * rest keep their existing (eyeballed/older) estimate untouched.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppmiralMap, AppmiralPoi } from "@festival-bot/adapters";
import { poiCentroid, haversineMeters } from "@festival-bot/adapters";
import { REPO_ROOT, cacheDir } from "./config.js";
import { ACTIVE_FESTIVAL } from "./festivals.js";

const PATH_FACTOR = 1.3; // real footpaths aren't straight lines
const WALK_MPS = 1.1; // crowd walking pace

interface RawVenues {
  _note?: string;
  venues: { slug: string; name: string }[];
  limitedCapacity: string[];
  walk: { defaultMinutes?: number; edges: Array<[string, string, number]> };
}

/**
 * Match each venue slug to a real-coordinate "Stages" POI by NAME. Sponsor names
 * drift year to year (e.g. "Lovely Days With Guinness" -> "Road To Nowhere") so an
 * exact-name match will usually miss most stages — pass `nameMap` (2025-name ->
 * 2026-slug) for a historical dump; omit it when the dump is already the active
 * festival's own edition (names should match venues.json directly by then).
 */
export function matchStageCoords(
  map: AppmiralMap,
  pois: AppmiralPoi[],
  venues: { slug: string; name: string }[],
  nameMap?: Record<string, string>,
): Map<string, { lat: number; lng: number }> {
  // Pop-up venues are sometimes BARS, not stages (Heineken Garden), so match
  // across both categories rather than stages alone.
  const stageCats = new Set(
    map.categories.filter((c) => c.name === "Stages" || c.name === "Bars").map((c) => c.id),
  );
  const byName = new Map<string, { lat: number; lng: number }>();
  for (const p of pois) {
    if (!stageCats.has(p.category_id as number) || !p.coordinates || p.coordinates.length === 0) continue;
    if (p.name) byName.set(p.name, poiCentroid(p.coordinates));
  }

  const out = new Map<string, { lat: number; lng: number }>();
  const bySlug = new Map(venues.map((v) => [v.name, v.slug]));
  for (const [poiName, slug] of Object.entries(nameMap ?? {})) {
    const pos = byName.get(poiName);
    if (pos) out.set(slug, pos);
  }
  if (!nameMap) {
    for (const [name, pos] of byName) {
      const slug = bySlug.get(name);
      if (slug) out.set(slug, pos);
    }
  }
  return out;
}

export interface RefineRow {
  a: string;
  b: string;
  curMin: number;
  estMin: number;
  deltaMin: number;
  meters: number;
}

/** Minutes for a real-coordinate pair — the single distance model for the graph. */
function walkMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.max(1, Math.round((haversineMeters(a, b) * PATH_FACTOR) / WALK_MPS / 60));
}

/**
 * Create edges for coordinate-bearing pairs that don't have one yet.
 *
 * `refineEdges` maps over the edges that already exist, so a stage added to the
 * lineup after the graph was built gets no edges at all and silently routes on
 * `defaultMinutes` (12). That has now happened twice — the Big Romance Dome in
 * July, then `all-curious-minds` turning up on 2026-07-29 already carrying three
 * sets. A missing edge is invisible in a way a wrong edge isn't: nothing errors,
 * the planner just quietly assumes twelve minutes.
 */
export function addMissingEdges(
  edges: Array<[string, string, number]>,
  coords: Map<string, { lat: number; lng: number }>,
  slugs: string[],
): { edges: Array<[string, string, number]>; added: RefineRow[] } {
  const have = new Set(edges.map(([a, b]) => [a, b].sort().join("|")));
  const added: RefineRow[] = [];
  const out = [...edges];
  const sorted = [...slugs].sort();

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (have.has([a, b].sort().join("|"))) continue;
      const pa = coords.get(a);
      const pb = coords.get(b);
      if (!pa || !pb) continue;
      const estMin = walkMinutes(pa, pb);
      out.push([a, b, estMin]);
      added.push({ a, b, curMin: 0, estMin, deltaMin: estMin, meters: Math.round(haversineMeters(pa, pb)) });
    }
  }
  out.sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
  return { edges: out, added };
}

export function refineEdges(
  edges: Array<[string, string, number]>,
  coords: Map<string, { lat: number; lng: number }>,
): { newEdges: Array<[string, string, number]>; changed: RefineRow[] } {
  const changed: RefineRow[] = [];
  const newEdges: Array<[string, string, number]> = edges.map(([a, b, curMin]) => {
    const pa = coords.get(a);
    const pb = coords.get(b);
    if (!pa || !pb) return [a, b, curMin];
    const meters = haversineMeters(pa, pb);
    const estMin = Math.max(1, Math.round(((meters * PATH_FACTOR) / WALK_MPS) / 60));
    if (estMin !== curMin) changed.push({ a, b, curMin, estMin, deltaMin: estMin - curMin, meters: Math.round(meters) });
    return [a, b, estMin];
  });
  return { newEdges, changed };
}

export function runWalkRefine(args: string[]): void {
  const rawFile = join(cacheDir(ACTIVE_FESTIVAL), "map_raw.json");
  if (!existsSync(rawFile)) {
    console.log(`no map data cached yet for ${ACTIVE_FESTIVAL} (${rawFile} missing) — run map-check first.`);
    return;
  }
  const venuesPath = join(REPO_ROOT, "festivals", ACTIVE_FESTIVAL, "venues.json");
  const venuesRaw = JSON.parse(readFileSync(venuesPath, "utf8")) as RawVenues;
  const { map, pois } = JSON.parse(readFileSync(rawFile, "utf8")) as { map: AppmiralMap; pois: AppmiralPoi[] };

  // ATN's own POI names don't always match the lineup feed's venue names, even
  // within the same edition — "ATN Main" vs "ATN Main Stage", and a stray "The"
  // on the Big Romance Dome. Two stages with real coordinates were being skipped
  // over a definite article, so map the near-misses rather than rename our
  // venues (those names come from the lineup feed and are what users see).
  const ALIASES: Record<string, string> = {
    "ATN Main": "atn-main-stage",
    "The Big Romance Dome x Altos": "the-big-romance-dome-x-altos",
    // The lineup feed spells it "Seanchoíche"; slugify strips the accented í to
    // "seancho-che", while ATN's map POI drops the accent entirely. Two
    // different manglings of one stage, so it needs an explicit bridge.
    Seanchoiche: "seancho-che",
    // Not a "Stages" POI — it is a BAR that ATN drop pop-ups into (the Mary
    // Wallopers, 2026-08-01). Aliased so it gets real edges rather than the
    // 12-minute default.
    "Heineken Garden": "heineken-garden",
  };
  const coords = matchStageCoords(map, pois, venuesRaw.venues);
  const aliased = matchStageCoords(map, pois, venuesRaw.venues, ALIASES);
  for (const [slug, pos] of aliased) if (!coords.has(slug)) coords.set(slug, pos);
  // Create edges for any venue that has a coordinate but no edges yet — a stage
  // added after the graph was built would otherwise route on defaultMinutes.
  const withNew = addMissingEdges(venuesRaw.walk.edges, coords, venuesRaw.venues.map((v) => v.slug));
  if (withNew.added.length) console.log(`${withNew.added.length} MISSING edges created (new venue):`);
  for (const r of withNew.added.slice(0, 8)) console.log(`  + ${r.a} <-> ${r.b}: ${r.estMin}min (${r.meters}m)`);
  const { newEdges, changed } = refineEdges(withNew.edges, coords);

  console.log(`${coords.size}/${venuesRaw.venues.length} stages matched to real coordinates.`);
  console.log(`${changed.length}/${venuesRaw.walk.edges.length} edges would change:`);
  for (const c of changed.sort((x, y) => Math.abs(y.deltaMin) - Math.abs(x.deltaMin)).slice(0, 25)) {
    console.log(`  ${c.a} <-> ${c.b}: ${c.curMin}min -> ${c.estMin}min (${c.deltaMin > 0 ? "+" : ""}${c.deltaMin}, ${c.meters}m)`);
  }

  if (args.includes("--commit")) {
    venuesRaw.walk.edges = newEdges;
    writeFileSync(venuesPath, JSON.stringify(venuesRaw, null, 2) + "\n");
    console.log("[venues.json updated]");
  } else {
    console.log("(dry run — pass --commit to write venues.json)");
  }
}
