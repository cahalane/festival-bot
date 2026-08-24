import json,re,unicodedata,difflib
from collections import defaultdict,OrderedDict
M=json.load(open("merged.json")); C=json.load(open("classified.json"))
SM=json.load(open("scaffold/stage-map.json"))
ours_to_cf={m['ours']:m['cf'] for m in SM['mapped']}
prio={m['ours']:m['priority'] for m in SM['mapped']}
preserve=set(SM['cf_only_MUST_PRESERVE']['locations'])
genuine={(g['stage'],g['name'],g['start']) for g in C['genuine']}
variant_cf={(c['stage'],c['name'],c['start']) for c,o,r in C['variants']}

cf_by_loc=defaultdict(list)
for c in M['cf']: cf_by_loc[c['stage']].append(c)

ours=[dict(x,src='app') for x in M['app']]+[dict(x,src='it') for x in M['it']]

# ---- UNION MERGE ----
out=OrderedDict()
# 1. seed with EVERY existing CF location + act (nothing is ever dropped)
for loc,acts in cf_by_loc.items():
    out[loc]=list(acts)
# 2. overlay ours onto the mapped CF location (or a new one)
added=0; updated=0
def norm(s):
    s=unicodedata.normalize('NFKD',s or ''); s=''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+','',s.lower())
def tkey(t): return (t or '').replace("T"," ")[:16]
for o in ours:
    loc = ours_to_cf.get(o['stage']) or o['stage']
    bucket = out.setdefault(loc,[])
    # match existing act by fuzzy name at same start
    hit=None
    for e in bucket:
        if tkey(e['start'])==tkey(o['start']) and difflib.SequenceMatcher(None,norm(e['name']),norm(o['name'])).ratio()>=0.75:
            hit=e;break
    if hit: updated+=1
    else: bucket.append(dict(name=o['name'],start=tkey(o['start']),end=tkey(o.get('end')),_new=True)); added+=1

total_after=sum(len(v) for v in out.values())
print("================ DRY RUN: UNION MERGE ================")
print(f"CF before          : {len(M['cf']):5} acts / {len(cf_by_loc)} locations")
print(f"ours (app+IT)      : {len(ours):5} sets")
print(f"CF after (proposed): {total_after:5} acts / {len(out)} locations")
print(f"   acts ADDED      : {added}")
print(f"   acts matched/kept: {updated}")
print(f"   locations created: {len(out)-len(cf_by_loc)}")
print()
# ---- SAFETY ASSERTIONS ----
before={(c['stage'],c['name'],c['start']) for c in M['cf']}
after=set()
for loc,acts in out.items():
    for a in acts:
        if not a.get('_new'): after.add((loc,a['name'],a['start']))
lost=before-after
print("---------------- SAFETY CHECKS ----------------")
print(f"[{'PASS' if not lost else 'FAIL'}] every pre-existing CF act survives : {len(before)-len(lost)}/{len(before)} kept, {len(lost)} lost")
missing_loc=[l for l in preserve if l not in out]
print(f"[{'PASS' if not missing_loc else 'FAIL'}] all {len(preserve)} CF-only locations preserved : {missing_loc or 'none missing'}")
g_kept=sum(1 for (s,n,st) in genuine if (s,n,st) in after)
print(f"[{'PASS' if g_kept==len(genuine) else 'FAIL'}] all {len(genuine)} genuinely-CF-only acts preserved : {g_kept}/{len(genuine)}")
scratch=[l for l in ('ACTS LIST TEMP','ACTS LIST TEMP 2','ACTS LIST TEMP 3')]
sc_ok=all(len(out[l])==len(cf_by_loc[l]) for l in scratch)
print(f"[{'PASS' if sc_ok else 'FAIL'}] maintainer scratch lists untouched : "+", ".join(f"{l}={len(cf_by_loc[l])}->{len(out[l])}" for l in scratch))
dupes=[(l,len(a)) for l,a in out.items() if len({(x['name'],x['start']) for x in a})!=len(a)]
print(f"[{'PASS' if not dupes else 'WARN'}] no duplicate act+time within a location : {len(dupes)} location(s) with dupes")
print()
print("---------------- MAIN ARENAS AFTER MERGE (priority 0-4) ----------------")
for m in sorted([m for m in SM['mapped'] if m['priority']<=4],key=lambda m:m['priority']):
    loc=m['cf'] or m['ours']
    b=len(cf_by_loc.get(loc,[])); a=len(out.get(loc,[]))
    print(f"  p{m['priority']}  {loc:22} {b:3} -> {a:3}  (+{a-b})")
json.dump({k:v for k,v in out.items()},open("proposed_ep26.json","w"),indent=1)
