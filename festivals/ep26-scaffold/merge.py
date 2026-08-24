import json,re,unicodedata
from datetime import datetime,timedelta

def norm(s):
    if not s: return ""
    s=unicodedata.normalize('NFKD',s)
    s=''.join(c for c in s if not unicodedata.combining(c))
    s=s.lower()
    s=re.sub(r'\b(the|a|an)\b','',s)
    s=re.sub(r'[^a-z0-9]+','',s)
    return s

# ---------- app (Greencopper v39) ----------
D="dec39"
S=json.load(open(f"{D}/core/strings/en-GB.json"))
items=json.load(open(f"{D}/event/data/scheduleItems.json"))
slots=json.load(open(f"{D}/event/data/timeSlots.json"))
stages=json.load(open(f"{D}/event/data/stages.json"))
stagename={st['id']:S.get(st['name']) for st in stages if S.get(st['name'])}
slotby={}
for ts in slots: slotby.setdefault(ts['scheduleItemId'],[]).append(ts)
app=[]; app_nostage=[]
for it in items:
    nm=S.get(it['name'])
    if not nm: continue
    stg=stagename.get(it.get('stageId'))
    for ts in slotby.get(it['id'],[]):
        if not ts.get('startDate'): continue
        rec=dict(name=nm,stage=stg,start=ts['startDate'],end=ts.get('endDate'))
        (app if stg else app_nostage).append(rec)

# ---------- Irish Times ----------
IT=json.load(open("scaffold/irish-times-sets.json"))
itstage={s['slug']:s['name'] for s in IT['stages']}
it=[]
for s in IT['sets']:
    day=IT['days'][s['day']]
    def mk(t):
        h,m=map(int,t.split(':'))
        base=datetime.fromisoformat(day)
        return (base+timedelta(hours=h,minutes=m)).strftime("%Y-%m-%d %H:%M")
    it.append(dict(name=s['name'],stage=itstage[s['stage']],start=mk(s['start']),end=mk(s['end']),slug=s['stage']))

# ---------- Clashfinder current ----------
cf=json.load(open("cf_ep26.json"))
cfsets=[]
for L in cf['locations']:
    for e in (L.get('events') or []):
        cfsets.append(dict(name=e.get('name'),stage=L.get('name'),start=e.get('start'),end=e.get('end'),short=e.get('short')))

print(f"APP  : {len(app):5} sets on {len({a['stage'] for a in app})} stages  (+{len(app_nostage)} with no stage)")
print(f"IT   : {len(it):5} sets on {len({i['stage'] for i in it})} stages")
print(f"CF   : {len(cfsets):5} acts on {len({c['stage'] for c in cfsets})} locations")
print()

# ---------- what a push of (app+IT) would do to CF ----------
ours = app+it
ours_names={norm(x['name']) for x in ours}
cf_names={norm(c['name']) for c in cfsets}

only_cf = sorted({norm(c['name']):c['name'] for c in cfsets if norm(c['name']) not in ours_names}.items())
only_ours= sorted({norm(x['name']):x['name'] for x in ours if norm(x['name']) not in cf_names}.items())

print(f"### ON CF BUT NOT IN OUR MERGED DATA -> A FULL PUSH WOULD DELETE THESE: {len(only_cf)}")
for k,v in only_cf[:40]: print("   -",v)
if len(only_cf)>40: print(f"   ... +{len(only_cf)-40} more")
print()
print(f"### IN OUR DATA BUT NOT ON CF -> would be ADDED: {len(only_ours)}")
for k,v in only_ours[:25]: print("   +",v)
if len(only_ours)>25: print(f"   ... +{len(only_ours)-25} more")

json.dump(dict(app=app,it=it,cf=cfsets,app_nostage=app_nostage),open("merged.json","w"),indent=1)
