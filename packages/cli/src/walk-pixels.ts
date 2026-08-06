/**
 * Walk-graph edges from a map IMAGE.
 *
 * ATN's 2026 site map is a 3000x3000 JPEG served as `static_map_image` on the
 * edition object — there is no POI/vector data this year, so `walk-refine` (which
 * needs real lat/lngs) has nothing to work from. Positions are therefore read off
 * the image in pixels, and the pixel-to-metre scale is calibrated against stages
 * whose REAL 2025 coordinates we still hold from that edition's POI API.
 *
 * This is an estimate and should be described as one: straight-line pixels times a
 * path factor, not measured footpaths. It ignores the lake, which any route around
 * the south of the site must actually go around.
 */

export interface ScaleReference {
  /** Known real-world separation, metres. */
  metres: number;
  /** Measured separation on the map image, pixels. */
  pixels: number;
}

export interface PixelWalkOptions {
  metresPerPixel: number;
  /** Real footpaths aren't straight lines. */
  pathFactor: number;
  /** Crowd walking pace, metres per second. */
  walkMps: number;
}

export type PixelPositions = Record<string, [number, number]>;

/**
 * Mean metres-per-pixel across reference pairs. Averaging matters: any single pair
 * carries both my pixel-reading error and the fact that a 2025 POI centroid is not
 * exactly the 2026 stage marker, so one pair alone would bake in whichever error
 * it happened to have.
 */
export function calibrateMetresPerPixel(refs: ScaleReference[]): number {
  const usable = refs.filter((r) => r.pixels > 0);
  if (!usable.length) throw new Error("need at least one reference pair with a non-zero pixel separation");
  return usable.reduce((sum, r) => sum + r.metres / r.pixels, 0) / usable.length;
}

/** All-pairs walking minutes between pixel positions, sorted for readable diffs. */
export function allPairsFromPixels(
  positions: PixelPositions,
  opts: PixelWalkOptions,
): Array<[string, string, number]> {
  const slugs = Object.keys(positions).sort();
  const edges: Array<[string, string, number]> = [];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i]!;
      const b = slugs[j]!;
      const [ax, ay] = positions[a]!;
      const [bx, by] = positions[b]!;
      const metres = Math.hypot(ax - bx, ay - by) * opts.metresPerPixel;
      const seconds = (metres * opts.pathFactor) / opts.walkMps;
      edges.push([a, b, Math.max(1, Math.round(seconds / 60))]);
    }
  }
  return edges;
}
