import json,re,unicodedata,os
from collections import OrderedDict
T=os.path.dirname(os.path.abspath(__file__))
new=json.load(open(f"{T}/cf_ep26_now.json"))
add=json.load(open(f"{T}/to_add.json"))
COR=json.load(open(f"{T}/corrections.json"))["fix"]
SM=json.load(open(f"{T}/scaffold/stage-map.json")); o2c={m['ours']:m['cf'] for m in SM['mapped'] if m['cf']}
bios=json.load(open(f"{T}/bios.json"))
mbids=json.load(open(f"{T}/mbids.json")) if os.path.exists(f"{T}/mbids.json") else {}
def slug(s):
    s=unicodedata.normalize('NFKD',s or ''); s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def strip_html(h):
    h=re.sub(r'<[^>]+>',' ',h or ''); h=h.replace('&nbsp;',' ').replace('&amp;','&').replace('&#39;',"'").replace('&quot;','"')
    return re.sub(r'\s+',' ',h).strip()
tk=lambda t:(t or '').replace("T"," ")[:16]
# App stage names carry stray double spaces ("Croi  - Serenity Gardens Stage");
# collapse them so the mirror does not show the artefact.
sq=lambda s: re.sub(r'\s+',' ',(s or '')).strip()
bio_by_slug={k:v.get('bio','') for k,v in bios.items()}

acts=[]; stage_order=[]; corrected=0; bio_n=0; mb_n=0
# 1. every existing CF act, verbatim except curated name fixes
for L in new['locations']:
    loc=L['name']
    if loc not in stage_order: stage_order.append(loc)
    for e in (L.get('events') or []):
        nme=e.get('name')
        if nme in COR: nme=COR[nme]; corrected+=1
        a=OrderedDict(start=tk(e.get('start')),end=tk(e.get('end')),stage=loc,act=nme)
        for k in ('blurb','url','mbid','estd'):
            if e.get(k): a[k]=e[k]
        acts.append(a)
# 2. our additions
for s in add:
    loc=sq(o2c.get(s['stage'], s['stage']))
    if loc not in stage_order: stage_order.append(loc)
    a=OrderedDict(start=tk(s['start']),end=tk(s['end']),stage=loc,act=s['name'])
    b=strip_html(bio_by_slug.get(slug(s['name']),''))
    if b: a['blurb']=b[:600]; bio_n+=1
    mb=mbids.get(s['name']) or mbids.get(s['name'].lower())
    if mb: a['mbid']=mb; mb_n+=1
    acts.append(a)

acts.sort(key=lambda a:(stage_order.index(a['stage']), a['start']))
lines=[f"act = {json.dumps(a,ensure_ascii=False)}" for a in acts]
open(f"{T}/input1.txt","w").write("\r\n".join(lines))
head=["maintitle = Electric Picnic 2026","timezone = Europe/Dublin","dateFormat = dddd dS mmmm",
      "printAdvisory = 5","daychangeover = 06:00","lpRevisions","lpComments"]
open(f"{T}/input0.txt","w").write("\r\n".join(head))
print(f"total act lines : {len(acts)}")
print(f"  existing kept : {len(acts)-len(add)}")
print(f"  newly added   : {len(add)}")
print(f"  names fixed   : {corrected}")
print(f"  blurbs added  : {bio_n}")
print(f"  mbids added   : {mb_n}")
print(f"  locations     : {len(stage_order)}")
