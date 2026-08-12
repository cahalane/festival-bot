# Scraped lineup — the no-API path

When your festival has no official app / no identifiable vendor API, the lineup has to come from
whatever public source the festival actually exposes: a GraphQL endpoint behind its site, a rendered
page with an embedded JSON blob, a PDF timetable — whatever it is. `festivals/ps26` is the reference
module for this path (source:
[`festivals/ps26/knowledge/data-source.md`](../../festivals/ps26/knowledge/data-source.md), which is
the detailed account this doc summarises — read it for the exact endpoint shapes if you're building
against a similar site).

## Where scrapes break

A scraped source is, definitionally, not a contract — it can change shape or go away without
notice, unlike a documented API. In `ps26`'s case the lineup comes from a GraphQL endpoint that
happens to have no auth and a stable query shape, but the concrete risks that showed up in
practice generalise to any scrape:

- **Field surprises.** ps26's feed returns `dateTimeStartReal` as epoch milliseconds *as a
  string*, and one `duration: 720` entry that's actually the venue's 12-hour opening window, not
  a band — filtered out by hand once discovered. Expect your source to have quirks like this;
  don't assume the first successful parse caught everything.
- **Two similarly-shaped feeds that are not the same event.** ps26's endpoint serves both the
  main festival and a separate off-site city programme (`--ciutat`) on the same query shape with
  a different `name` variable — easy to conflate if you're not careful about which one you're
  reading.
- **The feed shrinking on you.** Covered next — this is the one with a dedicated guard.

## Why the snapshot is committed

The lineup you fetch is written to `festivals/<slug>/schedule.json` and **committed to the
repo**, not fetched live on every command. Two reasons: it makes the planner usable offline /
without network flakiness on every query, and it means a bad fetch can be *seen* in a diff before
it becomes the thing every user-facing command relies on. Refresh it deliberately with
`./festplan fetch-lineup [--force]`, not implicitly.

## The shrink guard (`packages/adapters/src/refresh.ts`)

The lesson baked into this guard came from a real incident with ps26: a live feed prunes past
acts once the event is over, so a routine re-fetch after the festival can legitimately come back
*smaller* than the snapshot it would replace. Silently overwriting a fuller, correct snapshot
with a degraded (or genuinely pruned) one is exactly the kind of failure that's invisible until a
user asks about a set that's quietly vanished.

`refreshDecision()` makes the call:

- **Fetched count ≥ previous** → always write. Growth or a same-size refresh is never suspicious.
- **A shrink below ~80% of the previous count** → never write, regardless of any other signal.
  That large a drop is an implausible number of real cancellations — it reads as a broken fetch
  (bad response, wrong query, partial page), not schedule churn. `--force` is the explicit
  override for the rare case you're sure otherwise.
- **A smaller shrink, with no information about *which* sets vanished** → don't write. Can't tell
  pruning from cancellation from the count alone, so the guard stays conservative.
- **A smaller shrink, classified by `classifyRemoved()`** — the key refinement, and the actual
  lesson: **the guard classifies each missing set as past or future relative to now.** Sets
  missing from the *past* are legitimate pruning — the festival is over (or that slot already
  happened) and the feed cleaned up after itself; that's fine to write. Sets missing from the
  *future* are cancellations at best and a broken fetch at worst, and either way the guard treats
  any future-set loss as significant enough to report rather than silently accept.

This split matters because "is the festival still running" isn't the right question — a feed can
prune past sets *while the festival is still live* (yesterday's sets disappearing is normal
mid-weekend), and conflating "any shrink during a live festival is suspect" with "any shrink at
all is suspect" produces exactly the false positive that shipped first, before the guard was
sharpened to ask about specific sets rather than overall event state.

## Per-artist enrichment (optional)

ps26 enriches per-artist text via `artist-info.ts`, wired to `./festplan artist-info <slug>`. This is
a separate, optional concern from the lineup fetch — build it only if your festival carries useful
artist text and you want richer recommendations/blurbs. Not every artist will have one; handle an
empty bio as expected, not an error.

**Check for an API before you commit to the scrape.** ps26 read that bio out of the page's
`window.__INITIAL_DATA__` blob for a long time before anyone noticed the blob is just a *render of
the festival's own GraphQL API* — and that the API serves the same tree directly, batched, without
an HTML parse. The scrape survives only as a fallback. If a page embeds a big JSON blob, ask where
that blob comes from before you write a parser for it; see
[`primavera-graphql-api.md`](../research/primavera-graphql-api.md) for how that was traced.
