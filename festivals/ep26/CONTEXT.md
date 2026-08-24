# Electric Picnic 2026

**ep26** — Stradbally Hall, Co Laois. Thursday 27 – Sunday 30 August 2026 (arrivals Thu; the
programme proper runs Fri–Sun, with sets ending as late as 03:40).

Lineup comes from the **official Electric Picnic app**, which is built on **Greencopper / Leap
Event Technology** — *not* Appmiral. The vendor integration is shared and lives in
`@festival-bot/adapters` (`greencopper*.ts`); see
[`docs/setup/greencopper-discovery.md`](../../docs/setup/greencopper-discovery.md).

## Sanity anchor

`./festplan at "Sun 22:30"` must show **Fontaines D.C.** on **Main Stage presented by 3** until
00:00. If that time is off by an hour, the timezone handling has broken — fix the adapter, not the
manifest.

Note the app spells it "Fontaines D.C." (with points) where press spells it "Fontaines DC". Match on
a normalised name, not an exact string.

## Venues

53 stages. The five main arenas are listed first in `venues.json` and lead the bill:

- **Main Stage presented by 3** · **Electric Arena** · **Rankins Wood** · **Red Bull x Terminus** ·
  **Comedy Arena**

The rest are area/fringe stages, alphabetically — Croí (7 spaces), Fishtown, Mindfield (6), Little
Picnic (6), Theatre of Food, ArtLot, Glow Depot, Salty Dog, Trailer Park, Hazelwood, Treasure Beach,
Spike Island, Global Green, Anachronica, Transmission, Metro and others.

**The walk graph is empty.** `venues.json` declares `defaultMinutes: 12` and no edges, so every hop
costs the same. That is a placeholder, not a measurement — Stradbally is a large site and the real
spread is nothing like uniform. Run `walk-refine` once real POI coordinates exist, or follow
[`walk-graph.md`](../../docs/setup/walk-graph.md). Do not hand-guess edges.

## Data freshness — this feed moves fast

Coverage changed twice inside 48 hours:

- **v39** (22 Aug): 843 sets / 42 stages, **no main arenas at all**; the 79 Comedy acts present but
  with `stageId: null`, so unplannable.
- **v42** (24 Aug): 1054 sets / 53 stages, main arenas published, Comedy given a stage.

So `./festplan fetch-lineup` before trusting coverage, and read `extra-sets.json`'s `_note` when you
do — it shrank from 115 entries to 2 precisely because the app caught up. An entry the app has since
published becomes a **duplicate**, and can duplicate under a second stage name (the Irish Times
"Comedy Stage" vs the app's "Comedy Arena").

`extra-sets.json` currently holds 2 acts the app still lacks: **Breda Hegarty** and **The Saw
Doctors**.

## Favourites — none wired, deliberately

`./festplan favs` and `vibecheck` return nothing for anyone. The public Clashfinder event `ep26`
is maintained by an **independent user, not this deployment**: verified 2026-08-24, `GET
/s/ep26/?edit` returns **403** while the same session reads it fine. It is not ours to write to.

To wire favourites, point `EP26_FAVOURITES_EVENT` at an event you own and supply
`clashfinder.authUsername` / `authPublicKey`. See
[`docs/setup/clashfinder.md`](../../docs/setup/clashfinder.md) for the two topologies.

A full 957-act payload built from app + Irish Times was pushed to the **sandbox** event
`https://clashfinder.com/s/test/` on 2026-08-24 as a rendering check.

## Secrets

Live re-fetch needs **both** `greencopper.secret` and `greencopper.otaToken` in
`config/secrets.json` (gitignored) — the bundle-decryption key and the OTA path token. Neither is in
this repo: they are working access gates, and this repo is public (same reasoning as Appmiral's
`x-protect`, see [`appmiral-discovery.md`](../../docs/setup/appmiral-discovery.md) §4). Extract your
own per [`greencopper-discovery.md`](../../docs/setup/greencopper-discovery.md).

Without them the module still plans from the committed `bundle/` snapshot; only `fetch-lineup` is
unavailable.
