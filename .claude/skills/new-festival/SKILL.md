---
description: Onboard a new festival — scaffold the module, wire a lineup source, verify the timezone, build the walk graph, wire favourites, and verify. Use when the operator wants to add a festival this bot hasn't planned before, or asks "how do I set up a new festival."
allowed-tools: Bash, Read, Write, Edit, WebFetch
---

Onboarding a festival is where a newcomer is most likely to give up: it spans identifying a
vendor, extracting an app token, a timezone trap, and building a walk graph — and getting any one
of those wrong produces a module that looks fine and plans wrongly. This skill runs the procedure
in `docs/setup/` interactively, writing files as it goes, rather than restating it. Read the doc
it's based on if a step here is unclear: `docs/setup/getting-started.md`, plus
`docs/setup/appmiral-discovery.md`, `docs/setup/scraped-lineup.md`, `docs/setup/walk-graph.md`,
`docs/setup/clashfinder.md`.

Ask the operator one question at a time when a step needs a decision from them — don't front-load
an eight-part questionnaire. Verify each step before moving to the next; a scaffold that "looks
right" but was never run against real data is exactly the failure mode this skill exists to catch.

## Step 1 — Scaffold

Ask for the festival's slug (lowercase, short — e.g. `ranchparty`). Then:

```
cp -r festivals/_template festivals/<slug>
mv festivals/<slug>/package.json.template festivals/<slug>/package.json
```

Edit the new `package.json`'s `name` to `@festival/<slug>` (the template ships `@festival/CHANGEME`).
The rename is not cosmetic: the template's `.template` suffix is what keeps `festivals/_template`
itself from being picked up as a workspace package, so do this before anything else touches the
new directory.

Register it as a workspace member:
- `packages/cli/package.json` — add `"@festival/<slug>": "*"` to `dependencies`, alongside the
  `@festival/*` entries already there.
- `packages/cli/src/festivals.ts` — add `import { createFestival as <slug> } from "@festival/<slug>";`
  and an entry in the `builders` map (`<slug>: () => <slug>({ cacheDir: cacheDir("<slug>") })` —
  add `secrets: loadSecrets()` too once a source needs it).

Run `npm install` so the new workspace package resolves, then confirm the CLI sees it:

```
ACTIVE_FESTIVAL=<slug> ./festplan
```

This should print `festplan (festival: <slug>)` with the full command list — it doesn't need a
lineup yet, just registration.

## Step 2 — Identify the source

Ask the operator: does this festival have an official app, and can you identify what platform it
runs on? Two paths, each with a working reference module:

- **Vendor API** — `festivals/atn26` is the reference. If the app is Appmiral-built, follow
  `docs/setup/appmiral-discovery.md`: confirm the event/edition slugs, extract `x-protect` from
  the APK, and **live-test the token against a real endpoint before writing any module code** —
  a `curl` returning 200 is cheap to check now and expensive to debug later inside a half-built
  adapter. If the app isn't Appmiral, the same "find the API behind the app" method still
  applies; there's no second vendor adapter in this repo to copy, so expect more from-scratch
  work.
- **Scrape** — `festivals/ps26` is the reference, for no app / no identifiable vendor API. Follow
  `docs/setup/scraped-lineup.md` — a scraped source isn't a contract, so expect field surprises
  and build the shrink-guard behaviour (already shared via `packages/adapters/src/refresh.ts`)
  rather than reinventing it.

Report which path was chosen and why before writing `src/index.ts`.

## Step 3 — Manifest

Fill in `festivals/<slug>/festival.json` (copied from the template, all fields currently
`CHANGEME`/placeholder):

- `name`, `timezone` (an IANA zone, e.g. `Europe/Dublin`).
- `dayCutoffHour` — the hour after the last act ends, so post-midnight sets group with the right
  evening rather than rolling into the next day.
