#!/usr/bin/env bash
# Imminent-rain tick — the standing watch on the day ahead (operator request, 2026-07-31).
#
# The daily card is written once each morning; this catches rain that arrives
# AFTER it was written, which the card structurally cannot do.
#
# SILENT unless rain is newly imminent or has got materially worse. State lives
# in cache/<festival>/rain_alert_state.json so one episode warns once and
# survives the session going down.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
SLUG="$(./festplan active-festival)"
ERRLOG="cache/$SLUG/rain_watch_loop.err"
mkdir -p "cache/$SLUG"

while true; do
  ./festplan rain-tick 2>>"$ERRLOG"
  # 20-25 min, jittered. The operator asked for ~20; Open-Meteo is keyless but not
  # free of rate limits, and the forecast simply does not update faster.
  sleep $((1200 + RANDOM % 300))
done
