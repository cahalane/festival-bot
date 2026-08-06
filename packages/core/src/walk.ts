/**
 * Walk-time model for a festival site.
 *
 * A festival supplies an undirected list of adjacent walk edges (minutes);
 * all-pairs shortest paths are derived via Floyd-Warshall, so only adjacent
 * edges need listing. Off-graph stages fall back to a default penalty (a signal
 * that a stage slug is missing from the graph — the cause of past "silently
 * wrong 20-min" bugs, now centralised here).
 */

export interface WalkGraph {
  /** Undirected edges: [stageA, stageB, minutes]. */
  edges: ReadonlyArray<readonly [string, string, number]>;
  /** Penalty for a stage not present in the graph (default 20). */
  defaultMinutes?: number;
}

export interface WalkMatrix {
  /** Minutes from stage `a` to `b`; default penalty if either is off-graph. */
  walk(a: string, b: string): number;
  /** All stage slugs known to the graph (useful for validation). */
  stages(): string[];
}

export function buildWalkMatrix(graph: WalkGraph): WalkMatrix {
  const def = graph.defaultMinutes ?? 20;
  const nodes = new Set<string>();
  for (const [a, b] of graph.edges) {
    nodes.add(a);
    nodes.add(b);
  }
  const list = [...nodes];
  const dist = new Map<string, Map<string, number>>();
  for (const x of list) {
    const row = new Map<string, number>();
    for (const y of list) row.set(y, x === y ? 0 : Infinity);
    dist.set(x, row);
  }
  for (const [a, b, w] of graph.edges) {
    const ab = dist.get(a)!;
    const ba = dist.get(b)!;
    ab.set(b, Math.min(ab.get(b)!, w));
    ba.set(a, Math.min(ba.get(a)!, w));
  }
  for (const k of list) {
    const dk = dist.get(k)!;
    for (const i of list) {
      const di = dist.get(i)!;
      const dik = di.get(k)!;
      if (dik === Infinity) continue;
      for (const j of list) {
        const alt = dik + dk.get(j)!;
        if (alt < di.get(j)!) di.set(j, alt);
      }
    }
  }
  return {
    walk(a, b) {
      if (a === b) return 0;
      const row = dist.get(a);
      const d = row?.get(b);
      return d === undefined || d === Infinity ? def : d;
    },
    stages() {
      return [...list];
    },
  };
}
