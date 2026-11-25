/**
 * ov26's lineup: the Other Voices app's Aloompa sub-app, committed as
 * `snapshot/subapp.json` (the raw getSubApp slice) so planning works offline and a
 * bad fetch shows up in a diff. `refresh` re-fetches live, guarded by the shared
 * shrink guard so a degraded fetch parks beside the snapshot instead of over it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ArtistSet, LineupSource } from "@festival-bot/core";
import {
  parseAloompaLineup,
  fetchAloompaSubApp,
  refreshDecision,
  classifyRemoved,
  type AloompaConfig,
  type AloompaSubApp,
} from "@festival-bot/adapters";

export function createOv26LineupSource(opts: { file: string; aloompa?: AloompaConfig }): LineupSource {
  const read = (): AloompaSubApp => {
    if (!existsSync(opts.file)) {
      throw new Error(`ov26: no lineup snapshot at ${opts.file} — run \`festplan fetch-lineup\` (needs aloompa.buildParamsToken)`);
    }
    return JSON.parse(readFileSync(opts.file, "utf8")) as AloompaSubApp;
  };

  const source: LineupSource = {
    async loadSets(): Promise<ArtistSet[]> {
      return parseAloompaLineup(read());
    },
  };

  const cfg = opts.aloompa;
  if (cfg?.buildParamsToken) {
    source.refresh = async ({ force = false } = {}) => {
      const sub = await fetchAloompaSubApp(cfg);
      const next = parseAloompaLineup(sub);
      const prev = existsSync(opts.file) ? parseAloompaLineup(read()) : null;
      const decision = refreshDecision(next.length, prev?.length ?? null, force, {
        removed: prev ? classifyRemoved(prev, next) : undefined,
      });
      // Stable order so a re-fetch diffs only genuine changes.
      sub.listSubAppEvents.items.sort((a, b) => a.id.localeCompare(b.id));
      sub.listSubAppPlaces?.items.sort((a, b) => a.id.localeCompare(b.id));
      const out = decision.write ? opts.file : `${opts.file}.fetched.json`;
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(sub, null, 1) + "\n");
      return {
        variant: sub.name,
        fetched: next.length,
        previous: prev?.length ?? null,
        written: decision.write,
        file: out,
        note: decision.reason,
      };
    };
  }
  return source;
}
