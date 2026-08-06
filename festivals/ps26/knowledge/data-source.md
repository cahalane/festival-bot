# PS26 data sources — GraphQL lineup, Clashfinder favourites, artist-info scrape

Evergreen-for-Primavera reference (the APIs don't change year to year). **Year-variable:** the
GraphQL *event names* carry the year (`…-2026-…`) — update them in the rebuild.

## 1. GraphQL lineup — the lineup source
Endpoint: `https://graphql.primaverasound.com/prod/graphql` (GET, query in URL params, no auth).
The lineup lives in the module as `festivals/ps26/schedule.json`, parsed by the TS lineup source
(`festivals/ps26/src/lineup.ts`) into the engine's `ArtistSet` model. Refresh with
**`./festplan fetch-lineup`** (source `festivals/ps26/src/fetch.ts`).

**Two events on the SAME endpoint/query, different `name`:** Fòrum = `primavera-sound-2026-barcelona`
(Parc del Fòrum lineup → `schedule.json`); `--ciutat` = `primavera-ciutat-2026-barcelona`
(Primavera a la Ciutat — off-site city venues, SEPARATE ticket → `festivals/ps26/ciutat.json`,
tracked but NOT auto-planned; programme in `knowledge/2026/city-program.md`). The fetch **guards
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
(2026 late-added stages in `knowledge/2026/stages.md`; walk graph in `../venues.json`.)

### Per-artist set detail — `getArtistSetsByArtist`
variables `{"artist":"<slug>","eventSlugName":null,"maxPast":100,"maxFuture":100}`. Returns
prev/next/future/past sets with venue location + readable names. Good for a one-artist deep-dive.

### Editorial posts — `getPostsBySlugName`
variables `{"slugnames":["<slug>"]}`. **For ps26 artists returns only a routing stub**
(`{"type":"route","url":null}`), not write-up content. GraphQL introspection is disabled.

## 2. Per-artist genre/bio — `./festplan artist-info` (website scrape, not GraphQL)
The artist page `https://www.primaverasound.com/en/artist/<slug>` embeds a `window.__INITIAL_DATA__`
JSON blob with an editorial write-up for artists that have one. `./festplan artist-info <slug> …`
(`--json` → `{name, bio, url}`; source `festivals/ps26/src/artist-info.ts`) extracts the largest
`text.en` HTML block: genre cues plus "Where to start", "What you should know", and a
**"You'll like him if you like… [artists]"** line (gold for recommendations). Not every artist has
one (`bio=""`). The blob also carries the global 13-genre taxonomy (Electronic, Folk/Country, Jazz,
Pop/R&B, Rock, Experimental, Global, Rap/Hip-Hop, Latin, Indie, Flamenco, Urban, Punk) but artists
are NOT individually tagged.

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
