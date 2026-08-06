#!/usr/bin/env bash
# Reminder tick — the wake loop behind data/reminders.json.
#
# The QUEUE is the source of truth, not this loop (CronCreate here is session-only
# even with durable=true — verified via CronList — so a cron-only reminder would be
# lost on restart). This just wakes the session; anything missed while it was down
# fires late on the next tick rather than being dropped.
#
# SILENT unless something is due, same contract as the watch loops: no output means
# nothing to send, so an idle festival never wakes the session.
#
# Note the items are INSTRUCTIONS to the session, not user-facing text — a vibe check
# has to be generated at send time, not stored. The session reads the due item, does
# the work, sends the result, then marks it fired. Marking fired is deliberately NOT
# automated here: if the loop marked them itself, a reminder could be consumed while
# the session was mid-send or down, and the user would simply never get it.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ERRLOG="cache/reminders_loop.err"
mkdir -p cache

while true; do
  # Filter to DUE lines: `reminders due` prints "(none due)" rather than staying
  # quiet, so testing the raw output for non-emptiness would fire every tick
  # forever and bury the session in false alarms.
  out=$(./festplan reminders due 2>>"$ERRLOG" | grep '^DUE ' || true)
  if [ -n "$out" ]; then
    echo "REMINDER DUE:"
    echo "$out"
    echo "ACTION: do what the item says, send it, then ./festplan reminders fired <id>"
  fi
  # 5 min: fine-grained enough that a reminder lands within a few minutes of its
  # time, cheap enough that a quiet day costs nothing.
  sleep 300
done
