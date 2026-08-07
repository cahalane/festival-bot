# Weather

Weather comes from [Open-Meteo](https://open-meteo.com), a free, **keyless** forecast API —
nothing to configure in `config/secrets.json` for this one. It replaced an earlier AccuWeather
integration (dropped over pricing); Open-Meteo's free tier is generous enough for a festival
weekend's worth of polling.

## Coordinates

The adapter needs a single lat/lon pair, read from the active festival's `festival.json`:

```json
"coordinates": { "lat": 52.296, "lon": -7.353 }
```

If a festival module has no `coordinates` field, its weather source is left unwired — `demofest`
does this deliberately, both because it's a synthetic festival with no real location and to keep
the test suite off the network. Add coordinates when you set up a real festival to enable
`weather`, `cold-tick`, and `rain-tick`.

## The daily card

```
./festplan weather [--days N] [--png FILE]
```

Pulls the daily forecast (max/min temp, precipitation sum, precipitation probability) over the
festival window and optionally renders a shareable PNG card. This is a planning document written
once — it tells you what to expect for the day, not what's about to happen in the next hour. That
gap is deliberate, and it's exactly what the two watches below cover.

## The rain watch (`rain-tick`)

Unattended, silent unless rain is imminent or an already-flagged episode gets worse. Looks
`RAIN_LOOKAHEAD_HOURS` (6) hours ahead for a contiguous run of wet hours. Two separate bars are at
work here, and conflating them is what made an earlier version cry wolf:

- **What counts as a wet hour** (`WET_HOUR_MM`, 0.1mm) — used only to measure how far an episode
  extends. It requires **actual millimetres**, not just a raised probability: a 60% chance of 0.0mm
  is a cloudy afternoon, not rain.
- **Whether the episode is worth telling anyone about** (`alertWorthy`) — this defers to
  `rainSeverity`, so **drizzle never alerts**; only `rain` (peak ≥1mm or total ≥2mm) or `downpour`
  (peak ≥4mm or total ≥8mm) do.

A 0.1mm episode is therefore measured but never sent. That second bar exists because the watch once
fired at 01:05 over a tenth of a millimetre, then fired three times in twelve hours across a day of
light drizzle — see the drizzle story in
[`docs/operating/watches-and-alerts.md`](../operating/watches-and-alerts.md). Keeping one definition
of "how bad is this" (`rainSeverity`) rather than two is deliberate.

Fires once per episode, re-alerting only if the episode gets materially worse (`MATERIAL_WORSE_MM`,
1mm) — the daily-card gap this fills is weather *arriving* after the card was already written.

## The cold watch (`cold-tick`)

Same shape: unattended, silent unless due, one alert per episode. Two deliberate design choices,
both from the same real complaint (a crew member camping on site, cold overnight):

- It does **not** report the current temperature — being told it's cold while you're already
  cold isn't actionable. It looks a few hours ahead so the alert arrives before you need the
  extra layer.
- It alerts on **feels-like** temperature by default, not raw air temperature, because that's
  what a tent at 3am actually feels like — the triggering night was 9°C air on the wind, which
  reads much colder apparent.

Default threshold is 7°C feels-like; a user opts in and can override it per-person via
`prefs.json`'s `coldAlert.belowC`.

## Threshold philosophy

Both watches are tuned to one question: **would anyone actually act on this?** A watch that fires
on every fluctuation gets muted within a day, and a muted watch protects nobody — better to under-
alert on genuinely marginal conditions than to train the crew to ignore pings. If a threshold
feels too conservative for your festival's climate, adjust it, but keep the same bar: don't alert
on something nobody would change their plans over.
