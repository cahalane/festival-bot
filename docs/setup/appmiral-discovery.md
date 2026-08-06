# Appmiral discovery — finding and authenticating your festival's feed

**Appmiral** is a white-label festival-app platform (part of CM.com) used by 100+ festivals
(Rock Werchter, Tomorrowland, Pukkelpop, Dour, Iceland Airwaves, and more). If your festival's
official app is built on it, its full lineup — artists, stages, times, maps, POIs, news — is
reachable over a documented read API, `app.appmiral.com/api/v7/...`, the same one the app itself
calls. `festivals/atn26` in this repo is a working reference module built against it (source:
`docs/research/appmiral-lineup-api.md`, the raw research this guide distills into steps).

This is the path to take when your festival **has an official app** and you can identify its
vendor. If there is no app / no vendor API, see `scraped-lineup.md` instead.

## 1. Is your festival on Appmiral?

- Find your festival's official app on the Play Store / App Store and note its package id. An
  Appmiral-built app's Android package is `com.appmiral.<name>` (e.g.
  `com.appmiral.alltogethernow`). If the package doesn't match that shape, it's probably not
  Appmiral — check the app's "powered by" credit or ask the festival directly.
- Confirm the read API exists for your festival by trying:
  ```
  curl -i https://app.appmiral.com/api/v7/events/<guess>/editions/<guess>2026/artists
  ```
  Any response (even a 401/404) from `app.appmiral.com` means the host is live; a generic
  Symfony-style 404 page for a *plausible* event/edition slug usually just means you haven't
  found the right slug yet — see step 2. A connection failure means this festival isn't on
  Appmiral (or isn't on `app.appmiral.com`).

## 2. Find the event and edition slugs

- **Event** is usually the festival's own slug, e.g. `alltogethernow`. **Edition** is usually
  `<event><year>`, e.g. `alltogethernow2026`.
- Requests need the right headers (step 3) to distinguish "wrong slug" (generic 404) from "right
  slug, not authorised" (`401`).
- **The single most important ambiguity in this whole process:** an edition that exists but
  hasn't been published yet returns **401**, exactly the same status a *wrong or stale token*
  returns. You cannot tell "my token is wrong" from "this edition isn't live yet" from the status
  code alone. If you're confident the token is fresh (extracted this session, live-tested against
  a *known-good* edition — e.g. last year's) and you still get 401 on this year's edition, the
  likeliest explanation is the edition isn't published yet. Re-check closer to the festival.

## 3. Extract `x-protect`

Requests to `app.appmiral.com` are gated by a single static header, `x-protect` (there is no
separate `x-api-key` despite what older Appmiral docs imply — see the research note for how that
was confirmed). It is **not a per-user credential** — it's an Android string resource
(`R.string.x_Protect`) baked into the published app binary, shared across every festival on the
platform's read endpoints. That means you don't need a rooted device or a traffic-intercepting
proxy to get it; you can read it straight out of the APK.

1. Pull the APK. `gplaydl` (an anonymous-auth fork) works without a Google account:
   ```
   pip install gplaydl
   gplaydl auth
   gplaydl download com.appmiral.<name> -o <dir>
   ```
2. Unzip the base APK and grep its compiled resources for 32-character hex strings:
   ```
   unzip -o base.apk resources.arsc -d <dir>
   strings -n 32 <dir>/resources.arsc | grep -iE '\b[0-9a-f]{32}\b'
   ```
   This turns up a handful of candidates — the app also embeds Firebase/Facebook/etc. keys of the
   same shape, so don't assume the first hit is right.
3. **Disambiguate by live-testing each candidate** against a real endpoint, e.g.
   ```
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "x-protect: <candidate>" -H "x-platform: android" -H "Accept-Language: en" \
     https://app.appmiral.com/api/v7/events/<event>/editions/<edition>/artists
   ```
   The right candidate returns `200`; the rest return `401`. Test against a known-published
   edition (e.g. last year's) if this year's is still ambiguous per step 2.

## 4. Why the value is not in this repo

`x-protect` is shared across every festival built on Appmiral, not scoped to your festival or
your deployment. A working value committed to a public repo is an invitation to volume use — and
the predictable response to that is Appmiral tightening or rotating the endpoint, which breaks it
for every legitimate reader, including you. Extract your own token by the steps above and keep it
in `config/secrets.json` (gitignored — never commit it), under `appmiral.xProtect`.

## 5. Expect it to rotate

The token changed with an app major-version bump on ATN's app (v5.0.1 → v6.0.0). The old value
didn't just stop working outright: it kept authorising the *previous* edition (2025) while
returning 401 for the new one (2026). That's the same ambiguous 401 as step 2's "not published
yet" case, which is exactly what makes a stale token dangerous to rule out by symptom alone —
re-extract the token (steps 1–3) whenever the app has had a major-version update, before assuming
an edition isn't live.

## 6. Endpoints

Everything hangs off `events/{event}/editions/{edition}/`:

- `artists` — artist records, each with nested `performances` (or fetch `performances`
  separately and join by id).
- `stages` — stage list (id, name, display priority).
- `maps` / `pois` — site-map geodata, when the festival supplies it as real coordinates rather
  than a static image (see `walk-graph.md` for what to do when it's only an image).
- `pages` — CMS info pages (FAQ-style content), diffable for change-watching.
- `notifications` — the app's official push/news feed.

Pagination is `?page=N&max_per_page=50` where supported.

## 7. Field mapping

Appmiral's `performance` records map onto this project's `ArtistSet`:

- `name` ← artist `name`.
- `stage` ← the performance's `stage_id`, resolved against `stages`.
- `start` / `end` ← performance `start_time` / `end_time`, **ISO-8601 UTC**
  (`2026-07-31T21:45:00+00:00`). Parse as UTC, then render in the festival's own timezone — don't
  do arithmetic in UTC and forget the final conversion, and don't assume the feed is already
  local (it isn't).
- `durationMin` ← `(end - start) / 60000`; there is no separate duration field.

## 8. Verify before you trust it

Once you have a token and a working adapter, do not treat parsed times as correct just because
the fetch returned 200. Do the timezone-anchor check described in `getting-started.md`: pick one
act whose real-world set time you already know, and confirm the parsed/converted data reproduces
it exactly. An off-by-one-hour timezone bug is invisible in the JSON and wrong in every reply
downstream — the anchor check is the only thing that catches it before a user does.
