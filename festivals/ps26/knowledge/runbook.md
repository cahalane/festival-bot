# PS26 operational runbook (festival-specific facts)

Pulled out of the old monolithic CLAUDE.md. These are **Primavera-2026-specific** facts the
planner/agent relies on — they belong to this festival, not the shared engine.

## Dates & day structure
- **Wed 3 → Sun 7 June 2026** (sets span Wed 17:45 → Sun 20:00 local, Europe/Madrid = CEST/UTC+2).
- **Wed 3 = Jornada Inaugural** (opening day): small Fòrum lineup before the main days, running
  alongside the Ciutat city programme. All 4 acts on the `parc-del-forum` stage: Ouineta 17:45,
  Yard Act 18:55, Guitarricadelafuente 20:15, Wet Leg 21:55. (So on this one day `parc-del-forum`
  hosts real acts, not the 720-min filler.)
- **Sun 7 at the Fòrum = Primavera Bits**, a SEPARATELY-TICKETED electronic lineup. Most of the
  crew don't have it — default planning to **Thu→Sat** unless a user says otherwise; flag Bits as
  a separate ticket if asked about Sunday.
- **08:00 day-cutoff applies to every night** (`dayCutoffHour` in `festival.json`): a set
  timestamped e.g. Fri 02:00 belongs to **Thursday night**. Consequence: Saturday's post-midnight
  headliners (Gorillaz 01:15, etc., all Sun-dated) belong to **Saturday night**, NOT Bits.

## Data quirks
- Lineup feed `timezone` field is `null` → apply Europe/Madrid yourself.
- 175 artists, 1 set each; one 720-min "set" = Plenitude non-music open-hours → filtered out
  (the lineup adapter drops sets ≥ 600 min).
- `artistSetGenres` is always null in the feed; genres/bios come from the artist-info scraper.
- `dateTimeStartReal` = epoch **milliseconds** (string).

## Non-music / low-urgency slots — don't surface as must-catch
- Aperol Island of Joy hosts live podcast/talk tapings, not bands: **Bombificadas** (Fri 18:00),
  **Amiga Date Cuenta** (Sat 18:00, Radio Primavera Sound). They look like normal ~40-min sets.
- **Radio Primavera Sound** interviews/talks are low-urgency and do NOT substitute an artist's real
  set (e.g. Geese at RPS ≠ their mains-cluster set).
- **Fever House** = a Fever/NAKED SPACE branded space (NOT a music stage), 18:00–19:00 local-DJ
  mini-program. Operator's call: "not a priority".
- **Disney stage** = mixed Disney+ showcase (Paula Tape Thu / Martin Urrutia Fri / Absolutely Sat),
  not pure DJ slots.

## City programme (Primavera a la Ciutat)
Tracked separately (`city-program.md`), NOT auto-planned into routes. Some users' "not in lineup"
favourites are city-programme shows at venues like Sala Apolo. Use the Fòrum-vs-Ciutat split before
trusting a pick is at the main site.

## Access intel (2026, may change year-to-year)
- **Cameron Winter** (Thu, Auditori Rockdelux): high-demand, limited cap, doors 15:45 for 17:00,
  closes when full. Special access CW-only.
- **Revolut Balcony** (Revolut METAL holders): this year must first sign up at the Revolut
  activation @ Occident, then claim the balcony. Good view of Revolut stage, poor of Estrella Damm.
