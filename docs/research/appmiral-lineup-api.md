# Appmiral lineup/schedule API — research findings

Research date: 2026-06-18. Author: research subagent (reconnaissance only; no code/config changed).
Target: build a shared `appmiral` `LineupSource` adapter for the multi-festival framework, starting
with All Together Now (ATN) 2026.

Confidence legend: **[VERIFIED]** = directly observed at a cited source URL; **[INFERRED]** =
reasonable deduction, not directly confirmed; **[UNKNOWN]** = could not determine.

---

## ✅ 2026 EDITION LIVE + TOKEN ROTATED 2026-07-10 (app v6.0.0)

> The `alltogethernow2026` edition published its full timetable. Flipped the module to it on
> 2026-07-10 (`ATN_EDITION` in `festivals/atn26/src/index.ts`, `schedule.json` refetched: 763 artist
> records / 364 performances / 16 stages, sets 30 Jul 18:00 → 03 Aug 02:00 IST).

- **The `x-protect` token ROTATED with app v6.0.0.** The old token
  (`<redacted — extract your own, see docs/setup/appmiral-discovery.md>`, from v5.0.1) now
  returns **`401 Invalid X-Protect`** for the 2026 edition but still authorises 2025. The **new
  token** (`<redacted — extract your own, see docs/setup/appmiral-discovery.md>`, in
  `config/secrets.json` → `appmiral.xProtect`; the old one kept as `_prevXProtect_2025`). Lesson:
  **re-extract `x-protect` on each app major**, don't assume it's stable year to year.
- **How to extract without a rooted device / proxy (the method that worked):** the token is a static
  Android string resource `R.string.x_Protect`, so pull the APK and read it out of `resources.arsc`:
  1. `pip install gplaydl` (v-anonymous-auth fork), `gplaydl auth` (anonymous — no Google account),
     `gplaydl download com.appmiral.alltogethernow -o <dir>` (grabs base + split APKs).
  2. `unzip` the base APK; `strings -n 32 resources.arsc | grep -iE '\b[0-9a-f]{32}\b'` → a handful
     of 32-hex candidates (the app also embeds Firebase/FB/etc. keys).
  3. Disambiguate by **live-testing each** against the 2026 `…/artists` endpoint — the right one
     returns **200**, the rest 401. (Proper decode: `x_Protect` resource → its string value via
     androguard/apktool, but the live-test is faster and definitive.)
- The path/header contract is otherwise unchanged from the v5.0.1 notes below.

## ✅ RESOLVED 2026-06-18 — static extraction from the ATN app (v5.0.1), live-tested

> Supersedes the `[INFERRED]`/`[UNKNOWN]` auth notes below. Decompiled `com.appmiral.alltogethernow`
> v5.0.1 (XAPK → jadx 1.5.5) and confirmed against live calls.

- **Auth is a single STATIC header — `x-protect`. There is NO `x-api-key`.** The earlier
  "x-api-key + x-protect" guess was wrong. `HeaderInterceptor.kt` adds, for host `app.appmiral.com`:
  `x-protect` (= `R.string.x_Protect`, a static value), plus `x-platform: android`,
  `x-app-version`, `x-os-version`, and `Accept-Language`. Account tokens (`x-account-*`,
  `x-app-user-id`) are added **only** for `/function/` (ticketing/wallet) paths — irrelevant to the
  read-only lineup.
