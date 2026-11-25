#!/usr/bin/env bash
# Draft-act watch loop — the command behind the session's draft Monitor.
#
# Each tick asks the active festival's lineup source which acts it has staged but
# not published (Aloompa: performers linked to draft events). SILENT unless a new
# draft appears; `festplan draft-tick` keeps its seen-set in cache/<festival>/ and
# appends to cache/<festival>/draft_changes.log after reporting. Only arm this for a
# festival whose lineup source implements drafts() (see the bootstrap skill).
#
# Interval: 20-30 min by default; a festival can override it in
# festivals/<slug>/watch.conf with DRAFT_TICK_MIN_S / DRAFT_TICK_JITTER_S.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
SLUG="$(./festplan active-festival)"
ERRLOG="cache/$SLUG/draft_tick.err"
mkdir -p "cache/$SLUG"
DRAFT_TICK_MIN_S=1200
DRAFT_TICK_JITTER_S=600
# shellcheck disable=SC1090
[ -f "festivals/$SLUG/watch.conf" ] && . "festivals/$SLUG/watch.conf"

while true; do
  ./festplan draft-tick 2>>"$ERRLOG" || true
  sleep $(( DRAFT_TICK_MIN_S + RANDOM % DRAFT_TICK_JITTER_S ))
done
