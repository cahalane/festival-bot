#!/usr/bin/env bash
# Lineup watch loop — the command behind the session's schedule Monitor.
#
# Each tick re-pulls the active festival's lineup from its live source and diffs it
# against the saved baseline. It prints NOTHING while the lineup is unchanged, so a
# quiet festival never wakes the session; a change (or a source that has gone properly
# dark) is the only thing that produces a line.
#
# `festplan schedule-tick` advances the baseline and appends to
# cache/<festival>/schedule_changes.log once it has reported a change, so each change
# announces itself exactly once — and is still on disk if the session was down for it.
#
# Interval: 20-30 min (2-3 checks/hour) by default, jittered so we don't hammer the
# rate-limited API on a fixed beat. A festival can override it with an optional
# festivals/<slug>/watch.conf setting SCHEDULE_TICK_MIN_S / SCHEDULE_TICK_JITTER_S (e.g. ov26,
# whose surprise pop-up gigs are over before a 30-min tick would see them). Stderr is kept OFF stdout: only real news should notify.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
SLUG="$(./festplan active-festival)"
ERRLOG="cache/$SLUG/schedule_tick.err"
mkdir -p "cache/$SLUG"
SCHEDULE_TICK_MIN_S=1200
SCHEDULE_TICK_JITTER_S=600
# shellcheck disable=SC1090
[ -f "festivals/$SLUG/watch.conf" ] && . "festivals/$SLUG/watch.conf"

while true; do
  ./festplan schedule-tick 2>>"$ERRLOG" || true
  sleep $(( SCHEDULE_TICK_MIN_S + RANDOM % SCHEDULE_TICK_JITTER_S ))
done
