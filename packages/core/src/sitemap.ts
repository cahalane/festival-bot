/**
 * Site-map points of interest, vendor-agnostic.
 *
 * A festival module supplies POIs however it can (a vendor API, a KML export, a
 * hand-written JSON file); everything downstream — the publish watch, the
 * amenities report, walk-graph refinement — works off this shape and never sees
 * the vendor.
 */

export interface SitePoi {
  id: string;
  name: string;
  /** Vendor's own category label, e.g. "Toilets", "Stages". */
  category: string;
  lat: number;
  lng: number;
}

export interface SiteMapSource {
  /** All published POIs. Empty array = nothing published yet (not an error). */
  loadPois(): Promise<SitePoi[]>;
}

/**
 * Categories that describe the raster backdrop rather than a place. A map made
 * only of these has no information in it, however many rows it returns.
 */
const BACKDROP_CATEGORIES = new Set(["map_overlay_image"]);

/** Has this map published anything that tells you where something IS? */
export function poisPublished(pois: SitePoi[]): boolean {
  return pois.some((p) => !BACKDROP_CATEGORIES.has(p.category));
}
