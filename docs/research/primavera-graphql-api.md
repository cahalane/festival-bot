# Primavera Sound GraphQL API — research findings (from the official Android app)

Research date: 2026-08-12. Target: find better endpoints for `festivals/ps26` by studying the
official app, mirroring the depth `festivals/atn26` gets from Appmiral — specifically incoming
notifications/announcements and artist bios.

App studied: **`com.primaverasound.barcelona` v1.0.41** (versionCode 10411, targetSdk 34).

Confidence legend: **[VERIFIED]** = observed live against the API or in the app binary;
**[INFERRED]** = deduction; **[UNKNOWN]** = could not determine.

---

## 1. Getting the app — Appmiral's recipe does NOT apply here

[VERIFIED] Primavera is **not** on Appmiral. Its package is `com.primaverasound.barcelona`, not
`com.appmiral.*`, and nothing in the binary touches `app.appmiral.com`. So
[`docs/setup/appmiral-discovery.md`](../setup/appmiral-discovery.md) is the wrong playbook — there
is no `x-protect` and **no auth at all** (see §3).

[VERIFIED] `gplaydl` no longer does anonymous auth: it now requires linking a real Google account
to a "dispenser" via an Android Authenticator app, which is interactive and account-risky. The
account-free route that worked:

```
curl -sSL -A '<desktop UA>' -o ps.apk \
  'https://d.apkpure.com/b/APK/com.primaverasound.barcelona?version=latest'
```

[VERIFIED] It is a **React Native** app. The three `classes*.dex` files are RN plumbing; all API
logic is in **`assets/index.android.bundle`** (6.6 MB of minified JS). No `jadx`/`apktool` needed —
`unzip` + `strings` + a regex over the bundle is enough, which is *easier* than the Appmiral case.

Useful sweeps:

```
unzip -q -o ps.apk -d x
strings -n 6 x/assets/index.android.bundle | grep -oE '(query|mutation) [A-Za-z]+' | sort -u
```

GraphQL documents survive minification intact (they are `gql` template literals), so this recovers
the app's queries verbatim — **including field selections the public site never requests**, which is
where the value turned out to be.

## 2. What the app talks to

[VERIFIED] Hosts in the binary, and what each is actually for:

| Host | Role | Useful to us? |
|---|---|---|
| `graphql.primaverasound.com/prod/graphql` | everything: lineup, posts, favourites, config | **yes — all of it** |
| `sondheim.braze.com`, `sdk.iad-01.braze.com` | Braze — push + in-app messaging | no, see §5 |
| `assets.primaverasound.com`, `s3-eu-west-1…` | images; plus **dead** 2018–2020 `app/psb/prod/8.6/*.json` paths | no (legacy) |
| `c22xr04nk1.execute-api.eu-west-3.amazonaws.com` | lone API Gateway, unreferenced by app logic | no |
| `festbot.primaverasound.com/webhookapp` | a chat-bot widget URL in dead config | no |
| Mapbox / Spotify / Firebase / Mixpanel | vendor SDKs | no |

The `app/psb/prod/8.6/*.json` files (`notifications.json`, `maps.json`, `info.json`, …) look
tempting but belong to a **retired app generation** — they are 2018–2020 era and not read by any
live code path. Don't build on them.

## 3. Auth: there is none [VERIFIED]

