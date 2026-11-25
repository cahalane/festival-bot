# Aloompa (Dragonfly) discovery

Aloompa builds white-label festival apps in Flutter. Recognise one by
`assets/flutter_assets/properties.json` in the APK containing `staticParamsEndpoint` on
`*.aloompa.com` and `"dragonflyVersion"`. (First onboarded: Other Voices, `festivals/ov26`.)

1. **Get the APK** and `unzip` it into its own empty directory. Read
   `assets/flutter_assets/properties.json`: `appId`, `staticParamsEndpoint`,
   `staticParamsEndpointAuthToken`.
2. **Find the sub-app id** (one per edition) in the bundled package
   `assets/flutter_assets/assets/packages/package_en-<appId>.json` →
   `getApp.listSubApps.items[].{id,name}`. It also appears in share links
   (`sharepage.aloompa.com/<appId>/<subAppId>/…`).
3. **Live-test before writing code:**
   ```
   curl -H "Authorization: <token>" "<staticParamsEndpoint>?appId=<appId>"
   # -> {"dragonflyApiUrl": ".../graphql", "dragonflyApiKey": "da2-…", …}
   ```
   then POST `getSubApp(appId, id, versionId: "1.0.0") { listSubAppEvents { items { id name } } }`
   to `dragonflyApiUrl` with `x-api-key`. Note GraphQL ids are typed `String`, not `ID`.
   Introspection is disabled; field names mirror the bundled package's keys.
4. Put the token in `config/secrets.json` → `aloompa.buildParamsToken` (never commit it — same
   reasoning as Appmiral's `x-protect`, appmiral-discovery.md §4). The adapter resolves the AppSync
   key from build-params on every fetch, because AppSync keys expire and get rotated.
5. Wire `fetchAloompaSubApp` / `parseAloompaLineup` from `@festival-bot/adapters`, mirroring
   `festivals/ov26/src/lineup.ts`.

Feed quirks: UTC epoch-second times; `timeIsTBD` placeholders; places usually have no coordinates.

**Draft events.** `listSubAppEvents` returns only published events, but a performer's
`listPerformerEvents` can point at an event id that is absent from the event list and returns
`NOT_FOUND` from `getEvent` — an unpublished *draft*. A performer with no visible set whose
`listPerformerEvents` is non-empty is therefore a scheduled-but-unannounced act: the earliest signal
of an upcoming addition, ahead of both the schedule and any announcement feed. Watch for two false
positives — a link to a PUBLIC event under a mismatched name (livestream bundles), and a partial
performer list that omits some announced acts. `fetchAloompaDraftActs` implements the check and
`festplan draft-tick` runs it as a watch; `fixAloompaAmPmEnds` repairs ends typed 12h late. See
`festivals/ov26/knowledge/data-source.md` for a worked example.
