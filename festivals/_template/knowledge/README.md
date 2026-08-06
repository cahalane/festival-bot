# Knowledge docs

Add festival-specific prose the agent should read here as markdown. `loadKnowledge()` reads this
directory **recursively** and surfaces the docs as the `knowledge` map on the FestivalModule
(keyed by file basename). The festival's `CONTEXT.md` indexes these as plain links to Read on demand.

Split by lifespan so the annual rebuild is a clean cut:
- **Evergreen** (top level) — facts that persist year to year: `amenities.md`, `geography.md`,
  `data-source.md` (lineup API + favourites source + feed quirks), `runbook.md` (rebuild procedure).
- **`<year>/`** — anything derived from a specific edition's timetable: `<year>/stages.md`,
  `<year>/city-program.md`, etc. Banner each with `> ⚠️ <year> edition …`. The rebuild deletes the
  old year folder and regenerates.

Keep them factual and festival-specific — shared behaviour lives in the engine + agent memory.
