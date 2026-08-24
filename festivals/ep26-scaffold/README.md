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
