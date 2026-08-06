/**
 * Nearest amenity per category, computed in the map-image pixel frame.
 *
 * The 2026 site map is a picture with no POI data, so `computeStageAmenities`
 * (which reads the Appmiral POI dump) has nothing to work from this year. Stage
 * and amenity positions are both read off the image in the same 3000x3000 frame,
 * so distances are a straight pixel measure scaled by the same metres-per-pixel
 * the walk graph is calibrated on.
 *
 * Straight-line, like the walk graph: it does not know about the lake or fences.
 */
export interface PixelAmenity {
  name: string;
  category: string;
  at: [number, number];
  n?: number;
}

export interface NearestAmenity {
  name: string;
  metres: number;
}

export function nearestByCategory(
  stageAt: [number, number],
  items: PixelAmenity[],
  metresPerPixel: number,
): Record<string, NearestAmenity | undefined> {
  const best: Record<string, { name: string; px: number }> = {};
  for (const it of items) {
    const px = Math.hypot(stageAt[0] - it.at[0], stageAt[1] - it.at[1]);
    const cur = best[it.category];
    if (!cur || px < cur.px) best[it.category] = { name: it.name, px };
  }
  const out: Record<string, NearestAmenity | undefined> = {};
  for (const [cat, v] of Object.entries(best)) {
    out[cat] = { name: v.name, metres: Math.round(v.px * metresPerPixel) };
  }
  return out;
}
