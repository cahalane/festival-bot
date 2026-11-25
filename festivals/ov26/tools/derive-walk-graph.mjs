// Derive ov26 walk edges from knowledge/venue_coords.json (OSM) with the repo heuristic
// (docs/setup/walk-graph.md): minutes = round(haversine m * 1.3 / 1.1 m/s / 60), min 1.
// Run from repo root: node festivals/ov26/tools/derive-walk-graph.mjs
import { readFileSync, writeFileSync } from "node:fs";
const PATH_FACTOR = 1.3, WALK_MPS = 1.1, PAIDI_BUS_MIN = 30;
const { coords } = JSON.parse(readFileSync("festivals/ov26/knowledge/venue_coords.json", "utf8"));
const hav = ([la1, lo1], [la2, lo2]) => {
  const R = 6371000, r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
const slugs = Object.keys(coords).sort();
const edges = [];
for (let i = 0; i < slugs.length; i++)
  for (let j = i + 1; j < slugs.length; j++) {
    const m = hav(coords[slugs[i]], coords[slugs[j]]);
    edges.push([slugs[i], slugs[j], Math.max(1, Math.round((m * PATH_FACTOR) / WALK_MPS / 60))]);
  }
// Páidí Ó Sé's (Ventry, ~8 km): shuttle bus, not a walk. Flat estimate to every town venue.
const V = JSON.parse(readFileSync("festivals/ov26/venues.json", "utf8"));
// Only positioned venues: an unpositioned one (e.g. wave) must stay OFF-graph so it gets
// defaultMinutes — a bus edge would make Ventry its only link and route town walks via it.
for (const s of slugs) edges.push([s, "paidi-o-ses", PAIDI_BUS_MIN]);
V.walk = { defaultMinutes: 10, edges };
writeFileSync("festivals/ov26/venues.json", JSON.stringify(V, null, 2) + "\n");
const walk = edges.filter((e) => e[1] !== "paidi-o-ses").sort((a, b) => b[2] - a[2]);
console.log(`edges: ${edges.length} (${walk.length} walk among ${slugs.length} OSM-positioned venues + ${edges.length - walk.length} bus to paidi-o-ses)`);
console.log(`longest walk: ${walk[0].join(" ")}m; median ${walk[walk.length >> 1][2]}m`);
