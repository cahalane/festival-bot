# ep26 tools

`build-clashfinder-payload.mjs` renders the module's lineup (committed `bundle/` + `extra-sets.json`)
into Clashfinder editor fields — `input0` (directives) and `input1` (one `act = {...}` line per set),
main arenas first, with artist blurbs from the app bundle.

    npx tsx festivals/ep26/tools/build-clashfinder-payload.mjs

Blurbs go through `htmlToBlurb()` from `@festival-bot/adapters` and are **not length-capped**: an
earlier build truncated at 600 chars and silently cut 39% of them mid-sentence.

This exists because `cf-push` targets a mirror this deployment owns, and ep26 is not one — the
public `ep26` event is maintained by an independent user and returns 403 on `?edit`. Output was
verified against the sandbox event `https://clashfinder.com/s/test/`.
