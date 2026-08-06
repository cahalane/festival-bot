#!/usr/bin/env bash
# Site-map watch loop — mirrors schedule_watch_loop.sh's contract, driven by the
# TS `festplan map-check` command (packages/cli/src/map-watch.ts) rather than a
# standalone script, per the project's single-TS-toolchain convention.
#
# Polls the Appmiral maps/pois endpoints for the active ATN26 edition. Prints
# NOTHING while the map is unpublished (empty data) — silent Monitor, same
# convention as the schedule watch. The moment it publishes, `map-check` caches
# the raw dump (cache/atn26/map_raw.json), prints ONE "MAP AVAILABLE (atn26): ..."
# line, and marks itself done (cache/atn26/map_reported.flag) so it never re-fires.
#
# Interval: 20-30 min (2-3 checks/hour), jittered — same rate-limit posture as
# the schedule watch (map + POIs are heavier pulls than a lineup diff, no need to
# hit them more often).
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
# Resolved once at startup; switching the active festival requires restarting this loop.
SLUG="$(./festplan active-festival)"
ERRLOG="cache/$SLUG/map_watch.err"
mkdir -p "cache/$SLUG"

while true; do
  ./festplan map-check 2>>"$ERRLOG" || true
  if [ -f "cache/$SLUG/map_reported.flag" ]; then
    break
  fi
  sleep $(( 1200 + RANDOM % 600 ))
done
