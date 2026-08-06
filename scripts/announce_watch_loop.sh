#!/usr/bin/env bash
# Official-announcements watch loop — mirrors schedule_watch_loop.sh, driven by
# `festplan announce-tick`. Polls ATN's Appmiral push/news inbox (/notifications)
# and prints NOTHING unless a new official post landed — silent Monitor. Same
# 20-30 min jittered cadence and x-protect auth as the lineup pull.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ERRLOG="cache/atn26/announce_watch.err"
mkdir -p cache/atn26

while true; do
  ./festplan announce-tick 2>>"$ERRLOG" || true
  sleep $(( 1200 + RANDOM % 600 ))
done
