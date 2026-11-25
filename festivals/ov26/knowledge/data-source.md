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
- **End-time am/pm fault, corrected at parse time.** Some late sets have the end typed 12 hours
  late. On 2026-11-25: Yunè Pinku @ Wave 22:45→"12:15", Robocobra Quartet @ The Marina Inn
  23:45→"12:30", Secret Set @ John Benny's 00:15→"14:00". `fixAloompaAmPmEnds` (adapter, opt-in;
  ov26 applies it in `src/lineup.ts`) treats any set over 12h whose length minus 12h is ≤ 8h as an
  am/pm slip and moves the end back 12h, giving 00:15, 00:30 and 02:00. The operator confirmed the
  Robocobra and John Benny's readings; Yunè Pinku is corrected by the same rule. The independent
  Clashfinder `ov2026` reached the same three corrected ends on its own (checked 2026-11-25). The snapshot keeps
  the raw feed values so diffs stay faithful; only the planner sees corrected times. If the feed is
  fixed upstream the rule simply stops matching.
- `statusMessage` carries the access strand (wristband / golden ticket / free) — see CONTEXT.md.
- The app's articles feed is empty and push notifications are FCM-only, so there's no
  announcements source; surprise gigs are caught when they land in the schedule feed.

### Draft (unpublished) events — the surprise-set pipeline
The feed only returns PUBLISHED events, but the app's **performer** records leak what's being
prepared. A performer's `listPerformerEvents` can point at an event id that is **not** in
`listSubAppEvents` and returns `NOT_FOUND` from `getEvent` — that is a **draft event**: a set the
festival has staged internally but not pushed live. So a performer who has no visible set yet but
whose `listPerformerEvents` is non-empty is a scheduled-but-unpublished act. This is the earliest
signal we get — ahead of the set appearing in the schedule, ahead of any announcement.

To find them: pull `listSubAppPerformers { name listPerformerEvents { items { id } } }`, and flag any
performer whose linked event ids are all absent from `listSubAppEvents`. Cross-check each id with
`getEvent(appId,id,versionId:"1.0.0")` — `NOT_FOUND` confirms draft (vs. a dangling/deleted link).
Beware two false positives: a performer may link to a PUBLIC event under a name that doesn't match
(livestream bundles, e.g. Vaticanjail / Caitlín Nic Gabhann → IMRO Other Room livestreams), and the
performer list is itself partial (some site-announced acts have no performer record at all).

**Snapshot 2026-11-25:** 7 performers sat on draft events — Sprints, Daniel Avery, Shee,
spitroasty3k b2b lavaland, The Wran, Mother of Pearl, Makeshift Artbar. All belong to the
**J Music Stage** (Dingle Bridge House) — a whole Music Trail strand with **zero published events**
at that point (the `Jameson Music Stage` / `Jameson Green Street Stage` categories exist but carry no
sets). The site's J Music Stage blurb named the full bill (SPRINTS, Lambrini Girls, Daniel Avery,
Morgana, Winnie Ama, Róisín El Cherif, SHAMROCK SHOWBAND, Brìghde Chaimbeul, SHEE, Mother of Pearl,
ONAI, The Wran, Makeshift Artbar, Spitroasty3KB2B Lavaland) "plus a very special secret set" — so
expect a ~14-set J Music Stage block to publish into the feed, which the schedule watch will catch.

**Automated:** `festplan draft-tick` (loop: `scripts/draft_watch_loop.sh`, every 10–15 min per
`watch.conf`) runs this check unattended. It is silent unless a new draft event id appears, then
prints `DRAFT ACTS (ov26): …` with one `DRAFT:` line per act (handling: bootstrap skill, Step 3).
It flags any performer with at least one unpublished linked event, so a not-yet-published second
set for an act already on the schedule shows too. It doesn't call `getEvent`: absence from the
published list is the signal. Its first run (2026-11-25) quietly recorded 15 draft event ids across
17 acts: the 7 above, plus 10 already-scheduled acts with an extra unpublished event. Four of those
(Lambrini Girls, Morgana ×2, Róisín El Cherif, SHAMROCK SHOWBAND) are on the J Music Stage bill, so
probably their Bridge House sets. The other six (Aaron Rowe, Julia Jacklin, Madra Salach, The
Waterboys — all Church acts — plus ROOFCATS and The Fully Automatic Model) are unexplained: maybe a
broadcast/livestream entry, maybe a second set. Don't present any of them as confirmed.

### "Secret Set" placeholders (distinct from draft events)
Separately, the published schedule contains explicit **`Secret Set`** events (2026-11-25: Fri
00:00–02:00 McCarthys Bar, Sat 18:00–18:45 Kennedy's Bar, Sat 00:15 John Benny's Pub). These are
PUBLISHED, carry an empty performer list and the generic Jameson artwork — the act is **deliberately
withheld**, not derivable from metadata. Don't guess a name from app data; when the festival reveals
one it surfaces as a removed `Secret Set` + added named set in the schedule watch. (The website's
"secret set" line refers to the J Music Stage, which is a different thing from these pub slots — do
not conflate them.)

## Favourites — Clashfinder `ov2026` (read-only, independent maintainer)
On 2026-11-25 (CF last edit 21:24) it matched the app set-for-set: 195 sets, same 20 venues,
same times. One CF error: two of the three Zoë Uí Fhaoláin Green MusicWalk slots are on Sun 17:00
and **Mon** 18:00 there; the app (and the site's Cogar listing) has all three on Sat 16:00/17:00/18:00.
It's someone else's event, so we don't edit it; mention it to the maintainer if useful. Neither
source has the J Music Stage drafts or Man/Woman/Chainsaw's Church slot (TBD in the app).
## Weather — Open-Meteo at Dingle (52.1409, -10.2689).
