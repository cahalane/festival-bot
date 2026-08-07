# Lineup → Clashfinder export

Built 2026-06-18. Lets us keep our OWN Clashfinder event current from the same lineup
data the planner uses, and re-emit when a festival's timetable changes. Festival-agnostic.

## What's built
- **`packages/adapters/src/clashfinder-export.ts`** (cross-festival, TDD):
  - `toClashfinderAct(set, opts)` → one `act = {json}` line.
  - `toClashfinderSetup(sets, opts)` → full setup text (header + sorted act lines + footer).
  - `clashfinderLocalTime(date, tz)` → CF local wall time `yyyy-mm-dd hh:mm`.
- **CLI:** `ACTIVE_FESTIVAL=<slug> ./festplan clashfinder` → prints the
  setup text to stdout (redirect to a file). Verified for ps26 (Madrid) and atn26 (Dublin/478 acts).

## MusicBrainz IDs (`mbid`)
`cf-push` populates each act's `mbid` from MusicBrainz (`packages/adapters/src/musicbrainz.ts`,
`createMbidResolver`/`pickExactMbid`) — but **only on a unique, high-confidence exact name match**
(score ≥ 95, normalised name equality, no same-name ambiguity). Better no tag than a wrong one:
verified live that London Grammar / Kneecap tag, while ambiguous (Fat Dog, Saoirse) and non-music
("Comedy", "Yoga With Sonia") acts are refused.

- **Suffix stripping:** the lookup strips trailing qualifiers — "(DJ Set)", "(Live)", "[DJ]",
  "(2026)" — via `stripActSuffixes()` so "Fatboy Slim (DJ Set)" matches "Fatboy Slim". The displayed
  act name keeps its suffix; only the lookup is stripped.
- **Local cache:** name→mbid (hits *and* misses) persists to `cache/musicbrainz/mbid.json`
  (gitignored). First resolve is throttled ~1 req/s (MB limit + descriptive UA); later runs hit zero
  network.
- **Two-phase push (default):** when the schedule first lands, `cf-push` pushes the schedule
  immediately with whatever mbids are already cached (phase 1, fast — the clashfinder goes live),
  then resolves the uncached names from MusicBrainz and re-pushes enriched (phase 2). If every name
  is already cached it does a single enriched push; `--no-mbid` does a single push with none.

## Extended fields: `artist` + `blurb`
- **`artist`** — the act name with performance suffixes stripped (`stripActSuffixes`, same as the
  mbid lookup), emitted only when it differs from the displayed `act` (e.g. act "Fatboy Slim (DJ
  Set)" → artist "Fatboy Slim"). Auto-derived by the exporter for every act.
- **`blurb`** — the festival's own bio, run through `htmlToBlurb()` (strip tags, decode entities,
  paragraph/line breaks → `\n\n`). Sourced per festival via the `ArtistInfoSource`:
  - **ATN:** inline `body` from the lineup feed (free, no extra fetch — `createAppmiralArtistInfoSource`).
  - **PS:** the scraped artist-page bio (slower; cached).
  `cf-push` resolves blurbs alongside mbids, caching name→blurb in `cache/<festival>/blurbs.json`, and
  folds them into the same two-phase flow (cached blurbs in phase 1, the rest resolved in phase 2).

## Why the JSON `act` form
Clashfinder's config language (`tmp_Clashfinder_reference.html`) offers two `act` syntaxes. We use
the **JSON form**: each line is self-contained — absolute local date+time + its own stage — so there's
no `day`/`stage`/`date` state machine, order doesn't matter, and commas in act names are safe inside
the JSON string. Times are **local wall-clock, no timezone**, so each instant is rendered in the
festival timezone. Optional keys supported: `artist`, `blurb`, `url`, `estd`, `mbid`.

## Rate limits (recon 2026-06-18)
- **Clashfinder:** a signed read of `clashfinder.com/data/event/<event>.json` returned **HTTP 200 in
  ~0.24 s with NO rate-limit headers** (no `X-RateLimit-*`/`Retry-After`; just `cache-control:
  private`, nginx). No advertised quota — but it's a small indie service, so **self-throttle**: only
  re-push when the timetable actually changes, never poll. (Reads already cache 24 h via `cf_event.json`.)
- **Appmiral (contrast):** *does* throttle by IP — a burst of ~10 probes triggered **HTTP 403** for
  several minutes. Always serve the lineup from the bundled snapshot / disk cache.

## Push mechanism (BUILT 2026-06-18 — from a captured editor-save request)
**Live-verified 2026-06-19** against the Clashfinder **`/test` sandbox**: a push returned HTTP 200
(no login redirect) and a follow-up read confirmed the acts landed. Use `/test` for any future
write testing.

The CF editor saves via a form POST; it IS scriptable. Implemented as `pushClashfinder()` +
`toClashfinderFields()`/`buildClashfinderPushBody()` (adapters) and the **`festplan cf-push
<cf-event> [--note "..."]`** CLI command. The text export (`festplan clashfinder`) remains for
manual paste.

- **Request:** `POST https://clashfinder.com/s/<event>/?edit`, `Content-Type:
  application/x-www-form-urlencoded`.
- **Auth = one login COOKIE, not the read API key:** `userLogin`, the durable login token, is the
  whole of it — see "Auth" below. (The read API key / `privateKey` is unrelated to editor saves —
  confirmed against a live push.)
- **Body fields:**
  - `input0` — the **setup directives** block: `maintitle`, `timezone`, `dateFormat`,
    `printAdvisory`, `footer` (×N), `daychangeover`, `lpRevisions`, `lpComments`.
  - `input1` — the **act lines** (`act = {json}` each, `\r\n`-separated).
  - `user=` (empty), `revNote=<note>`, `entData=Update`.
  - `cinfo-desc=<event name>`, `cinfo-private=0`, `cinfo-whoCanEdit=anyone`, `cinfo-whoCanTag=anyone`,
    `cinfo-autoMbIdTagging=1`, and empty `cinfo-privateExceptUsers/adminList/editWhitelist/editBlacklist`,
    plus `cinfo-xlSetup=<spreadsheet import cfg>` (keep the captured default).
- **Implemented:** `toClashfinderFields()` emits the `input0`/`input1` split (header carries
  `timezone`/`daychangeover` from the festival cutoff/`dateFormat`); `buildClashfinderPushBody()`
  assembles the `cinfo-*` form; `pushClashfinder()` POSTs with the cookies and **detects a stale
  session** (login-wall heuristic). Self-throttle: push only on real timetable changes; `--note`
  bumps the revision label.

## Auth (settled 2026-06-19)
A write authenticates with **one cookie, `userLogin`** — nothing else. There is no session to keep
alive and no expiry to plan around.

Clashfinder hashes the password *client-side* and never sends it: the login is just the cookie
`userLogin = <user>,sha1(<user> + <password>)`, validated server-side via `/utils/checkHash.php`.
So there's **no login request to replay** — `clashfinderUserLogin(user, password)` (adapters) mints
the token with one SHA-1, and `cf-push` derives it from `clashfinder.password` in gitignored
`config/secrets.json` automatically, preferring it over a stored `write.userLogin`. It's a 10-year
token, so it only changes when the password does. (Verified: the derived token reproduces the
captured working `userLogin` exactly, and a live push authenticated with it alone.)

`pushClashfinder` still flags `staleSession` when a save response looks like a login wall, so a
push never silently no-ops — the fix is to correct `clashfinder.password` (or `write.userLogin`),
not to refresh a session.
