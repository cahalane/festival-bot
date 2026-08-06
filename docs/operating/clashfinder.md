# Maintaining a favourites mirror

Some lineup sources have no public per-user favourites/starring mechanism of their own. A common
workaround is to run a lightweight mirror on a third-party favourites tool (Clashfinder or
similar) that the bot owns and publishes to, so the crew can star acts there and have the bot
resolve those stars back into the official lineup. If your deployment runs one of these mirrors,
these are the operational rules that came out of running one live across two festivals.

## Pushing the mirror is the job, not a favour

Maintaining the mirror in sync with the real lineup is a standing responsibility, not a follow-up
step that only matters when messaging an affected person. Push it on **every** real lineup change
— a time move, a stage move, a cancellation, an addition — unprompted, and regardless of whether
anyone currently has that act starred. The reasoning that "nobody has this starred today, so it's
low priority" is exactly backwards: someone can star it tomorrow, and if the mirror is stale by
then, they're starring an act at the wrong time or on the wrong stage without knowing it.

This was learned the hard way: on separate occasions, a real schedule move was correctly diffed,
the affected person (if any) was correctly identified and told — and the mirror itself was left
stale, because the push had been mentally filed under "part of telling people," and when nobody
needed telling, the push got skipped along with it. The mirror is the crew's shared source of
truth; it is wrong the moment the underlying lineup changes, independent of who has noticed yet.
**Push first, then work out who to message** — not the other way around.

The one legitimate exception is a purely cosmetic change with no time or stage delta (a rename, a
capitalisation fix) — pushing that risks disturbing an existing star for genuinely zero benefit.
Even then, don't skip it silently: note that you're deliberately not pushing and why, so it
doesn't look like the same omission as above.

## The foreign-edit guard

A mirror push typically works by replacing the *entire* event's setup in one call — there's no
partial-update API. If anyone other than the bot can also edit the mirror directly (an operator
adding a set by hand, a crew member fixing something themselves), a naive push will silently
clobber that edit the next time the bot runs. Before pushing, check who made the last edit to the
target event. If it wasn't the bot, pull the current state and get a human decision on how to
reconcile before overwriting — don't push blind just because a change needs syncing. A shared
mirror that gets silently blown away by automation is worse than a mirror that's briefly behind.

## Display-name overrides apply at push time only

If the mirror needs display names that differ from the planner's internal/canonical names (a
title-cased or abbreviated form for readability, say), apply that mapping only when generating the
push payload — never rename anything in the planner's own data. The planner's internal names are
what favourites resolution matches against; if a display override leaks into the data the planner
actually reads, star-matching breaks for the renamed act. Keep the override strictly cosmetic and
strictly one-directional (planner name → mirror name), applied at the moment of export.

## Duplicate act names are a silent star-breaking hazard

If two different acts on the mirror end up sharing the same display name, a star against one can
become ambiguous — the mirror can't tell which instance a given id was meant to reference, and the
resolver may silently match the wrong one or drop the star entirely. When pushing, watch for name
collisions across the acts you're exporting and disambiguate them (a venue or set-time suffix is
usually enough) before they reach the mirror, rather than discovering after the fact that
someone's star silently stopped resolving.