The endpoint is a plain unauthenticated GET — query, `operationName` and `variables` as URL params.
No API key, no token, no origin check. Nothing to extract, rotate, or keep out of the repo (contrast
Appmiral's `x-protect`). Introspection is disabled server-side, but that no longer matters: the
app bundle hands us the exact query documents.

## 4. The find: artist bios were always in the API [VERIFIED]

Our previous note recorded `getPostsBySlugName` as returning "only a routing stub" for artists, and
that is why `artist-info` scraped `window.__INITIAL_DATA__` off the website. **That conclusion was
right about the fields we asked for and wrong about the endpoint.** The bio is not in
`postDescription` (genuinely empty for artists) — it is in **`components`**, a field nobody had
requested:

```
query P($slugnames: [String]!) {
  getPostsBySlugName(slugnames: $slugnames) { slugName postName postCategory components }
}
```

Live check — bios returned in full, batched, one request:

| slug | `postDescription.description` | `components` write-up |
|---|---|---|
| `wet-leg` | 0 chars | **1490** |
| `carl-cox` | 0 chars | **1525** |
| `gorillaz` | 0 chars | **1908** |
| `1111` | 0 chars | **1171** |

`components` is the *same nested `text.{en,es,ca,pt}` tree* the website ships in
`window.__INITIAL_DATA__` — the page is a render of this API. That is why the existing
`longestTextEn` walker reads both unchanged; the scrape had been consuming this API's output all
along, through an HTML page. Going direct means no HTML parse, no page-shape fragility, **N artists
in ONE request**, and multilingual text available if ever wanted.

Two behaviours to code against:
- [VERIFIED] Unknown slugs are **silently omitted**, not errored (5 requested → 4 returned). Match on
  `slugName`, never on array index.
- [VERIFIED] Some artists have a post record but an empty write-up. That is a real "not published",
  not a failure — keeping the website scrape as a fallback covers it.

## 5. Notifications/announcements: what is and isn't reachable

[VERIFIED] The app's *push* notifications are **Braze**. Braze delivers to a registered app instance;
pulling that feed would mean standing up a fake install against Primavera's Braze workspace. That is
impersonating an app install to read a private channel — **out of bounds, and we did not do it.**

[VERIFIED] Most in-app "notification" identifiers (`SET_ARTIST_NOTIFICATION`, `notificationTime`,
`localNotifications`, `cancelNotification`) are **local reminders** the app schedules on-device
before a favourited set. That is the same job `./festplan reminders` already does — nothing to mirror.

[VERIFIED] What *is* public and pullable is the editorial feed:

```
query L($category: [String], $from: Int!, $to: Int!) {
  getPostsListWithTotal(category: $category, from: $from, to: $to) {
    posts { slugName postCategory postDescription { title { en } subtitle { en } description { en } image { en } url date } }
  }
}
```

Posts are multi-tagged (`["news","barcelona","home"]`); **`barcelona`** scopes it to this festival and
keeps São Paulo / Porto / Primavera Pro out. `date` is **epoch milliseconds as a string**.

This is genuine official news (programme announcements, ticket waves, post-festival reports) but it is
**not** a live-ops channel — it will not carry "Stage X is delayed 20 minutes". So it **complements
and does not replace** the BlueSky announcements source, which is what actually carried the Thu 4 Jun
weather chaos. Wired as `sources.pages` for exactly that reason (§7).

[VERIFIED] Body extraction is uneven: artist posts and most articles use `text.en` blocks, but some —
notably the daily "Journal" posts — ship an `Embed` containing a **whole HTML newsletter email** under
`code.en`, all tables and inline CSS. We deliberately do not de-tag those; a summary plus the link is
honest, a de-tagged email dump is noise pretending to be content.

## 6. The lineup query has much more in it than we were asking for [VERIFIED]

The app's `getLineupEvent` selection vs. our old minimal one:

- **`artistsPosts`** — the bios again, *bundled into the lineup response*, so a snapshot can carry
  its own write-ups.
- **`postCategory`** — carries **`bits`**, marking a **separately-ticketed Primavera Bits** act. This
  is real, checkable data for a warning `CONTEXT.md` currently maintains by hand: all 4 surviving
  2026 Fòrum acts came back `["artist","bits"]`.
- **`venuesInfo`** — `venueName`, `venueReadableName`, display `position`, so slug→name no longer
  needs a hand-kept table.
- **`artistSetName` / `shortTitle` / `smallText` / `artistReadableName`** — the app's own display
  strings (b2b and "live" billings that bare `artistName` loses).
- `eventName`, `updatedAt` — provenance for a snapshot.

**Negative result, worth recording so nobody re-chases it:** `venuesInfo.latitude`, `longitude` and
`capacity` exist in the schema but Primavera **never populates them** — null/0 across every venue,
verified against the *full* 2025 edition (17 venues), not just the pruned 2026 one. So there is **no
walk-graph win here**; `knowledge/geography.md`'s hand-derived walk times remain the only source.
Likewise `artistSetGenres` is still null/empty — the genre gap is real, not a query mistake.

## 7. Other queries in the bundle, and why we skipped them

| Query | Verdict |
|---|---|
| `getUserFavourites` / `setUserFavourites` / `getUserData` | **account-scoped.** Reading a crew member's Primavera account favourites needs *their* credentials. Clashfinder already solves this consensually — see [`privacy-and-access.md`](../operating/privacy-and-access.md). Not pursued. |
| `getAppConfig(version, app, enviroment)` | [VERIFIED] returns empty for every `app`/version tried (`ps`, `psb`, …); it is app UI chrome (menus, onboarding), not festival data. |
| `radioPrograms` / `radioSchedule` | Primavera Radio. Real and unauthenticated, but off-scope for schedule planning. |
| `getRegisterPreferencesData` | [VERIFIED, now used] see §7b — a Spotify-id lookup, wired into MBID resolution. |
| `userSignup` / `userCheckEmail` / newsletter | account mutations. Never call these. |

## 7b. `getRegisterPreferencesData` — Spotify ids, and the trap in them

Powers the app's registration artist-picker. Unauthenticated like the rest:

```
query R($search: String, $from: Int, $to: Int, $artists: [String]) {
  getRegisterPreferencesData(search: $search, from: $from, to: $to, artists: $artists) {
    topArtists { name image isSpotifyArtist spotifyId slug }
  }
}
```

`spotifyId` is genuinely useful: MusicBrainz records streaming URLs as artist relations, so
`/ws/2/url?resource=https://open.spotify.com/artist/<id>&inc=artist-rels` reverses an id to an
**MBID by identity rather than by name** — the only way to separate two acts that share a name.
Implemented in `packages/adapters/src/primavera-spotify.ts` + `packages/adapters/src/musicbrainz.ts`.

**The trap.** This searches Spotify's *global* catalogue and pads results with related artists. It
is **not** a lineup lookup, and the first result is routinely a different, more famous act
(measured 2026-08-12):

| search | result[0] | actual |
|---|---|---|
| `Greta` | Greta Van Fleet | ps26's Bits act is slugged `greta` |
| `Amiga Date Cuenta` | Karol Sevilla | — |
| `Corte!` | CortexUS | — |

Taking `result[0]` would tag the wrong artist on a published mirror with full confidence — the
res/pinkpantheress phantom match through a new door. So the implementation accepts a result **only
on an exact normalised-name match**, and returns null otherwise.

**Measured value, on 30 real ps26 acts.** MusicBrainz name search alone resolved 17 (2 null from
same-name ambiguity, 11 from no exact match). The Spotify fallback added **3** — `Ecco2k`,
`Gorillaz`, `Absolutely` — for 20/30. The rest have no MusicBrainz Spotify relation at all
(`DJ Marcelle`, `Akazie`, `Gadea`, `DJ Nobu` → HTTP 404): coverage thins out on exactly the
smaller acts that need it most. Worth having as a fallback; not a fix.

## 8. Field mapping

- `dateTimeStartReal` — **epoch ms, as a string**. `new Date(Number(x))`, then render in
  **Europe/Madrid** (the feed's `timezone` is null; do not assume UTC-rendering is fine).
- `dateTimeStartHuman` — **not** the set time; a day-granularity bucket. Do not plan against it.
- `postDescription.date` — epoch ms string, used as the page `modifiedAt` fingerprint.
- `duration` — minutes; a `720` is the 12-hour non-music venue open-hours row, **not a band** —
  filter it (`FILLER_MIN` in `lineup.ts`).

## 9. Verify before trusting it

Same rule as Appmiral: a 200 does not mean the times are right. Re-run the timezone anchor in
`festivals/ps26/CONTEXT.md` (**Cameron Winter, Thu 2026-06-04 17:00 CEST, Auditori Rockdelux**) after
any change to the fetch or parse path.

**Post-festival pruning is live and aggressive.** As of this research date the 2026 Fòrum event
returns **4 artists and 1 venue** (down from 175/18); 2025 still returns 214 artists and 17 venues.
The `refreshDecision` shrink guard in `lineup.ts` exists for exactly this and correctly refuses to
overwrite the committed snapshot. Consequence: **the richer fields in §6 only populate a snapshot
taken while an edition is live** — they cannot backfill the frozen 2026 capture.
