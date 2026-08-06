#!/usr/bin/env bash
# Daily weather loop — the command behind the session's daily weather Monitor.
#
# Unlike the other watch loops, this one is NOT silent-unless-changed: the operator
# asked for a forecast update every day as the festival approaches (2026-07-25), because
# the multi-day outlook shifts materially day to day and the crew plan off it. So it
# emits the full festival-window forecast once per day and nothing at any other time.
#
# Timing: sleeps until the next HOUR:00 in the FESTIVAL's own timezone, resolved via
# `festplan active-festival --json` (which reads the active module's manifest.timezone),
# not the machine's — so it stays correct if the box is on another TZ, and across a DST
# boundary. It re-computes the sleep every iteration rather than assuming a fixed 24h, so
# a drifting or suspended host self-corrects instead of skewing.
#
# Stderr is kept OFF stdout: only the forecast itself should notify the session.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# GNU-only: this loop's sleep-until-next-HOUR math depends on `date -d` and
# `date -Is`, neither of which BSD/macOS `date` supports. On those platforms
# `date -d ...` used to fail silently, target_local came back empty, and the
# loop just logged one line to $ERRLOG and slept an hour, forever — no daily
# card, no signal anywhere the session would actually see. Full BSD portability
# (rewriting every `date -d`/`date -Is` call as `date -j -f ...`) is more
# machinery than this loop is worth; fail loudly at startup instead so a
# misconfigured host is obvious immediately rather than a silent no-op.
if ! date -d "today" >/dev/null 2>&1; then
  echo "WEATHER LOOP ERROR: this script requires GNU date (date -d / date -Is)," \
    "which this host's 'date' does not support (looks like BSD/macOS date)." \
    "Install GNU coreutils and either alias 'date' to 'gdate' or run this loop" \
    "on a Linux host. Refusing to start rather than looping silently forever."
  exit 1
fi

# Resolved once at startup from the ACTIVE festival's own manifest (via `festplan
# active-festival --json`), so this loop stays correct for any festival's timezone, not
# just Dublin. FEST_TZ env var still wins if set explicitly (escape hatch / testing).
if [ -z "${FEST_TZ:-}" ]; then
  FEST_TZ="$(./festplan active-festival --json | sed -n 's/.*"timezone": *"\([^"]*\)".*/\1/p')"
fi
FEST_TZ="${FEST_TZ:-Europe/Dublin}"
HOUR="${WEATHER_HOUR:-9}"
SLUG="$(./festplan active-festival)"
ERRLOG="cache/$SLUG/weather_daily.err"
CARD="cache/$SLUG/weather_card.png"
mkdir -p "cache/$SLUG"

while true; do
  # Seconds until the next HOUR:00 in FEST_TZ, computed via epoch arithmetic so the
  # machine TZ never enters into it.
  now_epoch=$(date +%s)
  target_local=$(TZ="$FEST_TZ" date -d "today ${HOUR}:00" +%s 2>/dev/null)
  if [ -z "$target_local" ]; then
    echo "WEATHER LOOP ERROR: cannot compute next ${HOUR}:00 in ${FEST_TZ}" >>"$ERRLOG"
    sleep 3600
    continue
  fi
  if [ "$target_local" -le "$now_epoch" ]; then
    target_local=$(TZ="$FEST_TZ" date -d "tomorrow ${HOUR}:00" +%s)
  fi
  sleep $(( target_local - now_epoch ))

  # Retry before giving up: the 2026-07-26 miss was a single transient 503 that cost
  # the whole day's update. Three attempts two minutes apart covers a blip; anything
  # that survives that is a real outage and must be REPORTED, never silently skipped.
  out=""
  for attempt in 1 2 3; do
    out=$(./festplan weather 2>>"$ERRLOG")
    [ -n "$out" ] && break
    echo "$(date -Is) weather attempt ${attempt}/3 produced no output" >>"$ERRLOG"
    [ "$attempt" -lt 3 ] && sleep 120
  done

  if [ -n "$out" ]; then
    # Render the card BEFORE emitting anything. Monitor streams stdout, so printing
    # the text first wakes the session while chromium is still rendering — on
    # 2026-07-27 that had me inspect the card 9s into a ~20s render, find YESTERDAY's
    # file still on disk, and report a failure that hadn't happened. Emitting only
    # after the render settles means the CARD: line is true when it is read.
    #
    # Delete the old card first: a stale PNG is worse than no PNG, because it looks
    # like a valid card and would be sent to the crew as today's forecast. If every
    # attempt fails there is now simply no file to send by mistake.
    rm -f "$CARD"
    card_ok=""
    for attempt in 1 2 3; do
      if ./festplan weather --png "$CARD" >>"$ERRLOG" 2>&1; then
        card_ok=1
        break
      fi
      echo "$(date -Is) card render attempt ${attempt}/3 failed" >>"$ERRLOG"
      [ "$attempt" -lt 3 ] && sleep 120
    done

    echo "WEATHER UPDATE ($(TZ="$FEST_TZ" date +%Y-%m-%d)):"
    echo "$out"
    if [ -n "$card_ok" ]; then
      echo "CARD: $CARD"
    else
      echo "CARD: unavailable (3 render attempts failed — check $ERRLOG). Send the text"
      echo "summary above instead; do NOT go looking for an older PNG to send."
    fi
  else
    # Loud on purpose. Operator note, 2026-07-26: "if it fails again, then actually tell
    # me — don't just skip it." A failed update is itself news and must reach the operator.
    echo "WEATHER UPDATE FAILED ($(TZ="$FEST_TZ" date +%Y-%m-%d\ %H:%M)): 3 attempts, no forecast."
    echo "ACTION: message the operator (their chat_id, from config) NOW saying today's weather update failed."
    echo "Do NOT just investigate quietly — tell the operator first, debug after. Last errors:"
    tail -n 3 "$ERRLOG" 2>/dev/null | sed 's/^/  /'
  fi
  sleep 60 # clear the target minute so we cannot double-fire within the same hour
done