- **`x-protect` value** lives in `config/secrets.json` → `appmiral.xProtect` (gitignored; it's an
  app-embedded static string, shared across Appmiral festivals' read endpoints).
- **Event / edition identifiers:** event = `alltogethernow`; edition = **`alltogethernow2025`**
  (live, returns 2025 data). `alltogethernow2026` currently returns **401** (not published/authorised
  yet — the app is still pointed at 2025). Re-confirm the 2026 edition slug when ATN publishes it.
- **Lineup read path (LIVE-VERIFIED 200):**
  `GET https://app.appmiral.com/api/v7/events/alltogethernow/editions/alltogethernow2025/artists?include_related=true`
  → `{data: [491 artists], _meta}`; and `…/stages` → 24 stages.
- **Data model → `ArtistSet` (richer than PS26, no scraping needed):** artist =
  `{id, name, body (HTML bio), category, tags, tracks, links, image, performances[]}`; performance =
  `{id, artist_id, stage_id, stage_name, start_time, end_time, show_in_schedule, show_in_line_up,
  color, ...}`. Times are **ISO-8601 UTC (`+00:00`)** → adapter converts to **Europe/Dublin** (IST).
- **All endpoints** (under `events/{event}/editions/{edition}/`): `artists`, `stages`, `maps`,
  `pois`, `vendors`, `pages`, `cards`, `sponsors`, `playlists`, `interests`, `emergency`,
  `translations`, `tickettypes`, `albums`, `stagehosts`, `heatmap/points`, `notifications`;
  `/function/...` for tickets/wallets/loyalty.
- **Headers to send from the adapter:** `x-protect: <secrets.appmiral.xProtect>`, `x-platform:
  android`, `Accept-Language: en` (app also sends `x-app-version`/`x-os-version`; not required for 200).

---

## Summary

- **[VERIFIED]** ATN's official app is built by Appmiral. The Google Play package is
  `com.appmiral.alltogethernow`, linked straight from ATN's own app page.
  Source: https://www.alltogethernow.ie/app (Play link
  https://play.google.com/store/apps/details?id=com.appmiral.alltogethernow ; iOS
  https://apps.apple.com/us/app/all-together-now/id1474261628).
- **[VERIFIED]** Appmiral is a real, large festival-app platform (now part of CM.com), powering
  100+ events (Rock Werchter, Tomorrowland, Pukkelpop, Dour, Iceland Airwaves, etc.).
- **[VERIFIED]** Appmiral exposes a versioned **Content API (v7)** with a single, consistent URL
  shape across all its festivals:
  `https://app.appmiral.com/api/v7/events/{event_identifier}/editions/{edition_identifier}/...`
  This is the high-leverage finding: one host + one path template serves every Appmiral festival,
  so a **single shared adapter parameterised by `(event_identifier, edition_identifier, api_key)`
  is genuinely feasible.**
- **[VERIFIED]** The API is **not openly public**: timetable requests send `x-api-key` and
  `x-protect` headers. Unauthenticated probes to `app.appmiral.com/api/v7/...` return the API
  backend's generic 404, confirming the host/path are real but gated.
- **[INFERRED]** The `x-api-key` is the per-app key embedded in the published mobile binary
  (standard for this class of read-only content API). Obtaining ATN's key almost certainly means
  reading it out of the app, not from a website. This is the main remaining blocker.
- Overall: a shared adapter is the right call. The data model maps cleanly to `ArtistSet`. The one
  concrete unknown to nail down before building is **the exact header values (`x-api-key`,
  `x-protect`) and ATN's `event_identifier` + `edition_identifier`**, recoverable by inspecting the
  app's network traffic.

---

## Appmiral platform

- **[VERIFIED]** "Native mobile app framework made specifically for building cross-platform music
  festival apps", ~15 years old, year-round engagement tool. Source: https://appmiral.com/ and
  https://www.linkedin.com/company/appmiral .
- **[VERIFIED]** Owned by / operating under **CM.com**. Source:
  https://www.cm.com/press/fkp-scorpio-and-cmcoms-appmiral-longterm-partnership-for-mobile-apps/ .
- **[VERIFIED]** Used by 100+ leading festivals; named clients include Rock Werchter, Tomorrowland,
  Iceland Airwaves, Rock am Ring, Pukkelpop, Dour, Eurosonic Noorderslag, Rocking The Daisies,
  Graspop Metal Meeting. Source: search results from https://appmiral.com/ and blog/LinkedIn.
  (Strong Belgian/Dutch + broader European footprint — good omen for other crew-relevant fests.)
- **[VERIFIED]** Public docs hub: https://help.appmiral.com/ (Knowledge Center). Public GitHub org
  https://github.com/appmiral exists but holds only `HyperJS`, `hugo-app-template`,
  `hugo-app-example` — **no API SDK or schema repo** of use here.
- **[VERIFIED]** Tech: Content API backend returns a Symfony-style error page on 404 (observed),
  images served from `s3-eu-west-1.amazonaws.com/appmiral-images/...`.

### How festivals get their lineup INTO Appmiral (context, not our read path)
Source: https://help.appmiral.com/client-deliverables/deliver-or-add-your-timetable-data
- **[VERIFIED]** Four ingestion methods: (1) a client-hosted **JSON live feed** in Appmiral's
  structure, polled and synced; (2) **Beatswitch** festival-software direct integration;
  (3) manual CMS entry; (4) push via Appmiral's API.
- **[VERIFIED]** Timetable importer v3/v4 polls **two client URLs every 15 minutes** — one for
  stages, one for artists (with nested performances).
  Source: https://help.appmiral.com/technical-info/data-importers/appmiral-timetable-v3-vendor-importer
- This is the *ingest* side (festival → Appmiral). Our adapter wants the *read* side (Appmiral →
  app), i.e. the Content API below. The two share field semantics, which is convenient.

---

## Lineup API (verified vs inferred)

### Base URL & versioning — **[VERIFIED]**
Source: official Appmiral Content API Postman documentation, reached via
https://help.appmiral.com/technical-info/appmiral-rest-api → "documentation can be found here"
→ https://app.appmiral.com/developer (redirects to)
→ https://documenter.getpostman.com/view/21064095/2sA3kaCyji
(structured JSON pulled from
https://documenter.gw.postman.com/api/collections/21064095/2sA3kaCyji ).

- Collection name: **"Appmiral Content API"**.
- Active version: **v7** (released 2023-09-14). v6 deprecated, v4/v5 deactivated.
- Base path template:
  `https://app.appmiral.com/api/v7/events/{event_identifier}/editions/{edition_identifier}/`
- Every content resource hangs off `.../editions/{edition}/`. So one festival "event" can have
  multiple yearly "editions" — exactly the per-year identifier we'd parameterise.

### Authentication — **[VERIFIED that headers exist] / [INFERRED how to get the key]**
- **[VERIFIED]** Timetable requests carry HTTP headers `x-api-key`, `x-protect`, and
  `Accept-Language`. (Postman collection marks `auth: noauth` but the real auth is these headers,
  with values templated as `{{x-api-key}}` / `{{x-protect}}`.)
- **[VERIFIED]** `help.appmiral.com` states: "For API access, please reach out to your Customer
  Success Manager." — i.e. keys are issued, not self-serve.
- **[VERIFIED]** Unauthenticated GETs to real-looking paths
  (`/api/v7/events/alltogethernow/editions`, `/api/v7/events/all-together-now`) return the
  backend's generic Symfony 404 page — host is live, but no data without the right
  key + identifiers.
- **[INFERRED]** `x-api-key` is the per-app content key shipped inside the mobile app binary; the
  app fetches lineup with it at runtime. `x-protect` is likely an anti-abuse / request-signing or
  static guard header (purpose unconfirmed). Recoverable by sniffing app traffic.

### Endpoints relevant to a LineupSource — **[VERIFIED]** (from the Postman collection)
All prefixed with `.../events/{event}/editions/{edition}`; pagination via
`?page=1&max_per_page=50`:
- `GET /stages` and `GET /stages/:STAGE_ID`
- `GET /artists` and `GET /artists/:ARTIST_ID`
- `GET /performances` and `GET /performances/:PERFORMANCE_ID`  ← the set/slot list (start/end/stage)
- `GET /stagehosts`, `GET /tags`, plus non-lineup folders: General (edition/translations/
  notifications/regions/tickettypes/...), Map (pois / Mapbox features), Partners (sponsors/
  vendors), Media (albums/playlists/games), Misc (pages), Push, Analytics.
- `GET /events/{event}/editions/{edition}` ("Get edition") returns edition metadata.

For our `loadSets()` the natural call is **`GET .../performances`** (each performance = one set,
with start/end + a stage reference + an artist reference), joined to `/artists` (name) and
`/stages` (stage name). Alternatively `/artists` returns artists with **nested performances**.

### Data shape / field mapping — **[VERIFIED for conventions] / [INFERRED for exact set fields]**
From the Content API "Common Fields" documentation (verified at the Postman doc) and the importer
v3 schema (verified at the help center):

Verified conventions (Content API doc):
- `id` — integer, unique per object type (a Stage and an Artist can both be id 1).
- `external_id` — string, present when imported from a third-party system (the festival's own ID).
- `priority` — integer, **lower = more important** (default 100). Useful for headliner ordering.
- **Dates: ISO-8601, always UTC**, e.g. `2020-08-23T19:30:00+00:00`. (Contrast: PS26 used epoch
  ms in local-ish handling — ATN/Appmiral gives clean UTC ISO, convert to Europe/Dublin for ATN.)
- `color` — `#RRGGBB` hex string. Images — object keyed by pixel width (`"100"`, `"250"`, ...).

Verified field names from the **importer v3** schema (festival→Appmiral side; the Content API
read side is expected to mirror these, hence [INFERRED] for the exact read-side keys):
- Stage: `id` (required, unique), `name` (translatable string/object), `priority`, plus
  `description`, `image`, `color`, `capacity`, `tags`, `customFields`.
- Artist: `id` (required, ≤500 chars), `name` (translatable), `category`
  (`headliner|featured|regular|supporting`), `performances` (nested array), social/website/
  description/image/tags/customFields.
- Performance (nested in artist on the importer side): `id` (unique), `start_time`, `end_time`
  (format `YYYY-MM-DD HH:mm:ssZ`, **UTC**), `stage_id`, `name`, `description`, `color`,
  visibility flags, `tags`, `customFields`.
- **No duration field; no day field** — timing is purely `start_time`/`end_time`. Importer note:
  "When a performance ends after midnight, it's day +1." So our `durationMin = end - start` (the
  framework's `ArtistSet` already derives duration; this is a clean fit).

**Caveat [INFERRED]:** the exact JSON keys the *Content API read endpoints* return (e.g. whether
performance time keys are `start_time`/`end_time` vs `startsAt`/`endsAt`, and how the artist/stage
join is expressed — embedded object vs id reference) are **not confirmed** because the Postman
collection ships **no saved example responses** (0 of 37 requests have one) and the live endpoints
need a key. The importer schema is our best proxy and is likely close, but confirm against one
real response before finalising field names.

### Proposed `ArtistSet` mapping (to validate against a real response)
- `name` ← artist `name` (resolve translatable → chosen locale via `Accept-Language`).
- `slug` ← artist `external_id` if present, else slugified `name` (or stringified `id`).
- `stage` ← stage `name` resolved from the performance's `stage_id`.
- `start` ← performance `start_time` parsed as UTC `Date`.
- `end` ← performance `end_time` parsed as UTC `Date`.
- `durationMin` ← `(end - start)/60000`.

---

## ATN 2026 status

- **[VERIFIED]** App vendor is Appmiral — package `com.appmiral.alltogethernow`, iOS app id
  `1474261628`. Source: https://www.alltogethernow.ie/app .
- **[VERIFIED]** ATN 2026 dates: **30 July – 2 August 2026**, Curraghmore Estate, Waterford.
  Sources: https://aikenpromotions.com/show/all-together-now-2026/ , https://www.alltogethernow.ie/ .
  (Note: the framing in the task said "August 2026" — it's the early-August bank-holiday weekend,
  spanning 30 Jul–2 Aug; timezone **Europe/Dublin**, IST/UTC+1 in summer.)
- **[VERIFIED]** ATN's own website does **not** embed an Appmiral API host or event identifier in
  its HTML/JS — scanning the home, `/app`, and `/lineup` pages found only the string
  `appmiral.alltogethernow` (the store package). The lineup on the site is rendered another way;
  the Appmiral data lives behind the app, not surfaced on the marketing site.
- **[UNKNOWN]** ATN's exact `event_identifier` and `edition_identifier`. Guesses
  (`alltogethernow`, `all-together-now`, edition `2026`) all 404 unauthenticated — but a 404 here
  proves nothing because the request also lacks `x-api-key`/`x-protect`. Do not assume the slug.
- **[UNKNOWN]** ATN 2026 lineup content availability in the API right now (the edition may not be
  populated/published this far out).

---

## Recommended adapter approach

**Recommendation: build ONE shared `appmiral` LineupSource adapter** (shipped as
`packages/adapters/src/appmiral.ts`), parameterised per festival. Rationale:

- The URL contract is identical across all Appmiral festivals — only `event_identifier`,
  `edition_identifier`, the `x-api-key`/`x-protect` header values, and the locale differ. That is a
  textbook case for one adapter + per-festival config, not N bespoke adapters.
- The data model (artists / stages / performances with UTC ISO start+end) maps directly onto
  `ArtistSet`; `durationMin` is derived, matching the framework's expectation.
- Payoff scales: any future Appmiral-powered festival (and several of the named clients are
  European/likely crew-relevant) becomes a config entry, not a new integration.

Adapter config shape (suggested):
```
{ event: "<event_identifier>", edition: "<edition_identifier>",
  apiKey: "<x-api-key>", protect: "<x-protect>", locale: "en", tz: "Europe/Dublin" }
```
`loadSets()` → `GET /performances` (paginate via `page`/`max_per_page`) joined with `/artists` and
`/stages` (or `/artists` with nested performances), map to `ArtistSet`, convert UTC→festival tz at
display time only (store/compare in UTC — cleaner than PS26's local-epoch handling).

Implementation notes / guardrails:
- Keep `apiKey`/`protect` **out of source control** — same posture as PS26's `cf_config.json`
  (credential, not committed). Load from env/secret config per festival.
- Handle pagination (`page` + `max_per_page`, observed default 50) and the translatable
  `name` fields (object keyed by locale; honour `Accept-Language`).
- Be a polite client: the importer polls every 15 min, so cache responses (PS26-style snapshot +
  staleness flag) rather than hammering the API; add an outage→stale-cache fallback like
  `cf_favs.py` already does.
- Don't hardcode field names yet — gate finalisation on one captured real response (see open
  questions).

**Do not** attempt to scrape ATN's marketing site for lineup data as the primary path — it doesn't
expose the structured feed; the app/API is the real source.

---

## Open questions / next steps to confirm

Ordered by how much they unblock the build:

1. **Capture one real app request (the decisive step).** Run ATN's app (or an Android emulator
   with the APK) behind an HTTPS intercepting proxy (mitmproxy / Charles / Proxyman) and watch for
   calls to `app.appmiral.com/api/v7/events/.../editions/.../performances` (and `/artists`,
   `/stages`). One capture yields, in a single shot: the exact **`event_identifier`**, the
   **`edition_identifier`**, the literal **`x-api-key`** and **`x-protect`** values, and a **real
   response body** to lock down field names. This resolves every [INFERRED]/[UNKNOWN] above.
   (The operator had already sniffed the app and ID'd Appmiral; this is the same exercise aimed at
   the `app.appmiral.com` host specifically — easy to miss if filtering by an obvious
   "lineup"/"api.appmiral" name. The host to watch is literally `app.appmiral.com`.)
2. **Alternative key source:** pull the APK (`com.appmiral.alltogethernow`) and grep decompiled
   resources/strings for the embedded `x-api-key` / base config and the event slug, if live
   traffic capture isn't convenient.
3. **Confirm read-side field names** against the captured response (esp. performance time keys and
   how artist↔stage are referenced) before writing the mapper; the importer-v3 schema is the
   working assumption, not gospel.
4. **Verify ATN 2026 edition is populated** — even with the key, the 2026 edition may be empty
   until closer to the festival; check whether `/performances` returns data now or later.
5. **Clarify `x-protect`** — is it a static per-app header or a computed/signed value? If computed,
   the adapter needs the signing scheme (capture multiple requests to compare). If static, it's
   just another config string.
6. **Cross-festival validation:** once one Appmiral festival works, test the same adapter against a
   second (e.g. a Belgian client) to confirm the "shared adapter" thesis end-to-end.

### Key source URLs
- ATN app page: https://www.alltogethernow.ie/app
- Appmiral platform: https://appmiral.com/ ; CM.com: https://www.cm.com/press/fkp-scorpio-and-cmcoms-appmiral-longterm-partnership-for-mobile-apps/
- Appmiral Knowledge Center: https://help.appmiral.com/
- REST API pointer: https://help.appmiral.com/technical-info/appmiral-rest-api
- Timetable delivery / importer schema: https://help.appmiral.com/client-deliverables/deliver-or-add-your-timetable-data and https://help.appmiral.com/technical-info/data-importers/appmiral-timetable-v3-vendor-importer
- **Content API spec (the core finding):** https://documenter.getpostman.com/view/21064095/2sA3kaCyji (JSON: https://documenter.gw.postman.com/api/collections/21064095/2sA3kaCyji)
- ATN 2026 dates: https://aikenpromotions.com/show/all-together-now-2026/
