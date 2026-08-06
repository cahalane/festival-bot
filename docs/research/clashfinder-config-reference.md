# Clashfinder config language — reference

Summarised from Clashfinder's in-app Command Reference (2026-06-18). This is the "setup text"
language used to define an event. Our exporter emits a subset; full command list below.

## The `act` command (the important one)

Two forms — **we use the JSON form** (self-contained per line, comma-safe, absolute local times):

```
act = {"start":"2026-04-17 18:45","end":"2026-04-17 19:00","stage":"The Church","act":"Opening Note"}
```

- `start` / `end` — `yyyy-mm-dd hh:mm`, 24-hour, **local wall-clock** (no timezone). `end` optional
  (CF estimates a changeover if omitted).
- `stage` — stage display name (a row). `act` — act name.
- Optional keys: `artist`, `blurb` (short description), `url`, `estd` (`1` if times estimated),
  `mbid` (MusicBrainz id).

**Comma-separated form** (`act = start, stop, name [!sure|!unsure]`) needs `day`/`date`/`stage`/
`title` state set first and uses `hh:mm` only; `stop` may be `len=>2:00` or `co=>0:00`. We avoid it.

## Event/header directives (go in editor field `input0`)

| Command | Meaning |
|---|---|
| `maintitle = <text>` | Event title shown atop every page. |
| `timezone = <IANA tz>` | e.g. `Europe/Dublin`. |
| `dateFormat = <fmt>` | e.g. `dddd dS mmmm`. |
| `daychangeover = hh:mm` | Times before this roll to the previous night (default `08:00`). Set to the festival's day cutoff. |
| `printAdvisory = 1..5` | Print-readiness advisory (1 = print now, 5 = hold). |
| `footer = <text>` | Footer line (repeat for up to ~3 lines). |
| `hashtags = #tag @handle` | Tweet-button tags. |
| `pdfAdr = <url>` | Link to a PDF version. |
| `confidence = low\|high` | Confidence of following acts (low = grey, high = red). CSV form only. |
| `actNameRemovePrefix/Suffix/String = <s>` | Auto-derive artist names by stripping `DJ:` etc. |

## Day/stage state (CSV-form only — unused by us)
`day = <handle>`, `title = <day title>`, `date = dd/mm/yyyy`, `stage = <name>`.

## Landing-page commands
`lpHeading`, `lpSubheading`, `lpDate`, `lpPara`, `lpHR`, `lpRevisions` (revision history block),
`lpComments` (user comments block). Any `lp*` use auto-creates a landing page.

## Editor save (write) — field split
The editor POST (`/s/<event>/?edit`) splits the setup text into two textareas:
- **`input0`** = the header/directives block above (maintitle, timezone, dateFormat, printAdvisory,
  footer×N, daychangeover, lpRevisions, lpComments).
- **`input1`** = the `act = {...}` lines (`\r\n`-separated).

Plus metadata fields: `user=`, `revNote=<note>`, `entData=Update`, and `cinfo-*` (desc, private=0,
whoCanEdit=anyone, whoCanTag=anyone, autoMbIdTagging=1, …, xlSetup=<default>). Auth is via login
cookies. See `clashfinder-export.md` for the push recipe.
