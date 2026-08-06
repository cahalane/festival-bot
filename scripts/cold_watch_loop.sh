#!/usr/bin/env bash
# Cold-snap tick — forecast-based cold alerts for users who opted in via
# prefs.json `coldAlert` (a crew member asked for it on 2026-07-31, camping at ATN).
#
# SILENT unless an alert is due, same contract as the other watches. State lives
# in cache/<festival>/cold_alert_state.json so each cold EPISODE fires once —
# not once per tick — and survives the session going down.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ERRLOG="cache/cold_watch_loop.err"
mkdir -p cache

while true; do
  ./festplan cold-tick 2>>"$ERRLOG"
  # 20-30 min, jittered — matches the other watches. A cold night arrives
  # slowly; there is nothing to gain from checking harder.
  sleep $((1200 + RANDOM % 600))
done
