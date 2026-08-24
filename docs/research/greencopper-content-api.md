# Greencopper / Leap content API — raw research

Recovered 2026-08-24 from `com.greencopper.android.electricpicnic` v7.0.3 (versionCode 29). This is
the working note behind [`docs/setup/greencopper-discovery.md`](../setup/greencopper-discovery.md);
the guide is the procedure, this is the evidence and the dead ends.

## Why the obvious routes fail

- Greencopper was acquired by **Leap Event Technology** and rebranded; `greencopper.com` now
  redirects to Leap marketing pages.
- Their public API Confluence space (`greencopper.atlassian.net/wiki/spaces/GE/...`) **302s to
  `patrontech.atlassian.net` and then 404s.** No public API documentation survives.
- `api3.greencopper.com`, cited in older third-party write-ups, **no longer resolves** (NXDOMAIN).
- The app's DEX is R8-obfuscated; a plain `strings` sweep of all four dex files surfaces **no**
  vendor host at all. The hosts live in the encrypted bundle, not the binary.

Everything below therefore came from the APK plus decompilation, not from documentation.

## Architecture

The app does not call a per-resource REST API. It ships an encrypted content bundle and replaces it
wholesale over the air:

```
assets/content/runConfig.json      plaintext: project tag + secret + bundled version
assets/content/content_v25.zip     the bundled snapshot, WinZip AES-256
        |
        +-- core/config.json       ota.apiUrl, remoteState.apiUrl, notification.apiUrl, timezone
        +-- core/strings/en-GB.json  the string table every name resolves through
        +-- event/data/*.json      scheduleItems, timeSlots, stages, activities, performers
        +-- maps/config.json       site map
```

## The password derivation

The single hardest thing to recover, and the thing everything else depends on.

`7z`/`pyzipper` reject the plain `secret`. Testing the WinZip-AES 2-byte password verifier directly
(PBKDF2-HMAC-SHA1, 1000 iterations, `dk[64:66]`) ruled out ~2,100 candidate derivations — plain,
upper/lower, reversed, md5/sha1/sha256/sha512 in hex and raw, base64, and every concatenation with
the project tag. All failed, so the answer was not a transform of the secret at all.

jadx on the whole APK **crashed** on the encrypted asset zip (`BufferUnderflowException`) and
produced nothing; decompiling the extracted `classes*.dex` directly worked but silently dropped the
`com.greencopper.core.content.ota` package on a multi-dex name collision. Decompiling
`classes3.dex` **alone** finally surfaced it.

`ConcreteContentArchiveOpener.kt` (`com/greencopper/core/content/archive/c.java`):

```java
String strU = zd0.s.U(name, ".zip", contentArchive.b + "zip", false);
```

That is `fileName.replace(".zip", secret + "zip")` — the secret spliced in place of the extension,
with the leading `content_vNN` retained:

```
content_v39.zip + 96fb…e71  ->  content_v3996fb…e71zip
```

Confirmed against the verifier, then by decrypting all 27 entries.

Kotlin `@Metadata` annotations survive R8 with original names intact, which is what made the
obfuscated code navigable at all — `ProjectParams(project, otaApiUrl)` and `OTAContent`'s field
list were both read straight out of `d2` arrays.

## OTA feed

`GET https://api.mobile.leapevent.tech/ota/<project>/<32-hex token>/` — no auth header, the token is
in the path. Returns `OTAContent[]`, serial field order from the `$$serializer`:

```
url, project, date, version, type, schema, creationDate, versionType
```

`type` is `release` | `in_progress` | `draft`. `ConcreteOTAManager.a()` filters to `Release` (plus
`Draft` only when a draft override is set), then takes `max(version)`.

Observed for `electricpicnic-2026`: 40 entries, v1 (2026-03-18) … v39 (2026-08-22), plus a v40
`in_progress`. Three more releases landed during this session — **v42 by 2026-08-24 14:47**.

Bundles are served from `https://content.greencopper.net/<project>/<token>/content/content_vNN.zip`.

## Schedule shape

`scheduleItems` and `timeSlots` are 1:N, joined on `scheduleItemId`:

```json
{ "id": 1711518960006337636, "activityId": 1711518959704347748,
  "name": "activity_name_1711518959704347748", "stageId": 1711512897458537744 }
{ "scheduleItemId": 1711518960006337636, "dayOfEvent": "2026-08-28T12:00:00+01:00",
  "startDate": "2026-08-28T16:30:00+01:00", "endDate": "2026-08-28T17:30:00+01:00" }
```

- Names and stage names are **string-table keys**, resolved via `core/strings/<locale>.json`.
- Times carry an explicit local offset; parse as instants, do not re-apply the zone.
- `performers.json` is `[]`.
- `core/config.json` claims `"timezone": "Europe/London"` for a festival in Co Laois. Do not trust it.

## Coverage moves fast, and unevenly

v39 (22 Aug) carried **843 plannable sets across 42 stages** — all fringe/area programming, and
**no main arenas at all**. The 79 Comedy acts were present but with `stageId: null`, so they were
unplannable. The main-arena times only existed in an Irish Times article published 24 Aug.

By **v42 (24 Aug)** the app had published the main arenas — 1054 sets, 53 stages — with times
matching that article (109 of 115 identical). This is why `festivals/ep26/extra-sets.json` shrank
from 115 entries to 2. **Re-check any local supplement after every fetch**: an entry the app has
caught up on becomes a duplicate, and can duplicate under a *second* stage name (the article's
"Comedy Stage" vs the app's "Comedy Arena", "Red Bull × Terminus" vs "Red Bull x Terminus").
