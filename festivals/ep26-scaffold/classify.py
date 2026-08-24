import json,re,unicodedata,difflib
from collections import defaultdict
M=json.load(open("merged.json"))
ours=M['app']+M['it']; cfsets=M['cf']

def norm(s):
    if not s: return ""
    s=unicodedata.normalize('NFKD',s); s=''.join(c for c in s if not unicodedata.combining(c))
    s=re.sub(r'[^a-z0-9]+','',s.lower())
    return s
def tkey(t):
    if not t: return None
    t=t.replace("T"," ")[:16].replace("-","").replace(" ","").replace(":","")
    return t

# index ours by start-minute
by_start=defaultdict(list)
for o in ours:
    by_start[tkey(o['start'])].append(o)
ours_norm={norm(o['name']) for o in ours}

def near(a,b): return difflib.SequenceMatcher(None,a,b).ratio()

variants=[]; genuine=[]
for c in cfsets:
    n=norm(c['name'])
    if n in ours_norm: continue
    # same start minute -> compare names
    cands=by_start.get(tkey(c['start']),[])
    best=None;bestr=0
    for o in cands:
        r=near(n,norm(o['name']))
        if r>bestr: bestr, best = r, o
    if best and bestr>=0.75:
        variants.append((c,best,round(bestr,2))); continue
    # fall back: global fuzzy on name only
    gb=None;gr=0
    for o in ours:
        r=near(n,norm(o['name']))
        if r>gr: gr,gb=r,o
    if gb and gr>=0.88:
        variants.append((c,gb,round(gr,2)))
    else:
        genuine.append(c)

print(f"CF acts not exactly matched : {len(variants)+len(genuine)}")
print(f"  -> spelling/format VARIANTS of acts we have : {len(variants)}")
print(f"  -> GENUINELY only on Clashfinder            : {len(genuine)}")
print()
print("=== SAMPLE VARIANTS (CF name  ~=  our name) ===")
for c,o,r in variants[:15]:
    print(f"  {r}  {c['name'][:42]:44} ~= {o['name'][:42]}")
print()
print(f"=== GENUINELY CF-ONLY — THESE WOULD BE DESTROYED BY A FULL PUSH ({len(genuine)}) ===")
bystage=defaultdict(list)
for c in genuine: bystage[c['stage']].append(c)
for stg in sorted(bystage,key=lambda s:-len(bystage[s])):
    print(f"  [{len(bystage[stg]):3}] {stg}")
    for c in bystage[stg][:4]:
        print(f"         {c['start']}  {c['name'][:60]}")
json.dump(dict(variants=[(c,o,r) for c,o,r in variants],genuine=genuine),open("classified.json","w"),indent=1)
