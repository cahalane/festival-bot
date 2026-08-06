# All Together Now — operations runbook

**Festival:** All Together Now, Curraghmore Estate, Portlaw, Co. Waterford (Ireland).
**Vendor:** Appmiral (CM.com). App package `com.appmiral.alltogethernow`.
**Data source:** Appmiral Content API v7 — see `docs/research/appmiral-lineup-api.md`.

## API facts
- Base: `https://app.appmiral.com/api/v7`
- Event id: `alltogethernow`
- Edition id: **`alltogethernow2026`** (LIVE — full timetable, flipped 2026-07-10) · `alltogethernow2025`
  (prior edition, still reachable with the old token).
- Auth: a single **static** header `x-protect` (in `config/secrets.json` → `appmiral.xProtect`),
  plus `x-platform: android` and `Accept-Language: en`. **No x-api-key.** ⚠️ **The token rotates per
  app major** — v6.0.0 rotated it; the 2026 edition rejects the old v5 token with `401 Invalid
  X-Protect`. Re-extract from the APK (`docs/research/appmiral-lineup-api.md` → gplaydl + `resources.arsc`)
  whenever a new edition 401s.
- Lineup: `…/editions/<edition>/artists?include_related=true` → artists with nested performances
  (`stage_name`, `start_time`/`end_time` in **UTC**, plus `body` bio / `tags` / `links`).
- **Rate limit:** the API throttles by IP — a burst of probes triggered HTTP 403 for several
  minutes. Always serve from the bundled snapshot / disk cache; refetch sparingly.

## What's bundled now (flipped to 2026 on 2026-07-10)
- `schedule.json` = the **published `alltogethernow2026`** snapshot (763 artist records / 364
  performances / 16 stages). `festival.json` `days` = the 2026 dates (Thu 30 Jul → Sun 2 Aug),
  verified against the snapshot with the 06:00 cutoff (Thu 19 / Fri 100 / Sat 122 / Sun 119).
  `venues.json` venue list regenerated from the 2026 stages.
- `venues.json` walk graph is **still a placeholder** (uniform `defaultMinutes` 12); Curraghmore site
  geography is not yet modelled → `myday` route *timings* aren't ground truth. Build real edges from
  the site map before trusting travel-sensitive routing.
- A read-only Clashfinder schedule mirror is published at `clashfinder.com/s/atn2026`
  (`./festplan cf-push atn2026`).

## Flip checklist — when the 2026 edition publishes
1. Confirm the edition slug resolves (probe `…/editions/alltogethernow2026/stages` → 200, not 401).
   If the slug differs, update `ATN_EDITION` in `src/index.ts`.
2. Refetch the snapshot with **`./festplan fetch-lineup --force`** — this is the canonical refresh:
   it pulls live via the Appmiral adapter, applies the shrink guard, and writes `schedule.json`
   **id-sorted** (artists + their performances by numeric id, trailing newline) so a re-fetch only
   diffs genuine changes, not record reordering. ⚠️ Do NOT `curl … -o schedule.json` directly — a raw
   dump is in the API's arbitrary order and produces a massive spurious diff every time (the reason
   id-sorting was added, 2026-07-24). If you must curl for debugging, pipe it through
   `sortLineupById` before writing over the snapshot.
3. Regenerate `venues.json` venue list with `appmiralVenuesFromLineup()` (keep the hand-built walk
   graph if one exists by then).
4. Update `festival.json` `days` to the 2026 dates (research: **30 Jul–2 Aug 2026**) — derive the
   exact evening-grouped dates from the new snapshot (dayCutoffHour 6), and add a sanity anchor.
5. Re-verify `coordinates` and, ideally, replace the placeholder walk graph with real edges from the
   site map (see `festivals/ps26/venues.json`).
6. `npm run typecheck && npm test`.

## Notes
- ATN runs late; `dayCutoffHour` is 6 so post-midnight sets group with the prior evening.
- The lineup carries bios (`body`) inline — no scraping needed (unlike PS26). An `ArtistInfoSource`
  could be added cheaply from the same response if richer artist detail is wanted.
