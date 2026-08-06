#!/usr/bin/env bash
# Info-pages watch loop — mirrors schedule_watch_loop.sh, driven by
# `festplan pages-tick`. Diffs the active festival's info/CMS pages by their
# modified timestamp — if its module declares a pages source — and prints NOTHING
# unless a page was added / removed / edited. Silent Monitor. Surfaces the change
# only; the session decides whether it is worth acting on. 20-30 min jittered
# cadence, same auth as that festival's lineup pull.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
# Resolved once at startup; switching the active festival requires restarting this loop.
SLUG="$(./festplan active-festival)"
ERRLOG="cache/$SLUG/pages_watch.err"
mkdir -p "cache/$SLUG"

while true; do
  ./festplan pages-tick 2>>"$ERRLOG" || true
  sleep $(( 1200 + RANDOM % 600 ))
done
