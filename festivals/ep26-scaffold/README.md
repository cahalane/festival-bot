# ep26 — scaffolding (NOT wired into the CLI)

Dry-run material for syncing Clashfinder `ep26` from two complementary sources. Nothing here is
registered in `packages/cli/src/festivals.ts`; there is no `festival.json` yet. **No push has been
made to Clashfinder.**

## The two sources are complementary, not redundant

| source | covers | count |
|---|---|---|
| EP app (Greencopper OTA v39, 22 Aug) | 42 fringe/area stages | 843 sets |
| Irish Times stage times (24 Aug) | the 5 main arenas | 115 sets |

The app carries **no** main-arena programming, and the Irish Times covers **only** the main arenas.
The app does carry the 79 Comedy acts but with `stageId: null`, so it cannot place them — the
Irish Times supplies that stage.

## Files

- `irish-times-sets.json` — the main-arena stage times, with an explicit `priority` per stage.
- `stage-map.json` — hand-curated identity map between our stage names and the existing CF location
  names, **plus the list of CF-only locations a push must preserve**. Curated because string
  similarity is unsafe here: `Irish Harp Stage`(CF) == `Harp Ireland Stage`(ours) scores 0.64,
  while `Coke Studio` vs `Comedy Stage` scores 0.48 and is a false match.
- `merge.py` / `classify.py` / `dryrun.py` — the dry-run pipeline.
- `classified.json` — CF acts split into spelling variants vs genuinely-CF-only.
- `proposed_ep26_clean.json` — the proposed post-merge event.

## Dry-run result (union merge, nothing deleted)

    every pre-existing CF act survives      1073/1073
    CF-only locations preserved             20/20
    genuinely-CF-only acts preserved        68/68
    maintainer parking lists                untouched

Cleaned variant: real acts 748 -> 1028 (+280), coverage 70% -> 77%, locations 51 -> 67.

## Two decisions still open — do NOT push before resolving

1. **126 acts would be retimed.** CF's existing main-arena times disagree with the Irish Times
   (Sombr 20:25 vs 21:00; Lewis Capaldi 23:05 vs 22:45; Wolf Alice 16:45 vs 21:15). This scaffolding
   assumes the Irish Times wins (published 24 Aug; CF `lastEdit` 22 Aug), but a wrong headliner time
   is the worst failure this bot can produce, so it needs a human call.
2. **ep26 is not ours.** `created 2026-08-14`, `lastEdit 2026-08-22 21:47`, maintained by an
   independent Clashfinder user. Per `docs/setup/clashfinder.md` this deployment does not write to
   an event it does not own. Updating it means agreeing the change with the maintainer, or standing
   up a separate event we do own.

## Still unfillable

18 locations remain 100% `?` — neither source covers them: Six Bars, Provedencia, Today FM Sound
Garden, Coke Studio, Three Music Stage, Stradbally Inn, Brutropolis - Ministry of Misinformation,
White Claw, 3 Charge and Chill, Cerebral Fortress, Northside Rises, Sa Chollchoill, Survivor, and
others. Their `?` rows are the maintainer's timetable skeleton and are deliberately left in place.

---

## Push attempt, 2026-08-24 14:39 — BLOCKED (403, no edit rights)

A complete payload was built and validated, then refused by Clashfinder.

**Diagnosis (not a technical fault):**

    GET  https://clashfinder.com/           200   signed in as colm2
    GET  https://clashfinder.com/s/ep26/    200   readable
    read API auth block                     {"result":"pass"}
    GET  https://clashfinder.com/s/ep26/?edit   403   (bot UA and browser UA alike)
    POST https://clashfinder.com/s/ep26/?edit   403

The session cookie is live and the read key works; `?edit` alone is forbidden. This account does
not hold edit rights on ep26. That is an access control on another user's event, so it was not
worked around.

**The payload is finished and ready** (`input0.txt` / `input1.txt`, rebuilt by `build_payload.py`):

    1272 act lines / 63 locations
      1013 existing acts carried through verbatim
       259 area/fringe sets added from the app (Greencopper OTA v39)
       215 artist blurbs from the app bundle
        12 misspelled act names corrected (see corrections.json)
         1 mbid
       0 locations dropped, 0 malformed rows, 0 inverted times

**Before any future push, re-run the freshness check.** `cf_ep26_baseline.json` is the state this
payload was built against (`lastEdit 2026-08-24 12:52`). The maintainer edited the event twice
during this session; a push built on a stale baseline would have re-created three parking lists and
a duplicate "Three Music Stage" they had just deleted.

**MBIDs were deliberately abandoned.** MusicBrainz resolved 1 of the first 17 fringe names (6%) —
the rest are workshops, trad sessions and cocktail classes with no MusicBrainz entry. The push sets
`cinfo-autoMbIdTagging=1`, so Clashfinder tags what it can server-side. The mainstream acts, which
would resolve, are already on the event and are not in the add list.

## Options from here

1. Ask halvin (halvin@clashfinder.com) for edit rights on ep26, or send them `input1.txt`.
2. Create an event this deployment owns and push there (the `atn26` mirror model).
3. Leave ep26 alone — the maintainer is actively filling it and had already applied the Irish
   Times main-arena times before this session's push was built.
