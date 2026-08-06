#!/usr/bin/env bash
# Official-announcements watch loop — mirrors schedule_watch_loop.sh, driven by
# `festplan announce-tick`. Polls the active festival's official news feed — if its
# module declares an announcements source — and prints NOTHING unless a new post
# landed. Silent Monitor, 20-30 min jittered cadence, same auth as that festival's
# lineup pull.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
# Resolved once at startup; switching the active festival requires restarting this loop.
SLUG="$(./festplan active-festival)"
ERRLOG="cache/$SLUG/announce_watch.err"
mkdir -p "cache/$SLUG"

while true; do
  ./festplan announce-tick 2>>"$ERRLOG" || true
  sleep $(( 1200 + RANDOM % 600 ))
done