- `days` — the festival's actual dates.
- `coordinates` — real lat/lon. This is what enables the weather source (`createWeatherSource`).
  The gate is `if (manifest.coordinates)` — **presence of the field, not whether it's sensible** —
  so the template's placeholder `{0.0, 0.0}` does *not* disable weather: it wires a live forecast
  for Null Island in the Atlantic and reports it as your festival's weather. Either put in real
  coordinates or delete the field outright (as `demofest` does, to stay offline). A wrong-but-
  confident forecast is worse than none.

Fill in `festivals/<slug>/venues.json`'s `venues` list with the real stage names (walk graph comes
in Step 7 — don't hand-guess edges here, the template's example edges are placeholders).

## Step 4 — Implement `loadSets()` (required gate — do not skip)

The scaffold step copies `festivals/_template/` into `festivals/<slug>/` (`cp -r`), so
`festivals/<slug>/src/index.ts` is now its own independent file, not a call-through to the
template — edit the new module's copy, not `festivals/_template/src/index.ts`. Its `loadSets()`
starts out as the template's stub:

```ts
loadSets() {
  throw new Error("implement loadSets() for this festival");
}
```

Nothing in this repo can fetch or plan for the new festival until that stub is replaced with a
real implementation. If Step 5 (fetch) throws `implement loadSets() for this festival`, that is
this exact step having been skipped — come back here, don't work around it.

Which shape to write follows directly from the Step 2 fork:

- **Vendor API** (`festivals/atn26/src/index.ts`) — `createFestival` builds a small config object
  (event/edition slugs, the vendor token from `config.secrets`) and hands it to the shared adapter
  factory instead of writing a bespoke `LineupSource`:
  ```ts
  const appmiralConfig = { event: ATN_EVENT, edition: config.edition ?? ATN_EDITION, xProtect: xProtect ?? "" };
  const appmiralOpts = { file: SCHEDULE_FILE, cacheDir: config.cacheDir, live: config.live };
  sources.lineup = createAppmiralLineupSource(appmiralConfig, appmiralOpts);
  ```
  `file` doubles as both what `loadSets()` reads by default (the bundled snapshot, for
  offline/deterministic planning) and what `fetch-lineup` (`LineupSource.refresh`) re-writes from
  the live API. If the new festival's vendor isn't Appmiral, write the equivalent adapter under
  `packages/adapters/` following that shape — a config object in, a `LineupSource` out.

- **Scrape** (`festivals/ps26/src/lineup.ts`) — write a `LineupSource` directly: a `parseLineup()`
  that turns the festival's own raw JSON shape into `ArtistSet[]`, a `loadSets()` that reads the
  committed snapshot file and parses it, and a `refresh()` that fetches live, parses to count sets,
  and writes the new snapshot (guarded by the shared shrink-guard so a bad fetch can't clobber a
  good snapshot with a shrunken one):
  ```ts
  return {
    async loadSets() {
      return parseLineup(JSON.parse(readFileSync(file, "utf8")) as RawLineup);
    },
    async refresh({ force = false } = {}) {
      const raw = await fetchLineupRaw(...);
      const fetched = parseLineup(raw).length;
      const decision = refreshDecision(fetched, countSets(file), force);
      writeFileSync(decision.write ? file : `${file}.fetched.json`, JSON.stringify(raw, null, 2));
      return { fetched, written: decision.write, ... };
    },
  };
  ```
  Wire it into `festivals/<slug>/src/index.ts` as `sources.lineup = createLineupSource()`, mirroring
  `ps26/src/index.ts`.

Either way, this step ends when `festivals/<slug>/src/index.ts` no longer depends on the
template's throwing `loadSets()` — check the diff, don't just eyeball the file.

## Step 5 — Fetch the snapshot

```
ACTIVE_FESTIVAL=<slug> ./festplan fetch-lineup
```

Then **report the numbers out loud**, not just "done": set count, stage count, and the first and
last set's artist/time. A snapshot with 3 stages when the festival's site advertises 20 is a
failed fetch that looks exactly like a successful one from the command's exit code alone — the
count is the only thing that catches it here.

## Step 6 — Timezone anchor (required gate — do not skip)

