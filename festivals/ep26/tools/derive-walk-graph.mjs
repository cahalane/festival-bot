import { readFileSync, writeFileSync } from "node:fs";
import { haversineMeters } from "/home/colm/festival-bot/packages/adapters/src/appmiral-map.ts";
const PATH_FACTOR=1.3, WALK_MPS=1.1, T="/home/colm/.claude/jobs/5834c5c1/tmp";
const geo=JSON.parse(readFileSync(`${T}/stages_geo.json`,"utf8"));
const der=JSON.parse(readFileSync(`${T}/derived_coords.json`,"utf8"));
const GPSMAP={"Main Stage":"main-stage-presented-by-3","Electric Arena":"electric-arena",
 "Rankings Wood":"rankins-wood","Terminus":"red-bull-x-terminus","Comedy Tent":"comedy-arena",
 "Salty Dog":"salty-dog","The Theatre":"the-theatre","Circus":"fosset-s-circus"};
const pt={}, src={};
for(const f of geo.features){
  const s=GPSMAP[(f.properties.NAME||"").trim()]; if(!s) continue;
  const [lng,lat]=f.geometry.coordinates; pt[s]={lat,lng}; src[s]="gps2025";
}
for(const [s,v] of Object.entries(der)){ if(!pt[s]){ pt[s]={lat:v.lat,lng:v.lng}; src[s]="map2024"; } }
const slugs=Object.keys(pt).sort();
const edges=[];
for(let i=0;i<slugs.length;i++)for(let j=i+1;j<slugs.length;j++){
  const a=slugs[i],b=slugs[j], m=haversineMeters(pt[a],pt[b]);
  edges.push([a,b,Math.max(1,Math.round(m*PATH_FACTOR/WALK_MPS/60)),Math.round(m),
              src[a]==="gps2025"&&src[b]==="gps2025"?"gps":"map"]);
}
const V=JSON.parse(readFileSync("festivals/ep26/venues.json","utf8"));
V.walk={defaultMinutes:12,edges:edges.map(([a,b,m])=>[a,b,m])};
V._note=`Walk edges cover ${slugs.length} of ${V.venues.length} stages. See knowledge/walk-graph.md: `+
  `8 positions are GPS-surveyed (Garda 2025 layer), the rest derived from the 2024 festival map `+
  `(median 38 m residual against those 8). The remaining ${V.venues.length-slugs.length} stages fall back to defaultMinutes: 12, which is a placeholder, not a measurement.`;
writeFileSync("festivals/ep26/venues.json",JSON.stringify(V,null,2)+"\n");
const mins=edges.map(e=>e[2]).sort((a,b)=>a-b);
console.log(`stages positioned : ${slugs.length} (gps ${Object.values(src).filter(v=>v==="gps2025").length}, map ${Object.values(src).filter(v=>v==="map2024").length})`);
console.log(`edges             : ${edges.length}`);
console.log(`minutes           : min ${mins[0]}  median ${mins[mins.length>>1]}  max ${mins.at(-1)}`);
console.log("\nsanity — from Main Stage:");
for(const e of edges.filter(e=>e[0]==="main-stage-presented-by-3"||e[1]==="main-stage-presented-by-3")
   .sort((a,b)=>a[2]-b[2]))
  console.log(`   ${String(e[2]).padStart(2)}m ${String(e[3]).padStart(4)}m [${e[4]}] ${e[0]==="main-stage-presented-by-3"?e[1]:e[0]}`);
