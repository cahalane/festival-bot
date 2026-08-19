---
description: Arm this session's background watches — the specific set the ACTIVE festival module actually has sources for, no more and no less. Use at session start, after a restart/compaction, or when the user asks to set up / check the watches.
allowed-tools: Bash, Read, Monitor, TaskStop
---

Arm the session's background Monitors: persistent loops, all but one **silent by design** — no
output means no change, so they cost nothing while things are quiet and only wake the session when
something actually moves. Which loops apply is not fixed — it follows whatever `FestivalSources`
the **active** festival module (`packages/core/src/festival.ts`) declares in its `sources` object.
A festival with no announcements feed gets no announcements watch; one with no site-map source gets
no map watch. Never arm a watch for a source the module doesn't have — it would just fail forever
and teach everyone to ignore its errors.

## Step 1 — Check config before arming anything

Report this before touching a single Monitor, so the operator sees what they're actually getting:

1. Find the active festival: `./festplan` with no args prints `festplan (festival: <slug>)` on its
   first line. Read `festivals/<slug>/src/index.ts` to see which `sources.*` fields it assigns —
   `lineup` is mandatory; `favourites`, `weather`, `announcements`, `pages`, `map`, `artistInfo` are
   all optional and are typically wired only inside an `if (secrets.something)` guard.
2. Check `config/secrets.json` exists (gitignored; `Bash -c 'test -f config/secrets.json'`). A
   source wired behind a secret that isn't present will have been skipped by the module itself at
   load time — that's a **missing-secret** gap, not a bug.
3. A source the module simply never assigns (no `sources.announcements = …` line at all) is a
   **not-implemented** gap for this festival — nothing to arm, nothing wrong.
4. Summarise before Step 2: which of {lineup, announcements, pages, map, weather} this festival
   has, and for each missing one, whether it's "not implemented for this festival" or "implemented
   but `<secret>` isn't set."

## Step 2 — Arm each applicable watch

`TaskList` exists in this harness but only lists the todo task-tracker, **not** background Monitor
loops — so the only reliable double-arm guard is `Bash`: `ps aux | grep -i <name>_watch_loop | grep
-v grep`. If a matching process is already running, do **NOT** start a second one. Otherwise arm
with the **Monitor** tool, `persistent: true`, `timeout_ms: 3600000`, one per applicable source.
Reminders are always armed — they don't depend on any festival source.

| Declared source | Command | Loop script |
|---|---|---|
| `lineup` (always present) | `./festplan schedule-tick` | `scripts/schedule_watch_loop.sh` |
| `announcements` | `./festplan announce-tick` | `scripts/announce_watch_loop.sh` |
| `pages` | `./festplan pages-tick` | `scripts/pages_watch_loop.sh` |
| `map` | `./festplan map-check` | `scripts/map_watch_loop.sh` |
| `weather` | daily card, `./festplan weather --png` | `scripts/weather_daily_loop.sh` |
| `weather` | `./festplan rain-tick` | `scripts/rain_watch_loop.sh` |
| `weather` | `./festplan cold-tick` | `scripts/cold_watch_loop.sh` |
| always | reminder queue wake, `./festplan reminders due` | `scripts/reminders_loop.sh` |

For each row whose source the active module actually declares:

- Guard: `ps aux | grep -i <name>_watch_loop | grep -v grep`.
- Arm: `command: bash scripts/<name>_watch_loop.sh` (repo-relative — run from the repo root),
  `description: <what it watches, plus "(active festival)">`, `persistent: true`,
  `timeout_ms: 3600000`.
- The lineup and reminders loops apply to every festival — arm them unconditionally. Everything
  else is conditional on Step 1's findings.

`announce_watch_loop.sh`, `pages_watch_loop.sh`, and `map_watch_loop.sh` resolve the active slug
themselves at startup (`SLUG="$(./festplan active-festival)"`) and write their error logs / one-shot
flag under `cache/$SLUG/…`, so no per-festival editing is needed before arming. That resolution
happens once at process start, so switching the active festival mid-run requires restarting the
loop, not just editing `CLAUDE.md`.

## Step 3 — What each event line means

- `SCHEDULE CHANGE (<festival>): N added, M removed, K moved` + one line per change — the lineup
  moved. **Act (Step 4).**
- `SCHEDULE WATCH (<festival>): guarded shrink — …` — the live feed came back smaller than the
  saved snapshot, so nothing was overwritten; the fetch was parked in a `.fetched.json` sidecar
  instead. Often legitimate (post-festival pruning) but suspicious before the festival has
  happened — inspect the sidecar and tell the operator, don't force it blind.
- `TICK ERROR: … fetch failed 3x in a row — …` — a source is properly down (one blip stays silent;
  this only fires on the third consecutive failure). Tell the operator the planner may be running
  on a stale snapshot. Never paper over missing data with a guess.
- `MAP AVAILABLE (<festival>): cache/<festival>/map_raw.json (N POIs)` — the site map published
  (one-shot watch; it self-stops after this). Follow up with `./festplan walk-refine --commit` and
  `./festplan amenities`, and record the change in the festival's own knowledge docs.
