# ov26 data sources

## Lineup — Aloompa Dragonfly (official app `com.othervoices.othervoices`)
- Adapter: `packages/adapters/src/aloompa.ts`; discovery: `docs/setup/aloompa-discovery.md`.
- App id `e3474b11-9155-45e6-86d9-6a4cbd419de2`, sub-app "2026 Other Voices"
  `93c338cc-ee57-482e-bb4f-f646bf4a0cf2` (both public — they're in every share link).
- Secret: `config/secrets.json` → `aloompa.buildParamsToken` (from the APK). Without it the module
  plans from the committed snapshot but can't refresh.
- `festplan fetch-lineup` rewrites `snapshot/subapp.json` (guarded by the shared shrink guard).
- Quirks: times are UTC epoch seconds (labelled Europe/London — same offset, ignore the label);
  `timeIsTBD` events are placeholders and dropped (Man/Woman/Chainsaw's Church slot, 2026-11-25);
  place names carry stray trailing spaces; the feed has **no venue coordinates**. The APK-bundled
  package (v72) was 168 events vs 196 live — always prefer a live fetch.
- **Known bad row (2026-11-25):** Yunè Pinku @ Wave, Sat 22:45 → **Sun 12:15** (810 min) — an
  end-time error in the feed. Not corrected locally (no source for the real time); don't promise
  anyone a 13-hour set — say it's late Saturday at Wave and the end time in the app looks wrong.
- `statusMessage` carries the access strand (wristband / golden ticket / free) — see CONTEXT.md.
- The app's articles feed is empty and push notifications are FCM-only, so there's no
  announcements source; surprise gigs are caught when they land in the schedule feed.

## Favourites — Clashfinder `ov2026` (read-only, independent maintainer)
## Weather — Open-Meteo at Dingle (52.1409, -10.2689).
