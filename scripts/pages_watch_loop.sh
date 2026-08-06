#!/usr/bin/env bash
# Info-pages watch loop — mirrors schedule_watch_loop.sh, driven by
# `festplan pages-tick`. Diffs ATN's Appmiral CMS pages (/pages) by modified_at
# and prints NOTHING unless a page was added / removed / edited — silent Monitor.
# Surfaces the change only; the session decides whether an update is worth delving
# into. Same 20-30 min jittered cadence and x-protect auth as the lineup pull.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ERRLOG="cache/atn26/pages_watch.err"
mkdir -p cache/atn26

while true; do
  ./festplan pages-tick 2>>"$ERRLOG" || true
  sleep $(( 1200 + RANDOM % 600 ))
done
