# Adding a new watch

Every unattended watch in this project is the same shape — follow it rather than inventing a new
one. The three invariants a watch must hold (silent unless something changed, state on disk, fail
quietly until the third consecutive failure) and *why* each one exists are in
[`../operating/watches-and-alerts.md`](../operating/watches-and-alerts.md); read that first, then
build against the steps here.

## 1. Build the tick

A `<name>-tick` subcommand in `packages/cli/src/<name>-watch.ts`, modelled on the existing tick
files (`tick.ts` / `announce-watch.ts` / `pages-watch.ts` / `cold-watch.ts` / `rain-watch.ts`): IO
injected for testability, pull the source, diff against a saved baseline/seen-set, print nothing
unless something changed, advance the baseline, append to `cache/<festival>/<name>_changes.log`,
reuse the shared 3-strike failure helper. Wire it as a `case "<name>-tick"` in
`packages/cli/src/index.ts`.

TDD it — the diff + failure state machine is pure and unit-testable without touching a real network.

## 2. Register the source

If the watch needs a source `FestivalSources` doesn't already carry, add it in
`packages/core/src/festival.ts` and `sources.ts`, then wire it conditionally in whichever festival
module(s) actually have it, guarded by whatever secret or precondition it needs — mirror how
`festivals/atn26/src/index.ts` gates `announcements` / `pages` / `map` on `xProtect` being set.

A source only some festivals have is what keeps the bootstrap skill from arming a watch that would
fail forever, so the conditional wiring is load-bearing, not tidiness.

## 3. Add the loop script

`scripts/<name>_watch_loop.sh`, modelled on `scripts/schedule_watch_loop.sh`: `cd` to the repo root,
call `./festplan <name>-tick`, sleep `1200 + RANDOM % 600` (20-30 min, jittered), loop forever.

If the watch is per-festival, resolve the slug at startup with `SLUG="$(./festplan
active-festival)"` and write state under `cache/$SLUG/…`, as `announce_watch_loop.sh` /
`pages_watch_loop.sh` / `map_watch_loop.sh` do — that resolution happens once at process start, so
switching the active festival mid-run means restarting the loop.

## 4. Teach the bootstrap skill about it

In `.claude/skills/bootstrap/SKILL.md`: add a row to the Step 2 table (declared source → command →
loop script) and a bullet to Step 3 giving the **exact** event-line string the tick prints and what
to do when it fires. For anything user-facing, that bullet also specifies the classifier gate that
keeps people from being messaged over trivia.

A watch whose event line isn't documented in Step 3 fires into a session that doesn't know what it
means — the arming half is worthless without it.
