# Clashfinder — favourites and the mirror

[Clashfinder](https://clashfinder.com) is a public festival-schedule/highlights site: anyone can
create an event, and users star ("highlight") the acts they want to see across a shared timetable.
This project reads a user's starred acts to build personalised plans (`myday`, `vibecheck`,
`favs`), and can also *write* a festival's lineup to Clashfinder as a shared mirror.

## Two topologies — know which one your festival is

- **Festival-run event** (`festivals/ps26`'s model). The festival itself operates a public
  Clashfinder event; your crew star acts on the festival's own event, and this project only
  *reads* their highlights (`clashfinder.com/data/event/<event>.json`, authed with your own
  Clashfinder API key — see `config/secrets.json`'s `clashfinder.authUsername`/`authPublicKey`).
  You never push anything here.
- **Mirror you publish** (`festivals/atn26`'s model), used when the festival has **no** public
  favourites mechanism of its own (Appmiral has nothing equivalent). This deployment creates and
  owns a Clashfinder event as a *mirror* of the vendor lineup — `cf-push` writes the schedule to
  it — and the crew star acts on that mirror instead. Reads and writes both go through your
  operator credentials.

Check which topology your festival wires up before assuming either behaviour — it is the event id
handed to `createClashfinderFavouritesSource` in that module's `src/index.ts`. Both topologies read
the same way; only the mirror topology ever writes.

## Reading favourites (both topologies)

A user's starred acts live in their mobile highlights page,
`clashfinder.com/m/<event>/?user=<name>`, embedded in an inline `cg.gets` object as short codes
(`hl1..hl20`). Resolving a short code to an artist name needs the authed event JSON. Inspect a
resolved profile directly:

```
./festplan favs <cf-user|handle>
```

## `cf-push` — publishing the mirror

Only relevant to the mirror topology:

```
./festplan cf-push <cf-event> [--note "..."] [--no-mbid]
```

This pushes the active festival's current lineup (including any locally-added `extra-sets.json`
entries — the planner and the mirror stay in sync) to the named Clashfinder event, two-phased:
phase 1 pushes the schedule immediately with whatever MusicBrainz ids and bios are already
cached, phase 2 resolves anything missing (MusicBrainz lookups are throttled to ~1/s) and
re-pushes enriched. Requires `clashfinder.password` (or a stored `write.userLogin`) in
`config/secrets.json` — the read key alone isn't enough to write.

- **`--no-mbid`** skips MusicBrainz enrichment entirely (both phases), useful when you just need
  the schedule live fast and don't need clickable artist links yet, or when the MusicBrainz cache
  is cold and you don't want to wait through the throttle.

## The foreign-edit guard

`cf-push` **overwrites the entire event** — it doesn't merge. On a mirror, that's dangerous: a
crew member might hand-edit an entry on the Clashfinder web UI (correcting a display name, adding
a note), and a routine automated push would silently delete their edit the next time it ran. This
guard exists because exactly that happened once in practice.

Before writing, `cf-push` checks who last edited the mirror. If it wasn't this deployment's own
push, it fetches the mirror's current state, diffs it against what this push *would* write, and:

- If the diff looks like a plausible hand edit (a handful of acts differ), it **holds the push
  entirely**, prints what would be deleted/changed, and tells you to re-run with
  `--accept-remote` once you've decided, or fold the edit into `extra-sets.json` /
  `cf-overrides.json` first so the next automated push preserves it.
- If the diff is too large to be a hand edit, it also holds — a large divergence usually means
  something is broken on one side, not that someone made a few tweaks.

`--accept-remote` is the explicit "I looked at the hold, decided to overwrite" override.

## `cf-overrides.json` — mirror-only display names

`festivals/<slug>/cf-overrides.json` lets you rename an act **on the mirror only**, without
touching the name the planner itself uses to resolve favourites. This matters because favourite
resolution matches on the feed's own artist name — renaming that name for display would silently
break anyone already starred on it. Overrides are applied at push time, nowhere else: the mirror
shows the human-readable label, the planner keeps resolving favourites against the original feed
name.
