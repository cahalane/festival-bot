import { readFileSync, writeFileSync } from "node:fs";
import { loadBundleFrom } from "/home/colm/festival-bot/festivals/ep26/src/lineup.ts";
import { parseGreencopperLineup } from "/home/colm/festival-bot/packages/adapters/src/greencopper.ts";
const T="/home/colm/.claude/jobs/5834c5c1/tmp";
const app=parseGreencopperLineup(loadBundleFrom("/home/colm/festival-bot/festivals/ep26/bundle"));
const fmt=d=>{const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Dublin",hour12:false,
 year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(d)
 .reduce((o,x)=>(x.type!=="literal"&&(o[x.type]=x.value),o),{});
 return `${p.year}-${p.month}-${p.day} ${p.hour==="24"?"00":p.hour}:${p.minute}`;};
const norm=s=>(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
// every act name the APP publishes (any stage/time)
const appNames=new Set(app.map(s=>norm(s.name)));
// app acts keyed by exact start minute
const appAt=new Map();
for(const s of app){const k=fmt(s.start); (appAt.get(k)||appAt.set(k,[]).get(k)).push(s.name);}
const d=JSON.parse(readFileSync(`${T}/cf_show.json`,"utf8"));
const groups=new Map();
for(const L of d.locations) for(const e of (L.events||[])){
  const k=`${L.name}|${e.start}|${e.end}`;
  (groups.get(k)||groups.set(k,[]).get(k)).push(e.name);
}
console.log("RESOLUTION of each co-billed slot (app takes precedence):\n");
const drop=[];
for(const [k,names] of groups){
  if(names.length<2) continue;
  const [loc,st]=k.split("|");
  if(loc==="Croi Serenity Gardens - Soft Landing") continue;
  const inApp=names.filter(n=>appNames.has(norm(n)));
  const notApp=names.filter(n=>!appNames.has(norm(n)));
  console.log(`  ${loc}  ${st.slice(5,16)}`);
  for(const n of names) console.log(`      ${appNames.has(norm(n))?"APP  ":"cf   "} ${n}`);
  if(inApp.length>=1 && notApp.length>=1){
    for(const n of notApp) drop.push({loc,start:st,name:n});
    console.log(`      -> keep ${inApp.length} app, drop ${notApp.length} cf-only`);
  } else console.log(`      -> both same source, LEAVE`);
  console.log();
}
writeFileSync(`${T}/cobill_drop.json`,JSON.stringify(drop,null,1));
console.log("total rows to drop:",drop.length);