Ask the operator: **name one act whose real-world set time you already know** (from the
festival's own site, a poster, anywhere trusted). Then run:

```
ACTIVE_FESTIVAL=<slug> ./festplan now "<that day/time>"
```

and confirm that act appears with the exact time given. **Do not proceed past this step until it
matches.** An off-by-one-hour (or off-by-several) timezone bug is invisible in the data — the JSON
still parses, every set still looks plausible, nothing errors — and it is wrong in every reply
this bot ever gives about the festival until someone happens to catch it by cross-checking a fact
they already knew. This is the same anchor `festivals/atn26/CONTEXT.md` documents for itself
(a headliner's known set time) — set an equivalent one here before trusting anything else.

If it doesn't match: check whether the source's `start`/`end` times are UTC needing conversion to
`festival.json`'s `timezone`, or already local and being double-converted. Fix the adapter, not
the manifest.

## Step 7 — Venues and walk graph

Check whether the chosen lineup source exposes real stage coordinates (a `maps`/`pois`-shaped
endpoint returning lat/lng, not just a static map image):

- **Has real POI coordinates** →
  ```
  ACTIVE_FESTIVAL=<slug> ./festplan walk-refine --commit
  ```
  (run once without `--commit` first to preview the diff). This matches `venues.json` stages to
  POIs by name and computes edges from real distance.
- **No coordinates, only a map image or nothing** → the manual path in `docs/setup/walk-graph.md`:
  read stage pixel positions off a map image, calibrate a pixels-to-metres scale from a couple of
  known real-world distances, and cross-check each stage position by reading it twice
  independently before trusting the derived edges.

Either way, **report the edge count and the longest edge** — a graph with far fewer edges than
`stages choose 2`, or one absurdly long edge, is visible immediately in those two numbers and easy
to miss by skimming the JSON.

## Step 8 — Favourites

This is a real fork, not a formality — ask the operator explicitly which applies
(`docs/setup/clashfinder.md` has the full distinction):

- **A public Clashfinder event already exists that someone else owns.** Anyone can create one, so
  check who actually runs it — often an independent user rather than the festival (PS26's is). Use
  its event id directly, read-only: this deployment never writes to an event it doesn't own.
  (`festivals/ps26`'s model.)
- **This deployment publishes its own mirror.** Pick an event id you'll own, wire `cf-push
  <event>` into the operator's own workflow, and know that from this point *you* are responsible
  for keeping it in sync. (`festivals/atn26`'s model — used because Appmiral has no public
  per-user favourites mechanism of its own.)

Wire the chosen event id into `festivals/<slug>/src/index.ts` via
`createClashfinderFavouritesSource(<event>, { authUsername, authPublicKey, cacheDir })`, gated
behind `config.secrets?.clashfinder` being present (mirror how `atn26/src/index.ts` and
`ps26/src/index.ts` both do it) so a clone with no secrets still plans, just without favourites.

## Step 9 — Verify

Run the actual commands, don't just assert the module is wired:

```
ACTIVE_FESTIVAL=<slug> ./festplan now
ACTIVE_FESTIVAL=<slug> ./festplan at "<day time>"
ACTIVE_FESTIVAL=<slug> ./festplan myday <cf-user-or-handle> <day>
```

For `myday` you'll need at least one real or test Clashfinder profile with a star or two on it —
ask the operator for one if none exists yet.

Report which sources actually produced output (lineup, favourites, weather if coordinates were
set) and which are unwired for this festival (e.g. no `announcements`/`pages`/`map` source if the
vendor doesn't expose one) — **do not claim a source works unless you just exercised it in this
step.**

## Ending — print, don't flip

Print the line the operator needs to add to their own `CLAUDE.md` to make this festival active:

```
@festivals/<slug>/CONTEXT.md
```

**Do not edit `CLAUDE.md` yourself, and do not add this line for them.** Switching the active
festival changes what every subsequent query in this repo plans against — every user-facing
command, every background watch — so that switch stays a deliberate act the operator makes
themselves, at a time of their choosing (e.g. once they're satisfied Steps 4-8 held up over more
than one test run), not a side effect of running this skill.