- `ANNOUNCEMENT (<festival>): N new official post(s)` + one line per item — the official channel,
  often ahead of the lineup feed. Don't relay blind: classify each item (disruption / schedule /
  lineup / logistics vs marketing — a cheap fresh subagent briefed only with the item text works
  well here) and treat anything schedule-shaped like a `SCHEDULE CHANGE`. Marketing items are
  already logged; drop them silently.
- `PAGE UPDATE (<festival>): N added, M removed, K changed` + the full body of every added/changed
  page. The tick pulls the body itself, so no follow-up fetch is needed — decide per page whether
  it's time-sensitive enough (opening times, entry, travel, safety) to relay, or routine enough to
  note and move past. `./festplan page <id>` remains available for pulling one page on demand.
- `RAIN WARNING (<festival>): <severity> from … until … — Xmm peak hour, Ymm total, starts in
  ~Nmin` — rain arriving within 6h. This is one of the few genuinely crew-wide alerts; say when it
  starts, how heavy, and whether it's worth changing plans over (a light warning usually isn't).
  Fires once per episode, again only if it worsens — a repeat is real news.
- `COLD ALERT (<festival>) [ahead|imminent] <handle> chat=<id>: …` — a cold snap for someone with a
  `coldAlert` block in `data/prefs.json`. `ahead` is the planning nudge, `imminent` the ~90-minute
  jacket reminder — relay `imminent` even if it fires late, it's still useful.
- `WEATHER UPDATE (<date>):` + `./festplan weather` output, then a `CARD: <path>` line — the one
  watch that fires on a clock (once daily), not on a change. Send the card (via the session's
  channel reply tool, as a file attachment) to everyone with `weatherDaily: true` in
  `data/prefs.json`, each in their own
  tone; that flag is the source of truth, so check it fresh rather than from memory. `CARD:
  unavailable` means send the text summary and say the render failed.
- `WEATHER UPDATE FAILED (<date>): 3 attempts, no forecast.` — tell the operator immediately, then
  debug; the loop already retried three times before surfacing this, so it's real.
- `REMINDER DUE:` + one or more `DUE …` lines — do what the item's text says, send it, then
  `./festplan reminders fired <id>`. Marking fired is deliberately manual (not done by the loop) so
  a reminder is never consumed while a send is still in flight.

## Step 4 — On a schedule-shaped change, bias to action

Don't just report a diff and wait to be asked:

1. **If this deployment publishes a favourites mirror** (see `docs/setup/clashfinder.md` — only an
   event this deployment owns is ever written to; an event someone else owns is read-only to us),
   **push it first**, unconditionally — even when nobody is affected. Maintaining the shared source
   of truth is the job; deciding who to message is the follow-up, not a precondition. The only
   exception is a purely cosmetic rename with no time/stage change (say so rather than silently
   skipping even then). If the festival's event belongs to someone else, there is nothing to push —
   go straight to re-checking stars.
2. **Read the `STAR CHECK` block in the push output.** `cf-push` already does this re-check for
   you: it re-pulls every crew member's Clashfinder page, diffs their star codes against the last
   push's baseline (`cache/<festival>/star_state.json`), and prints nothing when nothing broke.
   `DROPPED <act> (<code>)` — their star no longer resolves; tell that person to re-star it.
   `MOVED <code> was <act> — NOW POINTS AT <other>` is the worse case and leads: their plan still
   looks complete while routing them to an act they never picked. A `(star check skipped: …)` line
   means the check itself failed, so nothing was verified — say so rather than reading silence as
   all-clear.
3. **Tell only the affected people**, in their own tone from `data/prefs.json`, bound to the exact
   handle whose picks are hit — never leak one person's picks into another's reply.
4. Say what it means concretely (a cancellation, a new clash, a clash resolved) rather than
   restating the raw diff, and check whether a cancelled act still plays elsewhere before saying
   someone's lost them outright.

## Step 5 — Report

Summarise: which watches got armed (with their Monitor description), which were skipped and why
(source not implemented for this festival vs. secret missing vs. already running), and anything
from Step 1 the operator should know before relying on the arming (e.g. "this festival has no
`pages` source, so info-page changes won't be caught").

## Notes

- Read `cache/<festival>/schedule_changes.log` (and the other `*_changes.log` files) to recover
  changes that landed while the session was down, e.g. after `/clear` or a restart.
- Which watches apply follows the **active festival** import in `CLAUDE.md` (or `ACTIVE_FESTIVAL`
  for a one-off run) — switching festivals needs no change to this skill, only a re-run of Step 1.
- To add a new watch — same shape as every existing one, so follow it rather than inventing a
  new one: [`docs/setup/adding-a-watch.md`](../../../docs/setup/adding-a-watch.md).
- To stop a watch: `TaskStop` on its Monitor task id (note it when you arm it — `TaskList` won't
  show it later), or find the process with `ps aux | grep -i _watch_loop`.
