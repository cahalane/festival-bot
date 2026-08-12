# PS26 data sources — GraphQL lineup + posts, Clashfinder favourites, BlueSky

Evergreen-for-Primavera reference (the APIs don't change year to year). **Year-variable:** the
GraphQL *event names* carry the year (`…-2026-…`) — update them in the rebuild.

Everything except favourites and live-ops announcements comes from **one unauthenticated endpoint**,
`https://graphql.primaverasound.com/prod/graphql` — no key, no token, nothing to rotate or keep
secret (unlike Appmiral's `x-protect`). The query documents were recovered from the official Android
app; full derivation, negative results and the endpoints we chose NOT to use are in
[`docs/research/primavera-graphql-api.md`](../../../docs/research/primavera-graphql-api.md).

## 1. GraphQL lineup — the lineup source
Endpoint: `https://graphql.primaverasound.com/prod/graphql` (GET, query in URL params, no auth).
The lineup lives in the module as `festivals/ps26/schedule.json`, parsed by the TS lineup source
(`festivals/ps26/src/lineup.ts`) into the engine's `ArtistSet` model. Refresh with
**`./festplan fetch-lineup`** (source `festivals/ps26/src/fetch.ts`).

**Two events on the SAME endpoint/query, different `name`:** Fòrum = `primavera-sound-2026-barcelona`
(Parc del Fòrum lineup → `schedule.json`); `--ciutat` = `primavera-ciutat-2026-barcelona`
(Primavera a la Ciutat — off-site city venues, SEPARATE ticket → `festivals/ps26/ciutat.json`,
tracked but NOT auto-planned; programme in `2026/city-program.md`). The fetch **guards
against post-festival pruning**: if the live feed returns fewer sets than the snapshot it won't
overwrite (writes a `.fetched.json` sidecar unless `--force`).

Per-artist shape:
```json
{ "artistName": "Agriculture", "artistSlugName": "agriculture", "duration": 55,
  "venues": [ { "venueSlugName": "port",
                "artistSetSlugName": "agriculture-primavera-sound-2026-barcelona",
                "artistSetGenres": null,
                "duration": 55,
                "dateTimeStartReal": "1780599300000" } ] }
```
Key fields:
- `dateTimeStartReal` — **epoch milliseconds (string)**; converted via `new Date(Number(x))`, rendered in Europe/Madrid.
- `duration` — minutes (40–180; one 720 = the 12h non-music venue open-hours, **not a band — filter it out**).
- `venueSlugName` — stage key; readable names in the top-level `venues` map.
- `artistSetGenres` — **always null**; no genre data in the feed (fetch per-artist if genre filtering is wanted).

Stages (slug → name): estrella-damm, revolut, occident, cupra, schwarzkopf, port,
warehouse (The Levi's Warehouse), plenitude, auditori-rockdelux, pulse-cupra,
aperol-island-of-joy (Aperol Island of Joy), parc-del-forum (the venue itself, `position: 9999`).
(2026 late-added stages in `2026/stages.md`; walk graph in `../venues.json`.)

### Per-artist set detail — `getArtistSetsByArtist`
variables `{"artist":"<slug>","eventSlugName":null,"maxPast":100,"maxFuture":100}`. Returns
prev/next/future/past sets with venue location + readable names. Good for a one-artist deep-dive.

### What the fetch now pulls beyond the scheduler minimum
`fetch.ts` requests the app's own `getLineupEvent` selection, so a snapshot taken **while an edition
is live** also carries: `artistsPosts` (bios, see §2), `postCategory` (the **`bits`** tag = a
separately-ticketed Primavera Bits act), `venuesInfo` (readable stage names + display `position`),
and the app's display strings (`artistSetName`, `shortTitle`, `smallText`).
**Two verified dead ends — don't re-chase:** `venuesInfo.latitude/longitude/capacity` are null/0 even
on a full edition (so the walk graph stays hand-derived — see `geography.md`), and `artistSetGenres`
is still null/empty. Also note the enrichment **cannot backfill the frozen 2026 snapshot**: the live
feed is pruned post-festival (see the shrink guard above).

## 2. Per-artist bio — `./festplan artist-info` (GraphQL first, scrape as fallback)
`./festplan artist-info <slug> …` (`--json` → `{name, bio, url}`; source
`festivals/ps26/src/artist-info.ts`) returns the editorial write-up: genre cues plus "Where to
start", "What you should know", and a **"You'll like him if you like… [artists]"** line (gold for
recommendations). Not every artist has one (`bio=""`).

**Corrected 2026-08-12 — the earlier note here said `getPostsBySlugName` returns "only a routing
stub" for artists. That was true of the fields we asked for, not of the endpoint.** The bio is not in
`postDescription` (genuinely empty for artists) but in **`components`**, which nobody had requested.
So the primary path is now GraphQL:

```
getPostsBySlugName(slugnames: ["<slug>", …]) { slugName postName postCategory components }
```

- `components` is the **same nested `text.{en,es,ca,pt}` tree** the website ships in
  `window.__INITIAL_DATA__` — the page is a render of this API, which is why one `longestTextEn`
  walker reads both. Direct = no HTML parse, and **N artists batched into ONE request**.
- Unknown slugs are **silently omitted** (5 asked → 4 returned): match on `slugName`, never index.
- **The website scrape is kept as fallback** (`useApi: false` forces scrape-only) — it covers artists
  the posts API returns empty, and an API and a scrape rarely fail together.

The site's global 13-genre taxonomy (Electronic, Folk/Country, Jazz, Pop/R&B, Rock, Experimental,
Global, Rap/Hip-Hop, Latin, Indie, Flamenco, Urban, Punk) is still **not** applied per-artist.

**Batched bios (`infoMany`).** Because the query takes a slug *list*, the source implements the
optional `ArtistInfoSource.infoMany(slugs)` — chunked at 50 to keep the GET URL short. Measured
2026-08-12: **73 slugs → 53 bios in 732ms across 2 requests**, where the per-slug path would have
made 73. This is what makes bio-enriching a whole-lineup Clashfinder push practical. Slugs the
batch doesn't answer for are simply absent from the result, so callers fall back to `info()` per
slug and keep the scrape safety net — batching is a speed-up, never a coverage change.

## 2c. Spotify ids — `artistIds` source (MusicBrainz disambiguation only)

`getRegisterPreferencesData(search:)` — the app's registration artist-picker — returns
`spotifyId` per artist, which MusicBrainz can reverse into an MBID *by identity* rather than by
name. Used only to enrich a Clashfinder push (`festivals/ps26/src/spotify.ts`).

**Read the warning before using this for anything else:** it searches Spotify's global catalogue,
not the ps26 lineup, and pads with related artists — searching `Greta` returns *Greta Van Fleet*,
not ps26's Bits act slugged `greta`. The source therefore accepts a result only on an exact
normalised-name match and returns null otherwise. See
[`docs/research/primavera-graphql-api.md`](../../../docs/research/primavera-graphql-api.md) §7b for
the measured hit rate (+3 of 30 acts) and the full list of traps.

## 2b. Official news — `./festplan page` / `pages-tick` (`getPostsListWithTotal`)
The festival's editorial feed, wired as the `pages` source (so ps26 has the same change-watch atn26
gets from Appmiral's CMS). Category **`barcelona`** scopes it to this festival — posts are
multi-tagged, and without it you get São Paulo / Porto / Primavera Pro. `date` is epoch-ms as a
string, used as the `modifiedAt` fingerprint.

**This is not a live-ops channel** — it carries programme news and ticket waves, never "stage X
delayed". It complements BlueSky (§4), which is what actually carried the Thu 4 Jun weather chaos;
that is why the two sit on different seams (`pages` vs `announcements`). Some posts (the daily
"Journal") embed a whole HTML newsletter email instead of prose — those render as title + link by
design, rather than a de-tagged email dump.

**Push notifications are NOT mirrorable.** The app's push runs on **Braze**, which delivers to a
registered app instance; pulling it would mean faking an install against Primavera's Braze
workspace. Out of bounds. The app's other "notifications" are on-device reminders before favourited
sets — the job `./festplan reminders` already does.

## 3. User favourites — Clashfinder (clashfinder.com/m/ps26)
Users share must-see acts either by **telling us directly** or via a **Clashfinder** link. We read
any user's PUBLIC highlights with the deployment's own operator account.
- **Highlights (public, no per-user key):** a user's picks live in their mobile page
  `https://clashfinder.com/m/ps26/?user=<NAME>` inside the inline `cg.gets` object — `hl1..hl20` are
  highlight sets (comma-separated short codes), `hl-nameN` are set labels.
- **Short code → artist name** needs the event JSON `https://clashfinder.com/data/event/ps26.json`,
  which **requires auth**: sign with `authUsername` + `authPublicKey` (sha256 of
  username+privateKey+optional params). The operator's key lives in `config/secrets.json` under
  `clashfinder` (a credential — gitignored, never commit/share). Code form: event `short`
  `"ouinet(1)"` ↔ highlight code `"ouinet-1"`.
- For ps26, Clashfinder artist names match the GraphQL `artistName` **1:1** (verified against the
  operator's own picks) — join on name. Re-check name alignment for other users before trusting it.
- Multi-user model: users either tell us their acts, or we fetch their PUBLIC Clashfinder highlights
  with the operator's key. Don't ask users for their own private keys.

## 4. Live-ops announcements — BlueSky (`announcements` source)
`./festplan announcements` / `announce-tick`, source `festivals/ps26/src/announcements.ts`. The
official feed `primavera-sound.bsky.social` over the **public AT Protocol API**
(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed`) — no auth, no JS wall.

This is the **real-time** channel, and the reason it exists: during the Thu 4 Jun 2026 weather chaos
the website and other socials were unreadable and this feed still worked. Keep it distinct from the
editorial news feed (§2b) — different traffic, different urgency, deliberately different seams.

⚠️ Announcement graphics carry **no alt-text**: the content is often *inside the image*, so
`imageUrl` matters and a text-only relay can silently drop the actual message.
