# Greencopper discovery — finding and decrypting your festival's content bundle

**Greencopper** (now **Leap Event Technology**, formerly on `greencopper.com`) is a white-label
festival-app platform used by 300+ events — Electric Picnic, Roskilde, Leeds, Download and others.
If your festival's official app is built on it, its whole programme is reachable, but **not** the way
Appmiral's is: there is no per-resource REST API. The app ships an encrypted **content bundle** and
updates it over the air.

`festivals/ep26` is a working reference module built against it. The raw research is
[`docs/research/greencopper-content-api.md`](../research/greencopper-content-api.md).

Take this path when your festival **has an official app on Greencopper**. If it is on Appmiral, see
[`appmiral-discovery.md`](appmiral-discovery.md); if there is no app at all, see
[`scraped-lineup.md`](scraped-lineup.md).

## 1. Is your festival on Greencopper?

The Android package is `com.greencopper.android.<name>` (e.g.
`com.greencopper.android.electricpicnic`). Older or rebranded apps may use `com.greencopper.<name>`.
If the package does not match that shape it is probably not Greencopper.

Note that the vendor's own public API docs are **gone** — the Confluence space redirects to
`patrontech.atlassian.net` and 404s, and the historical `api3.greencopper.com` host no longer
resolves. Everything below was recovered from the app binary, not from documentation.

## 2. Pull the APK and read `runConfig.json`

Unlike Appmiral, the interesting value is **not** buried in compiled resources — it is a plain JSON
asset:

```
unzip -o base.apk 'assets/content/*' -d out
cat out/assets/content/runConfig.json
```

```json
{ "content": {
    "fileName": "content_v25.zip",
    "secret": "<32 hex chars>",
    "schema": 1,
    "version": 25,
    "project": "electricpicnic-2026",
    "deprecatedProjects": ["electricpicnic-2024", "electricpicnic-2025"] } }
```

`project` is the project tag and `secret` is the bundle-decryption key. Both are per-project.

## 3. Get the OTA url out of the bundled snapshot

`assets/content/<fileName>` is the **bundled** content bundle — already stale the day the app ships.
Decrypt it (step 4) and read `core/config.json`:

```json
{ "ota":         { "apiUrl": "https://api.mobile.leapevent.tech/ota/<project>/<32-hex token>/" },
  "remoteState": { "apiUrl": "https://user-state.mobile.leapevent.tech/prod/states/<project>" },
  "timezone":    "Europe/London" }
```

The OTA url embeds a second 32-hex path token, distinct from `secret`. **Do not trust
`core/config.json`'s `timezone`** — Electric Picnic's says `Europe/London` for an Irish festival.
Set the real IANA zone in `festival.json` yourself.

## 4. The bundle password — the one non-obvious step

Bundles are **WinZip AES-256** zips. The password is not the secret; it is the secret spliced into
the filename, from `ConcreteContentArchiveOpener.kt`:

```
password = fileName.replace(".zip", secret + "zip")
```

So `content_v39.zip` with secret `abc…` gives `content_v39abc…zip`. It is derived **per file**, so
every OTA version has a different password even though the secret never changes — always derive it
from the filename you actually downloaded. `greencopperBundlePassword()` does this and refuses a
non-`.zip` name rather than producing a silently wrong password.

You do not need a zip library: `readAesZipEntries()` implements WinZip AES over `node:crypto` and
`node:zlib`, keeping this repo dependency-free.

## 5. The OTA feed

`GET {otaApiUrl}` (no auth beyond the path token) returns a JSON array:

```json
[ { "version": 39, "schema": 1, "type": "release",
    "url": "https://content.greencopper.net/<project>/<token>/content/content_v39.zip",
    "date": "2026-08-22T14:03:24Z", "project": "electricpicnic-2026" },
  { "version": 40, "type": "in_progress" } ]
```

Take the highest `version` whose `type` is `"release"`. **`in_progress` and `draft` entries are
unpublished editor previews with a higher version than the live one** — serving those shows the crew
a schedule the festival has not published. `pickLatestRelease()` enforces this.

## 6. Field mapping

Inside the bundle, `event/data/`:

- `scheduleItems.json` — `{ id, activityId, name, description, stageId, tags }`
- `timeSlots.json` — `{ scheduleItemId, dayOfEvent, startDate, endDate }`, one-to-many
- `stages.json` — `{ id, name, order }`
- `performers.json` — empty in practice

Two traps:

- **Names are indirection keys.** A schedule item's `name` is `activity_name_<id>`, not the act
  name; resolve it against `core/strings/<locale>.json`. An unresolved key must never reach a user
  as if it were an act name — the parser drops those rows.
- **Times already carry a local offset** (`2026-08-30T22:30:00+01:00`). Parse them as instants and
  render in the festival timezone. Re-applying the zone shifts every set.

A set whose `stageId` is null is dropped as unplannable, exactly as in the Appmiral adapter — do not
infer a stage from sibling sets.

## 7. Keep the secret out of the repo

`secret` and the OTA token are embedded in the shipped app, not per-user credentials, but a working
value committed to a public repo invites volume use and the predictable response is the vendor
rotating it. Keep them in `config/secrets.json` (gitignored) under `greencopper.secret`.

## 8. Verify before trusting it

Do the timezone-anchor check from [`getting-started.md`](getting-started.md): pick one act whose
real set time you already know and confirm the parsed data reproduces it exactly. ep26's anchor is
Fontaines D.C. closing the Main Stage Sun 30 Aug 22:30–00:00.

**Expect the bundle to move fast close to the festival.** EP published v39→v42 within 48 hours, and
v42 added the entire main-arena programme that v39 lacked. Re-fetch before relying on coverage, and
re-check any local `extra-sets.json` for entries the app has since caught up on — those become
duplicates.
