import { readFileSync, writeFileSync } from "node:fs";
import { loadBundleFrom } from "/home/colm/festival-bot/festivals/ep26/src/lineup.ts";
import { parseGreencopperLineup, greencopperSlugify, greencopperArtistInfoMap } from "/home/colm/festival-bot/packages/adapters/src/greencopper.ts";
import { htmlToBlurb } from "/home/colm/festival-bot/packages/adapters/src/clashfinder-export.ts";
const T="/home/colm/.claude/jobs/5834c5c1/tmp", R="/home/colm/festival-bot/festivals/ep26";
const bundle=loadBundleFrom(`${R}/bundle`);
const app=parseGreencopperLineup(bundle);
const info=greencopperArtistInfoMap(bundle);
const extra=JSON.parse(readFileSync(`${R}/extra-sets.json`,"utf8")).sets
  .map(s=>({name:s.name,stage:s.stage,start:new Date(s.start),end:new Date(s.end)}));
const cf=JSON.parse(readFileSync(`${T}/cf_live.json`,"utf8"));
const gap=JSON.parse(readFileSync(`${T}/gap3.json`,"utf8"));
const g4=JSON.parse(readFileSync(`${T}/gap4.json`,"utf8"));

// ---- rule 1: spelling. accept genuine corrections, reject verbose expansions.
const ACCEPT=new Set(["Newwra","Claudio O","SEANAM","Ravyn Levae","DJ Bonjani","Shiloh Gray"]);
const spellFix=new Map();           // CF name -> our better name
const spellKeep=[];                 // CF name kept as-is
for(const s of g4.spell){
  if(ACCEPT.has(s.name)) spellFix.set(s.name,s.ours);
  else spellKeep.push({cf:s.name,ours:s.ours,
    why: s.ours.length>s.name.length+12 ? "ours is a verbose expansion" : "CF form is more readable"});
}
// ---- rule 2: Anachronica is CF's 2025 paste -> ours wins (verified: nialler9, Jul 2025)
const CF_2025_STAGE="Anachronica";
// ---- rule 3: self-announced stages + gap-fillers -> accept CF's incoming
const accepted=gap.real.map(c=>({...c,reason:c.why}));
const hazelConflicts=g4.conflict.filter(c=>c.loc==="Hazelwood - Chollchoill");

const fmt=d=>{const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Dublin",hour12:false,
 year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(d)
 .reduce((o,x)=>(x.type!=="literal"&&(o[x.type]=x.value),o),{});
 return `${p.year}-${p.month}-${p.day} ${p.hour==="24"?"00":p.hour}:${p.minute}`;};
const stageDisp=new Map();
for(const st of bundle.stages){const n=bundle.strings[st.name]; if(n){const c=n.replace(/\s+/g," ").trim();stageDisp.set(greencopperSlugify(c),c);} }
const CFLOC={"hazelwood-an-chollchoill":"Hazelwood - Chollchoill","anachronica":"Anachronica",
 "glow-depot-stage":"Glow Depot","glow-depot-court-side":"Glow Depot - Courtside Stage",
 "mindfield-leviathan":"Minefield - Leviathan","artlot-main-stage":"Artlot",
 "transmission":"Transmission","croi-crescent-earth":"Croi - Crescent Earth",
 "rankins-wood":"Rankins Wood","smirnoff-stage":"Smirnoff Stage"};
const disp=s=>CFLOC[s]||stageDisp.get(s)||s;

const out=[]; let nb=0;
const push=(name,stage,start,end,src)=>{
  const a={start:fmt(start),end:fmt(end),stage,act:name};
  const b=htmlToBlurb(info.get(greencopperSlugify(name))?.bio||"");
  if(b){a.blurb=b;nb++;}
  out.push({...a,_src:src});
};
for(const s of app) push(s.name,disp(s.stage),s.start,s.end,"app");
for(const s of extra) push(s.name,disp(s.stage),s.start,s.end,"irish-times");
// accepted CF incoming
const P=t=>new Date(t.replace(" ","T")+":00+01:00");
for(const c of accepted) push(c.name,c.loc,P(c.start),P(c.end||c.start),"cf-accepted");
for(const c of hazelConflicts) push(c.name,c.loc,P(c.start),P(c.end||c.start),"cf-hazelwood");
// drop OUR entries that the Hazelwood conflict replaces
const drop=new Set(hazelConflicts.map(c=>`${c.loc}|${c.start}`));
const final=out.filter(a=>!(drop.has(`${a.stage}|${a.start}`)&&a._src==="app"));
// apply accepted spelling fixes to any CF-sourced name
for(const a of final) if(spellFix.has(a.act)) a.act=spellFix.get(a.act);

writeFileSync(`${T}/final.json`,JSON.stringify({final,spellFix:[...spellFix],spellKeep,
  accepted:accepted.length,hazel:hazelConflicts.length,blurbs:nb},null,1));
console.log(`acts        : ${final.length}  (app ${app.length}, IT ${extra.length}, CF-accepted ${accepted.length}, CF-hazelwood ${hazelConflicts.length})`);
console.log(`blurbs      : ${nb}`);
console.log(`spelling    : ${spellFix.size} accepted, ${spellKeep.length} rejected`);
console.log(`Anachronica : ours kept (${app.filter(s=>s.stage==="anachronica").length} sets), CF's 2025 paste not merged`);
