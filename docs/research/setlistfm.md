# setlist.fm — recent-setlists client

Answers the recurring live-festival ask "what's `<artist>` playing?" (crew members
during The Cure at PS25). A prepared, reusable client like the other adapters.

## Source & auth
- Base: `https://api.setlist.fm/rest/1.0`
- Header auth: `x-api-key: <key>` + `Accept: application/json`. Free key, instant
  registration at <https://api.setlist.fm/docs/1.0/index.html>.
- Key lives **gitignored** in `config/secrets.json` → `"setlist.fm".apiKey` (note the
  literal dotted key — matches what's stored; `Secrets["setlist.fm"]` in `config.ts`).
- **Rate limits: 2 req/s, 1,440 req/day.** So we throttle (default 600 ms) and
  disk-cache per artist (`cache/setlistfm/`, 1 h freshness via the shared `cachedJson`).

## Endpoints used
- `GET /artist/{mbid}/setlists?p=1` — **preferred.** Keyed on the MusicBrainz ID,
  which we already resolve for the Clashfinder export, so the join is free.
- `GET /search/setlists?artistName=<name>&p=1` — **fallback only.** Name search is
  relevance-ranked and mis-hits: searching `Radiohead` returns the cover band
  *"An Evening of Radiohead"* first. Hence mbid-first; name search is best-effort.

## Response shape (verified live 2026-06-19)
```
{ setlist: [ {
    id, eventDate: "dd-MM-yyyy", info,
    artist: { name, mbid },
    venue: { name, city: { name } },
    tour:  { name },
    url,
    sets: { set: [ { encore?: number, name?, song: [
      { name, info?, tape?: true, cover?: { name }, with?: { name } } ] } ] }
} ] }
```
- `eventDate` is `dd-MM-yyyy` → normalised to ISO `YYYY-MM-DD` (`setlistfmDate`).
- Songs are nested per *set*; we **flatten in order** across main set + encores,
  tagging each song with its `encore` number (absent for the main set).
- Cover → `song.cover.name`; tape track → `song.tape`; per-song note → `song.info`.
- An entry with **no `sets`/empty `song`** means the gig exists but nothing's entered
  yet (future/in-progress) — we keep it with `songs: []` = "not yet known", not a drop.

## Crowd-sourced caveat (important)
Setlists are attendee-entered, so an in-progress set may be **absent, partial, or
lag**. The CLI renderer always attributes to setlist.fm and labels it "may lag / be
incomplete". Never present songs as first-hand observation (see memory
`no-firsthand-claims`). The reliable, always-available value is the **recent-tour
pattern** ("what they've been playing") as a predictor of what you'll hear.

## Code
- `packages/core/src/sources.ts` — `Setlist`, `SetlistSong`, `SetlistSource` interface.
- `packages/adapters/src/setlistfm.ts` — `setlistfmDate`, `parseSetlistfmResponse`,
  `setlistfm{Artist,Search}Url`, `setlistfmHeaders`, `createSetlistSource`
  (mbid-preferred, throttled, cached; inject `fetchJson`/`resolveMbid` for tests).
- CLI: `festplan setlist "<artist>" [--limit N] [--mbid <id>]`.

## Live-verified 2026-06-19
`setlist "The Cure"` resolved the mbid via MusicBrainz, returned future gigs as
"no songs entered yet" and past gigs with full main-set/encore splits + "first live
performance since…" notes — including The Cure at Estrella Damm, Barcelona (2026-06-05).
